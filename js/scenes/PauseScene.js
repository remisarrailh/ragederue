import { GAME_W, GAME_H } from '../config/constants.js';

const SLIDER_W = 200;
const SLIDER_H = 6;

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PauseScene' });
  }

  create() {
    // ── Semi-transparent overlay ──────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.7)
      .setOrigin(0.5);

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GAME_H * 0.12, 'PAUSE', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // ── Controls recap ────────────────────────────────────────────────────
    const lines = [
      '── KEYBOARD ──',
      '',
      'WASD / Arrows      Move',
      'Z                  Punch',
      'X                  Kick',
      'C                  Jab',
      'SPACE              Jump',
      'E                  Search',
      'TAB                Inventory',
      'ESC                Resume',
      '',
      '── GAMEPAD ──',
      '',
      'Left Stick / D-Pad Move',
      'Square  (X)        Punch',
      'Circle  (B)        Kick',
      'Triangle(Y)        Search',
      'Cross   (A)        Jump',
      'Select             Inventory',
      'Start              Resume',
    ];

    this.add.text(GAME_W / 2, GAME_H * 0.44, lines.join('\n'), {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#cccccc',
      align: 'left',
      lineSpacing: 4,
    }).setOrigin(0.5);

    // ── Volume slider ─────────────────────────────────────────────────────
    this._buildVolumeSlider();

    // ── Resume hint ───────────────────────────────────────────────────────
    const hint = this.add.text(GAME_W / 2, GAME_H * 0.93, 'Press ESC / Start to resume', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: hint,
      alpha: 0.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // ── Input: resume ─────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ESC', () => this._resume());
    this.input.gamepad.on('down', (pad, button) => {
      // Button 9 = Start on standard gamepad mapping
      if (button.index === 9) this._resume();
    });
  }

  // ── Volume slider ────────────────────────────────────────────────────────
  _buildVolumeSlider() {
    const cx = GAME_W / 2;
    const sy = GAME_H * 0.80;
    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');

    // Label
    this.add.text(cx, sy - 22, 'MUSIC VOLUME', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff8800',
    }).setOrigin(0.5);

    // Track background
    const trackX = cx - SLIDER_W / 2;
    this.add.rectangle(cx, sy, SLIDER_W, SLIDER_H, 0x333333).setOrigin(0.5);

    // Fill bar
    const fill = this.add.rectangle(
      trackX, sy, SLIDER_W * savedVol, SLIDER_H, 0xff6600
    ).setOrigin(0, 0.5);

    // Knob
    const knob = this.add.circle(
      trackX + SLIDER_W * savedVol, sy, 10, 0xffffff
    ).setInteractive({ draggable: true, useHandCursor: true });

    // Percentage text
    const pctText = this.add.text(cx + SLIDER_W / 2 + 28, sy, `${Math.round(savedVol * 100)}%`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#cccccc',
    }).setOrigin(0.5);

    const applyVol = (vol) => {
      fill.width = SLIDER_W * vol;
      knob.x = trackX + SLIDER_W * vol;
      pctText.setText(`${Math.round(vol * 100)}%`);
      localStorage.setItem('RAGEDERUE_music_vol', vol.toFixed(2));
      const gameScene = this.scene.get('GameScene');
      if (gameScene && gameScene.bgMusic) {
        gameScene.bgMusic.setVolume(vol);
      }
    };

    // Store for gamepad update loop
    this._volState = { vol: savedVol, applyVol, trackX };

    // Drag handler
    this.input.on('drag', (pointer, gameObject, dragX) => {
      if (gameObject !== knob) return;
      const clamped = Phaser.Math.Clamp(dragX, trackX, trackX + SLIDER_W);
      knob.x = clamped;
      const v = (clamped - trackX) / SLIDER_W;
      this._volState.vol = v;
      applyVol(v);
    });

    // Click on track to jump knob
    const hitZone = this.add.rectangle(cx, sy, SLIDER_W + 20, 30, 0x000000, 0)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    hitZone.on('pointerdown', (pointer) => {
      const clamped = Phaser.Math.Clamp(pointer.x, trackX, trackX + SLIDER_W);
      knob.x = clamped;
      const v = (clamped - trackX) / SLIDER_W;
      this._volState.vol = v;
      applyVol(v);
    });

    // Hint for gamepad
    this.add.text(cx, sy + 20, '◄ D-Pad / Stick ►', {
      fontFamily: 'monospace', fontSize: '10px', color: '#666666',
    }).setOrigin(0.5);
  }

  // ── Gamepad volume control (runs every frame) ───────────────────────────
  update() {
    if (!this._volState) return;
    const gp = this.input.gamepad;
    if (!gp || gp.total === 0) return;
    const pad = gp.getPad(0);
    if (!pad) return;

    const DEAD = 0.2;
    const SPEED = 0.8;  // full range per second at full tilt
    let dir = 0;

    // D-pad
    if (pad.left)  dir = -1;
    if (pad.right) dir =  1;

    // Left stick
    if (Math.abs(pad.leftStick.x) > DEAD) {
      dir = pad.leftStick.x;
    }

    if (dir !== 0) {
      const dt = this.game.loop.delta / 1000;
      const { vol, applyVol } = this._volState;
      const newVol = Phaser.Math.Clamp(vol + dir * SPEED * dt, 0, 1);
      this._volState.vol = newVol;
      applyVol(newVol);
    }
  }

  _resume() {
    // Resume music
    const gameScene = this.scene.get('GameScene');
    if (gameScene && gameScene.bgMusic) {
      gameScene.bgMusic.resume();
    }
    this.scene.resume('GameScene');
    this.scene.resume('HUDScene');
    this.scene.stop();
  }
}
