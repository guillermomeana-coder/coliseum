package dev.agentcraft.hq;

import dev.agentcraft.AgentCraft;
import dev.agentcraft.Cast;
import dev.agentcraft.block.ModBlocks;
import dev.agentcraft.block.PanelBlock;
import dev.agentcraft.layout.AnchorNames;
import dev.agentcraft.layout.Anchors;
import java.util.List;
import java.util.Locale;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * The OpenClaw Coliseum: a battle-royale arena supporting up to 100 simultaneous agents.
 * Elliptical Roman amphitheater inspired by the real Colosseum, scaled up for mass combat.
 *
 * <p>Based on the Compact Roman Colosseum schematic palette: polished diorite, chiseled sandstone,
 * stone bricks, cut sandstone, smooth sandstone. Elliptical shape (wider on X axis), 4 axial
 * gates (N/S/E/W), 3 tiers of arched walls, interior seating bowl (= eliminated zone),
 * 100 arena spots in concentric rings, central champion stage.
 *
 * <pre>
 *   Ellipse radii: X=35, Z=28 (outer wall)
 *   Arena radii:   X=22, Z=17
 *   4 concentric rings of arena spots (12+20+28+40 = 100)
 *   Champion stage: radius 5, raised 2 blocks
 *   Scoreboard wall on west interior
 *   4 axial gates (width 3) at N/S/E/W
 *   28 blocks tall (floor to parapet)
 * </pre>
 */
public final class ColiseumBuilder implements HqBuilder {
    public static final String ID = "coliseum";

    // ------------------------------------------------------------------ dimensions
    static final int GROUND = 64;
    static final int FLOOR = 65;
    static final int FEET = 66;

    /** Centre of the coliseum. */
    static final int CX = 0, CZ = 0;

    /** Ellipse semi-axes for the outer wall. */
    static final int OUTER_RX = 35;
    static final int OUTER_RZ = 28;

    /** Ellipse semi-axes for the arena floor. */
    static final int ARENA_RX = 22;
    static final int ARENA_RZ = 17;

    /** Stage radius (circular, centred). */
    static final int STAGE_R = 5;

    /** Wall height tiers. */
    static final int TIER_H = 5;      // height per tier
    static final int NUM_TIERS = 4;   // 4 tiers of arched wall
    static final int WALL_TOP = FEET + NUM_TIERS * TIER_H; // y=86
    static final int PARAPET = WALL_TOP + 2;

    /** Gate half-width (width 3 means -1..+1). */
    static final int GATE_W = 1;

    /** Site box. */
    static final int[] SITE = {-38, 60, -31, 38, 95, 31};

    /** Arena spot ring definitions: {count, radius}. Total = 12+20+28+40 = 100. */
    static final int[][] SPOT_RINGS = {
        {12, 7},
        {20, 10},
        {28, 13},
        {40, 16}
    };

