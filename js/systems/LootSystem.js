import Container from '../entities/Container.js';
import { CONTAINER_SPAWNS } from '../config/lootTable.js';

const SEARCH_RADIUS = 64;   // px – distance to interact with a container/body

export default class LootSystem {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene      = scene;
    this.containers = [];   // Container instances
    /** Currently highlighted searchable target (or null) */
    this.nearestTarget = null;
  }

  /** Spawn every container defined in CONTAINER_SPAWNS. Call once from GameScene.create(). */
  spawnContainers() {
    CONTAINER_SPAWNS.forEach((def, i) => {
      this.containers.push(
        new Container(this.scene, def.x, def.y, def.texture, {
          netId: i,
          skipLoot: true,   // server is loot authority
        })
      );
    });
  }

  /**
   * Each frame, find the nearest searchable target (container or dead enemy).
   * Returns the target so GameScene can show a prompt / launch search UI.
   * @param {object} player  Player entity
   * @param {Array}  enemies All enemies (alive & dead)
   * @returns {{ target: object, dist: number } | null}
   */
  update(player, enemies) {
    let best = null;
    let bestDist = SEARCH_RADIUS;

    // Check containers
    for (const c of this.containers) {
      if (c.searched) continue;
      const d = Phaser.Math.Distance.Between(player.x, player.y, c.x, c.y);
      if (d < bestDist) { bestDist = d; best = c; }
    }

    // Check dead enemies (corpses)
    for (const e of enemies) {
      if (e.state !== 'dead' || !e.searchable || e.searched) continue;
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.x, e.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }

    this.nearestTarget = best;
    return best ? { target: best, dist: bestDist } : null;
  }

  /** Destroy all containers (e.g. on scene shutdown). */
  destroyAll() {
    this.containers.forEach(c => c.destroy());
    this.containers = [];
  }

  /** Reset all containers for a world reset cycle. */
  resetContainers() {
    this.containers.forEach(c => {
      c.searched = false;
      c.lootItems = [];
    });
    this.nearestTarget = null;
  }
}
