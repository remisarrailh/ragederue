import { GAME_W, GAME_H, IS_MOBILE } from '../config/constants.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    // ── Background ────────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor('#0a0a14');

    // ── Pad index from localStorage → registry ────────────────────────────
    if (this.registry.get('padIndex') === undefined) {
      const saved = parseInt(localStorage.getItem('RAGEDERUE_padIndex') ?? '0', 10);
      this.registry.set('padIndex', saved);
    }

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GAME_H * 0.22, 'RAGEDERUE ONLINE', {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // ── Music (naval) ─────────────────────────────────────────────────────
    this.sound.stopByKey('music_naval');
    this.sound.stopByKey('music_street');
    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');
    this.bgMusic = this.sound.add('music_naval', { loop: true, volume: savedVol });
    this.bgMusic.play();

    // ── SFX volume from localStorage → registry ──────────────────────────
    const sfxVol = parseFloat(localStorage.getItem('RAGEDERUE_sfx_vol') ?? '0.5');
    this.registry.set('sfxVol', sfxVol);

    // ── Input state ───────────────────────────────────────────────────────
    this._started = false;

    this._buildUI();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Unified UI (buttons for everyone: mouse, touch, keyboard, gamepad)
  // ─────────────────────────────────────────────────────────────────────────

  _buildUI() {
    // Button definitions
    const btnDefs = [
      { label: 'JOUER',              color: 0xff6600, cb: () => this._go() },
      { label: 'RÉGLAGES',           color: 0x334466, cb: () => this._openSettings() },
      { label: 'ÉDITEUR DE NIVEAUX', color: 0x224422, cb: () => this._openEditor() },
    ];

    const BTN_W = 260, BTN_H = 52, GAP = 16;
    const totalH = btnDefs.length * BTN_H + (btnDefs.length - 1) * GAP;
    const startY = GAME_H * 0.50 - totalH / 2 + BTN_H / 2;

    this._mBtns = [];
    this._mSel  = 0;

    btnDefs.forEach((def, i) => {
      const y = startY + i * (BTN_H + GAP);
      const bg = this.add.rectangle(GAME_W / 2, y, BTN_W, BTN_H, def.color, 0.85)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(3, 0xffffff, 0.5);
      const lbl = this.add.text(GAME_W / 2, y, def.label, {
        fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);

      bg.on('pointerdown', () => { this._mSel = i; this._updateSel(); def.cb(); });
      bg.on('pointerover', () => { this._mSel = i; this._updateSel(); });

      this._mBtns.push({ bg, lbl, def, y });
    });

    this._updateSel();

    // ── Fullscreen button (mobile) ─────────────────────────────────────────
    if (IS_MOBILE) {
      const fsBg = this.add.rectangle(GAME_W / 2, GAME_H * 0.82, 220, 40, 0x335577, 0.85)
        .setStrokeStyle(2, 0x88aacc, 0.6).setInteractive({ useHandCursor: true });
      const fsLbl = this.add.text(GAME_W / 2, GAME_H * 0.82, '⛶  PLEIN ÉCRAN', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffffff',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
      fsBg.on('pointerdown', () => {
        this.scale.startFullscreen();
      });
    }

    // ── Keyboard shortcuts hint ───────────────────────────────────────────
    if (!IS_MOBILE) {
      this.add.text(GAME_W / 2, GAME_H * 0.84, [
        'ENTER ── Jouer     ESC ── Réglages     L ── Éditeur',
      ].join('\n'), {
        fontFamily: 'monospace', fontSize: '11px', color: '#444466',
        align: 'center',
      }).setOrigin(0.5);
    }

    // ── Keyboard input ────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ENTER',  () => this._confirmSel());
    this.input.keyboard.on('keydown-ESC',    () => this._openSettings());
    this.input.keyboard.on('keydown-L',      () => this._openEditor());
    this.input.keyboard.on('keydown-UP',     () => { this._mSel = Math.max(0, this._mSel - 1); this._updateSel(); });
    this.input.keyboard.on('keydown-DOWN',   () => { this._mSel = Math.min(this._mBtns.length - 1, this._mSel + 1); this._updateSel(); });

    // ── Gamepad ───────────────────────────────────────────────────────────
    this._gpCooldown = 0;
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 0 || button.index === 9) this._confirmSel();
      if (button.index === 1 || button.index === 8) this._openSettings();
    });
  }

  _updateSel() {
    this._mBtns.forEach((b, i) => {
      const active = i === this._mSel;
      b.bg.setStrokeStyle(active ? 4 : 2, active ? 0xffffff : 0x555577, active ? 1 : 0.4);
      b.bg.setAlpha(active ? 1 : 0.75);
      b.lbl.setAlpha(active ? 1 : 0.7);
    });
  }

  _confirmSel() {
    this._mBtns[this._mSel]?.def.cb();
  }

  update(time, delta) {
    if (!this._mBtns) return;
    this._gpCooldown -= delta;
    if (this._gpCooldown > 0) return;
    const gp = this.input.gamepad.total > 0 ? this.input.gamepad.getPad(0) : null;
    if (!gp) return;
    const DEAD = 0.4;
    if (gp.leftStick.y < -DEAD || gp.up) {
      this._mSel = Math.max(0, this._mSel - 1);
      this._updateSel();
      this._gpCooldown = 200;
    } else if (gp.leftStick.y > DEAD || gp.down) {
      this._mSel = Math.min(this._mBtns.length - 1, this._mSel + 1);
      this._updateSel();
      this._gpCooldown = 200;
    }
    if (gp.buttons[0]?.pressed) {
      this._confirmSel();
      this._gpCooldown = 300;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Actions
  // ─────────────────────────────────────────────────────────────────────────

  _go() {
    if (this._started) return;
    this._started = true;
    if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
    this.scene.start('CharacterScene');
  }

  _openSettings() {
    if (this._started) return;
    if (this.scene.isActive('PauseScene')) {
      this.scene.stop('PauseScene');
      return;
    }
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.scene.launch('PauseScene', { fromScene: 'TitleScene' });
  }

  _openEditor() {
    if (this._started) return;
    this._started = true;
    if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
    this.scene.start('LevelEditorScene');
  }
}
