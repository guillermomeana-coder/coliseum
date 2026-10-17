package dev.agentcraft.hq;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

import java.util.HashMap;
import java.util.Map;

/**
 * Material swaps applied on top of a finished {@link ColiseumBuilder} build by {@link ThemedColiseumBuilder}.
 *
 * @param stateSwaps block to block swaps that keep the block state properties (stairs, slabs, fences, walls,
 *                   campfire, lantern)
 * @param fullSwaps  block to exact state swaps for blocks without state worth keeping
 */
public record ColiseumPalette(Map<Block, Block> stateSwaps, Map<Block, BlockState> fullSwaps) {
	public static final ColiseumPalette EMPTY = new ColiseumPalette(Map.of(), Map.of());

	public ColiseumPalette {
		stateSwaps = Map.copyOf(stateSwaps);
		fullSwaps = Map.copyOf(fullSwaps);
	}

	public static Builder builder() {
		return new Builder();
	}

	public static final class Builder {
		private final Map<Block, Block> stateSwaps = new HashMap<>();
		private final Map<Block, BlockState> fullSwaps = new HashMap<>();

		/** Swap {@code from} for {@code to}, copying shared properties (facing, half, shape, waterlogged...). */
		public Builder state(Block from, Block to) {
			stateSwaps.put(from, to);
			return this;
		}

		/** Swap {@code from} for exactly {@code to}. */
		public Builder full(Block from, BlockState to) {
			fullSwaps.put(from, to);
			return this;
		}

		/** Swap {@code from} for the default state of {@code to}. */
		public Builder full(Block from, Block to) {
			return full(from, to.defaultBlockState());
		}

		public ColiseumPalette build() {
			return new ColiseumPalette(stateSwaps, fullSwaps);
		}
	}
}