    // ------------------------------------------------------------------ materials (Roman Colosseum palette)
    static final BlockState AIR = Blocks.AIR.defaultBlockState();
    static final BlockState FOUNDATION = Blocks.STONE_BRICKS.defaultBlockState();
    static final BlockState WALL_MAIN = Blocks.CHISELED_SANDSTONE.defaultBlockState();
    static final BlockState WALL_ACCENT = Blocks.CUT_SANDSTONE.defaultBlockState();
    static final BlockState WALL_SMOOTH = Blocks.SMOOTH_SANDSTONE.defaultBlockState();
    static final BlockState COLUMN = Blocks.POLISHED_DIORITE.defaultBlockState();
    static final BlockState COLUMN_TOP = Blocks.SMOOTH_QUARTZ.defaultBlockState();
    static final BlockState ARCH_BLOCK = Blocks.SMOOTH_SANDSTONE.defaultBlockState();
    static final BlockState FLOOR_ARENA = Blocks.SMOOTH_SANDSTONE.defaultBlockState();
    static final BlockState FLOOR_RING = Blocks.SMOOTH_RED_SANDSTONE.defaultBlockState();
    static final BlockState STAGE_BLOCK = Blocks.GILDED_BLACKSTONE.defaultBlockState();
    static final BlockState STAGE_EDGE = Blocks.SEA_LANTERN.defaultBlockState();
    static final Block SEAT_STAIRS = Blocks.SANDSTONE_STAIRS;
    static final Block SEAT_ACCENT_STAIRS = Blocks.STONE_BRICK_STAIRS;
    static final BlockState RUIN = Blocks.CRACKED_STONE_BRICKS.defaultBlockState();
    static final BlockState LANTERN_BLOCK = St.lantern(Blocks.LANTERN, false);
    static final BlockState LANTERN_HANG = St.lantern(Blocks.LANTERN, true);
    static final BlockState BANNER_BLOCK = Blocks.SANDSTONE_WALL.defaultBlockState();
    static final BlockState PLANK = Blocks.OAK_PLANKS.defaultBlockState();
    // Spot marker blocks — 4 different colors for the 4 rings
    static final BlockState SPOT_RING1 = St.concrete(net.minecraft.world.item.DyeColor.RED);
    static final BlockState SPOT_RING2 = St.concrete(net.minecraft.world.item.DyeColor.ORANGE);
    static final BlockState SPOT_RING3 = St.concrete(net.minecraft.world.item.DyeColor.YELLOW);
    static final BlockState SPOT_RING4 = St.concrete(net.minecraft.world.item.DyeColor.LIME);

    @Override
    public String id() { return ID; }

    @Override
    public String description() {
        return "OpenClaw Coliseum: elliptical battle-royale arena with 100 agent spots, champion stage, scoreboard, spectator seating";
    }

    @Override
    public void build(ServerLevel level, Anchors.Builder a) {
        build(level, a, Options.DEFAULT);
    }

    @Override
    public @Nullable String build(ServerLevel level, Anchors.Builder a, Options options) {
        long t0 = System.nanoTime();
        Plan p = new Plan(SITE[0], SITE[1], SITE[2], SITE[3], SITE[4], SITE[5], GROUND,
            y -> y > GROUND ? AIR
                : y == GROUND ? Blocks.GRASS_BLOCK.defaultBlockState()
                : y >= GROUND - 3 ? Blocks.DIRT.defaultBlockState()
                : Blocks.STONE.defaultBlockState());

        foundation(p);
        arenaFloor(p);
        seatingBowl(p);
        outerWalls(p);
        arches(p);
        gates(p);
        parapet(p);
        championStage(p, a);
        arenaSpots(p, a);
        scoreboardWall(p, a);
        eliminatedZone(p, a);
        lighting(p);
        ruins(p);
        anchors(p, a);

        BlockState[] previous = PlanStore.load(level.getServer(), ID, SITE, p.size());
        Plan.Stats st = p.apply(level, previous, options.force());
        PlanStore.save(level.getServer(), ID, SITE, p.cells());

        a.bounds(-OUTER_RX, FLOOR, -OUTER_RZ, OUTER_RX, PARAPET, OUTER_RZ);
        a.spot(AnchorNames.ENTRANCE, CX, FEET, OUTER_RZ + 2, 180);
        // Spectator spawn: high above arena center, looking down at 60 degrees
        a.put(AnchorNames.SPAWN, CX + 0.5, FEET + 20, CZ + 0.5, 0, 60);

        long ms = (System.nanoTime() - t0) / 1_000_000;
        AgentCraft.LOGGER.info("Coliseum: {} cells, {} changed in {} ms", st.cells(), st.changed(), ms);
        return String.format(Locale.ROOT, "Coliseum built: %d blocks, %d ms", st.changed(), ms);
    }

    // ================================================================== helpers

