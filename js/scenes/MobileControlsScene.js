import { GAME_W, GAME_H } from '../config/constants.js';

/**
 * MobileControlsScene — virtual joystick + action buttons overlay.
 *
 * Launched by GameScene on touch-capable devices. Runs in parallel
 * on top of GameScene and feeds input directly into the player object:
 *   player.mobileJoy  = { x, y }   — normalized -1..1 movement vector
 *   player._gpAttack  = { punch, kick, jab, jump }  — one-shot flags
 *
 * The scene stops itself when GameScene stops (shutdown event).
 *
 * Layout (landscape):
 *   LEFT side  — joystick  (large dead zone in center)
 *   RIGHT side — 5 buttons: PUNCH · KICK · JAB · JUMP · INTERACT
 *                            + small INVENTORY button top-right
 */

// ── Geometry ──────────────────────────────────────────────────────────────

const JOY_R   = 70;   // outer ring radius
const JOY_KNB = 34;   // knob radius
const JOY_X   = 100;  // centre X of joystick area (from left)
const JOY_Y   = GAME_H - 100; // centre Y

// Action buttons — arranged in a D-pad-like cluster bottom-right
const BTN_R   = 36;   // button radius
const BTN_PAD = 10;   // gap between buttons

// Cluster centre-X from right edge
const CLUST_CX = GAME_W - 110;
const CLUST_CY = GAME_H - 100;

// Individual button positions (offset from cluster centre)
const BTNS = [
  { key: 'punch', label: 'P',  dx:  0,        dy: -BTN_R - BTN_PAD, color: 0xee4444 },
  { key: 'kick',  label: 'K',  dx:  BTN_R + BTN_PAD, dy: 0,          color: 0xee8800 },
  { key: 'jab',   label: 'J',  dx: -(BTN_R + BTN_PAD), dy: 0,        color: 0xcccc00 },
  { key: 'jump',  label: '↑',  dx:  0,        dy:  BTN_R + BTN_PAD,  color: 0x44cc44 },
];

const BTN_INTERACT  = { key: 'interact',  label: 'E',   x: GAME_W - 200, y: GAME_H - 42, r: 26, color: 0x5588ff };
const BTN_INVENTORY = { key: 'inventory', label: 'INV', x: GAME_W - 42,  y: 36,          r: 24, color: 0x888888 };

// ── Alpha constants ───────────────────────────────────────────────────────
const ALPHA_IDLE  = 0.35;
const ALPHA_PRESS = 0.80;

export default class MobileControlsScene extends Phaser.Scene {
  constructor() { super({ key: 'MobileControlsScene' }); }

  // Called by GameScene: scene.launch('MobileControlsScene', { player, onInteract, onInventory, onPause })
  init(data) {
    this._player      = data.player;
    this._onInteract  = data.onInteract  ?? (() => {});
    this._onInventory = data.onInventory ?? (() => {});
    this._onPause     = data.onPause     ?? (() => {});
  }

