import Player       from '../entities/Player.js';
import Enemy        from '../entities/Enemy.js';
import CombatSystem from '../systems/CombatSystem.js';
import LootSystem   from '../systems/LootSystem.js';
import {
  GAME_W, GAME_H, WORLD_W,
  LANE_TOP, LANE_BOTTOM,
  DEBUG_DEPTH
} from '../config/constants.js';
import { RUN_TIMER, EXTRACT_X } from '../config/lootTable.js';

const SKY_H      = 290;
const GROUND_Y   = 290;
const FORE_DEPTH = LANE_BOTTOM + 50;
const EXTRACT_W  = 120;

// Enemy spawn definitions  { x, y, cfg }
const ENEMY_SPAWNS = [
  { x: 500,  y: 420, cfg: {} },
  { x: 900,  y: 385, cfg: {} },
  { x: 1350, y: 445, cfg: { hp: 80, speed: 80 } },
];

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this._gameEnded = false;
    this.runTimer   = RUN_TIMER;

    // ── World bounds ───────────────────────────────────────────────────────
    this.physics.world.setBounds(0, 0, WORLD_W, GAME_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, GAME_H);

    // ── Background layers ──────────────────────────────────────────────────
    this.bgLayer = this.add
      .tileSprite(0, 0, GAME_W, SKY_H, 'back')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(0);

    this.midLayer = this.add
      .tileSprite(0, SKY_H - 60, GAME_W, 200, 'tileset')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(5);

    // ── Ground plane ───────────────────────────────────────────────────────
    const gfx = this.add.graphics();
    gfx.fillStyle(0x2a2a3a);
    gfx.fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
    gfx.fillStyle(0x333345);
    gfx.fillRect(0, LANE_TOP, GAME_W, LANE_BOTTOM - LANE_TOP);
    gfx.fillStyle(0x888899, 0.4);
    gfx.fillRect(0, LANE_TOP - 2, GAME_W, 3);
    gfx.setScrollFactor(0).setDepth(8);

    if (DEBUG_DEPTH) {
      this.add.graphics()
        .lineStyle(1, 0xff0000, 0.5)
        .strokeRect(0, LANE_TOP, GAME_W, LANE_BOTTOM - LANE_TOP)
        .setScrollFactor(0).setDepth(200);
    }

    // ── Foreground decorations ─────────────────────────────────────────────
    [300, 900, 1500, 2100, 2700, 3300].forEach(wx => {
      this.add.image(wx, LANE_TOP - 20, 'fore')
        .setOrigin(0.5, 1).setDepth(FORE_DEPTH).setScale(1.2);
    });

    // ── Props ──────────────────────────────────────────────────────────────
    this._placeProp('car',      600, 345, 0.65);
    this._placeProp('car',     2200, 345, 0.65);
    this._placeProp('barrel',   800, 420, 1.0);
    this._placeProp('barrel',  1800, 410, 0.9);
    this._placeProp('hydrant', 1100, 335, 0.65);
    this._placeProp('hydrant', 2600, 340, 0.65);

    // ── Extraction zone ────────────────────────────────────────────────────
    this._buildExtractionZone();

    // ── Combat system ──────────────────────────────────────────────────────
    this.combat = new CombatSystem(this);

    // ── Player ────────────────────────────────────────────────────────────
    this.player        = new Player(this, 150, LANE_BOTTOM - 10, this.combat);
    this.player.wallet = 0;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Enemies ───────────────────────────────────────────────────────────
    this.enemies = ENEMY_SPAWNS.map(s =>
      new Enemy(this, s.x, s.y, this.combat, s.cfg)
    );

    // ── Physics group ───────────────────────────────────────────────────
    // Group allows Phaser to auto-clean destroyed enemies
    this.enemiesGroup = this.physics.add.group();
    this.enemies.forEach(e => this.enemiesGroup.add(e));

    // No physical body collision — combat is handled by the hitbox system

    // ── Loot ──────────────────────────────────────────────────────────────
    this.lootSystem = new LootSystem(this);
    this.lootSystem.spawnAll();

    // ── Input ─────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── HUD ───────────────────────────────────────────────────────────────
    this.scene.launch('HUDScene', { player: this.player });

    // ── Music ─────────────────────────────────────────────────────────────
    // Stop any leftover music from a previous run
    this.sound.stopByKey('music_street');
    const savedVol = parseFloat(localStorage.getItem('sor_music_vol') ?? '0.5');
    this.bgMusic = this.sound.add('music_street', { loop: true, volume: savedVol });
    this.bgMusic.play();

    // ── Pause input ───────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ESC', () => this._togglePause());
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 9) this._togglePause();   // Start button
    });
  }

  // ──────────────────────────────────────────────────── update ─────────────
  update(time, delta) {
    if (this._gameEnded) return;

    // ── Timer countdown ────────────────────────────────────────────────────
    this.runTimer -= delta / 1000;
    if (this.runTimer <= 0) {
      this.runTimer = 0;
      return this._endGame('over', 'TIME UP');
    }

    // ── Entities ───────────────────────────────────────────────────────────
    this.enemies = this.enemies.filter(e => e.active);
    this.player.update(this.cursors, this.wasd);
    this.enemies.forEach(e => e.update(this.player));
    this.combat.update([this.player, ...this.enemies]);

    // ── Loot pickup ────────────────────────────────────────────────────────
    this.lootSystem.update(this.player);

    // ── Extraction check ───────────────────────────────────────────────────
    if (this.player.x >= EXTRACT_X) {
      this._endGame('win', '');
    }

    // ── Parallax ───────────────────────────────────────────────────────────
    const camX = this.cameras.main.scrollX;
    this.bgLayer.tilePositionX  = camX * 0.06;
    this.midLayer.tilePositionX = camX * 0.25;
  }

  // ────────────────────────────────────────────────── helpers ──────────────

  _buildExtractionZone() {
    const zoneY = LANE_TOP - 30;
    const zoneH = LANE_BOTTOM - LANE_TOP + 60;

    // Green beam
    const beam = this.add.graphics();
    beam.fillStyle(0x00ff88, 0.12);
    beam.fillRect(EXTRACT_X, zoneY, EXTRACT_W, zoneH);
    beam.lineStyle(2, 0x00ff88, 0.9);
    beam.strokeRect(EXTRACT_X, zoneY, EXTRACT_W, zoneH);
    beam.setDepth(LANE_TOP - 5);

    // Arrow indicators (↓) above zone
    const arrow = this.add.text(EXTRACT_X + EXTRACT_W / 2, zoneY - 40, '▼  EXTRACT  ▼', {
      fontFamily: 'monospace', fontSize: '16px', color: '#00ff88',
      stroke: '#003322', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(LANE_TOP - 4);

    // Pulse
    this.tweens.add({
      targets: [beam, arrow],
      alpha: 0.25,
      duration: 850,
      yoyo: true,
      repeat: -1,
    });
  }

  _endGame(result, reason) {
    if (this._gameEnded) return;
    this._gameEnded = true;

    this.scene.stop('HUDScene');

    // Stop music before leaving
    if (this.bgMusic) {
      this.bgMusic.stop();
      this.bgMusic.destroy();
      this.bgMusic = null;
    }

    if (result === 'win') {
      this.scene.start('WinScene', {
        wallet:   this.player.wallet ?? 0,
        timeLeft: this.runTimer,
      });
    } else {
      this.scene.start('GameOverScene', {
        wallet: this.player.wallet ?? 0,
        reason,
      });
    }
  }

  _placeProp(key, wx, wy, scl) {
    const img = this.add.image(wx, wy, key).setOrigin(0.5, 1);
    if (scl !== undefined) img.setScale(scl);
    img.setDepth(wy);
    return img;
  }

  _togglePause() {
    if (this._gameEnded) return;
    this.sound.play('sfx_menu');
    if (this.bgMusic) this.bgMusic.pause();
    this.scene.pause();
    this.scene.pause('HUDScene');
    this.scene.launch('PauseScene');
  }
}
