import { LOOT_DEFS } from '../config/lootTable.js';

const BOB_DIST = 9;   // px the sprite floats up/down

export default class Loot {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} type  one of the LOOT_DEFS keys
   */
  constructor(scene, x, y, type) {
    this.scene     = scene;
    this.x         = x;
    this.y         = y;
    this.lootType  = type;
    this.def       = LOOT_DEFS[type];
    this.collected = false;

    // ── Glow ellipse (drawn behind the sprite) ────────────────────────────
    this.glow = scene.add.ellipse(x, y + 6, 42, 14, this.def.glowColor, 0.30);
    this.glow.setDepth(y - 1);

    // ── Sprite ────────────────────────────────────────────────────────────
    this.image = scene.add.image(x, y, this.def.texture);
    this.image.setDisplaySize(this.def.displayW, this.def.displayH);
    this.image.setDepth(y);

    // ── Bob tween ─────────────────────────────────────────────────────────
    this._bobTween = scene.tweens.add({
      targets:  this.image,
      y:        y - BOB_DIST,
      duration: 900,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  // ──────────────────────────────────────────────────────── public API ──────

  /**
   * Apply effect to player and trigger pick-up animation.
   * Safe to call multiple times (no-op after first call).
   */
  pickup(player) {
    if (this.collected) return;
    this.collected = true;

    this._bobTween.stop();
    this.glow.destroy();

    if (this.def.isConsumable) {
      player.hp = Math.min(player.maxHp, player.hp + this.def.healAmount);
    } else {
      player.wallet = (player.wallet ?? 0) + this.def.value;
    }

    // Pop animation — float up and scale out
    this.scene.tweens.add({
      targets:  this.image,
      y:        this.image.y - 48,
      alpha:    0,
      scaleX:   2.2,
      scaleY:   2.2,
      duration: 380,
      ease:     'Quad.easeOut',
      onComplete: () => this.image.destroy(),
    });
  }

  /** Hard-remove without animation (e.g. scene shutdown). */
  destroy() {
    this._bobTween.stop();
    this.image.destroy();
    this.glow.destroy();
  }
}
