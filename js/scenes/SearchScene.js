import { GAME_W, GAME_H } from '../config/constants.js';
import { ITEM_DEFS, SEARCH_OPEN_MS, SEARCH_IDENTIFY_MS } from '../config/lootTable.js';

/**
 * SearchScene — overlay shown when the player interacts with a searchable
 * container or enemy corpse.
 *
 * Flow:
 *   1. "Opening" progress bar  (SEARCH_OPEN_MS)
 *   2. Items appear one by one, each starting as "?" then identified after
 *      SEARCH_IDENTIFY_MS.
 *   3. Player can take items (added to inventory) or leave them.
 *   4. Close when done — leftover items stay on the corpse/container.
 */

const BOX_W = 340;
const BOX_H = 260;
const BOX_X = Math.round((GAME_W - BOX_W) / 2);
const BOX_Y = Math.round((GAME_H - BOX_H) / 2) - 20;

const ITEM_ROW_H  = 36;  // height of one item row
const ITEM_START_Y = BOX_Y + 70;

export default class SearchScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SearchScene' });
  }

  /**
   * @param {{ target: object, inventory: import('../systems/Inventory.js').default }} data
   *   target    — Container or dead Enemy with .lootItems[]
   *   inventory — Player inventory instance
   */
  init(data) {
    this.target    = data.target;
    this.inventory = data.inventory;
  }

  create() {
    // ── Overlay ─────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.6);

    // ── Box ─────────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2 - 20, BOX_W + 8, BOX_H + 8, 0x111122, 0.95)
      .setStrokeStyle(2, 0x5555aa, 0.8);

    // ── Title ───────────────────────────────────────────────────────────
    this._title = this.add.text(GAME_W / 2, BOX_Y + 16, 'Searching…', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffaa00',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Progress bar (opening) ──────────────────────────────────────────
    this._barBg = this.add.rectangle(GAME_W / 2, BOX_Y + 45, BOX_W - 40, 12, 0x333333)
      .setOrigin(0.5);
    this._barFill = this.add.rectangle(
      GAME_W / 2 - (BOX_W - 40) / 2, BOX_Y + 45, 0, 12, 0x33aaff
    ).setOrigin(0, 0.5);

    // ── Hint ────────────────────────────────────────────────────────────
    this._hint = this.add.text(GAME_W / 2, BOX_Y + BOX_H - 10, 'Z/A: take   X/B: leave   TAB/Select: close', {
      fontFamily: 'monospace', fontSize: '9px', color: '#555577',
    }).setOrigin(0.5);

    // State
    this._phase = 'opening';        // 'opening' | 'identifying' | 'ready'
    this._itemRows = [];             // UI rows for each loot item
    this._selectedIdx = 0;
    this._identifyIdx = 0;
    this._revealedItems = [];        // { type, identified }
    this._cursor = null;

    // ── Phase 1 — Opening bar ───────────────────────────────────────────
    this.tweens.add({
      targets: this._barFill,
      width: BOX_W - 40,
      duration: SEARCH_OPEN_MS,
      ease: 'Linear',
      onComplete: () => this._beginIdentify(),
    });

    // ── Input ───────────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-TAB',   () => this._tryClose());
    this.input.keyboard.on('keydown-ESC',   () => this._tryClose());
    this.input.keyboard.on('keydown-UP',    () => this._moveSel(-1));
    this.input.keyboard.on('keydown-DOWN',  () => this._moveSel(1));
    this.input.keyboard.on('keydown-Z',     () => this._takeSelected());
    this.input.keyboard.on('keydown-X',     () => this._leaveSelected());

    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 8) this._tryClose();  // Select
      if (button.index === 0) this._takeSelected();   // A / Cross
      if (button.index === 1) this._leaveSelected();  // B / Circle
    });
  }

  update(time, delta) {
    // Gamepad d-pad
    this._gpCooldown -= delta;
    const gp = this.input.gamepad;
    if (gp && gp.total > 0 && this._gpCooldown <= 0) {
      const pad = gp.getPad(0);
      if (pad) {
        const DEAD = 0.4;
        let dy = 0;
        if (pad.up    || pad.leftStick.y < -DEAD) dy = -1;
        if (pad.down  || pad.leftStick.y >  DEAD) dy =  1;
        if (dy) { this._moveSel(dy); this._gpCooldown = 180; }
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Phase 2 — Identify items one by one
  // ═════════════════════════════════════════════════════════════════════════

  _beginIdentify() {
    this._barBg.setVisible(false);
    this._barFill.setVisible(false);
    this._title.setText('Items found');
    this._phase = 'identifying';

    // Build the initial row list (all unknown)
    this._revealedItems = this.target.lootItems.map(type => ({
      type,
      identified: false,
      taken: false,
    }));

    // If no loot, go straight to ready
    if (this._revealedItems.length === 0) {
      this._title.setText('Empty');
      this._phase = 'ready';
      return;
    }

    // Draw all rows as "?"
    this._drawRows();

    // Start identifying chain
    this._identifyIdx = 0;
    this._identifyNext();
  }

  _identifyNext() {
    if (this._identifyIdx >= this._revealedItems.length) {
      this._phase = 'ready';
      return;
    }

    const idx = this._identifyIdx;
    this.time.delayedCall(SEARCH_IDENTIFY_MS, () => {
      this._revealedItems[idx].identified = true;
      this._refreshRow(idx);
      this._identifyIdx++;
      this._identifyNext();
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Row rendering
  // ═════════════════════════════════════════════════════════════════════════

  _drawRows() {
    for (let i = 0; i < this._revealedItems.length; i++) {
      const ry = ITEM_START_Y + i * ITEM_ROW_H;

      const bg = this.add.rectangle(GAME_W / 2, ry, BOX_W - 20, ITEM_ROW_H - 4, 0x222244, 0.6)
        .setStrokeStyle(1, 0x444466, 0.4);

      const icon = this.add.text(GAME_W / 2 - BOX_W / 2 + 30, ry, '?', {
        fontFamily: 'monospace', fontSize: '18px', color: '#666',
      }).setOrigin(0.5);

      const label = this.add.text(GAME_W / 2 - BOX_W / 2 + 60, ry, '???', {
        fontFamily: 'monospace', fontSize: '12px', color: '#888',
      }).setOrigin(0, 0.5);

      const status = this.add.text(GAME_W / 2 + BOX_W / 2 - 25, ry, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#555',
      }).setOrigin(1, 0.5);

      this._itemRows.push({ bg, icon, label, status, ry });
    }

    // Cursor
    this._cursor = this.add.rectangle(GAME_W / 2, ITEM_START_Y, BOX_W - 16, ITEM_ROW_H - 2)
      .setStrokeStyle(2, 0xffffff, 0.9).setFillStyle(0xffffff, 0.05);
    this.tweens.add({ targets: this._cursor, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });
    this._selectedIdx = 0;
    this._updateCursorPos();
  }

  _refreshRow(idx) {
    const row  = this._itemRows[idx];
    const item = this._revealedItems[idx];
    if (!row) return;

    if (item.taken) {
      row.icon.setText('✓');
      row.icon.setColor('#00cc44');
      row.label.setText('Taken').setColor('#44aa44');
      row.status.setText('');
      row.bg.setFillStyle(0x113311, 0.4);
    } else if (item.identified) {
      const def = ITEM_DEFS[item.type];
      if (def.texture && this.textures.exists(def.texture)) {
        row.icon.setVisible(false);
        const img = this.add.image(row.icon.x, row.ry, def.texture)
          .setDisplaySize(24, 24);
        row._img = img;
      } else {
        row.icon.setText(item.type.charAt(0).toUpperCase()).setColor(
          '#' + def.glowColor.toString(16).padStart(6, '0')
        );
      }
      row.label.setText(def.description).setColor('#cccccc');
    } else {
      row.icon.setText('?').setColor('#666');
      row.label.setText('???').setColor('#888');
    }
  }

  _updateCursorPos() {
    if (!this._cursor || this._itemRows.length === 0) return;
    const ry = ITEM_START_Y + this._selectedIdx * ITEM_ROW_H;
    this._cursor.setY(ry);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  User actions
  // ═════════════════════════════════════════════════════════════════════════

  _moveSel(dir) {
    if (this._phase === 'opening') return;
    if (this._revealedItems.length === 0) return;
    this._selectedIdx = Phaser.Math.Clamp(this._selectedIdx + dir, 0, this._revealedItems.length - 1);
    this._updateCursorPos();
  }

  _takeSelected() {
    if (this._phase === 'opening') return;
    const item = this._revealedItems[this._selectedIdx];
    if (!item || item.taken) return;

    // Check inventory space
    if (!this.inventory.hasRoom(item.type)) {
      // Flash the row red briefly
      const row = this._itemRows[this._selectedIdx];
      row.status.setText('FULL').setColor('#ff3333');
      this.time.delayedCall(800, () => { if (row.status.active) row.status.setText(''); });
      return;
    }

    // Add to inventory (identified = whatever it is now)
    this.inventory.addItem(item.type, item.identified);
    item.taken = true;
    this._refreshRow(this._selectedIdx);
  }

  _leaveSelected() {
    // Visual feedback — skip / nothing to do
  }

  _tryClose() {
    if (this._phase === 'opening') return; // can't close during opening anim

    // Mark the target as searched (removes the prompt)
    this.target.markSearched();

    // Remove taken items from the target's loot list (leftover stays for re-search? No — mark searched)
    this.scene.resume('GameScene');
    this.scene.resume('HUDScene');
    this.scene.stop();
  }
}
