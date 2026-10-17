package dev.agentcraft.hq;

import java.util.Set;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.GameType;

/** Puts a player in spectator mode high above the coliseum arena, looking straight down. */
final class ColiseumView {
	private static final int HEIGHT = 20;

	private ColiseumView() {
	}

	static void spectateFromAbove(ServerPlayer player) {
		player.setGameMode(GameType.SPECTATOR);
		player.teleportTo(player.level(), ColiseumBuilder.CX + 0.5, ColiseumBuilder.FEET + HEIGHT, ColiseumBuilder.CZ + 0.5,
			Set.of(), player.getYRot(), 90f, true);
	}
}
