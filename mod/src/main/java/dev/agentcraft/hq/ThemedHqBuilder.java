package dev.agentcraft.hq;

import dev.agentcraft.AgentCraft;
import dev.agentcraft.block.ModBlocks;
import dev.agentcraft.layout.Anchors;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.core.BlockPos;
import org.jspecify.annotations.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * Wraps StudioHqBuilder and applies a Theme by swapping materials post-build.
 * This preserves the proven layout and geometry while allowing visual customization.
 *
 * <p>The COLISEUM_THEME environment variable (legacy: OPENCLAW_THEME) selects a theme at startup:
 * {@code warm_studio} (default), {@code modern_glass}, or {@code executive}.
 */
public final class ThemedHqBuilder implements HqBuilder {
    public static final String ID = "coliseum_office";
    /** The id this builder had before the Coliseum rename; still accepted as an alias. */
    public static final String LEGACY_ID = "openclaw";

    private final StudioHqBuilder delegate = new StudioHqBuilder();
    private final Theme theme;

    public ThemedHqBuilder() {
        String themeId = System.getenv("COLISEUM_THEME");
        if (themeId == null) {
            themeId = System.getenv("OPENCLAW_THEME");
        }
        this.theme = Theme.byId(themeId != null ? themeId : "warm_studio");
        AgentCraft.LOGGER.info("Coliseum Office theme: {} ({})", theme.id(), theme.displayName());
    }

