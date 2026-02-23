import { GAME_W } from '../config/constants.js';

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

    // ── Stamina bar ──────────────────────────────────────────────────────
    this.add.rectangle(PAD + 22, PAD + 22, BAR_W, BAR_H, 0x332200)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(500);
    this._stFill = this.add.rectangle(PAD + 22, PAD + 22, BAR_W, BAR_H, 0xffee00)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);
    this._stText = this.add.text(PAD + 22 + BAR_W + 8, PAD + 22, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffee88',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);

    // ── Hunger bar ───────────────────────────────────────────────────────
    this.add.rectangle(PAD + 22, PAD + 40, BAR_W, BAR_H, 0x331100)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(500);
    this._hgFill = this.add.rectangle(PAD + 22, PAD + 40, BAR_W, BAR_H, 0xff8833)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);
    this._hgText = this.add.text(PAD + 22 + BAR_W + 8, PAD + 40, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffbb88',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);

    // ── Thirst bar ───────────────────────────────────────────────────────
    this.add.rectangle(PAD + 22, PAD + 58, BAR_W, BAR_H, 0x001133)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(500);
    this._thFill = this.add.rectangle(PAD + 22, PAD + 58, BAR_W, BAR_H, 0x00ccff)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);
    this._thText = this.add.text(PAD + 22 + BAR_W + 8, PAD + 58, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#88eeff',
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(501);

    this._updateHP();
  }

  update() {
    if (!this.player) return;

    this._updateHP();
    this._updateStamina();
    this._updateHunger();
    this._updateThirst();

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
      const gp = this.registry.get('inputMode') === 'gp';
      this._invText.setText(`Bag: ${used} items  [${gp ? 'Select' : 'TAB'}]`);
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

  _updateStamina() {
    const ratio = Phaser.Math.Clamp(this.player.stamina / this.player.maxStamina, 0, 1);
    this._stFill.setSize(Math.max(0, Math.round(BAR_W * ratio)), BAR_H);
    // jaune → orange quand la stamina descend
    const r = Math.round(Phaser.Math.Linear(0xff, 0xff, 1 - ratio));
    const g = Math.round(Phaser.Math.Linear(0xee, 0x44, 1 - ratio));
    this._stFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, 0x00));
    this._stText.setText(`${Math.round(this.player.stamina)}/${this.player.maxStamina}`);
  }

  _updateHunger() {
    const ratio = Phaser.Math.Clamp(this.player.hunger / this.player.maxHunger, 0, 1);
    this._hgFill.setSize(Math.max(0, Math.round(BAR_W * ratio)), BAR_H);
    // orange → rouge quand la faim monte
    const r = Math.round(Phaser.Math.Linear(0xff, 0xff, 1 - ratio));
    const g = Math.round(Phaser.Math.Linear(0x88, 0x11, 1 - ratio));
    this._hgFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, 0x00));
    this._hgText.setText(`${Math.round(this.player.hunger)}/${this.player.maxHunger}`);
  }

  _updateThirst() {
    const ratio = Phaser.Math.Clamp(this.player.thirst / this.player.maxThirst, 0, 1);
    this._thFill.setSize(Math.max(0, Math.round(BAR_W * ratio)), BAR_H);
    // cyan → bleu foncé quand la soif monte
    const r = 0x00;
    const g = Math.round(Phaser.Math.Linear(0x44, 0xcc, ratio));
    const b = Math.round(Phaser.Math.Linear(0x88, 0xff, ratio));
    this._thFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
    this._thText.setText(`${Math.round(this.player.thirst)}/${this.player.maxThirst}`);
  }
}
