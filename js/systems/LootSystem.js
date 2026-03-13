import Container from '../entities/Container.js';
import { getPropDef } from '../config/propDefs.js';
import { LOOT_SEARCH_RADIUS } from '../config/constants.js';

export default class LootSystem {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene      = scene;
    this.containers = [];   // Container instances
    /** Currently highlighted searchable target (or null) */
    this.nearestTarget = null;
  }

  /**
   * Spawn containers from objects list.
   * Filtre via PropDefs : seuls les objets avec isContainer=true sont créés.
   * Call once from GameScene.create().
   * @param {Array<{type:string, x:number, y:number}>} objects
   */
  spawnContainers(objects) {
    let netIdx = 0;  // suit exactement l'index de _containerSpawns côté serveur
    for (const obj of objects) {
      const def = getPropDef(obj.type ?? obj.texture ?? 'barrel');
      if (!def.isContainer) continue;

      const texture = obj.type ?? obj.texture ?? 'barrel';
      // Les containers spéciaux (chest, upgradeStation) ne reçoivent pas de loot
      // via le système standard — ils gardent netId = -1.
      const netId = def.specialType ? -1 : netIdx++;

      const c = new Container(this.scene, obj.x, obj.y, texture, {
        netId,
        skipLoot: true,   // server is loot authority
      });

      if (def.specialType === 'chest')          { c.isHideoutChest   = true; c.searched = false; }
      if (def.specialType === 'upgradeStation') { c.isUpgradeStation = true; c.searched = false; }
      this.containers.push(c);
    }
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
    let bestDist = LOOT_SEARCH_RADIUS;

    // Check containers
    for (const c of this.containers) {
      if (c.searched && !c.isHideoutChest && !c.isUpgradeStation) continue;
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
      if (c.isHideoutChest || c.isUpgradeStation) return;  // always interactable
      c.searched  = false;
      c.lootItems = [];
    });
    this.nearestTarget = null;
  }
}
