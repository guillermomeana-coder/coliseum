package dev.agentcraft.hq;

import dev.agentcraft.AgentCraft;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;

/** Coliseum atmosphere: clear weather at midnight so the fire decorations stand out. */
final class ColiseumEnvironment {
	static final int MIDNIGHT = 18000;

	private ColiseumEnvironment() {
	}

	/** Server thread. Time and weather stay put because HqWorld turns their advance off. */
	static void apply(ServerLevel level) {
		MinecraftServer server = level.getServer();
		var source = server.createCommandSourceStack().withSuppressedOutput();
		server.getCommands().performPrefixedCommand(source, "time set " + MIDNIGHT);
		server.getCommands().performPrefixedCommand(source, "weather clear");
		AgentCraft.LOGGER.info("Coliseum environment: clear weather, time {}", MIDNIGHT);
	}
}
