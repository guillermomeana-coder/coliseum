package dev.agentcraft.hq;

import dev.agentcraft.AgentCraft;
import dev.agentcraft.Cast;
import dev.agentcraft.block.ModBlocks;
import dev.agentcraft.layout.AnchorNames;
import dev.agentcraft.layout.Anchors;
import java.util.List;
import java.util.Locale;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import org.jspecify.annotations.Nullable;

/**
 * The OpenClaw Coliseum: a circular arena where AI agents debate ideas while the user spectates
 * from tiered seating above. Designed for the Arena skill — agents stand at podiums around a
 * central stage, present arguments via speech bubbles, and the audience (user) judges.
 *
 * <pre>
 *   Layout (top view, centre at 0,0):
 *
 *          ┌─── Tier 3 (r=22-24) ── upper gallery ───┐
 *          │  ┌─ Tier 2 (r=18-21) ── mid seating ──┐ │
 *          │  │  ┌─ Tier 1 (r=14-17) ── front ──┐  │ │
 *          │  │  │                               │  │ │
 *          │  │  │    Podiums (r=10) × 8         │  │ │
 *          │  │  │         ┌─────┐               │  │ │
 *          │  │  │         │Stage│               │  │ │
 *          │  │  │         │ r=4 │               │  │ │
 *          │  │  │         └─────┘               │  │ │
 *          │  │  │                               │  │ │
 *          │  │  └───────────────────────────────┘  │ │
 *          │  └─────────────────────────────────────┘ │
 *          └──────────── Gate (south) ────────────────┘
 *
 *   Cross-section:
 *     y=74  ·····  Tier 3 seating
 *     y=72  ···    Tier 2 seating
 *     y=70  ·      Tier 1 seating
 *     y=68         Podium level (agents stand here)
 *     y=67         Arena floor
 *     y=66         Stage platform
 * </pre>
 *
 * Floor at y=65 (same as StudioHqBuilder for compatibility). The coliseum sits in a cleared
 * flat area. Podiums are evenly spaced around the central stage at 45° intervals.
 */
public final class ColiseumBuilder implements HqBuilder {
    public static final String ID = "coliseum";

    // ------------------------------------------------------------------ dimensions
    static final int GROUND = 64;
    static final int FLOOR = 65;
    static final int FEET = 66;
    static final int ARENA_FLOOR = FEET;
    static final int STAGE_Y = FEET;
    static final int PODIUM_Y = FEET;

    /** Centre of the coliseum. */
    static final int CX = 0, CZ = 0;
    /** Radii */
    static final int STAGE_R = 4;
    static final int PODIUM_R = 10;
    static final int ARENA_R = 13;
    static final int TIER1_R = 14;
    static final int TIER2_R = 18;
    static final int TIER3_R = 22;
    static final int OUTER_R = 25;
    /** Wall height above ground. */
    static final int WALL_H = 12;

    /** Site box. */
    static final int[] SITE = {-28, 60, -28, 28, 90, 28};

    // ------------------------------------------------------------------ materials
    static final BlockState AIR = Blocks.AIR.defaultBlockState();
    static final BlockState STONE = Blocks.POLISHED_DEEPSLATE.defaultBlockState();
    static final BlockState STONE_BRICK = Blocks.DEEPSLATE_BRICKS.defaultBlockState();
    static final BlockState STONE_TILE = Blocks.DEEPSLATE_TILES.defaultBlockState();
    static final BlockState SAND_FLOOR = Blocks.SMOOTH_SANDSTONE.defaultBlockState();
    static final BlockState STAGE_BLOCK = Blocks.POLISHED_BLACKSTONE.defaultBlockState();
    static final BlockState STAGE_ACCENT = Blocks.GILDED_BLACKSTONE.defaultBlockState();
    static final BlockState PILLAR = Blocks.QUARTZ_PILLAR.defaultBlockState();
    static final BlockState SEAT_STONE = Blocks.POLISHED_ANDESITE.defaultBlockState();
    static final BlockState SEAT_DARK = Blocks.POLISHED_BASALT.defaultBlockState();
    static final BlockState PODIUM_BASE = Blocks.POLISHED_BLACKSTONE.defaultBlockState();
    static final BlockState PODIUM_TOP = Blocks.SMOOTH_QUARTZ.defaultBlockState();
    static final BlockState BANNER_POLE = Blocks.IRON_BARS.defaultBlockState();
    static final BlockState TORCH_BLOCK = Blocks.SOUL_LANTERN.defaultBlockState();
    static final BlockState GLOW = Blocks.SEA_LANTERN.defaultBlockState();
    static final BlockState FENCE = Blocks.DEEPSLATE_BRICK_WALL.defaultBlockState();

