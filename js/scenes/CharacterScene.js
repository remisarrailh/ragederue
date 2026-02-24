import { GAME_W, GAME_H, SPAWN_LEVEL } from '../config/constants.js';
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
 *   UP / DOWN / scroll / click/tap  — navigate list
 *   ENTER / A / button JOUER        — play with selected character
 *   N / button NOUVEAU              — new character (enter create state)
 *   DEL / Y / button SUPPR.         — delete selected character
 *   ESC / B / button RETOUR         — back to TitleScene
 *
 * Controls (create state):
 *   Type letters  — build name
 *   ENTER         — confirm creation
 *   BACKSPACE     — delete last char
 *   ESC           — cancel
 */

const BOX_W = 420;
const BOX_H = 300;
const BOX_X = (GAME_W - BOX_W) / 2;
const BOX_Y = (GAME_H - BOX_H) / 2 - 40;

const ROW_H      = 30;
const LIST_START = BOX_Y + 72;
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
    this._pendingChar = null;

    // ── Background box ────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, BOX_Y + BOX_H / 2, BOX_W + 8, BOX_H + 8, 0x111122, 0.97)
      .setStrokeStyle(2, 0x5555aa, 0.8);

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, BOX_Y + 18, 'SÉLECTION PERSONNAGE', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ff6600',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    // ── Status / error line ───────────────────────────────────────────────
    this._statusText = this.add.text(GAME_W / 2, BOX_Y + 44, 'Connexion au serveur…', {
      fontFamily: 'monospace', fontSize: '11px', color: '#777799',
    }).setOrigin(0.5);

    // ── Create-mode input row ─────────────────────────────────────────────
    this._createLabel = this.add.text(BOX_X + 14, BOX_Y + BOX_H - 22, 'Nom : ', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffcc00',
    }).setOrigin(0, 0.5).setVisible(false);

    this._createInput = this.add.text(BOX_X + 80, BOX_Y + BOX_H - 22, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0, 0.5).setVisible(false);

    // Blinking cursor
    this._createCursor = this.add.text(BOX_X + 80, BOX_Y + BOX_H - 22, '|', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffcc00',
    }).setOrigin(0, 0.5).setVisible(false);
    this.tweens.add({ targets: this._createCursor, alpha: 0, duration: 400, yoyo: true, repeat: -1 });

    // ── Selection cursor rect ─────────────────────────────────────────────
    this._cursor = this.add.rectangle(GAME_W / 2, 0, BOX_W - 20, ROW_H - 3)
      .setStrokeStyle(2, 0xffffff, 0.85).setFillStyle(0xffffff, 0.05).setVisible(false);
    this.tweens.add({ targets: this._cursor, alpha: 0.5, duration: 400, yoyo: true, repeat: -1 });

    // ── Action buttons (always visible) ──────────────────────────────────
    const BY   = BOX_Y + BOX_H + 28;
    const bw   = 90, bh = 38, gap = 10;
    const totalW = 4 * bw + 3 * gap;
    const bx0  = (GAME_W - totalW) / 2 + bw / 2;

    this._btnPlay   = this._makeBtn(bx0,              BY, bw, bh, 'JOUER',   0x226622, () => this._action('confirm'));
    this._btnNew    = this._makeBtn(bx0 + bw + gap,   BY, bw, bh, 'NOUVEAU', 0x224488, () => this._enterCreate());
    this._btnDel    = this._makeBtn(bx0 + 2*(bw+gap), BY, bw, bh, 'SUPPR.',  0x882222, () => this._action('delete'));
    this._btnBack   = this._makeBtn(bx0 + 3*(bw+gap), BY, bw, bh, 'RETOUR',  0x444444, () => this._back());

    // Create-mode buttons (hidden until create mode)
    const cx = GAME_W / 2;
    this._btnConfirm = this._makeBtn(cx - 75, BY, 130, bh, 'CONFIRMER', 0x226622, () => this._confirmCreate());
    this._btnCancel  = this._makeBtn(cx + 75, BY, 110, bh, 'ANNULER',   0x444444, () => this._exitCreate());
    this._btnConfirm.setVisible(false);
    this._btnCancel.setVisible(false);

    // ── Keyboard input ────────────────────────────────────────────────────
    this.input.keyboard.on('keydown', (e) => this._onKey(e));

    // ── Gamepad ───────────────────────────────────────────────────────────
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 0) this._action('confirm');
      if (button.index === 1) this._action('back');
      if (button.index === 3) this._action('delete');
    });

    // ── Swipe zone on list ────────────────────────────────────────────────
    this._swipeStartY = null;
    const swipeZone = this.add.zone(GAME_W / 2, BOX_Y + BOX_H / 2, BOX_W, BOX_H)
      .setInteractive();
    swipeZone.on('pointerdown', (ptr) => { this._swipeStartY = ptr.y; });
    swipeZone.on('pointerup', (ptr) => {
      if (this._swipeStartY === null) return;
      const dy = ptr.y - this._swipeStartY;
      if (Math.abs(dy) > 20) this._moveSel(dy < 0 ? -1 : 1);
      this._swipeStartY = null;
    });

    // ── Connect to server ─────────────────────────────────────────────────
    this._net = new NetworkManager();
    this._net.onCharList    = (chars) => this._onCharList(chars);
    this._net.onJoinRefused = (reason) => this._onRefused(reason);
    this._net.onChestData   = (items) => {
      this.registry.set('chestItems', items);
      // S_CHEST_DATA is the server's confirmation that char selection succeeded
      if (this._mode === 'waiting' && this._pendingChar) {
        this._enterGame(this._pendingChar);
      }
    };
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
    if (this.input.gamepad.total > 0 && this._gpCooldown <= 0) {
      const pad = this.input.gamepad.getPad(0);
      if (pad) {
        const DEAD = 0.4;
        if (pad.up    || pad.leftStick.y < -DEAD) { this._moveSel(-1); this._gpCooldown = 160; }
        if (pad.down  || pad.leftStick.y >  DEAD) { this._moveSel(1);  this._gpCooldown = 160; }
      }
    }

    // Hint text
    if (this._mode === 'list') {
      this._statusText.setText('ENTER: jouer   N: nouveau   DEL: supprimer   ESC: retour').setColor('#444466');
    } else if (this._mode === 'create') {
      this._statusText.setText('ENTER: confirmer   ESC: annuler').setColor('#444466');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Button factory
  // ─────────────────────────────────────────────────────────────────────────

  _makeBtn(x, y, w, h, label, color, cb) {
    const bg = this.add.rectangle(x, y, w, h, color, 0.85)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0xffffff, 0.3);
    this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    bg.on('pointerdown', () => { bg.setFillStyle(color, 1); cb(); });
    bg.on('pointerup',   () => bg.setFillStyle(color, 0.85));
    bg.on('pointerout',  () => bg.setFillStyle(color, 0.85));
    return bg;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Keyboard
  // ─────────────────────────────────────────────────────────────────────────

  _onKey(e) {
    if (this._mode === 'list') {
      if (e.key === 'ArrowUp')   { this._moveSel(-1); return; }
      if (e.key === 'ArrowDown') { this._moveSel(1);  return; }
      if (e.key === 'Enter')     { this._action('confirm'); return; }
      if (e.key === 'n' || e.key === 'N') { this._enterCreate(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { this._action('delete'); return; }
      if (e.key === 'Escape') { this._back(); return; }
    }

    if (this._mode === 'create') {
      if (e.key === 'Escape')    { this._exitCreate(); return; }
      if (e.key === 'Enter')     { this._confirmCreate(); return; }
      if (e.key === 'Backspace') {
        this._inputBuf = this._inputBuf.slice(0, -1);
        this._refreshCreateInput();
        return;
      }
      if (e.key.length === 1 && this._inputBuf.length < 20) {
        this._inputBuf += e.key;
        this._refreshCreateInput();
      }
    }
  }

  _action(act) {
    if (act === 'confirm' && this._mode === 'list') this._selectChar();
    if (act === 'back')                              this._back();
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
    if (char.inGame) {
      this._showStatus('Personnage déjà en jeu', '#ff6644');
      return;
    }
    this._mode = 'waiting';
    this._pendingChar = char;  // store the full char object
    this._showStatus('Connexion…', '#aaaacc');
    this._net.sendCharSelect(0, char.id);
  }

  _deleteChar() {
    if (this._chars.length === 0) return;
    const char = this._chars[this._selIdx];
    if (!char) return;
    this._net.sendCharDelete(char.id);
  }

  _enterCreate() {
    this._mode     = 'create';
    this._inputBuf = '';
    this._refreshCreateInput();
    this._createLabel.setVisible(true);
    this._createInput.setVisible(true);
    this._createCursor.setVisible(true);
    this._cursor.setVisible(false);

    // Swap button sets
    this._btnPlay.setVisible(false);
    this._btnNew.setVisible(false);
    this._btnDel.setVisible(false);
    this._btnBack.setVisible(false);
    this._btnConfirm.setVisible(true);
    this._btnCancel.setVisible(true);

    // Open virtual keyboard (mobile) via a hidden input
    this._fakeInput = document.createElement('input');
    this._fakeInput.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px;';
    document.body.appendChild(this._fakeInput);
    this._fakeInput.focus();
    this._fakeInput.addEventListener('input', () => {
      this._inputBuf = this._fakeInput.value.slice(0, 20);
      this._refreshCreateInput();
    });

    this._redraw();
  }

  _exitCreate() {
    this._mode = 'list';
    this._createLabel.setVisible(false);
    this._createInput.setVisible(false);
    this._createCursor.setVisible(false);

    // Restore button sets
    this._btnPlay.setVisible(true);
    this._btnNew.setVisible(true);
    this._btnDel.setVisible(true);
    this._btnBack.setVisible(true);
    this._btnConfirm.setVisible(false);
    this._btnCancel.setVisible(false);

    if (this._fakeInput) { this._fakeInput.remove(); this._fakeInput = null; }
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
    // Don't interrupt a pending selection — onChestData handles the transition
    if (this._mode === 'waiting') return;
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
    this._net.disconnect();
    this.scene.start('GameScene', { levelId: SPAWN_LEVEL });
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
      const empty = this.add.text(GAME_W / 2, LIST_START + ROW_H, 'Aucun personnage — appuyez NOUVEAU pour créer', {
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

      const bgColor = char.inGame ? 0x221111 : (isSelected ? 0x223355 : 0x1a1a2a);
      const bgAlpha = char.inGame ? 0.7      : (isSelected ? 0.9 : 0.5);
      const bg = this.add.rectangle(GAME_W / 2, ry, BOX_W - 20, ROW_H - 3,
        bgColor, bgAlpha,
      ).setStrokeStyle(1, char.inGame ? 0x663333 : 0x334466, 0.4).setInteractive({ useHandCursor: true });

      const nameColor = char.inGame ? '#886666' : (isSelected ? '#ffffff' : '#aaaacc');
      const name = this.add.text(BOX_X + 20, ry, char.name, {
        fontFamily: 'monospace', fontSize: '13px', color: nameColor,
      }).setOrigin(0, 0.5);

      if (char.inGame) {
        const tag = this.add.text(BOX_X + BOX_W - 30, ry, 'EN JEU', {
          fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
          stroke: '#000', strokeThickness: 2,
        }).setOrigin(1, 0.5);
        this._rowObjs.push(tag);
      }

      // Click / tap on a row: first press = select, second = play
      bg.on('pointerdown', () => {
        if (this._selIdx === absI && this._mode === 'list') {
          this._selectChar();
        } else {
          this._selIdx = absI;
          this._updateScroll();
          this._redraw();
        }
      });

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

    // Position selection cursor
    if (this._mode === 'list' && this._chars.length > 0) {
      const visIdx = this._selIdx - this._scroll;
      this._cursor.setY(LIST_START + visIdx * ROW_H).setVisible(true);
    } else {
      this._cursor.setVisible(false);
    }
  }
}
