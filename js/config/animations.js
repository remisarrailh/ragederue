import { FRAME_W, FRAME_H } from './constants.js';

/**
 * Register all game animations with Phaser's AnimationManager.
 * Call this once from PreloadScene.create() BEFORE launching GameScene.
 * @param {Phaser.Animations.AnimationManager} anims
 */
export function registerAnimations(anims) {
  // ── Brawler Girl ──────────────────────────────────────────────────────
  anims.create({
    key: 'player_idle',
    frames: anims.generateFrameNumbers('player_idle', { start: 0, end: 3 }),
    frameRate: 8,
    repeat: -1
  });
  anims.create({
    key: 'player_walk',
    frames: anims.generateFrameNumbers('player_walk', { start: 0, end: 9 }),
    frameRate: 12,
    repeat: -1
  });
  anims.create({
    key: 'player_punch',
    frames: anims.generateFrameNumbers('player_punch', { start: 0, end: 2 }),
    frameRate: 16,
    repeat: 0
  });
  anims.create({
    key: 'player_kick',
    frames: anims.generateFrameNumbers('player_kick', { start: 0, end: 4 }),
    frameRate: 14,
    repeat: 0
  });
  anims.create({
    key: 'player_jab',
    frames: anims.generateFrameNumbers('player_jab', { start: 0, end: 2 }),
    frameRate: 18,
    repeat: 0
  });
  anims.create({
    key: 'player_jump',
    frames: anims.generateFrameNumbers('player_jump', { start: 0, end: 3 }),
    frameRate: 10,
    repeat: 0
  });
  anims.create({
    key: 'player_jump_kick',
    frames: anims.generateFrameNumbers('player_jump_kick', { start: 0, end: 2 }),
    frameRate: 14,
    repeat: 0
  });
  anims.create({
    key: 'player_dive_kick',
    frames: anims.generateFrameNumbers('player_dive_kick', { start: 0, end: 4 }),
    frameRate: 16,
    repeat: 0
  });
  anims.create({
    key: 'player_hurt',
    frames: anims.generateFrameNumbers('player_hurt', { start: 0, end: 1 }),
    frameRate: 10,
    repeat: 0
  });

  // ── Enemy Punk ────────────────────────────────────────────────────────
  anims.create({
    key: 'enemy_idle',
    frames: anims.generateFrameNumbers('enemy_idle', { start: 0, end: 3 }),
    frameRate: 8,
    repeat: -1
  });
  anims.create({
    key: 'enemy_walk',
    frames: anims.generateFrameNumbers('enemy_walk', { start: 0, end: 3 }),
    frameRate: 10,
    repeat: -1
  });
  anims.create({
    key: 'enemy_punch',
    frames: anims.generateFrameNumbers('enemy_punch', { start: 0, end: 2 }),
    frameRate: 14,
    repeat: 0
  });
  anims.create({
    key: 'enemy_hurt',
    frames: anims.generateFrameNumbers('enemy_hurt', { start: 0, end: 3 }),
    frameRate: 12,
    repeat: 0
  });

  // Static corpse sprite (dedicated dead.png)
  // repeat: -1 keeps the single frame visible forever and avoids
  // Phaser edge-case where a 1-frame anim completion corrupts AnimationState
  anims.create({
    key: 'enemy_dead',
    frames: anims.generateFrameNumbers('enemy_dead', { start: 0, end: 0 }),
    frameRate: 1,
    repeat: -1
  });
}
