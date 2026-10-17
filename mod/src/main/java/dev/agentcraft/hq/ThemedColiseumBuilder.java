package dev.agentcraft.hq;

import dev.agentcraft.AgentCraft;
import dev.agentcraft.layout.Anchors;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import org.jspecify.annotations.Nullable;

import java.util.Map;

/**
 * Wraps {@link ColiseumBuilder} and applies a {@link ColiseumPalette} by swapping materials post-build, keeping
 * the proven layout and geometry.
 */
public final class ThemedColiseumBuilder implements HqBuilder {
	private final String id;
	private final String displayName;
	private final ColiseumPalette palette;

	public ThemedColiseumBuilder(String id, String displayName, ColiseumPalette palette) {
		this.id = id;
		this.displayName = displayName;
		this.palette = palette;
	}

	@Override
	public String id() {
		return id;
	}

	@Override
	public String description() {
		return "Coliseum (" + displayName + "): " + new ColiseumBuilder().description();
	}

	@Override
	public void build(ServerLevel level, Anchors.Builder anchors) {
		build(level, anchors, Options.DEFAULT);
	}

	@Override
	public @Nullable String build(ServerLevel level, Anchors.Builder anchors, Options options) {
		String report = new ColiseumBuilder().build(level, anchors, options);
		long t0 = System.nanoTime();
		int swapped = applyPalette(level);
		long ms = (System.nanoTime() - t0) / 1_000_000;
		AgentCraft.LOGGER.info("Coliseum theme '{}': swapped {} blocks in {} ms", id, swapped, ms);
		// the delegate saved its record as "coliseum" with the unswapped cells; drop it so a later plain
		// coliseum build does not diff against it and keep themed blocks as player edits
		PlanStore.invalidateUnless(level.getServer(), id);
		return (report != null ? report + "; " : "") + "theme " + displayName + " applied (" + swapped + " blocks)";
	}

	private int applyPalette(ServerLevel level) {
		Map<Block, Block> stateSwaps = palette.stateSwaps();
		Map<Block, BlockState> fullSwaps = palette.fullSwaps();
		if (stateSwaps.isEmpty() && fullSwaps.isEmpty()) {
			return 0;
		}
		int[] site = ColiseumBuilder.SITE;
		int count = 0;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int x = site[0]; x <= site[3]; x++) {
			for (int y = site[1]; y <= site[4]; y++) {
				for (int z = site[2]; z <= site[5]; z++) {
					pos.set(x, y, z);
					BlockState current = level.getBlockState(pos);
					Block block = current.getBlock();
					Block newBlock = stateSwaps.get(block);
					if (newBlock != null && newBlock != block) {
						BlockState newState = copyProperties(current, newBlock.defaultBlockState());
						if (!newState.equals(current)) {
							level.setBlock(pos, newState, 2);
							count++;
						}
						continue;
					}
					BlockState replacement = fullSwaps.get(block);
					if (replacement != null && !replacement.equals(current)) {
						level.setBlock(pos, replacement, 2);
						count++;
					}
				}
			}
		}
		return count;
	}

	@SuppressWarnings({"unchecked", "rawtypes"})
	private static BlockState copyProperties(BlockState source, BlockState target) {
		for (Property<?> prop : source.getProperties()) {
			if (target.hasProperty(prop)) {
				target = copyProperty(source, target, (Property) prop);
			}
		}
		return target;
	}

	private static <T extends Comparable<T>> BlockState copyProperty(BlockState source, BlockState target, Property<T> prop) {
		return target.setValue(prop, source.getValue(prop));
	}
}