    /** 8 podium positions around the stage (45° intervals). */
    static final int[][] PODIUM_POS = new int[8][2];
    static {
        for (int i = 0; i < 8; i++) {
            double angle = Math.toRadians(i * 45);
            PODIUM_POS[i][0] = CX + (int) Math.round(PODIUM_R * Math.sin(angle));
            PODIUM_POS[i][1] = CZ - (int) Math.round(PODIUM_R * Math.cos(angle));
        }
    }

    @Override
    public String id() { return ID; }

    @Override
    public String description() {
        return "OpenClaw Coliseum: circular debate arena with tiered spectator seating and 8 podiums";
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

        // Build all sections
        foundation(p);
        arenaFloor(p);
        stage(p);
        podiums(p, a);
        tieredSeating(p);
        outerWall(p);
        pillarsAndArches(p);
        lighting(p);
        entrance(p, a);
        cameras(a);

        // Apply
        BlockState[] previous = PlanStore.load(level.getServer(), ID, SITE, p.size());
        Plan.Stats st = p.apply(level, previous, options.force());
        PlanStore.save(level.getServer(), ID, SITE, p.cells());

        a.bounds(-OUTER_R, FLOOR, -OUTER_R, OUTER_R, FLOOR + WALL_H, OUTER_R);
        a.spot(AnchorNames.ENTRANCE, CX, FEET, OUTER_R + 2, 180);
        a.put(AnchorNames.SPAWN, CX + 0.5, FEET + 8, OUTER_R - 3.5, 180, 30); // spectator view from top tier

        long ms = (System.nanoTime() - t0) / 1_000_000;
        AgentCraft.LOGGER.info("Coliseum: {} cells applied in {} ms ({} changed)", st.cells(), ms, st.changed());
        return String.format(Locale.ROOT, "Coliseum built: %d blocks, %d ms", st.changed(), ms);
    }

    // ================================================================== foundation

    private static void foundation(Plan p) {
        for (int x = -OUTER_R - 1; x <= OUTER_R + 1; x++) {
            for (int z = -OUTER_R - 1; z <= OUTER_R + 1; z++) {
                double r = Math.sqrt(x * x + z * z);
                if (r <= OUTER_R + 1) {
                    p.set(x, GROUND, z, Blocks.DIRT.defaultBlockState());
                    p.set(x, FLOOR, z, r <= OUTER_R ? STONE : Blocks.GRASS_BLOCK.defaultBlockState());
                }
            }
        }
    }

    // ================================================================== arena floor

    private static void arenaFloor(Plan p) {
        for (int x = -ARENA_R; x <= ARENA_R; x++) {
            for (int z = -ARENA_R; z <= ARENA_R; z++) {
                double r = Math.sqrt(x * x + z * z);
                if (r <= ARENA_R) {
                    p.set(x, FLOOR, z, SAND_FLOOR);
                    // Decorative rings on the floor
                    if (Math.abs(r - 6) < 0.6 || Math.abs(r - ARENA_R) < 0.6) {
                        p.set(x, FLOOR, z, STONE_TILE);
                    }
                }
                // Clear air above arena
                for (int y = FEET; y < FEET + WALL_H; y++) {
                    if (r <= ARENA_R) p.set(x, y, z, AIR);
                }
            }
        }
    }

    // ================================================================== central stage

    private static void stage(Plan p) {
        for (int x = -STAGE_R; x <= STAGE_R; x++) {
            for (int z = -STAGE_R; z <= STAGE_R; z++) {
                double r = Math.sqrt(x * x + z * z);
                if (r <= STAGE_R) {
                    // Raised platform
                    p.set(x, FLOOR, z, STAGE_BLOCK);
                    p.set(x, FEET, z, STAGE_BLOCK);
                    // Accent ring
                    if (Math.abs(r - STAGE_R) < 0.7) {
                        p.set(x, FEET, z, STAGE_ACCENT);
                    }
                    // Clear above
                    for (int y = FEET + 1; y < FEET + 10; y++) {
                        p.set(x, y, z, AIR);
                    }
                }
            }
        }
        // Central beacon/hologram point
        p.set(CX, FEET + 1, CZ, GLOW);
    }

    // ================================================================== podiums