    /** Is (x,z) inside the ellipse with semi-axes rx, rz? */
    static boolean inEllipse(int x, int z, double rx, double rz) {
        double nx = x / rx, nz = z / rz;
        return nx * nx + nz * nz <= 1.0;
    }

    /** Ellipse radius at angle for (x,z). Returns distance from center normalized to 0..1. */
    static double ellipseNorm(int x, int z, double rx, double rz) {
        double nx = x / rx, nz = z / rz;
        return Math.sqrt(nx * nx + nz * nz);
    }

    /** Is this position inside a gate opening? 4 axial gates at N/S/E/W (width 3). */
    static boolean isGate(int x, int z) {
        // North/South gates: |x| <= GATE_W
        if (Math.abs(x) <= GATE_W && (Math.abs(z) > ARENA_RZ - 1)) return true;
        // East/West gates: |z| <= GATE_W
        if (Math.abs(z) <= GATE_W && (Math.abs(x) > ARENA_RX - 1)) return true;
        return false;
    }

    // ================================================================== foundation

    private static void foundation(Plan p) {
        for (int x = -OUTER_RX - 1; x <= OUTER_RX + 1; x++) {
            for (int z = -OUTER_RZ - 1; z <= OUTER_RZ + 1; z++) {
                if (inEllipse(x, z, OUTER_RX + 1.5, OUTER_RZ + 1.5)) {
                    p.set(x, GROUND, z, Blocks.DIRT.defaultBlockState());
                    p.set(x, FLOOR, z, FOUNDATION);
                }
            }
        }
    }

    // ================================================================== arena floor

    private static void arenaFloor(Plan p) {
        for (int x = -ARENA_RX; x <= ARENA_RX; x++) {
            for (int z = -ARENA_RZ; z <= ARENA_RZ; z++) {
                if (!inEllipse(x, z, ARENA_RX + 0.5, ARENA_RZ + 0.5)) continue;
                p.set(x, FLOOR, z, FLOOR_ARENA);
                // Decorative elliptical rings
                double norm = ellipseNorm(x, z, ARENA_RX, ARENA_RZ);
                if (Math.abs(norm - 0.5) < 0.06 || Math.abs(norm - 0.95) < 0.06) {
                    p.set(x, FLOOR, z, FLOOR_RING);
                }
                // Clear air above
                for (int y = FEET; y <= PARAPET; y++) {
                    p.set(x, y, z, AIR);
                }
            }
        }
    }

    // ================================================================== seating bowl

    private static void seatingBowl(Plan p) {
        // Stepped seating between arena edge and outer wall
        for (int x = -OUTER_RX; x <= OUTER_RX; x++) {
            for (int z = -OUTER_RZ; z <= OUTER_RZ; z++) {
                if (!inEllipse(x, z, OUTER_RX + 0.5, OUTER_RZ + 0.5)) continue;
                if (inEllipse(x, z, ARENA_RX + 0.5, ARENA_RZ + 0.5)) continue;
                if (isGate(x, z)) continue;

                // Step height: each row is 1 block higher
                int step = (int) ((ellipseNorm(x, z, ARENA_RX, ARENA_RZ) - 1.0) * 12);
                step = Math.max(0, Math.min(step, NUM_TIERS * TIER_H - 2));

                // Fill solid underneath
                for (int y = FLOOR; y <= FLOOR + step; y++) {
                    p.set(x, y, z, FOUNDATION);
                }
                // Seat on top (alternating for texture)
                BlockState seat = step % 3 == 0 ? WALL_SMOOTH : WALL_ACCENT;
                p.set(x, FLOOR + step + 1, z, seat);

                // Clear above seats
                for (int y = FLOOR + step + 2; y <= PARAPET; y++) {
                    p.set(x, y, z, AIR);
                }
            }
        }
    }

    // ================================================================== outer walls with arches

