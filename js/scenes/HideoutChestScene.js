import { GAME_W, GAME_H } from '../config/constants.js';
import { ITEM_DEFS }      from '../config/lootTable.js';

/**
 * HideoutChestScene — persistent storage chest for the planque.
 *
 * Two panels, side by side:
 *   LEFT  — Player's current inventory items (taken from field)
 *   RIGHT — Chest items (server-side, never wiped by world reset)
 *
 * Controls:
 *   TAB / LEFT / RIGHT — switch active panel
 *   UP / DOWN          — navigate within active panel
 *   X                  — transfer selected item to the other panel
 *   E / ESC / TAB      — close
 *
 * Chest data is stored server-side per character.
 * It is received via S_CHEST_DATA on character selection,
 * cached in the Phaser registry, and saved back to the server
 * via C_CHEST_SAVE on each transfer and on close.
 */

const CHEST_MAX = 30;

const BOX_W = 280;
const BOX_H = 320;
const GAP   = 16;
const TOTAL_W = BOX_W * 2 + GAP;
const START_X = Math.round((GAME_W - TOTAL_W) / 2);
const BOX_Y   = Math.round((GAME_H - BOX_H) / 2) - 20;

const ITEM_ROW_H   = 26;
const ITEMS_START_Y = BOX_Y + 60;
const MAX_VISIBLE   = 9;    // rows visible per panel

export default class HideoutChestScene extends Phaser.Scene {
  constructor() { super({ key: 'HideoutChestScene' }); }

  init(data) {
    this.inventory = data.inventory;
    this.player    = data.player;
    this._net      = data.net ?? null;
  }

  create() {
    // ── Load chest from registry (populated by CharacterScene via S_CHEST_DATA) ─
    this._chestItems = (this.registry.get('chestItems') ?? []).slice();  // string[]

    // ── Active panel: 'player' | 'chest' ─────────────────────────────────
    this._activePanel = 'player';
    this._playerSel   = 0;
    this._chestSel    = 0;
    this._playerScroll = 0;
    this._chestScroll  = 0;

    // ── Overlay ───────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.65);

    // ── Left panel box (player) ───────────────────────────────────────────
    this._boxPlayer = this.add.rectangle(
      START_X + BOX_W / 2, GAME_H / 2 - 20, BOX_W + 8, BOX_H + 8, 0x111122, 0.95,
    ).setStrokeStyle(2, 0x5555aa, 0.8);

    // ── Right panel box (chest) ───────────────────────────────────────────
    this._boxChest = this.add.rectangle(
      START_X + BOX_W + GAP + BOX_W / 2, GAME_H / 2 - 20, BOX_W + 8, BOX_H + 8, 0x111122, 0.95,
    ).setStrokeStyle(2, 0x5555aa, 0.8);

    // ── Panel titles ──────────────────────────────────────────────────────
    this._titlePlayer = this.add.text(START_X + BOX_W / 2, BOX_Y + 18, 'INVENTAIRE', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffaa00',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this._titleChest = this.add.text(
      START_X + BOX_W + GAP + BOX_W / 2, BOX_Y + 18, 'COFFRE', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffaa00',
        stroke: '#000', strokeThickness: 3,
      },
    ).setOrigin(0.5);

