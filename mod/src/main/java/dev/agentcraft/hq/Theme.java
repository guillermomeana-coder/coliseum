package dev.agentcraft.hq;

import dev.agentcraft.block.ModBlocks;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Visual theme for the HQ. Controls materials for walls, floors, roof, dome,
 * and decorative elements while keeping functional blocks (monitors, desks,
 * lamps, task boards) untouched.
 *
 * <p>Three built-in themes ship with OpenClaw Office:
 * <ul>
 *   <li>{@link #WARM_STUDIO} — the original timber + copper + plaster look</li>
 *   <li>{@link #MODERN_GLASS} — clean lines, quartz + glass + iron</li>
 *   <li>{@link #EXECUTIVE} — dark oak + deepslate + gold accents</li>
 * </ul>
 */
public record Theme(
    String id,
    String displayName,
    // --- Walls ---
    BlockState wallPrimary,
    BlockState wallFrame,
    BlockState wallTrim,
    Block framePost,           // vertical logs
    Block frameBeam,           // horizontal beams
    // --- Floor ---
    BlockState floorMain,
    BlockState floorAccent,
    BlockState floorTile,
    BlockState plinth,
    // --- Roof exterior ---
    Block roofStairs,
    Block roofSlab,
    BlockState roofFull,
    Block roofTrim,
    // --- Ceiling interior ---
    Block ceilStairs,
    BlockState ceilFull,
    // --- Dome ---
    BlockState domeShell,
    Block domeStairs,
    Block domeSlab,
    // --- Glass ---
    BlockState glassPane,
    // --- Sofa ---
    Block sofa,
    // --- Ambient ---
    BlockState lantern,
    BlockState lanternHanging
) {
    // =========================================================================
    // WARM STUDIO — original AgentCraft look (timber + copper + plaster)
    // =========================================================================
    public static final Theme WARM_STUDIO = new Theme(
        "warm_studio",
        "Warm Studio",
        // Walls
        ModBlocks.PLASTER_PANEL.defaultBlockState(),
        ModBlocks.PLASTER_FRAME.defaultBlockState(),
        ModBlocks.WALNUT_TRIM.defaultBlockState(),
        Blocks.STRIPPED_DARK_OAK_LOG,
        Blocks.STRIPPED_DARK_OAK_LOG,
        // Floor
        Blocks.BIRCH_PLANKS.defaultBlockState(),
        Blocks.DARK_OAK_PLANKS.defaultBlockState(),
        ModBlocks.TERRACOTTA_TILE.defaultBlockState(),
        Blocks.MUD_BRICKS.defaultBlockState(),
        // Roof
        Blocks.CUT_COPPER_STAIRS.waxed().unaffected(),
        Blocks.CUT_COPPER_SLAB.waxed().unaffected(),
        Blocks.DARK_OAK_PLANKS.defaultBlockState(),
        Blocks.DARK_OAK_STAIRS,
        // Ceiling
        Blocks.PALE_OAK_STAIRS,
        Blocks.PALE_OAK_PLANKS.defaultBlockState(),
        // Dome
        Blocks.CUT_COPPER.waxed().unaffected().defaultBlockState(),
        Blocks.CUT_COPPER_STAIRS.waxed().unaffected(),
        Blocks.CUT_COPPER_SLAB.waxed().unaffected(),
        // Glass
        Blocks.GLASS_PANE.defaultBlockState(),
        // Sofa
        Blocks.WOOL_STAIRS.pick(DyeColor.BROWN),
        // Ambient
        St.lantern(Blocks.LANTERN, false),
        St.lantern(Blocks.LANTERN, true)
    );

    // =========================================================================
    // MODERN GLASS — clean contemporary office (quartz + iron + glass)
    // =========================================================================
    public static final Theme MODERN_GLASS = new Theme(
        "modern_glass",
        "Modern Glass",
        // Walls
        Blocks.QUARTZ_BLOCK.defaultBlockState(),
        Blocks.SMOOTH_QUARTZ.defaultBlockState(),
        Blocks.QUARTZ_PILLAR.defaultBlockState(),
        Blocks.IRON_BARS != null ? Blocks.STRIPPED_BIRCH_LOG : Blocks.STRIPPED_BIRCH_LOG,
        Blocks.STRIPPED_BIRCH_LOG,
        // Floor
        Blocks.SMOOTH_STONE.defaultBlockState(),
        Blocks.POLISHED_ANDESITE.defaultBlockState(),
        St.concrete(DyeColor.WHITE),
        Blocks.STONE_BRICKS.defaultBlockState(),
        // Roof
        Blocks.QUARTZ_STAIRS,
        Blocks.QUARTZ_SLAB,
        Blocks.SMOOTH_QUARTZ.defaultBlockState(),
        Blocks.QUARTZ_STAIRS,
        // Ceiling
        Blocks.QUARTZ_STAIRS,
        Blocks.SMOOTH_QUARTZ.defaultBlockState(),
        // Dome
        Blocks.SMOOTH_QUARTZ.defaultBlockState(),
        Blocks.QUARTZ_STAIRS,
        Blocks.QUARTZ_SLAB,
        // Glass
        Blocks.GLASS_PANE.defaultBlockState(),
        // Sofa
        Blocks.WOOL_STAIRS.pick(DyeColor.WHITE),
        // Ambient
        St.lantern(Blocks.LANTERN, false),
        St.lantern(Blocks.LANTERN, true)
    );

    // =========================================================================
    // EXECUTIVE — premium dark office (deepslate + dark oak + gold)
    // =========================================================================
    public static final Theme EXECUTIVE = new Theme(
        "executive",
        "Executive Suite",
        // Walls
        Blocks.POLISHED_DEEPSLATE.defaultBlockState(),
        Blocks.DEEPSLATE_BRICKS.defaultBlockState(),
        Blocks.DEEPSLATE_TILE_WALL != null
            ? Blocks.POLISHED_DEEPSLATE.defaultBlockState()
            : Blocks.POLISHED_DEEPSLATE.defaultBlockState(),
        Blocks.STRIPPED_DARK_OAK_LOG,
        Blocks.STRIPPED_DARK_OAK_LOG,
        // Floor
        Blocks.DARK_OAK_PLANKS.defaultBlockState(),
        Blocks.POLISHED_DEEPSLATE.defaultBlockState(),
        Blocks.DEEPSLATE_TILES.defaultBlockState(),
        Blocks.DEEPSLATE_BRICKS.defaultBlockState(),
        // Roof
        Blocks.DARK_OAK_STAIRS,
        Blocks.DARK_OAK_SLAB,
        Blocks.DARK_OAK_PLANKS.defaultBlockState(),
        Blocks.DARK_OAK_STAIRS,
        // Ceiling
        Blocks.DARK_OAK_STAIRS,
        Blocks.DARK_OAK_PLANKS.defaultBlockState(),
        // Dome
        Blocks.POLISHED_DEEPSLATE.defaultBlockState(),
        Blocks.POLISHED_DEEPSLATE_STAIRS,
        Blocks.POLISHED_DEEPSLATE_SLAB,
        // Glass
        Blocks.TINTED_GLASS.defaultBlockState(),
        // Sofa
        Blocks.WOOL_STAIRS.pick(DyeColor.BLACK),
        // Ambient
        St.lantern(Blocks.SOUL_LANTERN, false),
        St.lantern(Blocks.SOUL_LANTERN, true)
    );

    /** Look up a theme by id. Falls back to WARM_STUDIO. */
    public static Theme byId(String id) {
        return switch (id.toLowerCase()) {
            case "modern_glass", "modern", "glass" -> MODERN_GLASS;
            case "executive", "exec", "dark" -> EXECUTIVE;
            default -> WARM_STUDIO;
        };
    }

    /** All built-in themes for UI listing. */
    public static Theme[] all() {
        return new Theme[] { WARM_STUDIO, MODERN_GLASS, EXECUTIVE };
    }
}