    private static void outerWalls(Plan p) {
        for (int x = -OUTER_RX - 1; x <= OUTER_RX + 1; x++) {
            for (int z = -OUTER_RZ - 1; z <= OUTER_RZ + 1; z++) {
                boolean outer = inEllipse(x, z, OUTER_RX + 1.5, OUTER_RZ + 1.5);
                boolean inner = inEllipse(x, z, OUTER_RX - 0.5, OUTER_RZ - 0.5);
                if (!outer || inner) continue;
                if (isGate(x, z)) continue;

                // Wall shell: all tiers
                for (int y = FLOOR; y <= WALL_TOP; y++) {
                    int tier = (y - FEET) / TIER_H;
                    p.set(x, y, z, tier % 2 == 0 ? WALL_MAIN : WALL_ACCENT);
                }
                // Horizontal bands between tiers
                for (int t = 1; t <= NUM_TIERS; t++) {
                    int bandY = FEET + t * TIER_H;
                    if (bandY <= WALL_TOP) {
                        p.set(x, bandY, z, WALL_SMOOTH);
                    }
                }
            }
        }
    }

    // ================================================================== arches in outer wall

    private static void arches(Plan p) {
        // Place arches around the ellipse perimeter at regular intervals
        int numArches = 48; // more arches for larger perimeter
        for (int i = 0; i < numArches; i++) {
            double angle = Math.toRadians(i * (360.0 / numArches));
            int ax = (int) Math.round(OUTER_RX * Math.sin(angle));
            int az = (int) Math.round(OUTER_RZ * Math.cos(angle));

            if (isGate(ax, az)) continue;

            // Column on each side of arch
            for (int tier = 0; tier < NUM_TIERS; tier++) {
                int baseY = FEET + tier * TIER_H;

                // Columns (2 blocks apart, centered on arch position)
                // Use perpendicular direction to ellipse
                double normAngle = Math.atan2(ax / (double) OUTER_RX, az / (double) OUTER_RZ);
                int dx = (int) Math.round(Math.cos(normAngle));
                int dz = (int) Math.round(-Math.sin(normAngle));

                // Left and right column
                for (int s : new int[]{-1, 1}) {
                    int cx = ax + s * dz;
                    int cz = az + s * dx;
                    if (!inEllipse(cx, cz, OUTER_RX + 1.5, OUTER_RZ + 1.5)) continue;

                    for (int y = baseY; y < baseY + TIER_H - 1; y++) {
                        p.set(cx, y, cz, COLUMN);
                    }
                    // Capital
                    p.set(cx, baseY + TIER_H - 1, cz, COLUMN_TOP);
                }

                // Arch opening between columns (clear 1 block wide, 3 tall)
                if (tier < 3) { // only lower 3 tiers have open arches
                    for (int y = baseY; y < baseY + 3; y++) {
                        p.set(ax, y, az, AIR);
                    }
                    // Arch top (rounded)
                    p.set(ax, baseY + 3, az, ARCH_BLOCK);
                }
            }
        }
    }

    // ================================================================== 4 axial gates (width 3)

