package dev.agentcraft.hq;

import net.minecraft.world.level.block.Blocks;

/** The "coliseum_nether" theme: {@link ColiseumBuilder} rebuilt from nether bricks, blackstone and magma. */
public final class NetherColiseum {
	public static final String ID = "coliseum_nether";

	private NetherColiseum() {
	}

	static ColiseumPalette palette() {
		return ColiseumPalette.builder()
				// walls, arches, floor
				.full(Blocks.CHISELED_SANDSTONE, Blocks.CHISELED_NETHER_BRICKS)
				.full(Blocks.CUT_SANDSTONE, Blocks.NETHER_BRICKS)
				.full(Blocks.SMOOTH_SANDSTONE, Blocks.POLISHED_BLACKSTONE)
				.full(Blocks.SANDSTONE, Blocks.BLACKSTONE)
				// columns and foundation
				.full(Blocks.POLISHED_DIORITE, Blocks.POLISHED_BLACKSTONE_BRICKS)
				.full(Blocks.SMOOTH_QUARTZ, Blocks.RED_NETHER_BRICKS)
				.full(Blocks.STONE_BRICKS, Blocks.POLISHED_BLACKSTONE_BRICKS)
				.full(Blocks.CRACKED_STONE_BRICKS, Blocks.CRACKED_POLISHED_BLACKSTONE_BRICKS)
				// floor rings and red pattern accents
				.full(Blocks.SMOOTH_RED_SANDSTONE, Blocks.RED_NETHER_BRICKS)
				.full(Blocks.RED_SANDSTONE, Blocks.MAGMA_BLOCK)
				.full(Blocks.CUT_RED_SANDSTONE, Blocks.RED_NETHER_BRICKS)
				.full(Blocks.CHISELED_RED_SANDSTONE, Blocks.CHISELED_POLISHED_BLACKSTONE)
				// lighting
				.full(Blocks.SEA_LANTERN, Blocks.SHROOMLIGHT)
				.state(Blocks.LANTERN, Blocks.SOUL_LANTERN)
				.state(Blocks.CAMPFIRE, Blocks.SOUL_CAMPFIRE)
				// stairs, slabs, walls, fences keep their properties
				.state(Blocks.SANDSTONE_STAIRS, Blocks.NETHER_BRICK_STAIRS)
				.state(Blocks.STONE_BRICK_STAIRS, Blocks.POLISHED_BLACKSTONE_BRICK_STAIRS)
				.state(Blocks.SANDSTONE_SLAB, Blocks.NETHER_BRICK_SLAB)
				.state(Blocks.SANDSTONE_WALL, Blocks.NETHER_BRICK_WALL)
				.state(Blocks.OAK_FENCE, Blocks.CRIMSON_FENCE)
				.build();
	}

	static HqBuilder create() {
		return new ThemedColiseumBuilder(ID, "Nether", palette());
	}
}
