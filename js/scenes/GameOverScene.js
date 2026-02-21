export default class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data) {
    this.wallet = data.wallet  ?? 0;
    this.reason = data.reason  ?? 'TIME UP';
  }

  create() {
    const { width: W, height: H } = this.scale;
    const cx = W / 2, cy = H / 2;

    this.add.rectangle(cx, cy, W, H, 0x000000, 0.82);

    this.add.text(cx, cy - 90, 'GAME OVER', {
      fontFamily: 'monospace', fontSize: '52px', color: '#ff2222',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 30, this.reason, {
      fontFamily: 'monospace', fontSize: '20px', color: '#888888',
    }).setOrigin(0.5);

    this.add.text(cx, cy + 20, `ETH COLLECTED : ${this.wallet}`, {
      fontFamily: 'monospace', fontSize: '24px', color: '#00ffcc',
    }).setOrigin(0.5);

    const hint = this.add.text(cx, cy + 90, 'PRESS SPACE  or  A  TO RETRY', {
      fontFamily: 'monospace', fontSize: '16px', color: '#666666',
    }).setOrigin(0.5);

    // Blink hint
    this.tweens.add({ targets: hint, alpha: 0, duration: 600, yoyo: true, repeat: -1 });

    // Input
    this.input.keyboard.once('keydown-SPACE', () => this._restart());
    if (this.input.gamepad.total > 0) {
      this.input.gamepad.once('down', () => this._restart());
    } else {
      this.input.gamepad.on('connected', () => {
        this.input.gamepad.once('down', () => this._restart());
      });
    }
  }

  _restart() { this.scene.start('GameScene'); }
}
