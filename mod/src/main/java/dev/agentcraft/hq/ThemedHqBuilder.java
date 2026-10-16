package dev.agentcraft.hq;

import dev.agentcraft.AgentCraft;
import dev.agentcraft.layout.Anchors;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.core.BlockPos;
import org.jspecify.annotations.Nullable;

import java.util.HashMap;
import java.util.Map;

/**
 * Wraps StudioHqBuilder and applies a Theme by swapping materials post-build.
 * This preserves the proven layout and geometry while allowing visual customization.
 *
 * <p>The OPENCLAW_THEME environment variable selects a theme at startup:
 * {@code warm_studio} (default), {@code modern_glass}, or {@code executive}.
 */
public final class ThemedHqBuilder implements HqBuilder {
    public static final String ID = "openclaw";

    private final StudioHqBuilder delegate = new StudioHqBuilder();
    private final Theme theme;

    public ThemedHqBuilder() {
        String themeId = System.getenv("OPENCLAW_THEME");
        this.theme = Theme.byId(themeId != null ? themeId : "warm_studio");
        AgentCraft.LOGGER.info("OpenClaw Office theme: {} ({})", theme.id(), theme.displayName());
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
        return "OpenClaw Office (" + theme.displayName() + "): " + delegate.description();
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
            AgentCraft.LOGGER.info("OpenClaw theme '{}': swapped {} blocks in {} ms", theme.id(), swapped, ms);
            return (report != null ? report + "; " : "") + "theme " + theme.displayName() + " applied (" + swapped + " blocks)";
        }
        return report;
    }

    /**
     * Walks the site box and swaps materials according to the theme's palette.
     * Only structural/decorative blocks are swapped — functional blocks (monitors,
     * desks, lamps, task boards, etc.) are left untouched.
     */
    private int applyTheme(ServerLevel level) {
        Map<Block, BlockState> simpleSwaps = buildSwapTable();
        int count = 0;
        int[] site = {-46, 60, -36, 46, 100, 54}; // StudioHqBuilder.SITE

        for (int x = site[0]; x <= site[3]; x++) {
            for (int y = site[1]; y <= site[4]; y++) {
                for (int z = site[2]; z <= site[5]; z++) {
                    BlockPos pos = new BlockPos(x, y, z);
                    BlockState current = level.getBlockState(pos);
                    Block block = current.getBlock();

                    BlockState replacement = simpleSwaps.get(block);
                    if (replacement != null && !replacement.equals(current)) {
                        level.setBlock(pos, replacement, 2); // 2 = update clients, no block update
                        count++;
                    }
                }
            }
        }
        return count;
    }

    /**
     * Maps original warm-studio blocks to theme blocks.
     * Only maps blocks that should change for the theme.
     */
    private Map<Block, BlockState> buildSwapTable() {
        Map<Block, BlockState> m = new HashMap<>();

        // Floor swaps
        m.put(Blocks.BIRCH_PLANKS, theme.floorMain());
        m.put(Blocks.DARK_OAK_PLANKS, theme.floorAccent());
        m.put(Blocks.MUD_BRICKS, theme.plinth());

        // Roof/ceiling swaps
        // Note: stairs and slabs need directional state preservation,
        // so we swap the full-block versions and leave stairs for now.
        // A future version can do state-aware stair swapping.

        // Glass swaps (only if theme changes glass type)
        if (theme.glassPane().getBlock() != Blocks.GLASS_PANE) {
            m.put(Blocks.GLASS_PANE, theme.glassPane());
        }

        // Sofa swaps
        // Brown wool stairs → theme sofa (handled by block identity)

        // Lantern swaps
        if (theme.lantern().getBlock() != Blocks.LANTERN) {
            m.put(Blocks.LANTERN, theme.lantern());
        }
        if (theme.lanternHanging().getBlock() != Blocks.SOUL_LANTERN) {
            m.put(Blocks.SOUL_LANTERN, theme.lanternHanging());
        }

        return m;
    }
}
