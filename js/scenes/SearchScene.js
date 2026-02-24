import { GAME_W, GAME_H, IS_MOBILE } from '../config/constants.js';
import { ITEM_DEFS, SEARCH_OPEN_MS, SEARCH_IDENTIFY_MS } from '../config/lootTable.js';

/**
 * SearchScene — overlay shown when the player interacts with a searchable
 * container or enemy corpse.
 *
 * The game keeps running underneath (enemies can attack, timer ticks).
 * If the player gets hit, the search is interrupted and the scene closes.
 *
 * Flow:
 *   1. "Opening" progress bar  (SEARCH_OPEN_MS)
 *   2. Items appear one by one, each starting as "?" then identified after
 *      SEARCH_IDENTIFY_MS.
 *   3. Player can take items (added to inventory) or leave them.
 *   4. Close when done — target marked as searched.
 */

const BOX_W = 340;
const BOX_H = 260;
const BOX_X = Math.round((GAME_W - BOX_W) / 2);
const BOX_Y = Math.round((GAME_H - BOX_H) / 2) - 20;

const ITEM_ROW_H  = 36;
const ITEM_START_Y = BOX_Y + 70;

export default class SearchScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SearchScene' });
  }

  init(data) {
    this.target    = data.target;
    this.inventory = data.inventory;
    this.player    = data.player;
    this.net       = data.net;      // NetworkManager for C_TAKE_ITEM

    // Determine target kind + id for network messages
    // Containers have an .image property; enemies don't
    this._targetKind = this.target.image ? 0 : 1;  // 0=container, 1=corpse
    this._targetId   = this.target.netId ?? 0;
  }

  create() {
    const gp = this.registry.get('inputMode') === 'gp';

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

    // ── Close button (mobile) ───────────────────────────────────────────
    if (IS_MOBILE) {
      const closeBg = this.add.circle(BOX_X + BOX_W - 6, BOX_Y + 6, 18, 0xaa2222, 0.9)
        .setStrokeStyle(2, 0xff4444, 0.8).setInteractive({ useHandCursor: true });
      this.add.text(BOX_X + BOX_W - 6, BOX_Y + 6, '✕', {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
      closeBg.on('pointerdown', () => this._tryClose());
    }

    // ── Hint (adaptive — updated each frame) ────────────────────────────
    this._hint = this.add.text(GAME_W / 2, BOX_Y + BOX_H - 10, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#555577',
    }).setOrigin(0.5);
    this._refreshHint();

    // State
    this._phase = 'opening';
    this._itemRows = [];
    this._selectedIdx = 0;
    this._identifyIdx = 0;
    this._revealedItems = [];
    this._cursor = null;
    this._hpSnapshot = this.player.hp;  // to detect hits

    // ── Phase 1 — Opening bar (skip if already opened before) ────────────
    if (this.target.opened) {
      // Already opened — go straight to showing identified items
      this._barBg.setVisible(false);
      this._barFill.setVisible(false);
      this._skipToReady();
    } else {
      this.tweens.add({
        targets: this._barFill,
        width: BOX_W - 40,
        duration: SEARCH_OPEN_MS,
        ease: 'Linear',
        onComplete: () => this._beginIdentify(),
      });
    }

    // ── Keyboard input ──────────────────────────────────────────────────
    this.input.keyboard.on('keydown-E',     () => { this.registry.set('inputMode', 'kb'); this._tryClose(); });
    this.input.keyboard.on('keydown-TAB',   () => { this.registry.set('inputMode', 'kb'); this._tryClose(); });
    this.input.keyboard.on('keydown-ESC',   () => { this.registry.set('inputMode', 'kb'); this._tryClose(); });
    this.input.keyboard.on('keydown-UP',    () => { this.registry.set('inputMode', 'kb'); this._moveSel(-1); });
    this.input.keyboard.on('keydown-DOWN',  () => { this.registry.set('inputMode', 'kb'); this._moveSel(1); });
    this.input.keyboard.on('keydown-X',     () => { this.registry.set('inputMode', 'kb'); this._takeSelected(); });
    this.input.keyboard.on('keydown-C',     () => { this.registry.set('inputMode', 'kb'); });

    // ── Gamepad input ───────────────────────────────────────────────────
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      this.registry.set('inputMode', 'gp');
      if (button.index === 0) this._takeSelected();   // A / Cross
      if (button.index === 1) this._tryClose();        // B / Circle → CLOSE
      if (button.index === 3) this._tryClose();        // Y / Triangle (same key as interact)
      if (button.index === 8) this._tryClose();        // Select
    });
  }

  update(time, delta) {
    // ── Adaptive hint refresh ───────────────────────────────────────────
    this._refreshHint();

    // ── Hit interruption: if player took damage, abort search ───────────
    if (this.player.hp < this._hpSnapshot || this.player.state === 'hurt') {
      this._forceClose();
      return;
    }
    this._hpSnapshot = this.player.hp;

    // ── Gamepad d-pad navigation ────────────────────────────────────────
    this._gpCooldown -= delta;
    const gpInput = this.input.gamepad;
    if (gpInput && gpInput.total > 0 && this._gpCooldown <= 0) {
      const pad = gpInput.getPad(0);
      if (pad) {
        const DEAD = 0.4;
        let dy = 0;
        if (pad.up    || pad.leftStick.y < -DEAD) dy = -1;
        if (pad.down  || pad.leftStick.y >  DEAD) dy =  1;
        if (dy) {
          this.registry.set('inputMode', 'gp');
          this._moveSel(dy);
          this._gpCooldown = 180;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Adaptive hint
  // ═══════════════════════════════════════════════════════════════════════

  _refreshHint() {
    if (IS_MOBILE) {
      this._hint.setText('Tap item to take   ✕ to close');
      return;
    }
    const gp = this.registry.get('inputMode') === 'gp';
    this._hint.setText(gp
      ? 'A: take   B: close'
      : 'X: take   E / TAB: close');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Phase 2 — Identify items one by one
  // ═══════════════════════════════════════════════════════════════════════

  /** Skip opening+identify — show items as already identified (re-search). */
  _skipToReady() {
    this._title.setText('Items found');
    this._phase = 'ready';

    this._revealedItems = this.target.lootItems.map(type => ({
      type, identified: true, taken: false,
    }));

    if (this._revealedItems.length === 0) {
      this._title.setText('Empty');
      return;
    }

    this._drawRows();
    this._revealedItems.forEach((_, i) => this._refreshRow(i));
  }

  _beginIdentify() {
    this._barBg.setVisible(false);
    this._barFill.setVisible(false);
    this._title.setText('Items found');
    this._phase = 'identifying';
    this.target.opened = true;  // mark as opened for future re-searches

    this._revealedItems = this.target.lootItems.map(type => ({
      type,
      identified: false,
      taken: false,
    }));

    if (this._revealedItems.length === 0) {
      this._title.setText('Empty');
      this._phase = 'ready';
      return;
    }

    this._drawRows();
    this._identifyIdx = 0;
    this._identifyNext();
  }

  _identifyNext() {
    if (this._identifyIdx >= this._revealedItems.length) {
      this._phase = 'ready';
      return;
    }

    const idx = this._identifyIdx;
    const lootLevel  = this.player?._skillLevel?.('lootSkill') ?? 0;
    const identDelay = Math.max(100, SEARCH_IDENTIFY_MS - lootLevel * 20);
    this.time.delayedCall(identDelay, () => {
      if (!this.scene.isActive()) return; // scene may have closed
      this._revealedItems[idx].identified = true;
      this._refreshRow(idx);
      this._identifyIdx++;
      this._identifyNext();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Row rendering
  // ═══════════════════════════════════════════════════════════════════════

  _drawRows() {
    for (let i = 0; i < this._revealedItems.length; i++) {
      const ry = ITEM_START_Y + i * ITEM_ROW_H;

      const bg = this.add.rectangle(GAME_W / 2, ry, BOX_W - 20, ITEM_ROW_H - 4, 0x222244, 0.6)
        .setStrokeStyle(1, 0x444466, 0.4);

      if (IS_MOBILE) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => {
          if (this._selectedIdx === i) {
            this._takeSelected();
          } else {
            this._selectedIdx = i;
            this._updateCursorPos();
          }
        });
      }

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
      row.icon.setText('✓').setColor('#00cc44');
      row.label.setText('Taken').setColor('#44aa44');
      row.status.setText('');
      row.bg.setFillStyle(0x113311, 0.4);
    } else if (item.identified) {
      const def = ITEM_DEFS[item.type];
      if (def.texture && this.textures.exists(def.texture)) {
        row.icon.setVisible(false);
        this.add.image(row.icon.x, row.ry, def.texture).setDisplaySize(24, 24);
      } else {
        row.icon.setText(item.type.charAt(0).toUpperCase()).setColor(
          '#' + def.glowColor.toString(16).padStart(6, '0')
        );
      }
      row.label.setText(def.description).setColor('#cccccc');
    }
  }

  _updateCursorPos() {
    if (!this._cursor || this._itemRows.length === 0) return;
    this._cursor.setY(ITEM_START_Y + this._selectedIdx * ITEM_ROW_H);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  User actions
  // ═══════════════════════════════════════════════════════════════════════

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

    // Can't take unidentified items
    if (!item.identified) {
      const row = this._itemRows[this._selectedIdx];
      row.status.setText('???').setColor('#ffaa00');
      this.time.delayedCall(600, () => { if (row.status.active) row.status.setText(''); });
      return;
    }

    if (!this.inventory.hasRoom(item.type)) {
      const row = this._itemRows[this._selectedIdx];
      row.status.setText('FULL').setColor('#ff3333');
      this.time.delayedCall(800, () => { if (row.status.active) row.status.setText(''); });
      return;
    }

    this.inventory.addItem(item.type, item.identified);
    item.taken = true;
    this._refreshRow(this._selectedIdx);

    // XP loot
    if (this.net?.sendSkillGain) this.net.sendSkillGain('lootSkill', 5);

    // Notify server so all players see the item removed
    if (this.net) {
      // Compute the server-side index (already-taken items have been removed
      // from the server's array, so we count only non-taken items before us)
      let serverIdx = 0;
      for (let i = 0; i < this._selectedIdx; i++) {
        if (!this._revealedItems[i].taken) serverIdx++;
      }
      this.net.sendTakeItem(this._targetKind, this._targetId, serverIdx);
    }
  }

  _tryClose() {
    if (this._phase === 'opening') return;

    // Server is authoritative on loot — check remaining items
    const allTaken = this._revealedItems.length === 0 ||
      this._revealedItems.every(i => i.taken);
    if (allTaken) {
      this.target.markSearched();
    }
    this._doClose();
  }

  /** Forced close (hit interruption) — doesn't mark as searched, can retry. */
  _forceClose() {
    this._doClose();
  }

  _doClose() {
    this.player.searching = false;
    this.scene.stop();
  }
}
