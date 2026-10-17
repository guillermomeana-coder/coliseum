package dev.agentcraft.hq;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import dev.agentcraft.command.AgentCraftCommands;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.IronBarsBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Iron-bar portcullis at the 4 coliseum gates. One row of bars sits across the outer face of each
 * gate passage (the cell plane at {@code OUTER_R* + 1}), over the full opening height. The built
 * world keeps the gates RAISED (open); {@code /agentcraft coliseum gates <raise|lower> [n|s|e|w|all]}
 * lowers or raises them. Only open gate cells (air, carpet or our own bars) are ever touched.
 */
public final class ColiseumPortcullis {
    private ColiseumPortcullis() {
    }

    /** One gate: its name, the outward direction and the cells of the bar plane (lateral offsets inside the passage). */
    public record Gate(String name, Direction outward, List<BlockPos> cells) {
    }

    /** Opening height in blocks (y FEET .. FEET+3; the arch sits at FEET+4). */
    static final int OPEN_H = 4;

    /** Geometry of the 4 gates (bar plane = outermost passage cell), reusable by other gate code. */
    public static List<Gate> gates() {
        List<Gate> out = new ArrayList<>();
        out.add(new Gate("n", Direction.NORTH, plane(true, -ColiseumBuilder.OUTER_RZ - 1)));
        out.add(new Gate("s", Direction.SOUTH, plane(true, ColiseumBuilder.OUTER_RZ + 1)));
        out.add(new Gate("e", Direction.EAST, plane(false, ColiseumBuilder.OUTER_RX + 1)));
        out.add(new Gate("w", Direction.WEST, plane(false, -ColiseumBuilder.OUTER_RX - 1)));
        return out;
    }

    /** Candidate cells of the plane: lateral |c| <= GATE_W, y FEET..FEET+3 (columns filter themselves out at runtime). */
    private static List<BlockPos> plane(boolean alongX, int fixed) {
        List<BlockPos> l = new ArrayList<>();
        for (int c = -ColiseumBuilder.GATE_W; c <= ColiseumBuilder.GATE_W; c++) {
            for (int y = ColiseumBuilder.FEET; y < ColiseumBuilder.FEET + OPEN_H; y++) {
                l.add(alongX ? new BlockPos(c, y, fixed) : new BlockPos(fixed, y, c));
            }
        }
        return l;
    }

    private static boolean passable(BlockState s) {
        return s.isAir() || s.is(Blocks.IRON_BARS) || s.getBlock() instanceof net.minecraft.world.level.block.WoolCarpetBlock;
    }

    /** Lowers (bars) or raises (air / carpet) the gate. Returns the number of cells changed. */
    public static int set(ServerLevel level, Gate g, boolean lower) {
        BlockState carpet = St.carpet(DyeColor.RED);
        List<BlockPos> open = new ArrayList<>();
        for (BlockPos p : g.cells()) {
            if (passable(level.getBlockState(p))) open.add(p);
        }
        int n = 0;
        for (BlockPos p : open) {
            BlockState want;
            if (lower) {
                want = bars(level, p, open);
            } else if (p.getY() == ColiseumBuilder.FEET && g.name().equals("s")
                    && Math.abs(p.getX()) <= ColiseumBuilder.GATE_W) {
                want = carpet; // the red carpet runs through the south gate
            } else {
                want = ColiseumBuilder.AIR;
            }
            if (!level.getBlockState(p).equals(want)) {
                level.setBlock(p, want, 2);
                n++;
            }
        }
        if (n > 0 && !open.isEmpty()) {
            level.playSound(null, open.get(0), lower ? SoundEvents.IRON_DOOR_CLOSE : SoundEvents.IRON_DOOR_OPEN,
                SoundSource.BLOCKS, 1.5f, lower ? 0.7f : 1.0f);
        }
        return n;
    }

    private static BlockState bars(ServerLevel level, BlockPos p, List<BlockPos> open) {
        BlockState s = Blocks.IRON_BARS.defaultBlockState();
        for (Direction d : Direction.Plane.HORIZONTAL) {
            BlockPos q = p.relative(d);
            boolean connect = open.contains(q)
                || level.getBlockState(q).isFaceSturdy(level, q, d.getOpposite());
            s = s.setValue(IronBarsBlock.PROPERTY_BY_DIRECTION.get(d), connect);
        }
        return s;
    }

    private static int run(CommandContext<CommandSourceStack> ctx, boolean lower, String which) {
        ServerLevel level = ctx.getSource().getServer().overworld();
        int n = 0;
        int gatesHit = 0;
        for (Gate g : gates()) {
            if (which.equals("all") || which.equals(g.name())) {
                n += set(level, g, lower);
                gatesHit++;
            }
        }
        if (gatesHit == 0) {
            ctx.getSource().sendFailure(Component.literal("Unknown gate '" + which + "' (n|s|e|w|all)"));
            return 0;
        }
        int total = n;
        ctx.getSource().sendSuccess(() -> Component.literal((lower ? "Lowered" : "Raised")
            + " portcullis (" + total + " blocks changed)"), true);
        return 1;
    }

    public static void register() {
        AgentCraftCommands.sub(root -> root.then(Commands.literal("coliseum").then(Commands.literal("gates")
            .then(Commands.literal("raise")
                .executes(ctx -> run(ctx, false, "all"))
                .then(Commands.argument("gate", StringArgumentType.word())
                    .suggests((c, b) -> {
                        for (String s : new String[] {"n", "s", "e", "w", "all"}) b.suggest(s);
                        return b.buildFuture();
                    })
                    .executes(ctx -> run(ctx, false, StringArgumentType.getString(ctx, "gate")))))
            .then(Commands.literal("lower")
                .executes(ctx -> run(ctx, true, "all"))
                .then(Commands.argument("gate", StringArgumentType.word())
                    .suggests((c, b) -> {
                        for (String s : new String[] {"n", "s", "e", "w", "all"}) b.suggest(s);
                        return b.buildFuture();
                    })
                    .executes(ctx -> run(ctx, true, StringArgumentType.getString(ctx, "gate"))))))));
    }
}
