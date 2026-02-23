import { GAME_W, GAME_H } from '../config/constants.js';
import NetworkManager     from '../network/NetworkManager.js';

/**
 * CharacterScene — Character selection and creation screen.
 *
 * Flow:
 *   TitleScene → CharacterScene → GameScene (level_03 / planque)
 *
 * The scene connects to the server (raw, no C_JOIN) to browse characters.
 * Once a character is selected, charId + charName are stored in the registry
 * and GameScene is started.
 *
 * Controls (list state):
 *   UP / DOWN    — navigate list
 *   ENTER / A    — play with selected character
 *   N            — new character (enter create state)
 *   DEL / Y      — delete selected character
 *   ESC / B      — back to TitleScene
 *
 * Controls (create state):
 *   Type letters  — build name
 *   ENTER         — confirm creation
 *   BACKSPACE     — delete last char
 *   ESC           — cancel
 */

const BOX_W = 420;
const BOX_H = 340;
const BOX_X = (GAME_W - BOX_W) / 2;
const BOX_Y = (GAME_H - BOX_H) / 2 - 20;

const ROW_H      = 30;
const LIST_START = BOX_Y + 80;
const MAX_VIS    = 7;

export default class CharacterScene extends Phaser.Scene {
  constructor() { super({ key: 'CharacterScene' }); }

  create() {
    this.cameras.main.setBackgroundColor('#0a0a14');

    // ── State ─────────────────────────────────────────────────────────────
    this._chars      = [];
    this._selIdx     = 0;
    this._scroll     = 0;
    this._mode       = 'connecting';  // 'connecting' | 'list' | 'create' | 'waiting'
    this._inputBuf   = '';
    this._errorTimer = 0;
    this._rowObjs    = [];

    // ── Background box ────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2 - 20, BOX_W + 8, BOX_H + 8, 0x111122, 0.97)
      .setStrokeStyle(2, 0x5555aa, 0.8);

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, BOX_Y + 20, 'SÉLECTION PERSONNAGE', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ff6600',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    // ── Status / error line ───────────────────────────────────────────────
    this._statusText = this.add.text(GAME_W / 2, BOX_Y + 48, 'Connexion au serveur…', {
      fontFamily: 'monospace', fontSize: '11px', color: '#777799',
    }).setOrigin(0.5);

    // ── Create-mode input row ─────────────────────────────────────────────
    this._createLabel = this.add.text(BOX_X + 14, BOX_Y + BOX_H - 54, 'Nom : ', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffcc00',
    }).setOrigin(0, 0.5).setVisible(false);

    this._createInput = this.add.text(BOX_X + 80, BOX_Y + BOX_H - 54, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0, 0.5).setVisible(false);

