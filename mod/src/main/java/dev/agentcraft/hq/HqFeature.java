package dev.agentcraft.hq;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import dev.agentcraft.AgentCraft;
import dev.agentcraft.command.AgentCraftCommands;
import dev.agentcraft.layout.Anchor;
import dev.agentcraft.layout.AnchorNames;
import dev.agentcraft.layout.Anchors;
import dev.agentcraft.world.HqWorld;
import java.util.Locale;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import org.jspecify.annotations.Nullable;

/**
 * HQ feature (common side): {@code /agentcraft hq [builder] [force]} builds the HQ and publishes its
 * anchors. The studio builder keeps cells the player changed since its last build; {@code force}
 * resets them too. {@code /agentcraft spectate} toggles the caller between spectator and their previous
 * gamemode (see {@link SpectateToggle}).
 */
public final class HqFeature {
	private HqFeature() {
	}

	/** The report of the last build (for QA: {@code dev.state.hq.lastBuild}). */
	private static volatile @Nullable String lastReport;

	public static @Nullable String lastReport() {
		return lastReport;
	}

	public static void init() {
		// TestRoom and Studio disabled — only office + coliseum variants active
		// HqBuilders.register(new TestRoomBuilder());
		// HqBuilders.register(new StudioHqBuilder());
		HqBuilders.register(new ThemedHqBuilder());
		HqBuilders.register(new ColiseumBuilder());
		HqBuilders.register(NetherColiseum.create());
		HqBuilders.register(IceColiseum.create());
		HqBuilders.setDefault(defaultBuilderId());
		// A fresh HQ world (no saved layout yet) gets the default HQ built before the player joins, so
		// the first launch walks straight into it. AGENTCRAFT_HQ_AUTOBUILD=0 turns this off.
		ServerLifecycleEvents.SERVER_STARTED.register(server -> {
			if (!HqWorld.isHq(server) || !Anchors.current().isEmpty() || !autoBuild()) {
				return;
			}
			HqBuilder builder = HqBuilders.get(HqBuilders.defaultId());
			if (builder != null) {
				try {
					buildAndPublish(server.overworld(), builder, HqBuilder.Options.DEFAULT);
					AgentCraft.LOGGER.info("Fresh HQ world: built the default HQ '{}'", builder.id());
				} catch (RuntimeException e) {
					AgentCraft.LOGGER.error("Auto-building the HQ failed (run /agentcraft hq)", e);
				}
			}
		});
		ColiseumPortcullis.register();
		ColiseumAmbience.init();
		AgentCraftCommands.sub(root -> root.then(Commands.literal("elevyte")
			.executes(ctx -> build(ctx, HqBuilders.defaultId(), false))
			.then(Commands.literal("force").executes(ctx -> build(ctx, HqBuilders.defaultId(), true)))
			.then(Commands.argument("builder", StringArgumentType.word())
				.suggests((ctx, b) -> {
					HqBuilders.ids().forEach(b::suggest);
					return b.buildFuture();
				})
				.executes(ctx -> build(ctx, StringArgumentType.getString(ctx, "builder"), false))
				.then(Commands.literal("force").executes(ctx -> build(ctx, StringArgumentType.getString(ctx, "builder"), true))))));
	}

	/**
	 * The default builder: -Dagentcraft.hq.default, then COLISEUM_HQ_DEFAULT (set by the launcher from the
	 * setup wizard's hqMode), then the legacy OPENCLAW_HQ_DEFAULT. The legacy id "openclaw" maps to
	 * coliseum_office. Unknown ids warn and fall back to the coliseum. Call after all registers.
	 */
	private static String defaultBuilderId() {
		String source = "agentcraft.hq.default";
		String v = System.getProperty(source);
		if (v == null) {
			source = "COLISEUM_HQ_DEFAULT";
			v = System.getenv(source);
		}
		if (v == null) {
			source = "OPENCLAW_HQ_DEFAULT";
			v = System.getenv(source);
		}
		String id = v == null ? "" : v.trim().toLowerCase(Locale.ROOT);
		if (id.isEmpty()) {
			return ColiseumBuilder.ID;
		}
		if (ThemedHqBuilder.LEGACY_ID.equals(id)) {
			id = ThemedHqBuilder.ID;
		}
		if (HqBuilders.get(id) != null) {
			AgentCraft.LOGGER.info("HQ default builder '{}' (from {})", id, source);
			return id;
		}
		AgentCraft.LOGGER.warn("Unknown HQ default builder '{}' ({}); known: {}; falling back to '{}'",
			id, source, HqBuilders.ids(), ColiseumBuilder.ID);
		return ColiseumBuilder.ID;
	}

	private static boolean autoBuild() {
		String v = System.getProperty("coliseum.hq.autobuild");
		if (v == null) {
			v = System.getenv("COLISEUM_HQ_AUTOBUILD");
		}
		return v == null || !(v.trim().equals("0") || v.trim().equalsIgnoreCase("false") || v.trim().equalsIgnoreCase("off"));
	}