    private static void gates(Plan p) {
        int gateH = 4;

        // South gate (main entrance)
        for (int x = -GATE_W; x <= GATE_W; x++) {
            for (int z = ARENA_RZ; z <= OUTER_RZ + 1; z++) {
                p.set(x, FLOOR, z, WALL_SMOOTH);
                for (int y = FEET; y < FEET + gateH; y++) {
                    p.set(x, y, z, AIR);
                }
                if (Math.abs(x) < GATE_W) {
                    p.set(x, FEET + gateH, z, ARCH_BLOCK);
                } else {
                    for (int y = FEET; y <= FEET + gateH + 1; y++) {
                        p.set(x, y, z, COLUMN);
                    }
                }
            }
        }

        // North gate
        for (int x = -GATE_W; x <= GATE_W; x++) {
            for (int z = -OUTER_RZ - 1; z <= -ARENA_RZ; z++) {
                p.set(x, FLOOR, z, WALL_SMOOTH);
                for (int y = FEET; y < FEET + gateH; y++) {
                    p.set(x, y, z, AIR);
                }
                if (Math.abs(x) < GATE_W) {
                    p.set(x, FEET + gateH, z, ARCH_BLOCK);
                } else {
                    for (int y = FEET; y <= FEET + gateH + 1; y++) {
                        p.set(x, y, z, COLUMN);
                    }
                }
            }
        }

        // East gate
        for (int z = -GATE_W; z <= GATE_W; z++) {
            for (int x = ARENA_RX; x <= OUTER_RX + 1; x++) {
                p.set(x, FLOOR, z, WALL_SMOOTH);
                for (int y = FEET; y < FEET + gateH; y++) {
                    p.set(x, y, z, AIR);
                }
                if (Math.abs(z) < GATE_W) {
                    p.set(x, FEET + gateH, z, ARCH_BLOCK);
                } else {
                    for (int y = FEET; y <= FEET + gateH + 1; y++) {
                        p.set(x, y, z, COLUMN);
                    }
                }
            }
        }

        // West gate
        for (int z = -GATE_W; z <= GATE_W; z++) {
            for (int x = -OUTER_RX - 1; x <= -ARENA_RX; x++) {
                p.set(x, FLOOR, z, WALL_SMOOTH);
                for (int y = FEET; y < FEET + gateH; y++) {
                    p.set(x, y, z, AIR);
                }
                if (Math.abs(z) < GATE_W) {
                    p.set(x, FEET + gateH, z, ARCH_BLOCK);
                } else {
                    for (int y = FEET; y <= FEET + gateH + 1; y++) {
                        p.set(x, y, z, COLUMN);
                    }
                }
            }
        }
    }

    // ================================================================== parapet and top

    private static void parapet(Plan p) {
        for (int x = -OUTER_RX - 1; x <= OUTER_RX + 1; x++) {
            for (int z = -OUTER_RZ - 1; z <= OUTER_RZ + 1; z++) {
                boolean outer = inEllipse(x, z, OUTER_RX + 1.5, OUTER_RZ + 1.5);
                boolean inner = inEllipse(x, z, OUTER_RX - 0.5, OUTER_RZ - 0.5);
                if (!outer || inner) continue;
                if (isGate(x, z)) continue;

                // Crenellations: alternating merlons and crenels
                boolean merlon = ((x + z) % 2 == 0);
                if (merlon) {
                    p.set(x, WALL_TOP + 1, z, WALL_ACCENT);
                    p.set(x, WALL_TOP + 2, z, WALL_SMOOTH);
                }
            }
        }
    }

    // ================================================================== champion stage (central raised platform)

    private static void championStage(Plan p, Anchors.Builder a) {
        for (int x = -STAGE_R; x <= STAGE_R; x++) {
            for (int z = -STAGE_R; z <= STAGE_R; z++) {
                double r = Math.sqrt(x * x + z * z);
                if (r > STAGE_R + 0.5) continue;

                // Raised 2 blocks: fill FLOOR and FEET with solid, stand on FEET+1
                p.set(x, FLOOR, z, STAGE_BLOCK);
                p.set(x, FEET, z, STAGE_BLOCK);
                p.set(x, FEET + 1, z, STAGE_BLOCK);
                // Edge ring of sea lanterns
                if (r > STAGE_R - 0.7) {
                    p.set(x, FEET + 1, z, STAGE_EDGE);
                }
                // Clear air above the platform
                for (int y = FEET + 2; y <= FEET + 8; y++) {
                    p.set(x, y, z, AIR);
                }
            }
        }
        // Central marker on top of the platform
        p.set(CX, FEET + 2, CZ, Blocks.SEA_LANTERN.defaultBlockState());

        // Champion stage anchor (standing on top of the raised platform)
        a.put("champion_stage", CX + 0.5, FEET + 2, CZ + 0.5, 0, 0);
    }

