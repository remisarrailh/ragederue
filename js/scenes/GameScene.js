import Player       from '../entities/Player.js';
import Enemy        from '../entities/Enemy.js';
import CombatSystem from '../systems/CombatSystem.js';
import LootSystem   from '../systems/LootSystem.js';
import Inventory    from '../systems/Inventory.js';
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
  { x: 400,  y: 410, cfg: {} },
  { x: 650,  y: 380, cfg: {} },
  { x: 900,  y: 440, cfg: {} },
  { x: 1100, y: 395, cfg: {} },
  { x: 1400, y: 450, cfg: { hp: 80, speed: 80 } },
  { x: 1700, y: 385, cfg: {} },
  { x: 2000, y: 430, cfg: { hp: 80, speed: 80 } },
  { x: 2400, y: 400, cfg: {} },
  { x: 2800, y: 445, cfg: { hp: 100, speed: 70 } },
  { x: 3200, y: 390, cfg: {} },
];

// Wave spawner config
const WAVE_INTERVAL  = 10_000; // ms between waves
const WAVE_MIN       = 1;     // min enemies per wave
const WAVE_MAX       = 3;     // max enemies per wave
const SPAWN_MARGIN   = 300;   // px off-screen margin for spawn x

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this._gameEnded = false;
    this.runTimer   = RUN_TIMER;

    // ── Input mode tracking (keyboard / gamepad) ──────────────────────────
    this.registry.set('inputMode', 'kb');

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

    // ── Wave spawner timer ────────────────────────────────────────────────
    this._waveTimer = this.time.addEvent({
      delay: WAVE_INTERVAL,
      loop: true,
      callback: () => this._spawnWave(),
    });

    // ── Inventory ─────────────────────────────────────────────────────────
    this.inventory = new Inventory();

    // ── Loot / Search system ──────────────────────────────────────────────
    this.lootSystem = new LootSystem(this);
    this.lootSystem.spawnContainers();

    // ── Input ─────────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── HUD ───────────────────────────────────────────────────────────────
    this.scene.launch('HUDScene', { player: this.player, inventory: this.inventory });

    // ── Search prompt (world-space text) ──────────────────────────────────
    this._searchPrompt = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffcc00',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9999).setVisible(false);
    this.tweens.add({ targets: this._searchPrompt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    // ── Music ─────────────────────────────────────────────────────────────
    // Stop any leftover music from a previous run
    this.sound.stopByKey('music_street');
    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');
    this.bgMusic = this.sound.add('music_street', { loop: true, volume: savedVol });
    this.bgMusic.play();

    // ── SFX volume from localStorage → registry ──────────────────────────
    const sfxVol = parseFloat(localStorage.getItem('RAGEDERUE_sfx_vol') ?? '0.5');
    this.registry.set('sfxVol', sfxVol);

    // ── Search re-trigger cooldown ────────────────────────────────────────
    this._searchCooldown = 0;
    this.scene.get('SearchScene').events.on('shutdown', () => {
      this._searchCooldown = 500; // ms before search can be re-triggered
    });

    // ── Interaction / Inventory keys ──────────────────────────────────────
    this.input.keyboard.on('keydown-E',   () => { this.registry.set('inputMode', 'kb'); this._interact(); });
    this.input.keyboard.on('keydown-TAB', (e) => { e.preventDefault(); this.registry.set('inputMode', 'kb'); this._openInventory(); });

    // ── Pause input ───────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ESC', () => { this.registry.set('inputMode', 'kb'); this._togglePause(); });
    this.input.keyboard.on('keydown', () => { this.registry.set('inputMode', 'kb'); });
    this.input.gamepad.on('down', (pad, button) => {
      this.registry.set('inputMode', 'gp');
      if (this.player.searching) return;  // ignore GameScene input while search overlay is open
      if (button.index === 9) this._togglePause();       // Start
      if (button.index === 3) this._interact();           // Y / Triangle
      if (button.index === 8) this._openInventory();      // Select
    });
  }

  // ──────────────────────────────────────────────────── update ─────────────
  update(time, delta) {
    if (this._gameEnded) return;

    // ── Search cooldown tick ───────────────────────────────────────────
    if (this._searchCooldown > 0) this._searchCooldown -= delta;

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

    // ── Player death check ────────────────────────────────────────────────
    if (this.player.hp <= 0) {
      return this._endGame('over', 'DEAD');
    }

    // ── Search proximity ───────────────────────────────────────────────────
    const searchResult = this.lootSystem.update(this.player, this.enemies);
    if (searchResult) {
      const gp = this.registry.get('inputMode') === 'gp';
      this._searchPrompt.setText(gp ? '[Y] Search' : '[E] Search');
      this._searchPrompt.setVisible(true);
      this._searchPrompt.setPosition(searchResult.target.x, (searchResult.target.y ?? searchResult.target.image?.y ?? this.player.y) - 60);
    } else {
      this._searchPrompt.setVisible(false);
    }

    // ── Extraction check ───────────────────────────────────────────────────
    if (this.player.x >= EXTRACT_X) {
      // Pass inventory total value as wallet for win screen
      this.player.wallet = this.inventory.totalValue;
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

    // Close any open overlay scenes
    this.scene.stop('HUDScene');
    this.scene.stop('SearchScene');
    this.scene.stop('InventoryScene');
    this.player.searching = false;

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

  // ── Wave spawner ──────────────────────────────────────────────────────
  _spawnWave() {
    if (this._gameEnded) return;

    const count = Phaser.Math.Between(WAVE_MIN, WAVE_MAX);
    const camX  = this.cameras.main.scrollX;

    for (let i = 0; i < count; i++) {
      // Pick a random x that's off-screen (left or right of camera)
      let sx;
      if (Math.random() < 0.5) {
        // Spawn to the left of the camera
        sx = camX - SPAWN_MARGIN + Phaser.Math.Between(-80, 0);
      } else {
        // Spawn to the right of the camera
        sx = camX + GAME_W + SPAWN_MARGIN + Phaser.Math.Between(0, 80);
      }
      // Clamp within world bounds (but away from extraction zone)
      sx = Phaser.Math.Clamp(sx, 60, EXTRACT_X - 120);

      const sy  = Phaser.Math.Between(LANE_TOP + 10, LANE_BOTTOM - 10);

      // Occasionally spawn a tougher variant
      const tough = Math.random() < 0.25;
      const cfg   = tough ? { hp: 100, speed: 70 } : {};

      const enemy = new Enemy(this, sx, sy, this.combat, cfg);
      this.enemies.push(enemy);
      this.enemiesGroup.add(enemy);
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
    // Close any overlay before pausing
    if (this.scene.isActive('InventoryScene')) {
      this.player.inInventory = false;
      this.scene.stop('InventoryScene');
    }
    if (this.scene.isActive('SearchScene')) {
      this.player.searching = false;
      this.scene.stop('SearchScene');
    }
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    if (this.bgMusic) this.bgMusic.pause();
    this.scene.pause();
    this.scene.pause('HUDScene');
    this.scene.launch('PauseScene');
  }

  // ── Interact: search nearby container/corpse ─────────────────────────
  _interact() {
    if (this._gameEnded) return;
    if (this.player.searching) return;  // already searching
    if (this._searchCooldown > 0) return;  // cooldown after closing search
    const target = this.lootSystem.nearestTarget;
    if (!target) return;

    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    // Game keeps running — player is frozen but enemies still move
    this.player.searching = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('SearchScene', {
      target,
      inventory: this.inventory,
      player: this.player,
    });
  }

  // ── Open inventory overlay ───────────────────────────────────────────
  _openInventory() {
    if (this._gameEnded) return;
    if (this.player.searching || this.player.inInventory) return;
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    // Game keeps running — player is frozen but enemies still move
    this.player.inInventory = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('InventoryScene', {
      inventory: this.inventory,
      player:    this.player,
    });
  }
}
