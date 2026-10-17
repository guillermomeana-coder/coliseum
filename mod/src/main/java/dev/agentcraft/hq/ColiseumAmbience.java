package dev.agentcraft.hq;

import com.mojang.brigadier.context.CommandContext;
import dev.agentcraft.command.AgentCraftCommands;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.NoteBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.NoteBlockInstrument;

/**
 * Coliseum ambience: note blocks buried in the champion stage base ({@code /agentcraft coliseum fanfare}
 * plays them all as a chord).
 */
final class ColiseumAmbience {
    private ColiseumAmbience() {
    }

    /** {dx, dz, instrument, note}: all inside the solid base (y = FEET, r <= STAGE_R - 1). */
    private static final Object[][] NOTES = {
        {3, 0, NoteBlockInstrument.BELL, 6},
        {-3, 0, NoteBlockInstrument.BELL, 10},
        {0, 3, NoteBlockInstrument.CHIME, 13},
        {0, -3, NoteBlockInstrument.CHIME, 18},
        {2, 2, NoteBlockInstrument.HARP, 6},
        {-2, 2, NoteBlockInstrument.HARP, 10},
        {2, -2, NoteBlockInstrument.HARP, 13},
        {-2, -2, NoteBlockInstrument.HARP, 18},
    };

    /** Plan step: called from ColiseumBuilder.build right after championStage. */
    static void stageNoteBlocks(Plan p) {
        for (Object[] n : NOTES) {
            BlockState s = Blocks.NOTE_BLOCK.defaultBlockState()
                .setValue(NoteBlock.INSTRUMENT, (NoteBlockInstrument) n[2])
                .setValue(NoteBlock.NOTE, (Integer) n[3]);
            p.set((Integer) n[0], ColiseumBuilder.FEET, (Integer) n[1], s);
        }
    }

    static void init() {
        AgentCraftCommands.sub(root -> root.then(Commands.literal("coliseum")
            .then(Commands.literal("fanfare").executes(ColiseumAmbience::fanfare))));
    }

    private static int fanfare(CommandContext<CommandSourceStack> ctx) {
        ServerLevel level = ctx.getSource().getServer().overworld();
        int played = 0;
        for (Object[] n : NOTES) {
            BlockPos pos = new BlockPos((Integer) n[0], ColiseumBuilder.FEET, (Integer) n[1]);
            if (level.getBlockState(pos).is(Blocks.NOTE_BLOCK)) {
                level.blockEvent(pos, Blocks.NOTE_BLOCK, 0, 0);
                played++;
            }
        }
        if (played == 0) {
            ctx.getSource().sendFailure(Component.literal("No coliseum stage note blocks found (build the coliseum first)"));
            return 0;
        }
        final int count = played;
        ctx.getSource().sendSuccess(() -> Component.literal("Fanfare: played " + count + " note blocks"), true);
        return count;
    }

    // TODO(particles): stage - when the fanfare plays, spawn END_ROD / FIREWORK particles rising from the stage
    //   edge ring (r ~ STAGE_R, y = FEET + 2) and NOTE particles above each note block.
    // TODO(particles): pillar fires (ColiseumBuilder.pillarFires) - a periodic server-side spawner above each
    //   CAMPFIRE at PARAPET: LARGE_SMOKE / FLAME plus occasional LAVA sparks.
    // TODO(particles): gates - when a portcullis is raised or lowered, spawn dust (BLOCK particles of iron bars /
    //   POOF) along the gate opening, |x| <= GATE_W, y FEET..FEET+3.
}