    private static void podiums(Plan p, Anchors.Builder a) {
        List<String> cast = Cast.ids();
        for (int i = 0; i < 8; i++) {
            int px = PODIUM_POS[i][0];
            int pz = PODIUM_POS[i][1];

            // 3x3 podium base
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    p.set(px + dx, FLOOR, pz + dz, PODIUM_BASE);
                    p.set(px + dx, FEET, pz + dz, PODIUM_TOP);
                }
            }

            // Lectern/desk on podium (facing center)
            Direction facing = dirToCenter(px, pz);
            p.set(px, FEET + 1, pz, Blocks.LECTERN.defaultBlockState()
                .setValue(net.minecraft.world.level.block.LecternBlock.FACING, facing));

            // Anchor for agent desk + monitor
            String agentId = i < cast.size() ? cast.get(i) : "agent" + i;
            String deskAnchor = AnchorNames.desk(agentId);
            String monitorAnchor = AnchorNames.monitor(agentId);
            float yaw = (float) Math.toDegrees(Math.atan2(px - CX, -(pz - CZ)));
            a.put(deskAnchor, px + 0.5, FEET + 1, pz + 0.5, yaw, 0);
            a.put(monitorAnchor, px + 0.5, FEET + 2, pz + 0.5, yaw, 0);