    // ================================================================== 100 arena spots in concentric rings

    private static void arenaSpots(Plan p, Anchors.Builder a) {
        int spotIndex = 0;
        BlockState[] ringMarkers = {SPOT_RING1, SPOT_RING2, SPOT_RING3, SPOT_RING4};

        for (int ring = 0; ring < SPOT_RINGS.length; ring++) {
            int count = SPOT_RINGS[ring][0];
            int radius = SPOT_RINGS[ring][1];
            BlockState marker = ringMarkers[ring];

            for (int i = 0; i < count; i++) {
                double angle = Math.toRadians(i * (360.0 / count));
                int sx = CX + (int) Math.round(radius * Math.sin(angle));
                int sz = CZ - (int) Math.round(radius * Math.cos(angle));

                // Floor marker (different color per ring)
                p.set(sx, FLOOR, sz, marker);

                // Anchor for this spot
                float yaw = (float) Math.toDegrees(Math.atan2(sx - CX, -(sz - CZ)));
                a.put("arena_spot_" + spotIndex, sx + 0.5, FEET, sz + 0.5, yaw, 0);

                spotIndex++;
            }
        }
    }

    // ================================================================== scoreboard wall (west interior)

    private static void scoreboardWall(Plan p, Anchors.Builder a) {
        // 20 blocks wide, 10 blocks tall on the west interior wall — task board panels facing east
        int wallX = -ARENA_RX + 1;
        int startZ = -10;
        int endZ = 9;
        int startY = FEET + 1;
        int endY = FEET + 10;

        BlockState board = ModBlocks.TASK_BOARD.defaultBlockState()
            .setValue(PanelBlock.FACING, Direction.EAST);
        for (int z = startZ; z <= endZ; z++) {
            for (int y = startY; y <= endY; y++) {
                p.set(wallX, y, z, board);
            }
        }

        // Scoreboard anchor at the center of the wall
        a.put("scoreboard", wallX + 0.5, FEET + 5, CZ + 0.5, 90, 0);
    }

    // ================================================================== eliminated zone (seating tiers with anchors)

    private static void eliminatedZone(Plan p, Anchors.Builder a) {
        // Spread 100 eliminated anchors across the seating tiers
        // Distribute them around the elliptical seating bowl
        for (int i = 0; i < 100; i++) {
            double angle = Math.toRadians(i * (360.0 / 100));
            // Place in the seating area (between arena edge and outer wall)
            double seatRadius = 0.6; // 60% of the way from arena to outer wall
            int ex = (int) Math.round((ARENA_RX + (OUTER_RX - ARENA_RX) * seatRadius) * Math.sin(angle));
            int ez = (int) Math.round((ARENA_RZ + (OUTER_RZ - ARENA_RZ) * seatRadius) * Math.cos(angle));

            // Calculate the seating step height at this position
            double norm = ellipseNorm(ex, ez, ARENA_RX, ARENA_RZ);
            int step = (int) ((norm - 1.0) * 12);
            step = Math.max(0, Math.min(step, NUM_TIERS * TIER_H - 2));
            int seatY = FLOOR + step + 2; // stand on top of the seat

            float yaw = (float) Math.toDegrees(Math.atan2(-ex, ez));
            a.put("eliminated_" + i, ex + 0.5, seatY, ez + 0.5, yaw, 0);
        }
    }

    // ================================================================== lighting

