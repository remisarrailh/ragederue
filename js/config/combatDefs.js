/**
 * combatDefs.js — Définitions de combat centralisées.
 *
 * Hitboxes et frames actives du joueur, hitbox et comportement des ennemis.
 * Permet de tweaker le gameplay sans toucher aux entités.
 *
 * Consommateurs :
 *   - js/entities/Player.js  (PLAYER_HITBOXES, PLAYER_ACTIVE_FRAMES)
 *   - js/entities/Enemy.js   (ENEMY_ATTACK_HITBOX, ENEMY_PATROL_RADIUS)
 */

// ── Hitboxes attaques joueur ─────────────────────────────────────────────────
// { offsetX, offsetY, w, h, dmg, kb }
// offsetX est devant le joueur (inversé automatiquement si facing left)
export const PLAYER_HITBOXES = {
  player_punch:     { offsetX: 48, offsetY: -22, w: 52, h: 30, dmg: 15, kb: 130 },
  player_kick:      { offsetX: 55, offsetY: -16, w: 62, h: 28, dmg: 20, kb: 160 },
  player_jab:       { offsetX: 42, offsetY: -22, w: 46, h: 28, dmg: 10, kb: 95  },
  player_jump_kick: { offsetX: 50, offsetY: -10, w: 60, h: 34, dmg: 25, kb: 200 },
};

// ── Frames d'activation des hitboxes (1-indexed, Phaser AnimationFrame.index) ─
export const PLAYER_ACTIVE_FRAMES = {
  player_punch:     [2],
  player_kick:      [2, 3],
  player_jab:       [2],
  player_jump_kick: [2],
};

// ── Hitbox attaque ennemi ────────────────────────────────────────────────────
// Activée sur frame 2 de enemy_punch
export const ENEMY_ATTACK_HITBOX = { offsetX: 50, offsetY: -22, w: 58, h: 32 };

// ── Comportement ennemi ──────────────────────────────────────────────────────
/** Rayon de patrouille autour du point de spawn (px). */
export const ENEMY_PATROL_RADIUS = 160;