    // ── Item count labels ─────────────────────────────────────────────────
    this._countPlayer = this.add.text(START_X + BOX_W / 2, BOX_Y + 38, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#777799',
    }).setOrigin(0.5);

    this._countChest = this.add.text(
      START_X + BOX_W + GAP + BOX_W / 2, BOX_Y + 38, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#777799',
      },
    ).setOrigin(0.5);

    // ── Hint ──────────────────────────────────────────────────────────────
    this._hint = this.add.text(GAME_W / 2, BOX_Y + BOX_H - 4, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#555577',
    }).setOrigin(0.5);

    // ── Cursor rects (one per panel) ──────────────────────────────────────
    this._cursorPlayer = this.add.rectangle(0, 0, BOX_W - 16, ITEM_ROW_H - 2)
      .setStrokeStyle(2, 0xffffff, 0.9).setFillStyle(0xffffff, 0.05).setVisible(false);
    this.tweens.add({ targets: this._cursorPlayer, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });

    this._cursorChest = this.add.rectangle(0, 0, BOX_W - 16, ITEM_ROW_H - 2)
      .setStrokeStyle(2, 0x00ffcc, 0.9).setFillStyle(0x00ffcc, 0.04).setVisible(false);
    this.tweens.add({ targets: this._cursorChest, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });

    // ── Initial draw ──────────────────────────────────────────────────────
    this._rowObjs = { player: [], chest: [] };
    this._redraw();
    this._updateFocus();

    // ── Keyboard input ────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-UP',    () => { this.registry.set('inputMode', 'kb'); this._moveSel(-1); });
    this.input.keyboard.on('keydown-DOWN',  () => { this.registry.set('inputMode', 'kb'); this._moveSel(1); });
    this.input.keyboard.on('keydown-LEFT',  () => { this.registry.set('inputMode', 'kb'); this._switchPanel('player'); });
    this.input.keyboard.on('keydown-RIGHT', () => { this.registry.set('inputMode', 'kb'); this._switchPanel('chest'); });
    this.input.keyboard.on('keydown-TAB',   () => { this.registry.set('inputMode', 'kb'); this._togglePanel(); });
    this.input.keyboard.on('keydown-X',     () => { this.registry.set('inputMode', 'kb'); this._transfer(); });
    this.input.keyboard.on('keydown-E',     () => { this.registry.set('inputMode', 'kb'); this._doClose(); });
    this.input.keyboard.on('keydown-ESC',   () => { this.registry.set('inputMode', 'kb'); this._doClose(); });

    // ── Gamepad ───────────────────────────────────────────────────────────
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      this.registry.set('inputMode', 'gp');
      if (button.index === 0) this._transfer();   // A
      if (button.index === 1) this._doClose();    // B
      if (button.index === 3) this._doClose();    // Y
      if (button.index === 4) this._switchPanel('player');  // LB
      if (button.index === 5) this._switchPanel('chest');   // RB
    });
  }

  update(time, delta) {
    this._gpCooldown -= delta;
    const gp = this.registry.get('inputMode') === 'gp';
    this._hint.setText(gp
      ? 'A: transférer   B: fermer   LB/RB: panneau'
      : 'X: transférer   E: fermer   TAB: panneau');

    if (gp && this.input.gamepad.total > 0 && this._gpCooldown <= 0) {
      const pad = this.input.gamepad.getPad(0);
      if (pad) {
        const DEAD = 0.4;
        let dy = 0;
        if (pad.up    || pad.leftStick.y < -DEAD) dy = -1;
        if (pad.down  || pad.leftStick.y >  DEAD) dy =  1;
        if (dy) { this.registry.set('inputMode', 'gp'); this._moveSel(dy); this._gpCooldown = 180; }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Panel helpers
  // ─────────────────────────────────────────────────────────────────────────

  _togglePanel() {
    this._switchPanel(this._activePanel === 'player' ? 'chest' : 'player');
  }

  _switchPanel(panel) {
    this._activePanel = panel;
    this._updateFocus();
  }

  _moveSel(dir) {
    if (this._activePanel === 'player') {
      const items = this._playerItems();
      this._playerSel = Phaser.Math.Clamp(this._playerSel + dir, 0, Math.max(0, items.length - 1));
      this._updateScrollPlayer(items.length);
    } else {
      this._chestSel = Phaser.Math.Clamp(this._chestSel + dir, 0, Math.max(0, this._chestItems.length - 1));
      this._updateScrollChest(this._chestItems.length);
    }
    this._updateFocus();
    this._redraw();
  }

  _updateScrollPlayer(total) {
    if (this._playerSel < this._playerScroll) this._playerScroll = this._playerSel;
    if (this._playerSel >= this._playerScroll + MAX_VISIBLE) this._playerScroll = this._playerSel - MAX_VISIBLE + 1;
    this._playerScroll = Phaser.Math.Clamp(this._playerScroll, 0, Math.max(0, total - MAX_VISIBLE));
  }

  _updateScrollChest(total) {
    if (this._chestSel < this._chestScroll) this._chestScroll = this._chestSel;
    if (this._chestSel >= this._chestScroll + MAX_VISIBLE) this._chestScroll = this._chestSel - MAX_VISIBLE + 1;
    this._chestScroll = Phaser.Math.Clamp(this._chestScroll, 0, Math.max(0, total - MAX_VISIBLE));
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Transfer
  // ─────────────────────────────────────────────────────────────────────────

  _transfer() {
    if (this._activePanel === 'player') {
      // Move from player inventory → chest
      const items = this._playerItems();
      if (items.length === 0) return;
      const item = items[this._playerSel];
      if (!item) return;
      if (this._chestItems.length >= CHEST_MAX) return;
      this.inventory.removeItem(item);
      this._chestItems.push(item.type);
      // clamp selection
      this._playerSel = Math.min(this._playerSel, Math.max(0, this._playerItems().length - 1));
    } else {
      // Move from chest → player inventory
      if (this._chestItems.length === 0) return;
      const type = this._chestItems[this._chestSel];
      if (!type) return;
      if (!this.inventory.hasRoom(type)) return;
      this._chestItems.splice(this._chestSel, 1);
      this.inventory.addItem(type, true);
      // clamp selection
      this._chestSel = Math.min(this._chestSel, Math.max(0, this._chestItems.length - 1));
    }
    this._saveChest();
    this._redraw();
    this._updateFocus();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Drawing
  // ─────────────────────────────────────────────────────────────────────────

  _playerItems() {
    return this.inventory.items;
  }

  _redraw() {
    // Destroy previous row objects
    for (const side of ['player', 'chest']) {
      for (const obj of this._rowObjs[side]) obj.destroy();
      this._rowObjs[side] = [];
    }

    const playerItems = this._playerItems();
    this._countPlayer.setText(`${playerItems.length} objet(s)`);
    this._countChest.setText(`${this._chestItems.length} / ${CHEST_MAX}`);

    // Draw player items
    const pBaseX = START_X;
    const visP = playerItems.slice(this._playerScroll, this._playerScroll + MAX_VISIBLE);
    visP.forEach((item, vi) => {
      const ry  = ITEMS_START_Y + vi * ITEM_ROW_H;
      const absI = vi + this._playerScroll;
      const def  = ITEM_DEFS[item.type] ?? {};
      const isSelected = absI === this._playerSel && this._activePanel === 'player';

      const bg = this.add.rectangle(pBaseX + BOX_W / 2, ry, BOX_W - 20, ITEM_ROW_H - 3,
        isSelected ? 0x223355 : 0x1a1a33, isSelected ? 0.9 : 0.6,
      ).setStrokeStyle(1, 0x334466, 0.4);

      const label = this.add.text(pBaseX + 14, ry,
        def.description ?? item.type, {
          fontFamily: 'monospace', fontSize: '10px',
          color: '#ccccdd',
        },
      ).setOrigin(0, 0.5);

      this._rowObjs.player.push(bg, label);
    });

    // Scroll indicators
    if (this._playerScroll > 0) {
      const up = this.add.text(pBaseX + BOX_W - 14, ITEMS_START_Y, '▲', {
        fontFamily: 'monospace', fontSize: '10px', color: '#555577',
      }).setOrigin(1, 0.5);
      this._rowObjs.player.push(up);
    }
    if (this._playerScroll + MAX_VISIBLE < playerItems.length) {
      const dn = this.add.text(pBaseX + BOX_W - 14, ITEMS_START_Y + (MAX_VISIBLE - 1) * ITEM_ROW_H, '▼', {
        fontFamily: 'monospace', fontSize: '10px', color: '#555577',
      }).setOrigin(1, 0.5);
      this._rowObjs.player.push(dn);
    }

    // Draw chest items
    const cBaseX = START_X + BOX_W + GAP;
    const visC = this._chestItems.slice(this._chestScroll, this._chestScroll + MAX_VISIBLE);
    visC.forEach((type, vi) => {
      const ry   = ITEMS_START_Y + vi * ITEM_ROW_H;
      const absI = vi + this._chestScroll;
      const def  = ITEM_DEFS[type] ?? {};
      const isSelected = absI === this._chestSel && this._activePanel === 'chest';

      const bg = this.add.rectangle(cBaseX + BOX_W / 2, ry, BOX_W - 20, ITEM_ROW_H - 3,
        isSelected ? 0x1a3322 : 0x1a1a33, isSelected ? 0.9 : 0.6,
      ).setStrokeStyle(1, 0x334466, 0.4);

      const label = this.add.text(cBaseX + 14, ry,
        def.description ?? type, {
          fontFamily: 'monospace', fontSize: '10px',
          color: '#ccddcc',
        },
      ).setOrigin(0, 0.5);

      this._rowObjs.chest.push(bg, label);
    });

    if (this._chestScroll > 0) {
      const up = this.add.text(cBaseX + BOX_W - 14, ITEMS_START_Y, '▲', {
        fontFamily: 'monospace', fontSize: '10px', color: '#555577',
      }).setOrigin(1, 0.5);
      this._rowObjs.chest.push(up);
    }
    if (this._chestScroll + MAX_VISIBLE < this._chestItems.length) {
      const dn = this.add.text(cBaseX + BOX_W - 14, ITEMS_START_Y + (MAX_VISIBLE - 1) * ITEM_ROW_H, '▼', {
        fontFamily: 'monospace', fontSize: '10px', color: '#555577',
      }).setOrigin(1, 0.5);
      this._rowObjs.chest.push(dn);
    }
  }

  _updateFocus() {
    // Player cursor
    const playerItems = this._playerItems();
    if (this._activePanel === 'player' && playerItems.length > 0) {
      const visIdx = this._playerSel - this._playerScroll;
      const pBaseX = START_X + BOX_W / 2;
      this._cursorPlayer.setPosition(pBaseX, ITEMS_START_Y + visIdx * ITEM_ROW_H).setVisible(true);
    } else {
      this._cursorPlayer.setVisible(false);
    }

    // Chest cursor
    if (this._activePanel === 'chest' && this._chestItems.length > 0) {
      const visIdx = this._chestSel - this._chestScroll;
      const cBaseX = START_X + BOX_W + GAP + BOX_W / 2;
      this._cursorChest.setPosition(cBaseX, ITEMS_START_Y + visIdx * ITEM_ROW_H).setVisible(true);
    } else {
      this._cursorChest.setVisible(false);
    }

    // Panel title highlight
    const activeColor   = '#00ffcc';
    const inactiveColor = '#ffaa00';
    this._titlePlayer.setColor(this._activePanel === 'player' ? activeColor : inactiveColor);
    this._titleChest.setColor(this._activePanel === 'chest'  ? activeColor : inactiveColor);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Persistence
  // ─────────────────────────────────────────────────────────────────────────

  _saveChest() {
    // Update registry so other scenes can read the latest state
    this.registry.set('chestItems', this._chestItems.slice());
    // Send to server if connected (charId included so server can identify character on raw connections)
    if (this._net && this._net.connected) {
      const charId = this.registry.get('charId') ?? '';
      this._net.sendChestSave(charId, this._chestItems);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Close
  // ─────────────────────────────────────────────────────────────────────────

  _doClose() {
    this._saveChest();
    this.player.searching = false;
    this.scene.stop();
  }
}
