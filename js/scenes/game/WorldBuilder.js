/**
 * WorldBuilder — builds all visual/static world elements for GameScene.
 * Responsibilities: backgrounds, ground, foreground, props, extraction zone.
 * Exposes bgLayer / midLayer for parallax updates.
 */
import {
  GAME_W, GAME_H, WORLD_W, LANE_TOP, LANE_BOTTOM, DEBUG_DEPTH
} from '../../config/constants.js';
import { EXTRACT_X } from '../../config/lootTable.js';

const SKY_H      = 290;
const GROUND_Y   = 290;
const FORE_DEPTH = LANE_BOTTOM + 50;
const EXTRACT_W  = 120;

export default class WorldBuilder {
  constructor(scene) {
    this.scene    = scene;
    this.bgLayer  = null;
    this.midLayer = null;
  }

  build() {
    const scene = this.scene;

    // ── World / camera bounds ────────────────────────────────────────────
    scene.physics.world.setBounds(0, 0, WORLD_W, GAME_H);
    scene.cameras.main.setBounds(0, 0, WORLD_W, GAME_H);

    // ── Background layers ────────────────────────────────────────────────
    this.bgLayer = scene.add
      .tileSprite(0, 0, GAME_W, SKY_H, 'back')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(0);

    this.midLayer = scene.add
      .tileSprite(0, SKY_H - 60, GAME_W, 200, 'tileset')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(5);

    // ── Ground plane ─────────────────────────────────────────────────────
    const gfx = scene.add.graphics();
    gfx.fillStyle(0x2a2a3a);
    gfx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
    gfx.fillStyle(0x333345);
    gfx.fillRect(0, LANE_TOP, GAME_W, LANE_BOTTOM - LANE_TOP);
    gfx.fillStyle(0x888899, 0.4);
    gfx.fillRect(0, LANE_TOP - 2, GAME_W, 3);
    gfx.setScrollFactor(0).setDepth(8);

    if (DEBUG_DEPTH) {
      scene.add.graphics()
        .lineStyle(1, 0xff0000, 0.5)
        .strokeRect(0, LANE_TOP, GAME_W, LANE_BOTTOM - LANE_TOP)
        .setScrollFactor(0).setDepth(200);
    }

    // ── Foreground decorations ───────────────────────────────────────────
    [300, 900, 1500, 2100, 2700, 3300].forEach(wx => {
      scene.add.image(wx, LANE_TOP - 20, 'fore')
        .setOrigin(0.5, 1).setDepth(FORE_DEPTH).setScale(1.2);
    });

    // ── Props ────────────────────────────────────────────────────────────
    this._placeProp('car',      600, 345, 0.65);
    this._placeProp('car',     2200, 345, 0.65);
    this._placeProp('barrel',   800, 420, 1.0);
    this._placeProp('barrel',  1800, 410, 0.9);
    this._placeProp('hydrant', 1100, 335, 0.65);
    this._placeProp('hydrant', 2600, 340, 0.65);

    // ── Extraction zone ──────────────────────────────────────────────────
    this._buildExtractionZone();
  }

  /** Update parallax — call from GameScene.update(). */
  updateParallax(camX) {
    this.bgLayer.tilePositionX  = camX * 0.06;
    this.midLayer.tilePositionX = camX * 0.25;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _placeProp(key, wx, wy, scl) {
    const img = this.scene.add.image(wx, wy, key).setOrigin(0.5, 1);
    if (scl !== undefined) img.setScale(scl);
    img.setDepth(wy);
    return img;
  }

  _buildExtractionZone() {
    const scene = this.scene;
    const zoneY = LANE_TOP - 30;
    const zoneH = LANE_BOTTOM - LANE_TOP + 60;

    const beam = scene.add.graphics();
    beam.fillStyle(0x00ff88, 0.12);
    beam.fillRect(EXTRACT_X, zoneY, EXTRACT_W, zoneH);
    beam.lineStyle(2, 0x00ff88, 0.9);
    beam.strokeRect(EXTRACT_X, zoneY, EXTRACT_W, zoneH);
    beam.setDepth(LANE_TOP - 5);

    const arrow = scene.add.text(EXTRACT_X + EXTRACT_W / 2, zoneY - 40, '▼  EXTRACT  ▼', {
      fontFamily: 'monospace', fontSize: '16px', color: '#00ff88',
      stroke: '#003322', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(LANE_TOP - 4);

    scene.tweens.add({
      targets: [beam, arrow],
      alpha: 0.25,
      duration: 850,
      yoyo: true,
      repeat: -1,
    });
  }
}
