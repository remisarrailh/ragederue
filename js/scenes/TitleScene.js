import { GAME_W, GAME_H } from '../config/constants.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    // ── Background ────────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor('#0a0a14');

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GAME_H * 0.32, 'RAGEDERUE ONLINE', {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // ── "Press Start" label ───────────────────────────────────────────────
    const prompt = this.add.text(GAME_W / 2, GAME_H * 0.55, 'PRESS ANY KEY / BUTTON', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Blink
    this.tweens.add({
      targets: prompt,
      alpha: 0,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // ── Controls hint ─────────────────────────────────────────────────────
    const controls = [
      'WASD / Arrows ── Move',
      'X ── Punch    C ── Kick    V ── Jab',
      'SPACE ── Jump',
      'ESC / Start ── Pause',
    ];
    this.add.text(GAME_W / 2, GAME_H * 0.75, controls.join('\n'), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#888888',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // ── Input: any key or gamepad button ──────────────────────────────────
    this._started = false;

    this.input.keyboard.on('keydown', () => this._go());
    this.input.on('pointerdown', () => this._go());
    this.input.gamepad.on('down', () => this._go());
  }

  _go() {
    if (this._started) return;
    this._started = true;
    this.scene.start('GameScene');
  }
}