	/**
	 * Building rewrites a large area of terrain and moves the world spawn, so it only runs in the
	 * Coliseum HQ world unless COLISEUM_HQ_ANYWORLD=1 (-Dcoliseum.hq.anyworld=1) opts in, and
	 * never in a Hardcore world.
	 */
	private static @Nullable String refusal(CommandSourceStack source) {
		var server = source.getServer();
		if (server.getWorldData().isHardcore()) {
			return "/warp hq never builds in a Hardcore world (it rewrites terrain and moves the spawn)";
		}
		if (!HqWorld.isHq(server) && !anyWorld()) {
			return "/warp hq only builds in the \"" + HqWorld.LEVEL_NAME + "\" world; to build into this world on purpose,"
				+ " back it up and start the game with -Dcoliseum.hq.anyworld=1";
		}
		return null;
	}

	private static boolean anyWorld() {
		String v = System.getProperty("coliseum.hq.anyworld");
		if (v == null) {
			v = System.getenv("COLISEUM_HQ_ANYWORLD");
		}
		return v != null && (v.trim().equals("1") || v.trim().equalsIgnoreCase("true") || v.trim().equalsIgnoreCase("on"));
	}

	static int build(CommandContext<CommandSourceStack> ctx, String requestedId, boolean force) {
		String id = ThemedHqBuilder.LEGACY_ID.equals(requestedId) ? ThemedHqBuilder.ID : requestedId;
		String refused = refusal(ctx.getSource());
		if (refused != null) {
			ctx.getSource().sendFailure(Component.literal(refused));
			return 0;
		}
		HqBuilder builder = HqBuilders.get(id);
		if (builder == null) {
			ctx.getSource().sendFailure(Component.literal("Unknown HQ builder '" + id + "' (known: " + HqBuilders.ids() + ")"));
			return 0;
		}
		Anchors.Layout layout;
		try {
			layout = buildAndPublish(ctx.getSource().getLevel(), builder, new HqBuilder.Options(force));
		} catch (RuntimeException e) {
			AgentCraft.LOGGER.error("HQ builder '{}' failed", id, e);
			ctx.getSource().sendFailure(Component.literal("HQ builder '" + id + "' failed: " + e));
			return 0;
		}
		String report = lastReport;
		var player = ctx.getSource().getPlayer();
		boolean spectate = isColiseum(id) && player != null;
		if (spectate) {
			ColiseumView.spectateFromAbove(player);
		}
		ctx.getSource().sendSuccess(() -> Component.literal("Built HQ '" + id + "': " + layout.anchors().size() + " anchors"
			+ (report == null ? "" : ". " + report) + (spectate ? ". Spectating from above" : "")), true);
		return layout.anchors().size();
	}

	/** True for the plain coliseum and its themed variants ({@code coliseum_*}), but not the office HQ. */
	public static boolean isColiseum(String id) {
		if (ThemedHqBuilder.ID.equals(id)) {
			return false;
		}
		return ColiseumBuilder.ID.equals(id) || id.startsWith(ColiseumBuilder.ID + "_");
	}

	/** Runs {@code builder} (server thread), publishes its layout and moves the world spawn to its spawn anchor. */
	public static Anchors.Layout buildAndPublish(ServerLevel level, HqBuilder builder) {
		return buildAndPublish(level, builder, HqBuilder.Options.DEFAULT);
	}

	public static Anchors.Layout buildAndPublish(ServerLevel level, HqBuilder builder, HqBuilder.Options options) {
		long t0 = System.nanoTime();
		// another builder rewrites the same ground without a record: the studio's memory of its last
		// build no longer describes the world
		PlanStore.invalidateUnless(level.getServer(), builder.id());
		Anchors.Builder anchors = Anchors.builder(builder.id());
		lastReport = builder.build(level, anchors, options);
		Anchors.Layout layout = anchors.build();
		Anchors.publish(level.getServer(), layout);
		Anchor spawn = layout.get(AnchorNames.SPAWN);
		if (spawn != null) {
			level.getServer().getCommands().performPrefixedCommand(level.getServer().createCommandSourceStack().withSuppressedOutput(),
				String.format(Locale.ROOT, "setworldspawn %d %d %d %.1f 0", (int) Math.floor(spawn.x()), (int) Math.floor(spawn.y()),
					(int) Math.floor(spawn.z()), spawn.yaw()));
		}
		if (isColiseum(builder.id())) {
			ColiseumEnvironment.apply(level);
		}
		AgentCraft.LOGGER.info("HQ '{}' built in {} ms{}", builder.id(), (System.nanoTime() - t0) / 1_000_000,
			lastReport == null ? "" : ": " + lastReport);
		return layout;
	}
}
