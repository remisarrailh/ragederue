import { DEBUG_HITBOXES } from '../config/constants.js';

export default class CombatSystem {
  constructor(scene) {
    this.scene = scene;
    this.activeHitboxes = [];

    if (DEBUG_HITBOXES) {
      this.debugGfx = scene.add.graphics().setDepth(999);
    }
  }

  /**
   * Register an active hitbox for this frame.
   * offsetX/Y are relative to the owner's center; sign of offsetX flips with facing.
   */
  activateHitbox(owner, offsetX, offsetY, width, height, damage, knockback) {
    const facing = owner.facing ?? 1;
    const rect = new Phaser.Geom.Rectangle(
      owner.x + offsetX * facing - width / 2,
      owner.y + offsetY - height / 2,
      width,
      height
    );
    this.activeHitboxes.push({ rect, owner, damage, knockback, used: false });
  }

  /** Remove all pending hitboxes belonging to owner (call on animationcomplete). */
  deactivateHitboxes(owner) {
    this.activeHitboxes = this.activeHitboxes.filter(h => h.owner !== owner);
  }

  /**
   * Check every active hitbox against every target.
   * Pass all hittable entities (player + enemies) — ownership is checked internally.
   * @param {Array} entities  All entities that can be hit
   */
  update(entities) {
    if (DEBUG_HITBOXES) this.debugGfx.clear();

    for (const hit of this.activeHitboxes) {
      if (hit.used) continue;

      if (DEBUG_HITBOXES) {
        this.debugGfx.lineStyle(2, 0xff2200, 1);
        this.debugGfx.strokeRect(hit.rect.x, hit.rect.y, hit.rect.width, hit.rect.height);
      }

      for (const target of entities) {
        if (target === hit.owner) continue;
        if (target.isInvincible)  continue;
        if (target.state === 'dead') continue;

        // Hurtbox: generous rectangle centered on entity's feet (origin bottom-center)
        const hurtW = target.displayWidth  * 0.5;
        const hurtH = target.displayHeight * 0.8;
        const targetRect = new Phaser.Geom.Rectangle(
          target.x - hurtW / 2,
          target.y - hurtH,
          hurtW,
          hurtH
        );

        if (DEBUG_HITBOXES) {
          this.debugGfx.lineStyle(1, 0x0088ff, 0.6);
          this.debugGfx.strokeRect(targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        }

        if (Phaser.Geom.Intersects.RectangleToRectangle(hit.rect, targetRect)) {
          target.takeHit(hit.damage, hit.knockback, hit.owner.x);
          hit.used = true;
          break;
        }
      }
    }

    // Purge consumed hitboxes
    this.activeHitboxes = this.activeHitboxes.filter(h => !h.used);
  }
}