            // Status lamp above podium
            p.set(px, FEET + 3, pz, ModBlocks.STATUS_LAMP.defaultBlockState());
        }
    }

    /** Direction from (x,z) towards center (0,0). */
    private static Direction dirToCenter(int x, int z) {
        int ax = Math.abs(x), az = Math.abs(z);
        if (ax >= az) return x > 0 ? Direction.WEST : Direction.EAST;
        return z > 0 ? Direction.NORTH : Direction.SOUTH;
    }

    // ================================================================== tiered seating

    private static void tieredSeating(Plan p) {
        for (int x = -TIER3_R - 1; x <= TIER3_R + 1; x++) {
            for (int z = -TIER3_R - 1; z <= TIER3_R + 1; z++) {
                double r = Math.sqrt(x * x + z * z);

                // Tier 1: front row (closest to arena)
                if (r >= TIER1_R && r < TIER2_R) {
                    int ty = FEET;
                    // Stepped: higher rows further out
                    int step = (int) (r - TIER1_R);
                    for (int y = FLOOR + 1; y <= FLOOR + 1 + step; y++) {
                        p.set(x, y, z, STONE_BRICK);
                    }
                    p.set(x, FLOOR + 2 + step, z, step % 2 == 0 ? SEAT_STONE : SEAT_DARK);
                }

                // Tier 2: mid seating
                if (r >= TIER2_R && r < TIER3_R) {
                    int step = (int) (r - TIER2_R) + 4;
                    for (int y = FLOOR + 1; y <= FLOOR + 1 + step; y++) {
                        p.set(x, y, z, STONE_BRICK);
                    }
                    p.set(x, FLOOR + 2 + step, z, step % 2 == 0 ? SEAT_STONE : SEAT_DARK);
                }

                // Tier 3: upper gallery
                if (r >= TIER3_R && r <= OUTER_R) {
                    int step = (int) (r - TIER3_R) + 8;
                    for (int y = FLOOR + 1; y <= FLOOR + 1 + step; y++) {
                        p.set(x, y, z, STONE_BRICK);
                    }
                    p.set(x, FLOOR + 2 + step, z, step % 2 == 0 ? SEAT_STONE : SEAT_DARK);
                }
            }
        }
    }

    // ================================================================== outer wall

    private static void outerWall(Plan p) {
        for (int x = -OUTER_R - 1; x <= OUTER_R + 1; x++) {
            for (int z = -OUTER_R - 1; z <= OUTER_R + 1; z++) {
                double r = Math.sqrt(x * x + z * z);
                if (r >= OUTER_R && r < OUTER_R + 1.5) {
                    for (int y = FLOOR; y <= FLOOR + WALL_H; y++) {
                        p.set(x, y, z, STONE_BRICK);
                    }
                    // Crenellations at top
                    boolean merlon = (x + z) % 3 == 0;
                    if (merlon) {
                        p.set(x, FLOOR + WALL_H + 1, z, STONE_TILE);
                    }
                }
            }
        }
    }

    // ================================================================== pillars & arches

    private static void pillarsAndArches(Plan p) {
        // 16 evenly spaced pillars on the outer wall
        for (int i = 0; i < 16; i++) {
            double angle = Math.toRadians(i * 22.5);
            int px = CX + (int) Math.round((OUTER_R) * Math.sin(angle));
            int pz = CZ - (int) Math.round((OUTER_R) * Math.cos(angle));

            // Pillar column
            for (int y = FLOOR; y <= FLOOR + WALL_H + 2; y++) {
                p.set(px, y, pz, PILLAR);
            }
            // Capital
            p.set(px, FLOOR + WALL_H + 2, pz, St.slab(Blocks.QUARTZ_SLAB, false));

            // Torch on each pillar (interior side)
            int tx = px - (int) Math.signum(px);
            int tz = pz - (int) Math.signum(pz);
            p.set(tx, FLOOR + WALL_H - 2, tz, TORCH_BLOCK);
        }
    }

    // ================================================================== lighting

    private static void lighting(Plan p) {
        // Ring of sea lanterns around the arena edge (recessed in floor)
        for (int i = 0; i < 24; i++) {
            double angle = Math.toRadians(i * 15);
            int lx = CX + (int) Math.round(ARENA_R * Math.sin(angle));
            int lz = CZ - (int) Math.round(ARENA_R * Math.cos(angle));
            p.set(lx, FLOOR, lz, GLOW);
        }

        // Lanterns on podium posts
        for (int i = 0; i < 8; i++) {
            int px = PODIUM_POS[i][0];
            int pz = PODIUM_POS[i][1];
            p.set(px + 1, FEET + 3, pz + 1, St.lantern(Blocks.LANTERN, false));
            p.set(px - 1, FEET + 3, pz - 1, St.lantern(Blocks.LANTERN, false));
        }

        // Central stage spotlight (light blocks above)
        for (int y = FEET + 6; y <= FEET + 8; y++) {
            p.set(CX, y, CZ, GLOW); // sea lantern as spotlight
        }
    }

    // ================================================================== entrance

    private static void entrance(Plan p, Anchors.Builder a) {
        // South gate: 5-wide, 4-tall opening
        for (int x = -2; x <= 2; x++) {
            for (int y = FEET; y <= FEET + 3; y++) {
                p.set(x, y, OUTER_R, AIR);
                p.set(x, y, OUTER_R + 1, AIR);
            }
        }
        // Gate frame
        p.fill(-3, FLOOR, OUTER_R, -3, FLOOR + WALL_H, OUTER_R, PILLAR);
        p.fill(3, FLOOR, OUTER_R, 3, FLOOR + WALL_H, OUTER_R, PILLAR);
        p.fill(-2, FEET + 4, OUTER_R, 2, FEET + 4, OUTER_R, STONE);

        // Path from gate
        for (int z = OUTER_R + 1; z <= OUTER_R + 5; z++) {
            for (int x = -2; x <= 2; x++) {
                p.set(x, FLOOR, z, STONE_TILE);
            }
        }

        // Task wall (west side of arena, visible from spectator seats)
        int twX = -ARENA_R + 1;
        a.spot(AnchorNames.TASK_WALL, twX, FEET + 1, CZ, 90);

        // Decision podium (east side, user faces it)
        a.spot(AnchorNames.DECISION_PODIUM, ARENA_R - 1, FEET, CZ, 270);

        // Goal atrium anchor (center of stage)
        a.spot(AnchorNames.GOAL_ATRIUM, CX, FEET + 1, CZ, 180);

        // Lounge slots for off-shift agents (behind tier 3, north side)
        for (int i = 0; i < 6; i++) {
            int lx = -8 + i * 3;
            a.put(AnchorNames.slot(AnchorNames.LOUNGE, i + 1), lx + 0.5, FEET + 9, -TIER3_R + 0.5, 180, 0);
        }

        // Meeting slots (in the upper gallery, east)
        for (int i = 0; i < 6; i++) {
            a.put(AnchorNames.slot(AnchorNames.MEETING, i + 1), TIER3_R - 1.5, FEET + 9, -4 + i * 2 + 0.5, 270, 0);
        }
    }

    // ================================================================== cameras

    private static void cameras(Anchors.Builder a) {
        // Overhead view
        a.put("camera_overview", CX + 0.5, FEET + 20, CZ + 0.5, 0, 90);
        // Stage close-up
        a.put("camera_stage", CX + 0.5, FEET + 4, STAGE_R + 4.5, 0, 20);
        // Spectator POV
        a.put("camera_spectator", 0.5, FEET + 10, OUTER_R - 2.5, 180, 30);
        // Each podium
        for (int i = 0; i < 8; i++) {
            int px = PODIUM_POS[i][0];
            int pz = PODIUM_POS[i][1];
            float yaw = (float) Math.toDegrees(Math.atan2(-(px - CX), pz - CZ));
            a.put("camera_podium_" + i, px + 0.5, FEET + 3, pz + 0.5, yaw, 10);
        }
    }
}
