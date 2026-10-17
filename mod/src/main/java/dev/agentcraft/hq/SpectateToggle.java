package dev.agentcraft.hq;

import com.mojang.brigadier.context.CommandContext;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.GameType;

/** {@code /agentcraft spectate}: toggles the calling player between spectator and their previous gamemode. */
final class SpectateToggle {
	private static final Map<UUID, GameType> PREVIOUS = new ConcurrentHashMap<>();

	private SpectateToggle() {
	}

	static int toggle(CommandContext<CommandSourceStack> ctx) {
		CommandSourceStack source = ctx.getSource();
		ServerPlayer player = source.getPlayer();
		if (player == null) {
			source.sendFailure(Component.literal("must be run by a player"));
			return 0;
		}
		GameType target;
		if (player.gameMode() != GameType.SPECTATOR) {
			PREVIOUS.put(player.getUUID(), player.gameMode());
			target = GameType.SPECTATOR;
		} else {
			GameType prev = PREVIOUS.remove(player.getUUID());
			target = prev != null ? prev : GameType.CREATIVE;
		}
		player.setGameMode(target);
		source.sendSuccess(() -> Component.literal("Game mode set to " + target.getName()), false);
		return 1;
	}
}
