/**
 * WorldBuilder — builds all visual/static world elements for GameScene.
 * Responsibilities: backgrounds, ground, foreground, props, transit zones.
 * Exposes bgLayer / midLayer for parallax updates, blockingGroup for collisions.
 *
 * Accepts a levelConfig object from js/config/levels.js.
 */
import {
  GAME_W, GAME_H, LANE_TOP, LANE_BOTTOM, DEBUG_DEPTH, DEBUG_HITBOXES
} from '../../config/constants.js';
import { getPropDef } from '../../config/propDefs.js';

const SKY_H    = 290;
const GROUND_Y = 290;

// Épaisseur fallback (en Y) de la bande de collision au sol des props bloquants.
const BLOCK_DEPTH = 30;

export default class WorldBuilder {
  constructor(scene) {
    this.scene         = scene;
    this.bgLayer       = null;
    this.midLayer      = null;
    this.bgSpeed       = 0.06;
    this.midSpeed      = 0.25;
    this.blockingGroup = null;
    this._blockingProps = [];   // { img, px, py, dw, dh, col } pour debug live
  }

  /** @param {object} levelConfig  Entry from LEVELS array in js/config/levels.js */
  build(levelConfig) {
    const scene = this.scene;

    const config = levelConfig;

    const { parallax, transitZones, background } = config;
    let { worldW } = config;

    // Per-level lane bounds (fallback to global constants)
    const laneTop    = config.laneTop    ?? LANE_TOP;
    const laneBottom = config.laneBottom ?? LANE_BOTTOM;

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

    // ── Objects (unifié : props + containers) ──────────────────────────
    const objects = config.objects ?? [];
    for (const obj of objects) {
      const def = getPropDef(obj.type);
      if (def.isContainer) {
        // Le visuel est géré par LootSystem/Container.js.
        // Mais si blocksPlayer, on crée un corps physique statique invisible.
        if (def.blocksPlayer) {
          const img = this._placeObject(obj, def);
          if (img) img.setAlpha(0);
        }
      } else {
        this._placeObject(obj, def);
      }
    }

    // ── Transit zones ────────────────────────────────────────────────────
    (transitZones ?? []).forEach(z => this._buildTransitZone(z, laneTop, laneBottom));
  }

  /** Update parallax — call from GameScene.update(). No-op in single-image mode. */
  updateParallax(camX) {
    if (this.bgLayer)  this.bgLayer.tilePositionX  = camX * this.bgSpeed;
    if (this.midLayer) this.midLayer.tilePositionX = camX * this.midSpeed;
    this._updateBlockingDebug();
  }

  /** Recalcule les hitboxes des props bloquants si window.BLOCK_DEPTH change. */
  _updateBlockingDebug() {
    if (!this._blockingProps.length) return;
    const bd = window.BLOCK_DEPTH ?? BLOCK_DEPTH;
    for (const bp of this._blockingProps) {
      const { img, px, py, dw, dh, col } = bp;
      const h  = col.height ?? bd;
      const w  = col.width  ?? dw;
      const ox = (dw - w) / 2     + (col.offsetX ?? 0);
      const oy = (dh - h / 2)     + (col.offsetY ?? 0);
      img.body.setSize(w, h);
      img.body.setOffset(ox, oy);

      if (img._dbgGfx) {
        const bx = px - dw * 0.5 + ox;
        const by = (py - dh) + oy;
        img._dbgGfx.clear();
        img._dbgGfx.lineStyle(2, 0xff00ff, 1);
        img._dbgGfx.strokeRect(bx, by, w, h);
        img._dbgGfx.fillStyle(0xff00ff, 0.15);
        img._dbgGfx.fillRect(bx, by, w, h);
      }
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Place un objet dans le monde.
   * Scale et collision sont lus depuis PropDef (plus de données par instance).
   * @param {{ type: string, x: number, y: number }} obj
   * @param {object} def  PropDef for this type
   */
  _placeObject(obj, def) {
    const scale = def.scale ?? 1;

    if (def.blocksPlayer) {
      // Static physics body — blocks the player
      const img = this.blockingGroup.create(obj.x, obj.y, obj.type);
      img.setOrigin(0.5, 1).setScale(scale).setDepth(obj.y);
      img.refreshBody();

      // Hitbox depuis PropDef (ou fallback BLOCK_DEPTH)
      const col = def.collision ?? {};
      const dw  = img.displayWidth;
      const dh  = img.displayHeight;
      const h   = col.height ?? BLOCK_DEPTH;
      const w   = col.width  ?? dw;
      const ox  = (dw - w) / 2     + (col.offsetX ?? 0);
      const oy  = (dh - h / 2)     + (col.offsetY ?? 0);
      img.body.setSize(w, h);
      img.body.setOffset(ox, oy);

      if (DEBUG_HITBOXES) {
        img._dbgGfx = this.scene.add.graphics().setDepth(9999);
        this._blockingProps.push({ img, px: obj.x, py: obj.y, dw, dh, col });
        if (!window.BLOCK_DEPTH) window.BLOCK_DEPTH = BLOCK_DEPTH;
      }
      return img;
    }

    // Non-blocking : simple image
    const img = this.scene.add.image(obj.x, obj.y, obj.type).setOrigin(0.5, 1);
    img.setScale(scale);
    img.setDepth(obj.y);
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
