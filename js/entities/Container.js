import { CONTAINER_LOOT_TABLES, CONTAINER_ITEM_COUNTS, rollLoot } from '../config/lootTable.js';
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
    // Depth basé sur le milieu vertical du sprite : le joueur passe devant
    // dès que ses pieds dépassent la moitié de la hauteur de l'objet.
    // Cela évite que de grands sprites (workbench 128px) masquent le joueur
    // qui se tient juste devant eux.
    this.image.setDepth(y - this.image.displayHeight * 0.5);

    // ── Searchable properties ─────────────────────────────────────────────
    this.searchable = true;
    this.searched   = false;
    this.opened     = false;   // true after first search (skip opening anim on re-search)

    // Generate loot (skipped in online mode — server sends loot data)
    if (opts.skipLoot) {
      this.lootItems = [];
    } else {
      const table = CONTAINER_LOOT_TABLES[texture] ?? CONTAINER_LOOT_TABLES['default'] ?? [];
      const cnt   = CONTAINER_ITEM_COUNTS[texture] ?? CONTAINER_ITEM_COUNTS['default'] ?? { min: 1, max: 3 };
      const count = Phaser.Math.Between(cnt.min, cnt.max);
      this.lootItems = rollLoot(table, count);
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