  create() {
    // ── Enable multi-touch (joystick + buttons simultaneously) ──────────
    this.input.addPointer(1);  // 2 pointers total (default pointer1 + pointer2)

    // ── Joystick ──────────────────────────────────────────────────────────
    this._joyActive  = false;
    this._joyPointerId = -1;
    this._joyOrigin  = { x: JOY_X, y: JOY_Y };
    this._joyVec     = { x: 0, y: 0 };

    // Outer ring (non-interactive — les events sont gérés globalement)
    this._joyRing = this.add.circle(JOY_X, JOY_Y, JOY_R, 0xffffff, 0.12)
      .setDepth(2000).setScrollFactor(0);
    this.add.circle(JOY_X, JOY_Y, JOY_R, 0x000000, 0)
      .setStrokeStyle(2, 0xffffff, ALPHA_IDLE)
      .setDepth(2001).setScrollFactor(0);

    // Knob
    this._joyKnob = this.add.circle(JOY_X, JOY_Y, JOY_KNB, 0xffffff, ALPHA_IDLE)
      .setDepth(2002).setScrollFactor(0);

    // ── Action buttons ────────────────────────────────────────────────────
    this._btnObjs = {};

    for (const def of BTNS) {
      const bx = CLUST_CX + def.dx;
      const by = CLUST_CY + def.dy;
      const circle = this.add.circle(bx, by, BTN_R, def.color, ALPHA_IDLE)
        .setDepth(2002).setScrollFactor(0).setInteractive();
      const label = this.add.text(bx, by, def.label, {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(2003).setScrollFactor(0);

      this._btnObjs[def.key] = { circle, label, def };
      this._setupButton(circle, def.key, def.color);
    }

    // Interact button
    const iBt = this.add.circle(BTN_INTERACT.x, BTN_INTERACT.y, BTN_INTERACT.r, BTN_INTERACT.color, ALPHA_IDLE)
      .setDepth(2002).setScrollFactor(0).setInteractive();
    this.add.text(BTN_INTERACT.x, BTN_INTERACT.y, BTN_INTERACT.label, {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2003).setScrollFactor(0);
    this._btnObjs.interact = { circle: iBt, def: BTN_INTERACT };
    this._setupButton(iBt, 'interact', BTN_INTERACT.color);

    // Inventory button
    const vBt = this.add.circle(BTN_INVENTORY.x, BTN_INVENTORY.y, BTN_INVENTORY.r, BTN_INVENTORY.color, ALPHA_IDLE)
      .setDepth(2002).setScrollFactor(0).setInteractive();
    this.add.text(BTN_INVENTORY.x, BTN_INVENTORY.y, BTN_INVENTORY.label, {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2003).setScrollFactor(0);
    this._btnObjs.inventory = { circle: vBt, def: BTN_INVENTORY };
    this._setupButton(vBt, 'inventory', BTN_INVENTORY.color);

    // Pause button (top-left area, away from HUD bars)
    const pauseBt = this.add.circle(42, 36, 20, 0x555566, ALPHA_IDLE)
      .setDepth(2002).setScrollFactor(0).setInteractive();
    this.add.text(42, 36, '⏸', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2003).setScrollFactor(0);
    this._btnObjs.pause = { circle: pauseBt };
    this._setupButton(pauseBt, 'pause', 0x555566);

    // ── Joystick — events globaux input (capte le drag même hors zone) ───────
    // pointerdown sur la moitié gauche du canvas → démarre le joystick
    this.input.on('pointerdown', (ptr) => {
      if (ptr.x < GAME_W / 2) this._joyStart(ptr);
    });
    // pointermove global → déplace le knob (même si le doigt sort de la zone)
    this.input.on('pointermove', (ptr) => this._joyMove(ptr));
    // pointerup global → relâche
    this.input.on('pointerup', (ptr) => this._joyEnd(ptr));

    // Init player mobile input state
    if (this._player) {
      this._player.mobileJoy = { x: 0, y: 0 };
    }
  }

  // ── Button setup ─────────────────────────────────────────────────────────

  _setupButton(circle, key, color) {
    circle.on('pointerdown', () => {
      circle.setFillStyle(color, ALPHA_PRESS);
      this._triggerButton(key);
    });
    circle.on('pointerup',  () => circle.setFillStyle(color, ALPHA_IDLE));
    circle.on('pointerout', () => circle.setFillStyle(color, ALPHA_IDLE));
  }

  _triggerButton(key) {
    if (!this._player) return;
    if (this._player.searching || this._player.inMenu) return;

    switch (key) {
      case 'punch':     this._player._gpAttack.punch = true; break;
      case 'kick':      this._player._gpAttack.kick  = true; break;
      case 'jab':       this._player._gpAttack.jab   = true; break;
      case 'jump':      this._player._gpAttack.jump  = true; break;
      case 'interact':  this._onInteract();  break;
      case 'inventory': this._onInventory(); break;
      case 'pause':     this._onPause();     break;
    }
  }

  // ── Joystick logic ────────────────────────────────────────────────────────

  _joyStart(ptr) {
    this._joyActive    = true;
    this._joyPointerId = ptr.id;
    // Relocate joystick origin to where the finger landed
    this._joyOrigin.x = ptr.x;
    this._joyOrigin.y = ptr.y;
    this._joyRing.setPosition(ptr.x, ptr.y);
    this._joyKnob.setPosition(ptr.x, ptr.y);
    this._joyRing.setAlpha(0.25);
    this._joyMove(ptr);
  }

  _joyMove(ptr) {
    if (!this._joyActive || ptr.id !== this._joyPointerId) return;
    const dx = ptr.x - this._joyOrigin.x;
    const dy = ptr.y - this._joyOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, JOY_R);
    const nx = dist > 0 ? (dx / dist) : 0;
    const ny = dist > 0 ? (dy / dist) : 0;

    // Position knob
    this._joyKnob.setPosition(
      this._joyOrigin.x + nx * clamped,
      this._joyOrigin.y + ny * clamped,
    );

    // Deadzone ~15%
    const DEAD = 0.15;
    this._joyVec.x = Math.abs(nx) > DEAD ? nx : 0;
    this._joyVec.y = Math.abs(ny) > DEAD ? ny : 0;

    if (this._player) {
      this._player.mobileJoy.x = this._joyVec.x;
      this._player.mobileJoy.y = this._joyVec.y;
    }
  }

  _joyEnd(ptr) {
    if (ptr.id !== this._joyPointerId) return;
    this._joyActive = false;
    this._joyVec    = { x: 0, y: 0 };
    // Return knob and ring to default position
    this._joyRing.setPosition(JOY_X, JOY_Y).setAlpha(0.12);
    this._joyKnob.setPosition(JOY_X, JOY_Y).setAlpha(ALPHA_IDLE);

    if (this._player) {
      this._player.mobileJoy.x = 0;
      this._player.mobileJoy.y = 0;
    }
  }

  update() {
    // Keep player reference fresh (scene may restart)
    if (this._player) {
      this._player.mobileJoy = this._player.mobileJoy ?? { x: 0, y: 0 };
    }
  }
}
