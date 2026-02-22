import Player         from '../entities/Player.js';
import Enemy          from '../entities/Enemy.js';
import CombatSystem   from '../systems/CombatSystem.js';
import LootSystem     from '../systems/LootSystem.js';
import Inventory      from '../systems/Inventory.js';
import NetworkManager from '../network/NetworkManager.js';
import RemotePlayer   from '../network/RemotePlayer.js';
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

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this._gameEnded = false;
    this.runTimer   = RUN_TIMER;

    // ── Pending loot buffer (for loot arriving before enemies are created) ──
    this._pendingCorpseLoot = new Map();  // netId → items[]

    // ── Input mode tracking (keyboard / gamepad) ──────────────────────────
    this.registry.set('inputMode', 'kb');

    // ── Network (always online) ───────────────────────────────────────────
    this.net = new NetworkManager();
    this.remotePlayers = new Map();
    this.net.autoConnect('Player');

    this.net.onWelcome = (id) => {
      console.log(`[Game] Connected as player #${id}`);
    };

    this.net.onSnapshot = (players) => {
      const seen = new Set();
      for (const p of players) {
        if (p.id === this.net.playerId) continue;
        seen.add(p.id);
        let rp = this.remotePlayers.get(p.id);
        if (!rp) {
          rp = new RemotePlayer(this, p.id, `Player ${p.id}`, p.x, p.y);
          this.remotePlayers.set(p.id, rp);
        }
        rp.applySnapshot(p);
      }
      for (const [id, rp] of this.remotePlayers) {
        if (!seen.has(id)) {
          rp.destroy();
          this.remotePlayers.delete(id);
        }
      }
    };

    this.net.onEnemySnapshot = (enemyData) => {
      this._syncEnemiesFromServer(enemyData);
    };

    // Loot synchronisation — server is the authority on loot contents
    this.net.onLootData = (targetKind, targetId, items) => {
      if (targetKind === 0) { // container
        const c = this.lootSystem.containers.find(c => c.netId === targetId);
        if (c) c.lootItems = items;
      } else { // corpse (1)
        const e = this.enemies.find(e => e.netId === targetId);
        if (e) {
          e.lootItems = items;
          e.searchable = true;
          e.searched = false;
        } else {
          // Enemy not yet created — buffer for later
          this._pendingCorpseLoot.set(targetId, items);
        }
      }
    };

    // Timer sync from server
    this.net.onTimerSync = (remainingTime) => {
      this.runTimer = remainingTime;
    };

    // World reset — server says the cycle is over, respawn everything
    this.net.onWorldReset = (remainingTime) => {
      console.log('[Game] World reset received — new timer:', remainingTime);
      this._handleWorldReset(remainingTime);
    };

    this.net.onPlayerLeave = (id) => {
      const rp = this.remotePlayers.get(id);
      if (rp) {
        rp.destroy();
        this.remotePlayers.delete(id);
      }
    };

    this.net.onDisconnect = () => {
      console.log('[Game] Disconnected from server');
      this._endGame('over', 'DISCONNECTED');
    };

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

    // Send hit events to server when player hits an enemy
    this.combat.onHit = (owner, target, damage, knockback) => {
      if (owner === this.player && target.netId != null) {
        this.net.sendHitEnemy(target.netId, damage, knockback, owner.x);
      }
    };

    // ── Player ────────────────────────────────────────────────────────────
    this.player        = new Player(this, 150, LANE_BOTTOM - 10, this.combat);
    this.player.wallet = 0;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Enemies ───────────────────────────────────────────────────────────
    this.enemies = [];
    this.enemiesGroup = this.physics.add.group();

    // Enemies come from server — no local spawning

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
    this.sound.stopByKey('music_street');    this.sound.stopByKey('music_naval');    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');
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

    // ── Pad index from registry (default 0) ─────────────────────────────
    if (this.registry.get('padIndex') === undefined) {
      const saved = parseInt(localStorage.getItem('RAGEDERUE_padIndex') ?? '0', 10);
      this.registry.set('padIndex', saved);
    }

    // ── Pause / Settings input ───────────────────────────────────────
    this.input.keyboard.on('keydown-ESC', () => { this.registry.set('inputMode', 'kb'); this._toggleSettings(); });
    this.input.keyboard.on('keydown', () => { this.registry.set('inputMode', 'kb'); });
    this.input.gamepad.on('down', (pad, button) => {
      if (!document.hasFocus()) return;  // ignore when tab is not focused
      const chosenPad = this.registry.get('padIndex') ?? 0;
      if (chosenPad < 0) return;  // keyboard-only mode
      if (pad.index !== chosenPad) return;
      this.registry.set('inputMode', 'gp');
      if (this.player.searching || this.player.inMenu) return;  // ignore while overlay is open
      if (button.index === 9) this._toggleSettings();       // Start
      if (button.index === 3) this._interact();           // Y / Triangle
      if (button.index === 8) this._openInventory();      // Select
    });
  }

  // ──────────────────────────────────────────────────── update ─────────────
  update(time, delta) {
    if (this._gameEnded) return;

    // ── Search cooldown tick ───────────────────────────────────────────
    if (this._searchCooldown > 0) this._searchCooldown -= delta;

    // ── Timer (server-authoritative — only display, no local decrement) ──

    // ── Entities ───────────────────────────────────────────────────────────
    this.enemies = this.enemies.filter(e => e.active);
    this.player.update(this.cursors, this.wasd);
    // Enemies are remote — interpolate snapshots from server
    this.enemies.forEach(e => e.update(this.player));
    this.combat.update([this.player, ...this.enemies]);

    // ── Player death check ────────────────────────────────────────────────
    if (this.player.hp <= 0) {
      return this._endGame('over', 'DEAD');
    }

    // ── HUD timer display ─────────────────────────────────────────────────
    this.registry.set('runTimer', this.runTimer);

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

    // ── Network send ───────────────────────────────────────────────────────
    this.net.sendState(
      this.player.x, this.player.y,
      this.player.body.velocity.x, this.player.body.velocity.y,
      this.player.state, this.player.facing, this.player.hp
    );

    // ── Update remote players ──────────────────────────────────────────────
    for (const [, rp] of this.remotePlayers) {
      rp.update(time, delta);
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

    // Disconnect network
    this.net.disconnect();
    for (const [, rp] of this.remotePlayers) rp.destroy();
    this.remotePlayers.clear();

    // Close any open overlay scenes
    this.scene.stop('HUDScene');
    this.scene.stop('SearchScene');
    this.scene.stop('InventoryScene');
    this.scene.stop('PauseScene');
    this.player.searching = false;
    this.player.inMenu = false;

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

  // ── Enemy sync (server-authoritative) ────────────────────────────────

  _syncEnemiesFromServer(enemyData) {
    const seen = new Set();

    for (const data of enemyData) {
      seen.add(data.netId);
      // Find existing enemy by netId
      let enemy = this.enemies.find(e => e.netId === data.netId);

      if (!enemy) {
        // Create remote enemy
        enemy = new Enemy(this, data.x, data.y, this.combat, {});
        enemy.netId = data.netId;
        enemy.isRemote = true;
        enemy._justCreated = true;  // flag: skip death SFX if already dead
        this.enemies.push(enemy);
        this.enemiesGroup.add(enemy);

        // Apply any buffered corpse loot that arrived before this enemy existed
        if (this._pendingCorpseLoot.has(data.netId)) {
          enemy.lootItems  = this._pendingCorpseLoot.get(data.netId);
          enemy.searchable = true;
          enemy.searched   = false;
          this._pendingCorpseLoot.delete(data.netId);
        }
      }
      enemy.applyNetState(data);
      enemy._justCreated = false;
    }

    // Remove enemies not in the snapshot
    this.enemies = this.enemies.filter(e => {
      if (seen.has(e.netId)) return true;
      e.destroy();
      return false;
    });
  }

  // ── World reset (server cycle expired) ───────────────────────────────
  _handleWorldReset(remainingTime) {
    // Close overlay if open
    if (this.scene.isActive('SearchScene')) {
      this.player.searching = false;
      this.scene.stop('SearchScene');
    }

    // Destroy all local enemies
    for (const e of this.enemies) e.destroy();
    this.enemies = [];
    this.enemiesGroup.clear(true, true);
    this._pendingCorpseLoot.clear();

    // Reset containers (server will send fresh loot data)
    this.lootSystem.resetContainers();

    // Reset timer
    this.runTimer = remainingTime;

    // Reset player HP
    this.player.hp = this.player.maxHp;

    console.log('[Game] World reset complete — waiting for new enemies & loot from server');
  }

  _toggleSettings() {
    if (this._gameEnded) return;
    // Close any overlay before opening settings
    if (this.scene.isActive('InventoryScene')) {
      this.player.inInventory = false;
      this.scene.stop('InventoryScene');
    }
    if (this.scene.isActive('SearchScene')) {
      this.player.searching = false;
      this.scene.stop('SearchScene');
    }
    // Toggle: if settings is already open, close it
    if (this.scene.isActive('PauseScene')) {
      this.player.inMenu = false;
      this.scene.stop('PauseScene');
      return;
    }
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.player.inMenu = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('PauseScene', { fromScene: 'GameScene' });
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
      net: this.net,
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
