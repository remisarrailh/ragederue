import { LANE_TOP, LANE_BOTTOM, DEBUG_DEPTH } from '../config/constants.js';

/** Fixed scale for all entities (2× original size). */
const ENTITY_SCALE = 3.0;

/**
 * Update depth-based render order for an entity.
 * Scale is fixed — no 2.5D scaling. Only depth (draw order) varies with Y.
 *
 * @param {Phaser.GameObjects.Sprite} entity  - Must have x, y, shadow (optional)
 */
export function updateDepth(entity) {
  entity.setScale(ENTITY_SCALE);
  entity.setDepth(entity.y);

  // Shadow ellipse
  if (entity.shadow) {
    const sh = entity.shadow;
    sh.setPosition(entity.x, entity.y + (entity.displayHeight * 0.45));
    sh.setScale(ENTITY_SCALE, ENTITY_SCALE * 0.3);
    sh.setAlpha(0.35);
    sh.setDepth(entity.y - 0.5);
  }
}

/**
 * Create a shadow ellipse for an entity.
 * Attach it as entity.shadow so updateDepth() can control it.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Sprite} entity
 * @returns {Phaser.GameObjects.Ellipse}
 */
export function createShadow(scene, entity) {
  const shadow = scene.add.ellipse(entity.x, entity.y, 56, 14, 0x000000, 0.35);
  entity.shadow = shadow;
  return shadow;
}
