package dev.agentcraft.hq;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.AABB;

/** Iron-armored armor-stand guards flanking each coliseum gate (2 per gate, 8 total). */
final class ColiseumGuards {
    static final String TAG = "agentcraft_coliseum_guard";

    private ColiseumGuards() {}

    /** Removes old guards inside the site box, then spawns the current set. */
    static void spawn(ServerLevel level) {
        int[] s = ColiseumBuilder.SITE;
        AABB site = new AABB(s[0], s[1], s[2], s[3] + 1, s[4] + 1, s[5] + 1);
        for (ArmorStand old : level.getEntitiesOfClass(ArmorStand.class, site, e -> e.entityTags().contains(TAG))) {
            old.discard();
        }

        // Same cell the gate podium uses: first free cell outward + 1 (between the two columns),
        // on the flanking platform (solid block at FEET), just outside |l| <= GATE_W.
        int[][] dirs = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}}; // S, N, E, W
        for (int[] d : dirs) {
            int dx = d[0], dz = d[1];
            int d0 = (dx != 0 ? ColiseumBuilder.OUTER_RX : ColiseumBuilder.OUTER_RZ) + 2;
            int along = d0 + 1;
            // yaw: 0 faces +Z (south), 90 faces -X, 180 faces -Z, 270 faces +X
            float yaw = dz > 0 ? 0f : dz < 0 ? 180f : dx > 0 ? 270f : 90f;
            for (int side = -1; side <= 1; side += 2) {
                int l = side * (ColiseumBuilder.GATE_W + 1);
                int x = dx != 0 ? dx * along : l;
                int z = dz != 0 ? dz * along : l;
                spawnOne(level, x + 0.5, ColiseumBuilder.FEET + 1, z + 0.5, yaw);
            }
        }
    }

    private static void spawnOne(ServerLevel level, double x, double y, double z, float yaw) {
        ArmorStand stand = EntityTypes.ARMOR_STAND.create(level, EntitySpawnReason.COMMAND);
        if (stand == null) return;
        stand.snapTo(x, y, z, yaw, 0f);
        stand.setYHeadRot(yaw);
        stand.setPermanentlyInvulnerable(true);
        stand.setNoGravity(true);
        stand.setShowArms(true);
        stand.addTag(TAG);
        stand.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
        stand.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.IRON_CHESTPLATE));
        stand.setItemSlot(EquipmentSlot.LEGS, new ItemStack(Items.IRON_LEGGINGS));
        stand.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.IRON_BOOTS));
        stand.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.IRON_SWORD));
        level.addFreshEntity(stand);
    }
}
