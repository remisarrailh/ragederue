/**
 * WorldBuilder — builds all visual/static world elements for GameScene.
 * Responsibilities: backgrounds, ground, foreground, props, transit zones.
 * Exposes bgLayer / midLayer for parallax updates, blockingGroup for collisions.
 *
 * Accepts a levelConfig object from js/config/levels.js.
 */
import {
  GAME_W, GAME_H, LANE_TOP, LANE_BOTTOM, DEBUG_DEPTH
} from '../../config/constants.js';

const SKY_H    = 290;
const GROUND_Y = 290;

export default class WorldBuilder {
  constructor(scene) {
    this.scene         = scene;
    this.bgLayer       = null;
    this.midLayer      = null;
    this.bgSpeed       = 0.06;
    this.midSpeed      = 0.25;
    this.blockingGroup = null;
  }

  /** @param {object} levelConfig  Entry from LEVELS array in js/config/levels.js */
  build(levelConfig) {
    const scene = this.scene;
    const { parallax, props, transitZones, background } = levelConfig;
    let { worldW } = levelConfig;

    // Per-level lane bounds (fallback to global constants)
    const laneTop    = levelConfig.laneTop    ?? LANE_TOP;
    const laneBottom = levelConfig.laneBottom ?? LANE_BOTTOM;

    // Store parallax speeds
    this.bgSpeed  = parallax?.bg  ?? 0.06;
    this.midSpeed = parallax?.mid ?? 0.25;

    if (background && scene.textures.exists(background)) {
      // ── Mode image unique ─────────────────────────────────────────────
      const tex   = scene.textures.get(background);
      const src   = tex.source[0];
      const scale = GAME_H / src.height;
      worldW = Math.round(src.width * scale);

      scene.add.image(0, 0, background)
        .setOrigin(0, 0).setScale(scale).setDepth(0);

      this.bgLayer  = null;
      this.midLayer = null;
    } else {
      // ── Mode parallax classique ───────────────────────────────────────
      this.bgLayer = scene.add
        .tileSprite(0, 0, GAME_W, SKY_H, 'back')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(0);

      this.midLayer = scene.add
        .tileSprite(0, SKY_H - 60, GAME_W, 200, 'tileset')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(5);

      // ── Ground plane ───────────────────────────────────────────────────
      const gfx = scene.add.graphics();
      gfx.fillStyle(0x2a2a3a);
      gfx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
      gfx.fillStyle(0x333345);
      gfx.fillRect(0, laneTop, GAME_W, laneBottom - laneTop);
      gfx.fillStyle(0x888899, 0.4);
      gfx.fillRect(0, laneTop - 2, GAME_W, 3);
      gfx.setScrollFactor(0).setDepth(8);
    }

    // ── World / camera bounds ────────────────────────────────────────────
    scene.physics.world.setBounds(0, 0, worldW, GAME_H);
    scene.cameras.main.setBounds(0, 0, worldW, GAME_H);

    if (DEBUG_DEPTH) {
      scene.add.graphics()
        .lineStyle(1, 0xff0000, 0.5)
        .strokeRect(0, laneTop, GAME_W, laneBottom - laneTop)
        .setScrollFactor(0).setDepth(200);
    }

    // ── Static collision group (blocksPlayer props) ───────────────────────
    this.blockingGroup = scene.physics.add.staticGroup();

    // ── Props (décor + fore) ─────────────────────────────────────────────
    props.forEach(p => this._placeProp(p));

    // ── Rétrocompatibilité : forePositions legacy ─────────────────────────
    if (levelConfig.forePositions?.length) {
      for (const x of levelConfig.forePositions)
        this._placeProp({ type: 'fore', x, y: laneTop - 20, scale: 1.2 });
    }

    // ── Transit zones ────────────────────────────────────────────────────
    transitZones.forEach(z => this._buildTransitZone(z, laneTop, laneBottom));
  }

  /** Update parallax — call from GameScene.update(). No-op in single-image mode. */
  updateParallax(camX) {
    if (this.bgLayer)  this.bgLayer.tilePositionX  = camX * this.bgSpeed;
    if (this.midLayer) this.midLayer.tilePositionX = camX * this.midSpeed;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Place a prop in the world.
   * @param {{ type, x, y, scale?, blocksPlayer? }} p
   */
  _placeProp(p) {
    if (p.blocksPlayer) {
      // Static physics body — blocks the player
      const img = this.blockingGroup.create(p.x, p.y, p.type);
      img.setOrigin(0.5, 1).setScale(p.scale ?? 1).setDepth(p.y);
      img.refreshBody();
      return img;
    }
    const img = this.scene.add.image(p.x, p.y, p.type).setOrigin(0.5, 1);
    if (p.scale != null) img.setScale(p.scale);
    img.setDepth(p.y);
    return img;
  }

  _buildTransitZone(zone, laneTop = LANE_TOP, laneBottom = LANE_BOTTOM) {
    const scene  = this.scene;
    const zoneY  = zone.y      ?? (laneTop - 30);
    const zoneH  = zone.height ?? (laneBottom - laneTop + 60);
    const zoneW  = zone.width ?? 120;
    // extract = green, warp = cyan
    const color  = zone.type === 'warp' ? 0x00ccff : 0x00ff88;
    const stroke = zone.type === 'warp' ? '#003344' : '#003322';
    const tcolor = zone.type === 'warp' ? '#00ccff' : '#00ff88';

    const beam = scene.add.graphics();
    beam.fillStyle(color, 0.12);
    beam.fillRect(zone.x, zoneY, zoneW, zoneH);
    beam.lineStyle(2, color, 0.9);
    beam.strokeRect(zone.x, zoneY, zoneW, zoneH);
    beam.setDepth(laneTop - 5);

    const labelText = zone.type === 'warp'
      ? `► ${zone.label ?? zone.targetLevel ?? 'WARP'} ►`
      : `▼  ${zone.label ?? 'EXTRACT'}  ▼`;

    const arrow = scene.add.text(zone.x + zoneW / 2, zoneY - 40, labelText, {
      fontFamily: 'monospace', fontSize: '16px', color: tcolor,
      stroke: stroke, strokeThickness: 3,
    }).setOrigin(0.5).setDepth(laneTop - 4);

    scene.tweens.add({
      targets: [beam, arrow],
      alpha: 0.25,
      duration: 850,
      yoyo: true,
      repeat: -1,
    });
  }
}