    public ThemedHqBuilder(Theme theme) {
        this.theme = theme;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String description() {
        return "Coliseum Office (" + theme.displayName() + "): " + delegate.description();
    }

    @Override
    public void build(ServerLevel level, Anchors.Builder anchors) {
        build(level, anchors, Options.DEFAULT);
    }

    @Override
    public @Nullable String build(ServerLevel level, Anchors.Builder anchors, Options options) {
        // First, build the standard studio
        String report = delegate.build(level, anchors, options);

        // Then apply theme swaps if not using the default warm studio
        if (!"warm_studio".equals(theme.id())) {
            long t0 = System.nanoTime();
            int swapped = applyTheme(level);
            long ms = (System.nanoTime() - t0) / 1_000_000;
            AgentCraft.LOGGER.info("Coliseum theme '{}': swapped {} blocks in {} ms", theme.id(), swapped, ms);
            return (report != null ? report + "; " : "") + "theme " + theme.displayName() + " applied (" + swapped + " blocks)";
        }
        return report;
    }

    /**
     * Walks the site box and swaps materials according to the theme's palette.
     * Preserves block state properties (direction, half, waterlogged) when swapping
     * stairs and slabs. Functional blocks (monitors, desks, lamps, task boards) are untouched.
     */
    private int applyTheme(ServerLevel level) {
        Map<Block, Block> blockSwaps = buildBlockSwapTable();
        Map<Block, BlockState> fullSwaps = buildFullSwapTable();
        int count = 0;
        int[] site = {-46, 60, -36, 46, 100, 54}; // StudioHqBuilder.SITE

        for (int x = site[0]; x <= site[3]; x++) {
            for (int y = site[1]; y <= site[4]; y++) {
                for (int z = site[2]; z <= site[5]; z++) {
                    BlockPos pos = new BlockPos(x, y, z);
                    BlockState current = level.getBlockState(pos);
                    Block block = current.getBlock();

                    // 1. State-aware swap (stairs, slabs) — preserves facing, half, shape, waterlogged
                    Block newBlock = blockSwaps.get(block);
                    if (newBlock != null && newBlock != block) {
                        BlockState newState = copyProperties(current, newBlock.defaultBlockState());
                        if (!newState.equals(current)) {
                            level.setBlock(pos, newState, 2);
                            count++;
                        }
                        continue;
                    }

                    // 2. Simple full-block swap (planks, bricks, glass)
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

    /**
     * Copies all matching properties from the source state onto the target state.
     * This preserves facing, half, shape, waterlogged, etc. when swapping stairs/slabs.
     */
    @SuppressWarnings("unchecked")
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

    /** Block→Block swaps for stairs and slabs (state properties preserved). */
    private Map<Block, Block> buildBlockSwapTable() {
        Map<Block, Block> m = new HashMap<>();

        // Roof stairs
        Block origRoofStairs = Blocks.CUT_COPPER_STAIRS.waxed().unaffected();
        if (theme.roofStairs() != origRoofStairs) {
            m.put(origRoofStairs, theme.roofStairs());
        }

        // Roof trim stairs
        if (theme.roofTrim() != Blocks.DARK_OAK_STAIRS) {
            m.put(Blocks.DARK_OAK_STAIRS, theme.roofTrim());
        }

        // Ceiling stairs
        if (theme.ceilStairs() != Blocks.PALE_OAK_STAIRS) {
            m.put(Blocks.PALE_OAK_STAIRS, theme.ceilStairs());
        }

        // Roof slab
        Block origRoofSlab = Blocks.CUT_COPPER_SLAB.waxed().unaffected();
        if (theme.roofSlab() != origRoofSlab) {
            m.put(origRoofSlab, theme.roofSlab());
        }

        // Sofa
        Block origSofa = Blocks.WOOL_STAIRS.pick(net.minecraft.world.item.DyeColor.BROWN);
        if (theme.sofa() != origSofa) {
            m.put(origSofa, theme.sofa());
        }

        // Dome stairs
        Block origDomeStairs = Blocks.CUT_COPPER_STAIRS.waxed().unaffected();
        if (theme.domeStairs() != origDomeStairs) {
            m.put(origDomeStairs, theme.domeStairs());
        }

        // Dome slab
        Block origDomeSlab = Blocks.CUT_COPPER_SLAB.waxed().unaffected();
        if (theme.domeSlab() != origDomeSlab) {
            m.put(origDomeSlab, theme.domeSlab());
        }

        // Frame posts and beams (stripped logs — axis property preserved by copyProperties)
        if (theme.framePost() != Blocks.STRIPPED_DARK_OAK_LOG) {
            m.put(Blocks.STRIPPED_DARK_OAK_LOG, theme.framePost());
        }

        return m;
    }

    /** Block→BlockState swaps for full blocks (no state to preserve). */
    private Map<Block, BlockState> buildFullSwapTable() {
        Map<Block, BlockState> m = new HashMap<>();

        // Floors — vanilla blocks
        m.put(Blocks.BIRCH_PLANKS, theme.floorMain());
        m.put(Blocks.DARK_OAK_PLANKS, theme.floorAccent());
        m.put(Blocks.MUD_BRICKS, theme.plinth());

        // Floors — mod blocks
        if (!theme.floorMain().is(ModBlocks.OAK_PARQUET)) {
            m.put(ModBlocks.OAK_PARQUET, theme.floorMain());
        }
        if (!theme.floorTile().is(ModBlocks.TERRACOTTA_TILE)) {
            m.put(ModBlocks.TERRACOTTA_TILE, theme.floorTile());
        }

        // Walls — plaster (mod blocks)
        if (!theme.wallPrimary().is(ModBlocks.PLASTER_PANEL)) {
            m.put(ModBlocks.PLASTER_PANEL, theme.wallPrimary());
        }
        if (!theme.wallFrame().is(ModBlocks.PLASTER_FRAME)) {
            m.put(ModBlocks.PLASTER_FRAME, theme.wallFrame());
        }

        // Walls — walnut (mod blocks)
        if (!theme.wallTrim().is(ModBlocks.WALNUT_TRIM)) {
            m.put(ModBlocks.WALNUT_TRIM, theme.wallTrim());
        }
        if (!theme.wallWood().is(ModBlocks.WALNUT_PANEL)) {
            m.put(ModBlocks.WALNUT_PANEL, theme.wallWood());
        }

        // Glow panel (mod block)
        if (!theme.glowPanel().is(ModBlocks.GLOW_PANEL)) {
            m.put(ModBlocks.GLOW_PANEL, theme.glowPanel());
        }

        // Ceiling full blocks
        if (!theme.ceilFull().is(Blocks.PALE_OAK_PLANKS)) {
            m.put(Blocks.PALE_OAK_PLANKS, theme.ceilFull());
        }

        // Roof full blocks
        // (roofFull swaps are tricky since dark_oak_planks is also floorAccent — skip to avoid conflict)

        // Dome shell
        Block origCopper = Blocks.COPPER_BLOCK.waxed().unaffected();
        if (!theme.domeShell().is(origCopper)) {
            m.put(origCopper, theme.domeShell());
        }
        Block origCutCopper = Blocks.CUT_COPPER.waxed().unaffected();
        if (!theme.domeShell().is(origCutCopper)) {
            m.put(origCutCopper, theme.domeShell());
        }

        // Glass
        if (theme.glassPane().getBlock() != Blocks.GLASS_PANE) {
            m.put(Blocks.GLASS_PANE, theme.glassPane());
        }

        // Lanterns
        if (theme.lantern().getBlock() != Blocks.LANTERN) {
            m.put(Blocks.LANTERN, theme.lantern());
        }

        return m;
    }
}