    private static void lighting(Plan p) {
        // Ring of lanterns at arena edge
        for (int i = 0; i < 36; i++) {
            double angle = Math.toRadians(i * 10);
            int lx = (int) Math.round(ARENA_RX * Math.sin(angle));
            int lz = (int) Math.round(ARENA_RZ * Math.cos(angle));
            p.set(lx, FLOOR, lz, Blocks.SEA_LANTERN.defaultBlockState());
        }

        // Lanterns on top of outer wall columns (every 8th position)
        for (int i = 0; i < 24; i++) {
            double angle = Math.toRadians(i * 15);
            int wx = (int) Math.round((OUTER_RX + 0.5) * Math.sin(angle));
            int wz = (int) Math.round((OUTER_RZ + 0.5) * Math.cos(angle));
            p.set(wx, WALL_TOP + 1, wz, LANTERN_BLOCK);
        }

        // Hanging lanterns inside the arena at seating level
        for (int i = 0; i < 12; i++) {
            double angle = Math.toRadians(i * 30 + 15);
            int hx = (int) Math.round((ARENA_RX + 3) * Math.sin(angle));
            int hz = (int) Math.round((ARENA_RZ + 3) * Math.cos(angle));
            // Pole + hanging lantern
            p.set(hx, FEET + 8, hz, Blocks.OAK_FENCE.defaultBlockState());
            p.set(hx, FEET + 7, hz, LANTERN_HANG);
        }
    }

    // ================================================================== ruins (weathering at top)

    private static void ruins(Plan p) {
        // Add cracked/weathered blocks to top tier for authentic Roman look
        java.util.Random rng = new java.util.Random(42); // deterministic
        for (int x = -OUTER_RX - 1; x <= OUTER_RX + 1; x++) {
            for (int z = -OUTER_RZ - 1; z <= OUTER_RZ + 1; z++) {
                boolean outer = inEllipse(x, z, OUTER_RX + 1.5, OUTER_RZ + 1.5);
                boolean inner = inEllipse(x, z, OUTER_RX - 0.5, OUTER_RZ - 0.5);
                if (!outer || inner) continue;

                // Random weathering on top tier
                if (rng.nextFloat() < 0.15) {
                    int wy = WALL_TOP - rng.nextInt(3);
                    p.set(x, wy, z, RUIN);
                }
                // Random missing blocks at very top (broken parapet)
                if (rng.nextFloat() < 0.1) {
                    p.set(x, WALL_TOP, z, AIR);
                    p.set(x, WALL_TOP + 1, z, AIR);
                    p.set(x, WALL_TOP + 2, z, AIR);
                }
            }
        }
    }

    // ================================================================== anchors

    private static void anchors(Plan p, Anchors.Builder a) {
        // Task wall — positioned at the front face of the board (panel depth 3px = 0.1875 blocks)
        a.put(AnchorNames.TASK_WALL, -ARENA_RX + 1 + 1 - 0.1875, FEET + 1, CZ + 0.5, 90, 0);
        // Decision podium (east inner wall)
        a.spot(AnchorNames.DECISION_PODIUM, ARENA_RX - 1, FEET, CZ, 270);
        // Goal atrium (centre stage)
        a.spot(AnchorNames.GOAL_ATRIUM, CX, FEET + 2, CZ, 180);

        // Lounge slots (upper tiers, north)
        for (int i = 0; i < 6; i++) {
            int lx = -6 + i * 2;
            a.put(AnchorNames.slot(AnchorNames.LOUNGE, i + 1), lx + 0.5, FEET + 10, -ARENA_RZ - 2.5, 180, 0);
        }
        // Meeting slots (upper tiers, east)
        for (int i = 0; i < 6; i++) {
            a.put(AnchorNames.slot(AnchorNames.MEETING, i + 1), ARENA_RX + 2.5, FEET + 10, -3 + i * 1.5, 270, 0);
        }

        // Cameras
        a.put("camera_overview", CX + 0.5, FEET + 30, CZ + 0.5, 0, 90);
        a.put("camera_stage", CX + 0.5, FEET + 6, CZ + STAGE_R + 6.5, 0, 15);
        a.put("camera_spectator", 0.5, FEET + 20, OUTER_RZ - 1.5, 180, 40);
        a.cameraLookAt("gate_south", CX + 0.5, FEET + 2, OUTER_RZ + 3.5, CX, FEET + 2, CZ);
    }
}
