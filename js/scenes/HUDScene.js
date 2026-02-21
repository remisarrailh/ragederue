import { GAME_W, PLAYER_MAX_HP } from '../config/constants.js';

const PAD = 14;
const BAR_W = 160;
const BAR_H = 14;

export default class HUDScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HUDScene' });
  }

  init(data) {
    this.player    = data.player;
    this.inventory = data.inventory;
  }

  create() {
    // ── P1 label ──────────────────────────────────────────────────────────
    this.add.text(PAD, PAD, 'P1', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff8800',
    }).setScrollFactor(0).setDepth(500);

    // ── HP bar ─────────────────────────────────────────────────────────────
    this.add.rectangle(PAD + 22, PAD + 4, BAR_W, BAR_H, 0x330000)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(500);

    this._hpFill = this.add.rectangle(PAD + 22, PAD + 4, BAR_W, BAR_H, 0xff4400)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);

    this._hpText = this.add.text(PAD + 22 + BAR_W + 8, PAD + 4, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffaa55',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);

    // ── Timer (top centre) ────────────────────────────────────────────────
    this._timerText = this.add.text(GAME_W / 2, PAD + 4, '2:00', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(501);

    // ── ETH counter (top right) ───────────────────────────────────────────
    this._ethIcon = this.add.text(GAME_W - PAD, PAD + 4, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#00ffcc',
      stroke: '#003322', strokeThickness: 2,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(501);

    // ── Inventory indicator (below ETH) ─────────────────────────────────
    this._invText = this.add.text(GAME_W - PAD, PAD + 22, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#8888aa',
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(501);

    this._updateHP();
  }

  update() {
    if (!this.player) return;

    this._updateHP();

    const gs = this.scene.get('GameScene');
    if (!gs || gs._gameEnded) return;

    // Timer
    const t   = Math.max(0, gs.runTimer);
    const mm  = Math.floor(t / 60);
    const ss  = Math.floor(t % 60).toString().padStart(2, '0');
    this._timerText.setText(`${mm}:${ss}`);
    // Flash red under 30 s
    this._timerText.setColor(t < 30 ? (Math.floor(t * 4) % 2 === 0 ? '#ff2222' : '#ffaa00') : '#ffffff');

    // ETH wallet — read from inventory total value
    const eth = this.inventory ? this.inventory.totalValue : (this.player.wallet ?? 0);
    this._ethIcon.setText(`◆ ${eth} ETH`);

    // Inventory slots
    if (this.inventory) {
      const used = this.inventory.items.length;
      const max  = this.inventory.cols * this.inventory.rows;
      this._invText.setText(`Bag: ${used} items  [TAB]`);
    }
  }

  _updateHP() {
    const ratio = Phaser.Math.Clamp(this.player.hp / this.player.maxHp, 0, 1);
    const fillW = Math.max(0, Math.round(BAR_W * ratio));
    this._hpFill.setSize(fillW, BAR_H);
    const r = Math.round(Phaser.Math.Linear(0x00, 0xff, 1 - ratio));
    const g = Math.round(Phaser.Math.Linear(0xff, 0x00, 1 - ratio));
    this._hpFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, 0x22));
    this._hpText.setText(`${this.player.hp}/${this.player.maxHp}`);
  }
}
