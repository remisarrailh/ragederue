import { GAME_W, GAME_H, IS_MOBILE } from '../config/constants.js';
import { ITEM_DEFS } from '../config/lootTable.js';

const CELL    = IS_MOBILE ? 72 : 48;   // cell size in px
const GAP     = IS_MOBILE ? 4  : 2;
const COLS    = 6;
const ROWS    = 4;
const GRID_W  = COLS * (CELL + GAP) + GAP;
const GRID_H  = ROWS * (CELL + GAP) + GAP;
const GRID_X  = Math.round((GAME_W - GRID_W) / 2);
const GRID_Y  = Math.round((GAME_H - GRID_H) / 2) - 20;

const TAB_INV   = 0;
const TAB_STATS = 1;

const SKILL_DEFS = [
  { key: 'punchSkill', label: 'Poings',  icon: '👊', bonusLabel: 'dmg poings' },
  { key: 'kickSkill',  label: 'Pieds',   icon: '🦵', bonusLabel: 'dmg pieds' },
  { key: 'jabSkill',   label: 'Jab',     icon: '⚡',  bonusLabel: 'dmg jab' },
  { key: 'moveSkill',  label: 'Vitesse', icon: '🏃',  bonusLabel: 'vitesse' },
  { key: 'runSkill',   label: 'Sprint',  icon: '💨',  bonusLabel: '+vitesse/-conso sprint' },
  { key: 'jumpSkill',  label: 'Saut',    icon: '🦘',  bonusLabel: '+hauteur/-conso saut' },
  { key: 'lootSkill',  label: 'Loot',    icon: '📦',  bonusLabel: '-20ms/lv ident.' },
  { key: 'healSkill',  label: 'Soins',   icon: '💊',  bonusLabel: 'efficacité soins' },
  { key: 'eatSkill',   label: 'Manger',  icon: '🍕',  bonusLabel: 'efficacité nourriture' },
];

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
    this._activeTab  = TAB_INV;

    // ── Overlay ───────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.65);

    // ── Tab buttons ───────────────────────────────────────────────────────
    const tabNames  = ['INVENTAIRE', 'STATS'];
    const tabSpacing = 130;
    const tabStartX  = GAME_W / 2 - tabSpacing / 2;
    this._tabLabels  = [];
    for (let i = 0; i < tabNames.length; i++) {
      const lbl = this.add.text(tabStartX + i * tabSpacing, 22, tabNames[i], {
        fontFamily: 'monospace', fontSize: '13px', color: '#888888',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      lbl.on('pointerdown', () => this._switchTab(i));
      this._tabLabels.push(lbl);
    }

    // ── Tab groups ────────────────────────────────────────────────────────
    this._tabGroups = [[], []];

    this._buildInventoryTab();
    this._buildStatsTab();
    this._switchTab(TAB_INV);

    // ── Close button (mobile) ──────────────────────────────────────────────
    if (IS_MOBILE) {
      const closeBtn = this.add.text(GAME_W - 20, 18, '✕', {
        fontFamily: 'monospace', fontSize: '22px', color: '#ff4444',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      closeBtn.on('pointerdown', () => this._close());
    }

    // ── Hint (adaptive) ───────────────────────────────────────────────────
    this._hintText = this.add.text(GAME_W / 2, GAME_H - 16, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#666666',
    }).setOrigin(0.5);
    this._refreshHint();

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-TAB', () => {
      this.registry.set('inputMode', 'kb');
      if (this._activeTab === TAB_INV) this._switchTab(TAB_STATS);
      else this._close();
    });
    this.input.keyboard.on('keydown-ESC', () => { this.registry.set('inputMode', 'kb'); this._close(); });
    this.input.keyboard.on('keydown-LEFT',  () => { this.registry.set('inputMode', 'kb'); if (this._activeTab === TAB_INV) this._move(-1, 0); });
    this.input.keyboard.on('keydown-RIGHT', () => { this.registry.set('inputMode', 'kb'); if (this._activeTab === TAB_INV) this._move(1, 0); });
    this.input.keyboard.on('keydown-UP',    () => { this.registry.set('inputMode', 'kb'); if (this._activeTab === TAB_INV) this._move(0, -1); });
    this.input.keyboard.on('keydown-DOWN',  () => { this.registry.set('inputMode', 'kb'); if (this._activeTab === TAB_INV) this._move(0, 1); });
    this.input.keyboard.on('keydown-X',     () => { this.registry.set('inputMode', 'kb'); if (this._activeTab === TAB_INV) this._useSelected(); });

    // Gamepad
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      this.registry.set('inputMode', 'gp');
      if (button.index === 8) this._close();                          // Select : fermer
      if (button.index === 4 || button.index === 5) {                 // LB / RB : switch tab
        this._switchTab(this._activeTab === TAB_INV ? TAB_STATS : TAB_INV);
      }
      if (button.index === 0 && this._activeTab === TAB_INV) this._useSelected(); // A / Cross
    });
  }

  update(time, delta) {
    // ── Hit detection — close inventory if player takes damage ──────────
    if (this.player.hp < this._hpSnapshot || this.player.state === 'hurt' || this.player.state === 'dead') {
      this._forceClose();
      return;
    }

    this._refreshHint();

    // Gamepad D-pad navigation (inventory tab only)
    this._gpCooldown -= delta;
    const gp = this.input.gamepad;
    if (gp && gp.total > 0 && this._gpCooldown <= 0 && this._activeTab === TAB_INV) {
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

  // ── Tab management ───────────────────────────────────────────────────────

  _switchTab(idx) {
    this._activeTab = idx;
    for (let i = 0; i < this._tabGroups.length; i++) {
      const visible = i === idx;
      for (const obj of this._tabGroups[i]) obj.setVisible(visible);
      this._tabLabels[i].setColor(visible ? '#ff8800' : '#888888');
    }
    if (idx === TAB_STATS) this._refreshStats();
  }

  // ── Tab: INVENTAIRE ──────────────────────────────────────────────────────

  _buildInventoryTab() {
    const grp = this._tabGroups[TAB_INV];

    // Grid background
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a1a2e, 0.9);
    gfx.fillRect(GRID_X - 4, GRID_Y - 4, GRID_W + 8, GRID_H + 8);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = GRID_X + GAP + c * (CELL + GAP);
        const cy = GRID_Y + GAP + r * (CELL + GAP);
        gfx.fillStyle(0x333355, 0.7);
        gfx.fillRect(cx, cy, CELL, CELL);
      }
    }
    grp.push(gfx);

    // Items
    this._itemSprites = [];
    this._selectedIdx = 0;
    this._drawItems(grp);

    // Selection cursor
    this._cursor = this.add.rectangle(0, 0, CELL, CELL)
      .setStrokeStyle(2, 0xffffff, 1).setFillStyle(0xffffff, 0.1);
    this.tweens.add({ targets: this._cursor, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });
    grp.push(this._cursor);
    this._updateCursor();

    // Info panel
    this._infoText = this.add.text(GAME_W / 2, GRID_Y + GRID_H + 14, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#cccccc', align: 'center',
    }).setOrigin(0.5, 0);
    grp.push(this._infoText);
    this._updateInfo();

    // Use progress bar
    this._useBarBg = this.add.rectangle(GAME_W / 2, GRID_Y + GRID_H + 52, 160, 10, 0x333333)
      .setOrigin(0.5).setVisible(false);
    this._useBarFill = this.add.rectangle(GAME_W / 2 - 80, GRID_Y + GRID_H + 52, 0, 10, 0x00ff88)
      .setOrigin(0, 0.5).setVisible(false);
    this._isUsing = false;
    grp.push(this._useBarBg);
    grp.push(this._useBarFill);
  }

  _drawItems(grp) {
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

      // Touch: tap to select, tap again to use
      bg.setInteractive();
      const idx = this._itemSprites.length;
      bg.on('pointerdown', () => {
        if (this._selectedIdx === idx) {
          this._useSelected();
        } else {
          this._selectedIdx = idx;
          this._updateCursor();
          this._updateInfo();
        }
      });

      this._itemSprites.push({ item, bg, icon, cx, cy, w, h });
      if (grp) { grp.push(bg); grp.push(icon); }
    }
  }

  // ── Tab: STATS ────────────────────────────────────────────────────────────

  _buildStatsTab() {
    const grp  = this._tabGroups[TAB_STATS];
    const cx   = GAME_W / 2;
    const BAR_W = 180;
    const ROW_H = 44;
    const startY = 46;

    const title = this.add.text(cx, startY, 'COMPÉTENCES', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff8800',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
    grp.push(title);

    this._skillRows = [];

    for (let i = 0; i < SKILL_DEFS.length; i++) {
      const def = SKILL_DEFS[i];
      const ry  = startY + 18 + i * ROW_H;

      const rowBg = this.add.rectangle(cx, ry + ROW_H / 2, 380, ROW_H - 4, 0x111122, 0.7)
        .setStrokeStyle(1, 0x333355, 0.5);
      grp.push(rowBg);

      const lbl = this.add.text(cx - 165, ry + ROW_H / 2 - 6, `${def.icon} ${def.label}`, {
        fontFamily: 'monospace', fontSize: '12px', color: '#cccccc',
      }).setOrigin(0, 0.5);
      grp.push(lbl);

      const lvlTxt = this.add.text(cx - 42, ry + ROW_H / 2 - 6, 'lv 0', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffcc00',
      }).setOrigin(0.5, 0.5);
      grp.push(lvlTxt);

      const barBg = this.add.rectangle(cx + 18, ry + ROW_H / 2 - 6, BAR_W, 7, 0x222244)
        .setOrigin(0, 0.5);
      grp.push(barBg);

      const barFill = this.add.rectangle(cx + 18, ry + ROW_H / 2 - 6, 0, 7, 0x4466ff)
        .setOrigin(0, 0.5);
      grp.push(barFill);

      const bonusTxt = this.add.text(cx + 18, ry + ROW_H / 2 + 6, 'aucun bonus', {
        fontFamily: 'monospace', fontSize: '9px', color: '#6688aa',
      }).setOrigin(0, 0.5);
      grp.push(bonusTxt);

      this._skillRows.push({ lvlTxt, barFill, bonusTxt, barW: BAR_W });
    }
  }

  _refreshStats() {
    const player = this.player;
    if (!player || !this._skillRows) return;

    for (let i = 0; i < SKILL_DEFS.length; i++) {
      const def = SKILL_DEFS[i];
      const row = this._skillRows[i];
      const totalXP = player.skills?.[def.key] ?? 0;

      let xp = totalXP, lvl = 0;
      while (xp >= Math.round(100 * Math.pow(lvl + 1, 1.5))) {
        xp -= Math.round(100 * Math.pow(lvl + 1, 1.5));
        lvl++;
        if (lvl >= 50) break;
      }

      const lvlCap  = Math.round(100 * Math.pow(lvl + 1, 1.5));
      const progress = lvl >= 50 ? 1 : xp / lvlCap;

      row.lvlTxt.setText(`lv ${lvl}`);
      row.barFill.setSize(Math.round(row.barW * progress), 7);

      const t = Math.min(lvl / 20, 1);
      const r = Math.round(Phaser.Math.Linear(0x44, 0xff, t));
      const g = Math.round(Phaser.Math.Linear(0x66, 0xcc, t));
      const b = Math.round(Phaser.Math.Linear(0xff, 0x00, t));
      row.barFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));

      const bonusPct = lvl * 2;
      if (def.key === 'lootSkill') {
        row.bonusTxt.setText(lvl > 0 ? `-${lvl * 20}ms identification` : 'aucun bonus');
      } else {
        row.bonusTxt.setText(bonusPct > 0 ? `+${bonusPct}% ${def.bonusLabel}` : 'aucun bonus');
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _refreshHint() {
    const gp = this.registry.get('inputMode') === 'gp';
    if (this._activeTab === TAB_INV) {
      this._hintText.setText(gp
        ? 'D-Pad: naviguer   A: utiliser   LB/RB: stats   Select: fermer'
        : 'Flèches: naviguer   X: utiliser   TAB: stats   ESC: fermer');
    } else {
      this._hintText.setText(gp
        ? 'LB/RB: inventaire   Select: fermer'
        : 'TAB: inventaire   ESC: fermer');
    }
  }

  _move(dx, dy) {
    if (this._isUsing) return;
    if (this._itemSprites.length === 0) return;

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
    if (this._itemSprites.length === 0) { this._cursor.setVisible(false); return; }
    this._cursor.setVisible(this._activeTab === TAB_INV);
    const s = this._itemSprites[this._selectedIdx];
    this._cursor.setPosition(s.cx + s.w / 2, s.cy + s.h / 2);
    this._cursor.setSize(s.w + 4, s.h + 4);
  }

  _updateInfo() {
    if (this._itemSprites.length === 0) { this._infoText.setText('Inventaire vide'); return; }
    const item = this._itemSprites[this._selectedIdx]?.item;
    if (!item) return;
    if (!item.identified) {
      this._infoText.setText('??? — Objet non identifié');
    } else {
      const usable = item.def.useTime > 0 ? `  [${(item.def.useTime / 1000).toFixed(1)}s]` : '';
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

    if (item.def.useTime <= 0 && !item.def.healAmount && !item.def.hungerRestore && !item.def.thirstRestore) return;

    this._isUsing = true;
    this._useBarBg.setVisible(true);
    this._useBarFill.setVisible(true).setSize(0, 10);

    this.tweens.add({
      targets: this._useBarFill,
      width: 160,
      duration: item.def.useTime,
      ease: 'Linear',
      onComplete: () => {
        this.inventory.useItem(item, this.player);
        this._isUsing = false;
        this._useBarBg.setVisible(false);
        this._useBarFill.setVisible(false);
        this._rebuild();
      },
    });
  }

  _rebuild() {
    const grp = this._tabGroups[TAB_INV];
    for (const s of this._itemSprites) {
      s.bg.destroy(); s.icon.destroy();
      const bi = grp.indexOf(s.bg);   if (bi !== -1) grp.splice(bi, 1);
      const ii = grp.indexOf(s.icon); if (ii !== -1) grp.splice(ii, 1);
    }
    this._itemSprites = [];
    this._selectedIdx = 0;
    this._drawItems(grp);
    this._updateCursor();
    this._updateInfo();
  }

  _close() {
    if (this._isUsing) return;
    // Set a brief "just closed" timestamp so InputController won't re-open
    // inventory on the same gamepad button event.
    this.registry.set('inventoryClosedAt', Date.now());
    this.player.inInventory = false;
    this.scene.stop();
  }

  _forceClose() {
    this.tweens.killAll();
    this._isUsing = false;
    this.registry.set('inventoryClosedAt', Date.now());
    this.player.inInventory = false;
    this.scene.stop();
  }
}
