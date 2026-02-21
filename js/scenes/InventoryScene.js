import { GAME_W, GAME_H } from '../config/constants.js';
import { ITEM_DEFS } from '../config/lootTable.js';

const CELL    = 48;   // cell size in px
const GAP     = 2;
const COLS    = 6;
const ROWS    = 4;
const GRID_W  = COLS * (CELL + GAP) + GAP;
const GRID_H  = ROWS * (CELL + GAP) + GAP;
const GRID_X  = Math.round((GAME_W - GRID_W) / 2);
const GRID_Y  = Math.round((GAME_H - GRID_H) / 2) - 30;

export default class InventoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'InventoryScene' });
  }

  init(data) {
    /** @type {import('../systems/Inventory.js').default} */
    this.inventory = data.inventory;
    /** @type {object} player entity */
    this.player = data.player;
  }

  create() {
    // ── HP snapshot for hit detection ─────────────────────────────────────
    this._hpSnapshot = this.player.hp;

    // ── Overlay ───────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.65);

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GRID_Y - 30, 'INVENTORY', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ff8800',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Grid background ───────────────────────────────────────────────────
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a1a2e, 0.9);
    gfx.fillRect(GRID_X - 4, GRID_Y - 4, GRID_W + 8, GRID_H + 8);

    // Empty cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = GRID_X + GAP + c * (CELL + GAP);
        const cy = GRID_Y + GAP + r * (CELL + GAP);
        gfx.fillStyle(0x333355, 0.7);
        gfx.fillRect(cx, cy, CELL, CELL);
      }
    }

    // ── Draw items ────────────────────────────────────────────────────────
    this._itemSprites = [];
    this._selectedIdx = 0;

    for (const item of this.inventory.items) {
      const cx = GRID_X + GAP + item.gridX * (CELL + GAP);
      const cy = GRID_Y + GAP + item.gridY * (CELL + GAP);
      const w  = item.def.invW * CELL + (item.def.invW - 1) * GAP;
      const h  = item.def.invH * CELL + (item.def.invH - 1) * GAP;

      // Item background
      const bg = this.add.rectangle(cx + w / 2, cy + h / 2, w, h, item.def.glowColor, 0.2)
        .setStrokeStyle(1, item.def.glowColor, 0.5);

      // Sprite
      const tex = item.identified ? item.def.texture : null;
      let icon;
      if (tex) {
        icon = this.add.image(cx + w / 2, cy + h / 2, tex)
          .setDisplaySize(Math.min(w - 8, item.def.displayW), Math.min(h - 8, item.def.displayH));
      } else {
        icon = this.add.text(cx + w / 2, cy + h / 2, '?', {
          fontFamily: 'monospace', fontSize: '28px', color: '#888888',
        }).setOrigin(0.5);
      }

      this._itemSprites.push({ item, bg, icon, cx, cy, w, h });
    }

    // ── Selection cursor ──────────────────────────────────────────────────
    this._cursor = this.add.rectangle(0, 0, CELL, CELL)
      .setStrokeStyle(2, 0xffffff, 1).setFillStyle(0xffffff, 0.1);
    this.tweens.add({ targets: this._cursor, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });
    this._updateCursor();

    // ── Info panel ─────────────────────────────────────────────────────────
    this._infoText = this.add.text(GAME_W / 2, GRID_Y + GRID_H + 20, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#cccccc', align: 'center',
    }).setOrigin(0.5, 0);
    this._updateInfo();

    // ── Use progress bar ──────────────────────────────────────────────────
    this._useBarBg = this.add.rectangle(GAME_W / 2, GRID_Y + GRID_H + 60, 160, 10, 0x333333)
      .setOrigin(0.5).setVisible(false);
    this._useBarFill = this.add.rectangle(GAME_W / 2 - 80, GRID_Y + GRID_H + 60, 0, 10, 0x00ff88)
      .setOrigin(0, 0.5).setVisible(false);
    this._isUsing = false;

    // ── Hint (adaptive — updated each frame) ──────────────────────────────
    this._hintText = this.add.text(GAME_W / 2, GAME_H - 20, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#666666',
    }).setOrigin(0.5);
    this._refreshHint();

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-TAB', () => { this.registry.set('inputMode', 'kb'); this._close(); });
    this.input.keyboard.on('keydown-ESC', () => { this.registry.set('inputMode', 'kb'); this._close(); });
    this.input.keyboard.on('keydown-LEFT',  () => { this.registry.set('inputMode', 'kb'); this._move(-1, 0); });
    this.input.keyboard.on('keydown-RIGHT', () => { this.registry.set('inputMode', 'kb'); this._move(1, 0); });
    this.input.keyboard.on('keydown-UP',    () => { this.registry.set('inputMode', 'kb'); this._move(0, -1); });
    this.input.keyboard.on('keydown-DOWN',  () => { this.registry.set('inputMode', 'kb'); this._move(0, 1); });
    this.input.keyboard.on('keydown-X',     () => { this.registry.set('inputMode', 'kb'); this._useSelected(); });

    // Gamepad
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      this.registry.set('inputMode', 'gp');
      if (button.index === 8) this._close();      // Select
      if (button.index === 1) this._close();      // B / Circle
      if (button.index === 0) this._useSelected(); // A / Cross
    });
  }

  update(time, delta) {
    // ── Hit detection — close inventory if player takes damage ──────────
    if (this.player.hp < this._hpSnapshot || this.player.state === 'hurt' || this.player.state === 'dead') {
      this._forceClose();
      return;
    }

    // Adaptive hint refresh
    this._refreshHint();

    // Gamepad D-pad navigation with repeat cooldown
    this._gpCooldown -= delta;
    const gp = this.input.gamepad;
    if (gp && gp.total > 0 && this._gpCooldown <= 0) {
      const pad = gp.getPad(0);
      if (pad) {
        const DEAD = 0.4;
        let dx = 0, dy = 0;
        if (pad.left  || pad.leftStick.x < -DEAD) dx = -1;
        if (pad.right || pad.leftStick.x >  DEAD) dx = 1;
        if (pad.up    || pad.leftStick.y < -DEAD) dy = -1;
        if (pad.down  || pad.leftStick.y >  DEAD) dy = 1;
        if (dx || dy) {
          this.registry.set('inputMode', 'gp');
          this._move(dx, dy);
          this._gpCooldown = 180;
        }
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _refreshHint() {
    const gp = this.registry.get('inputMode') === 'gp';
    this._hintText.setText(gp
      ? 'D-Pad: navigate   A: use   B: close'
      : 'Arrows: navigate   X: use   TAB: close');
  }

  _move(dx, dy) {
    if (this._isUsing) return;
    if (this._itemSprites.length === 0) return;

    // Navigate among items (not empty grid cells)
    const cur = this._itemSprites[this._selectedIdx]?.item;
    if (!cur) { this._selectedIdx = 0; this._updateCursor(); this._updateInfo(); return; }

    let bestIdx = this._selectedIdx;
    let bestDist = Infinity;
    const cx = cur.gridX + cur.def.invW / 2;
    const cy = cur.gridY + cur.def.invH / 2;

    for (let i = 0; i < this._itemSprites.length; i++) {
      if (i === this._selectedIdx) continue;
      const it = this._itemSprites[i].item;
      const ix = it.gridX + it.def.invW / 2;
      const iy = it.gridY + it.def.invH / 2;
      const ddx = ix - cx;
      const ddy = iy - cy;
      // Only consider items in the direction we're moving
      if (dx !== 0 && Math.sign(ddx) !== Math.sign(dx)) continue;
      if (dy !== 0 && Math.sign(ddy) !== Math.sign(dy)) continue;
      if (dx !== 0 && dy === 0 && Math.abs(ddy) > 1.5) continue;
      if (dy !== 0 && dx === 0 && Math.abs(ddx) > 1.5) continue;
      const dist = Math.abs(ddx) + Math.abs(ddy);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    this._selectedIdx = bestIdx;
    this._updateCursor();
    this._updateInfo();
  }

  _updateCursor() {
    if (this._itemSprites.length === 0) {
      this._cursor.setVisible(false);
      return;
    }
    this._cursor.setVisible(true);
    const s = this._itemSprites[this._selectedIdx];
    this._cursor.setPosition(s.cx + s.w / 2, s.cy + s.h / 2);
    this._cursor.setSize(s.w + 4, s.h + 4);
  }

  _updateInfo() {
    if (this._itemSprites.length === 0) {
      this._infoText.setText('Inventory empty');
      return;
    }
    const item = this._itemSprites[this._selectedIdx]?.item;
    if (!item) return;
    if (!item.identified) {
      this._infoText.setText('??? — Unidentified item');
    } else {
      const usable = item.def.useTime > 0 ? `  [Use: ${(item.def.useTime / 1000).toFixed(1)}s]` : '';
      this._infoText.setText(`${item.def.description}${usable}`);
    }
  }

  _useSelected() {
    if (this._isUsing) return;
    if (this._itemSprites.length === 0) return;
    const entry = this._itemSprites[this._selectedIdx];
    if (!entry) return;
    const item = entry.item;
    if (!item.identified) return;

    // Non-usable items (value only, no use time)
    if (item.def.useTime <= 0 && item.def.healAmount <= 0) return;

    this._isUsing = true;
    this._useBarBg.setVisible(true);
    this._useBarFill.setVisible(true).setSize(0, 10);

    // Progress bar tween
    this.tweens.add({
      targets: this._useBarFill,
      width: 160,
      duration: item.def.useTime,
      ease: 'Linear',
      onComplete: () => {
        // Apply effect
        this.inventory.useItem(item, this.player);
        this._isUsing = false;
        this._useBarBg.setVisible(false);
        this._useBarFill.setVisible(false);
        // Refresh view
        this._rebuild();
      },
    });
  }

  _rebuild() {
    // Destroy old item visuals
    for (const s of this._itemSprites) {
      s.bg.destroy();
      s.icon.destroy();
    }
    this._itemSprites = [];
    this._selectedIdx = 0;

    for (const item of this.inventory.items) {
      const cx = GRID_X + GAP + item.gridX * (CELL + GAP);
      const cy = GRID_Y + GAP + item.gridY * (CELL + GAP);
      const w  = item.def.invW * CELL + (item.def.invW - 1) * GAP;
      const h  = item.def.invH * CELL + (item.def.invH - 1) * GAP;

      const bg = this.add.rectangle(cx + w / 2, cy + h / 2, w, h, item.def.glowColor, 0.2)
        .setStrokeStyle(1, item.def.glowColor, 0.5);

      const tex = item.identified ? item.def.texture : null;
      let icon;
      if (tex) {
        icon = this.add.image(cx + w / 2, cy + h / 2, tex)
          .setDisplaySize(Math.min(w - 8, item.def.displayW), Math.min(h - 8, item.def.displayH));
      } else {
        icon = this.add.text(cx + w / 2, cy + h / 2, '?', {
          fontFamily: 'monospace', fontSize: '28px', color: '#888888',
        }).setOrigin(0.5);
      }

      this._itemSprites.push({ item, bg, icon, cx, cy, w, h });
    }

    this._updateCursor();
    this._updateInfo();
  }

  _close() {
    if (this._isUsing) return;
    this.player.inInventory = false;
    this.scene.stop();
  }

  _forceClose() {
    // Cancel use-in-progress tween
    this.tweens.killAll();
    this._isUsing = false;
    this.player.inInventory = false;
    this.scene.stop();
  }
}