    // Blinking cursor
    this._createCursor = this.add.text(BOX_X + 80, BOX_Y + BOX_H - 54, '|', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffcc00',
    }).setOrigin(0, 0.5).setVisible(false);
    this.tweens.add({ targets: this._createCursor, alpha: 0, duration: 400, yoyo: true, repeat: -1 });

    // ── Hint line ─────────────────────────────────────────────────────────
    this._hintText = this.add.text(GAME_W / 2, BOX_Y + BOX_H - 20, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#444466',
    }).setOrigin(0.5);

    // ── Selection cursor rect ─────────────────────────────────────────────
    this._cursor = this.add.rectangle(GAME_W / 2, 0, BOX_W - 20, ROW_H - 3)
      .setStrokeStyle(2, 0xffffff, 0.85).setFillStyle(0xffffff, 0.05).setVisible(false);
    this.tweens.add({ targets: this._cursor, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });

    // ── Keyboard input ────────────────────────────────────────────────────
    this.input.keyboard.on('keydown', (e) => this._onKey(e));

    // ── Gamepad ───────────────────────────────────────────────────────────
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 0) this._action('confirm');
      if (button.index === 1) this._action('back');
      if (button.index === 3) this._action('delete');
    });

    // ── Connect to server ─────────────────────────────────────────────────
    this._net = new NetworkManager();
    this._net.onCharList    = (chars) => this._onCharList(chars);
    this._net.onJoinRefused = (reason) => this._onRefused(reason);
    this._net.onChestData   = (items) => { this.registry.set('chestItems', items); };
    this._net.onConnect     = () => { this._net.sendCharListReq(); };
    this._net.onDisconnect  = () => this._showStatus('Serveur non disponible', '#ff4444');

    const params   = new URLSearchParams(window.location.search);
    const server   = params.get('server') || 'localhost';
    const port     = params.get('port')   || '9000';
    const ssl      = params.get('ssl') === 'true' || window.location.protocol === 'https:';
    const protocol = ssl ? 'wss' : 'ws';
    this._net.connectRaw(`${protocol}://${server}:${port}`);
  }

  update(time, delta) {
    this._gpCooldown -= delta;
    if (this._errorTimer > 0) {
      this._errorTimer -= delta;
      if (this._errorTimer <= 0) this._clearStatus();
    }

    // Gamepad navigation
    const gp = this.registry.get('inputMode') === 'gp';
    if (gp && this.input.gamepad.total > 0 && this._gpCooldown <= 0) {
      const pad = this.input.gamepad.getPad(0);
      if (pad) {
        const DEAD = 0.4;
        if (pad.up    || pad.leftStick.y < -DEAD) { this._moveSel(-1); this._gpCooldown = 160; }
        if (pad.down  || pad.leftStick.y >  DEAD) { this._moveSel(1);  this._gpCooldown = 160; }
      }
    }

    // Update hint
    if (this._mode === 'list') {
      this._hintText.setText('ENTER: jouer   N: nouveau   DEL: supprimer   ESC: retour');
    } else if (this._mode === 'create') {
      this._hintText.setText('ENTER: confirmer   ESC: annuler');
    } else {
      this._hintText.setText('');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Keyboard
  // ─────────────────────────────────────────────────────────────────────────

  _onKey(e) {
    this.registry.set('inputMode', 'kb');

    if (this._mode === 'list') {
      if (e.key === 'ArrowUp')   { this._moveSel(-1); return; }
      if (e.key === 'ArrowDown') { this._moveSel(1);  return; }
      if (e.key === 'Enter')     { this._action('confirm'); return; }
      if (e.key === 'n' || e.key === 'N') { this._enterCreate(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { this._action('delete'); return; }
      if (e.key === 'Escape') { this._back(); return; }
    }

    if (this._mode === 'create') {
      if (e.key === 'Escape')     { this._exitCreate(); return; }
      if (e.key === 'Enter')      { this._confirmCreate(); return; }
      if (e.key === 'Backspace')  {
        this._inputBuf = this._inputBuf.slice(0, -1);
        this._refreshCreateInput();
        return;
      }
      // Accept printable characters (max 20 chars)
      if (e.key.length === 1 && this._inputBuf.length < 20) {
        this._inputBuf += e.key;
        this._refreshCreateInput();
      }
    }
  }

  _action(act) {
    if (act === 'confirm' && this._mode === 'list') this._selectChar();
    if (act === 'back')    { this._back(); }
    if (act === 'delete'  && this._mode === 'list') this._deleteChar();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Navigation
  // ─────────────────────────────────────────────────────────────────────────

  _moveSel(dir) {
    if (this._mode !== 'list' || this._chars.length === 0) return;
    this._selIdx = Phaser.Math.Clamp(this._selIdx + dir, 0, this._chars.length - 1);
    this._updateScroll();
    this._redraw();
  }

  _updateScroll() {
    if (this._selIdx < this._scroll) this._scroll = this._selIdx;
    if (this._selIdx >= this._scroll + MAX_VIS) this._scroll = this._selIdx - MAX_VIS + 1;
    this._scroll = Phaser.Math.Clamp(this._scroll, 0, Math.max(0, this._chars.length - MAX_VIS));
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Character actions
  // ─────────────────────────────────────────────────────────────────────────

  _selectChar() {
    if (this._chars.length === 0) return;
    const char = this._chars[this._selIdx];
    if (!char) return;
    this._mode = 'waiting';
    this._showStatus('Connexion…', '#aaaacc');
    this._net.sendCharSelect(0, char.id);
  }

  _deleteChar() {
    if (this._chars.length === 0) return;
    const char = this._chars[this._selIdx];
    if (!char) return;
    this._net.sendCharDelete(char.id);
    // Server will respond with updated list via onCharList
  }

  _enterCreate() {
    this._mode      = 'create';
    this._inputBuf  = '';
    this._refreshCreateInput();
    this._createLabel.setVisible(true);
    this._createInput.setVisible(true);
    this._createCursor.setVisible(true);
    this._cursor.setVisible(false);
    this._redraw();
  }

  _exitCreate() {
    this._mode = 'list';
    this._createLabel.setVisible(false);
    this._createInput.setVisible(false);
    this._createCursor.setVisible(false);
    this._redraw();
  }

  _confirmCreate() {
    const name = this._inputBuf.trim();
    if (name.length < 2) {
      this._showStatus('Nom trop court (min 2 caractères)', '#ff6644');
      return;
    }
    this._net.sendCharSelect(1, name);
    this._exitCreate();
  }

  _refreshCreateInput() {
    this._createInput.setText(this._inputBuf);
    // Reposition cursor after the text
    this._createCursor.setX(this._createInput.x + this._createInput.width + 2);
  }

  _back() {
    this._net.disconnect();
    this.scene.start('TitleScene');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Network callbacks
  // ─────────────────────────────────────────────────────────────────────────

  _onCharList(chars) {
    this._chars = chars;
    if (this._mode === 'waiting') {
      // C_CHAR_SELECT(0) succeeded → enter game
      const char = chars.find(c => c.id === this._pendingCharId) ??
                   chars[this._selIdx] ?? chars[0];
      if (char) {
        this._enterGame(char);
        return;
      }
    }
    // Clamp selection
    this._selIdx = Phaser.Math.Clamp(this._selIdx, 0, Math.max(0, chars.length - 1));
    this._updateScroll();
    this._mode = 'list';
    this._clearStatus();
    this._redraw();
  }

  _onRefused(reason) {
    this._mode = 'list';
    this._showStatus(reason, '#ff4444');
    this._redraw();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Enter game
  // ─────────────────────────────────────────────────────────────────────────

  _enterGame(char) {
    this.registry.set('charId',   char.id);
    this.registry.set('charName', char.name);
    // Disconnect raw connection — GameScene will open its own
    this._net.disconnect();
    // Start in planque
    this.scene.start('GameScene', { levelId: 'level_03' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Status helpers
  // ─────────────────────────────────────────────────────────────────────────

  _showStatus(msg, color = '#777799') {
    this._statusText.setText(msg).setColor(color);
    this._errorTimer = 3000;
  }

  _clearStatus() {
    this._statusText.setText('').setColor('#777799');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Redraw list
  // ─────────────────────────────────────────────────────────────────────────

  _redraw() {
    for (const obj of this._rowObjs) obj.destroy();
    this._rowObjs = [];

    if (this._chars.length === 0 && this._mode !== 'create') {
      const empty = this.add.text(GAME_W / 2, LIST_START + ROW_H, 'Aucun personnage — appuyez N pour créer', {
        fontFamily: 'monospace', fontSize: '11px', color: '#444466',
      }).setOrigin(0.5);
      this._rowObjs.push(empty);
      this._cursor.setVisible(false);
      return;
    }

    const visible = this._chars.slice(this._scroll, this._scroll + MAX_VIS);
    visible.forEach((char, vi) => {
      const ry   = LIST_START + vi * ROW_H;
      const absI = vi + this._scroll;
      const isSelected = absI === this._selIdx && this._mode === 'list';

      const bg = this.add.rectangle(GAME_W / 2, ry, BOX_W - 20, ROW_H - 3,
        isSelected ? 0x223355 : 0x1a1a2a, isSelected ? 0.9 : 0.5,
      ).setStrokeStyle(1, 0x334466, 0.4);

      const name = this.add.text(BOX_X + 20, ry, char.name, {
        fontFamily: 'monospace', fontSize: '13px',
        color: isSelected ? '#ffffff' : '#aaaacc',
      }).setOrigin(0, 0.5);

      this._rowObjs.push(bg, name);
    });

    // Scroll indicators
    if (this._scroll > 0) {
      const up = this.add.text(BOX_X + BOX_W - 10, LIST_START, '▲', {
        fontFamily: 'monospace', fontSize: '10px', color: '#556688',
      }).setOrigin(1, 0.5);
      this._rowObjs.push(up);
    }
    if (this._scroll + MAX_VIS < this._chars.length) {
      const dn = this.add.text(BOX_X + BOX_W - 10, LIST_START + (MAX_VIS - 1) * ROW_H, '▼', {
        fontFamily: 'monospace', fontSize: '10px', color: '#556688',
      }).setOrigin(1, 0.5);
      this._rowObjs.push(dn);
    }

    // Position cursor
    if (this._mode === 'list' && this._chars.length > 0) {
      const visIdx = this._selIdx - this._scroll;
      this._cursor.setY(LIST_START + visIdx * ROW_H).setVisible(true);
    } else {
      this._cursor.setVisible(false);
    }
  }
}
