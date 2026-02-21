import Loot         from '../entities/Loot.js';
import { LOOT_SPAWNS } from '../config/lootTable.js';

const PICKUP_RADIUS = 48;   // px – generous for controller play

export default class LootSystem {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.items = [];        // active (not yet collected) Loot instances
  }

  /** Spawn every item defined in LOOT_SPAWNS. Call once from GameScene.create(). */
  spawnAll() {
    for (const def of LOOT_SPAWNS) {
      this.items.push(new Loot(this.scene, def.x, def.y, def.type));
    }
  }

  /** Check proximity between player and each item; auto-collect on contact. */
  update(player) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const loot = this.items[i];
      if (loot.collected) {
        this.items.splice(i, 1);
        continue;
      }
      const dist = Phaser.Math.Distance.Between(player.x, player.y, loot.x, loot.y);
      if (dist < PICKUP_RADIUS) {
        loot.pickup(player);
        // item removes itself from list next tick via collected flag
      }
    }
  }

  /** Number of ETH tokens still on the ground. */
  get ethRemaining() {
    return this.items.filter(l => l.lootType === 'ethereum' && !l.collected).length;
  }

  /** Destroy all remaining items (e.g. on scene shutdown). */
  destroyAll() {
    this.items.forEach(l => l.destroy());
    this.items = [];
  }
}
