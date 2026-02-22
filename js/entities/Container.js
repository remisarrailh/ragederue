import { CONTAINER_LOOT_TABLE, CONTAINER_ITEM_COUNT, rollLoot } from '../config/lootTable.js';
import { updateDepth } from '../systems/DepthSystem.js';

/**
 * A world container (barrel, crate…) that can be searched for loot.
 */
export default class Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} texture  Preloaded image key (e.g. 'barrel')
   * @param {object} [opts]   Options: { netId, skipLoot }
   */
  constructor(scene, x, y, texture, opts = {}) {
    this.scene = scene;
    this.x     = x;
    this.y     = y;
    this.netId = opts.netId ?? -1;

    // ── Visual ────────────────────────────────────────────────────────────
    this.image = scene.add.image(x, y, texture).setOrigin(0.5, 1);
    this.image.setDepth(y);

    // ── Searchable properties ─────────────────────────────────────────────
    this.searchable = true;
    this.searched   = false;
    this.opened     = false;   // true after first search (skip opening anim on re-search)

    // Generate loot (skipped in online mode — server sends loot data)
    if (opts.skipLoot) {
      this.lootItems = [];
    } else {
      const count = Phaser.Math.Between(CONTAINER_ITEM_COUNT.min, CONTAINER_ITEM_COUNT.max);
      this.lootItems = rollLoot(CONTAINER_LOOT_TABLE, count);
    }
  }

  /** Mark as searched — dim it to indicate it's been looted. */
  markSearched() {
    this.searched = true;
    this.image.setAlpha(0.4);
  }

  destroy() {
    this.image.destroy();
  }
}
