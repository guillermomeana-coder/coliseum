package dev.agentcraft.hq;

import net.minecraft.world.level.block.Blocks;

/**
 * Ice theme for the coliseum: packed ice, blue ice and snow for the masonry, pale quartz/diorite stairs, slabs and
 * walls (vanilla has no ice stairs or slabs), sea lanterns for light. Plain ICE is never placed because it melts at
 * block light above 11.
 */
final class IceColiseum {
	static final String ID = "coliseum_ice";

	private IceColiseum() {
	}

	static ColiseumPalette palette() {
		return ColiseumPalette.builder()
			// walls and foundation
			.full(Blocks.STONE_BRICKS, Blocks.PACKED_ICE)
			.full(Blocks.CHISELED_SANDSTONE, Blocks.PACKED_ICE)
			.full(Blocks.CUT_SANDSTONE, Blocks.SNOW_BLOCK)
			.full(Blocks.SMOOTH_SANDSTONE, Blocks.SNOW_BLOCK)
			.full(Blocks.CRACKED_STONE_BRICKS, Blocks.BLUE_ICE)
			// columns
			.full(Blocks.POLISHED_DIORITE, Blocks.BLUE_ICE)
			.full(Blocks.SMOOTH_QUARTZ, Blocks.SNOW_BLOCK)
			// floor ring and patterns (arena floor is smooth sandstone -> snow, ring -> blue ice)
			.full(Blocks.SMOOTH_RED_SANDSTONE, Blocks.BLUE_ICE)
			.full(Blocks.SANDSTONE, Blocks.PACKED_ICE)
			.full(Blocks.CUT_RED_SANDSTONE, Blocks.PACKED_ICE)
			.full(Blocks.RED_SANDSTONE, Blocks.BLUE_ICE)
			.full(Blocks.CHISELED_RED_SANDSTONE, Blocks.BLUE_ICE)
			// stage
			.full(Blocks.GILDED_BLACKSTONE, Blocks.BLUE_ICE)
			// stairs, slabs, walls: closest pale variants
			.state(Blocks.SANDSTONE_STAIRS, Blocks.QUARTZ_STAIRS)
			.state(Blocks.STONE_BRICK_STAIRS, Blocks.DIORITE_STAIRS)
			.state(Blocks.SANDSTONE_SLAB, Blocks.QUARTZ_SLAB)
			.state(Blocks.SANDSTONE_WALL, Blocks.DIORITE_WALL)
			// lighting and props
			.full(Blocks.LANTERN, Blocks.SEA_LANTERN)
			.full(Blocks.CAMPFIRE, Blocks.SEA_LANTERN)
			.state(Blocks.OAK_FENCE, Blocks.DIORITE_WALL)
			.build();
	}

	static HqBuilder create() {
		return new ThemedColiseumBuilder(ID, "Ice", palette());
	}
}
