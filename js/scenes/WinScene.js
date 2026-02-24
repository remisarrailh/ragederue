export default class WinScene extends Phaser.Scene {
  constructor() { super({ key: 'WinScene' }); }

  init(data) {
    this.wallet    = data.wallet   ?? 0;
    this.timeLeft  = data.timeLeft ?? 0;
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;

    this.add.rectangle(cx, cy, W, H, 0x000000, 0.82);

    this.add.text(cx, cy - 110, 'EXTRACTION', {
      fontFamily: 'monospace', fontSize: '50px', color: '#00ff88',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 55, 'SUCCESSFUL', {
      fontFamily: 'monospace', fontSize: '50px', color: '#00ff88',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    const timeBonus = Math.floor(this.timeLeft) * 10;
    const total     = this.wallet + timeBonus;

    this.add.text(cx, cy + 10, `ETH COLLECTED : ${this.wallet}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#00ffcc',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 45, `TIME BONUS    : +${timeBonus}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffff44',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 80, `TOTAL SCORE   : ${total}`, {
      fontFamily: 'monospace', fontSize: '26px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    const hint = this.add.text(cx, cy + 140, 'TAP / SPACE / A  TO PLAY AGAIN', {
      fontFamily: 'monospace', fontSize: '15px', color: '#666666',
    }).setOrigin(0.5);

    this.tweens.add({ targets: hint, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

    const restart = () => this.scene.start('GameScene');
    this.input.keyboard.once('keydown-SPACE', restart);
    if (this.input.gamepad.total > 0) {
      this.input.gamepad.once('down', restart);
    } else {
      this.input.gamepad.on('connected', () => {
        this.input.gamepad.once('down', restart);
      });
    }
    // Delay touch so the player doesn't accidentally tap through
    this.time.delayedCall(800, () => {
      this.input.once('pointerdown', restart);
    });
  }
}
