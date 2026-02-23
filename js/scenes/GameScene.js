import Player          from '../entities/Player.js';
import Enemy           from '../entities/Enemy.js';
import RemoteEnemy     from '../entities/RemoteEnemy.js';
import CombatSystem    from '../systems/CombatSystem.js';
import LootSystem      from '../systems/LootSystem.js';
import Inventory       from '../systems/Inventory.js';
import NetworkManager  from '../network/NetworkManager.js';
import { GAME_W, GAME_H, LANE_TOP, LANE_BOTTOM } from '../config/constants.js';
import { RUN_TIMER }   from '../config/lootTable.js';
import { LEVELS, LEVEL_MAP } from '../config/levels.js';

import WorldBuilder    from './game/WorldBuilder.js';
import InputController from './game/InputController.js';
import NetworkHandlers from './game/NetworkHandlers.js';

const TRANSIT_DURATION = 5000; // ms to hold E before transit triggers
const TRANSIT_BAR_W    = 280;
const TRANSIT_BAR_H    = 12;
const TRANSIT_BAR_X    = (GAME_W - TRANSIT_BAR_W) / 2;
const TRANSIT_BAR_Y    = GAME_H - 56;

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  create(data) {
    this._gameEnded         = false;
    this.runTimer           = RUN_TIMER;
    this._pendingCorpseLoot = new Map();
    this.registry.set('inputMode', 'kb');

    // ── Level config ──────────────────────────────────────────────────────
    const levelId = (data && data.levelId) || LEVELS[0].id;
    this._fromEditor = !!(data && data.fromEditor);
    // If launched from the editor, use the editor's in-memory levels
    const levelSource = this._fromEditor
      ? (this.registry.get('editorLevels') || LEVELS)
      : LEVELS;
    this._levelConfig = levelSource.find(l => l.id === levelId) || LEVELS[0];

    // ── Lane bounds (per-level, fallback to global constants) ─────────────
    this.laneTop    = this._levelConfig.laneTop    ?? LANE_TOP;
    this.laneBottom = this._levelConfig.laneBottom ?? LANE_BOTTOM;

    // ── Network ───────────────────────────────────────────────────────────
    this.net           = new NetworkManager();
    this.remotePlayers = new Map();
    this.net.autoConnect('Player');

    // ── World ─────────────────────────────────────────────────────────────
    this.world = new WorldBuilder(this);
    this.world.build(this._levelConfig);

    // ── Net handlers (callbacks set up before any enemy/loot objects needed) ──
    this.netHandlers = new NetworkHandlers(this);
    this.netHandlers.setup();

    // ── Combat ────────────────────────────────────────────────────────────
    this.combat = new CombatSystem(this);
    this.combat.onHit = (owner, target, damage, knockback) => {
      if (owner === this.player && target.netId != null)
        this.net.sendHitEnemy(target.netId, damage, knockback, owner.x);
    };

    // ── Player ────────────────────────────────────────────────────────────
    const spawnX = this._levelConfig.spawnX ?? 150;
    this.player        = new Player(this, spawnX, this.laneBottom - 10, this.combat);
    this.player.wallet = 0;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.physics.add.collider(this.player, this.world.blockingGroup);

    // ── Enemies ───────────────────────────────────────────────────────────
    this.enemies      = [];
    this.enemiesGroup = this.physics.add.group();

    // ── Inventory & loot ─────────────────────────────────────────────────
    this.inventory  = new Inventory();
    this.lootSystem = new LootSystem(this);
    this.lootSystem.spawnContainers(this._levelConfig.containers);

    // ── Input (wired after player/loot exist so callbacks are valid) ──────
    this.inputCtrl = new InputController(this);
    this.inputCtrl.setup({
      onInteract:  () => this._interact(),
      onInventory: () => this._openInventory(),
      onSettings:  () => this._toggleSettings(),
    });

    // ── HUD ───────────────────────────────────────────────────────────────
    this.scene.launch('HUDScene', { player: this.player, inventory: this.inventory });

    // ── Search prompt ─────────────────────────────────────────────────────
    this._searchPrompt = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffcc00',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9999).setVisible(false);
    this.tweens.add({ targets: this._searchPrompt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    // ── Transit zone state ────────────────────────────────────────────────
    this._transitZone   = null;   // zone the player is currently inside
    this._transitTimer  = 0;      // ms elapsed since _startTransit()
    this._transitActive = false;  // countdown running

    // Transit prompt (world space — appears above the zone)
    this._transitPrompt = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ff88',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9998).setVisible(false);
    this.tweens.add({ targets: this._transitPrompt, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    // Transit progress bar (screen-fixed)
    this._transitBarBg   = this.add.graphics().setScrollFactor(0).setDepth(9998).setVisible(false);
    this._transitBarFill = this.add.graphics().setScrollFactor(0).setDepth(9999).setVisible(false);
    this._transitBarLabel = this.add.text(GAME_W / 2, TRANSIT_BAR_Y - 18, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#00ff88',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9999).setVisible(false);

    // ── Music ─────────────────────────────────────────────────────────────
    this.sound.stopByKey('music_street');
    this.sound.stopByKey('music_naval');
    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');
    this.bgMusic = this.sound.add('music_street', { loop: true, volume: savedVol });
    this.bgMusic.play();
    this.registry.set('sfxVol', parseFloat(localStorage.getItem('RAGEDERUE_sfx_vol') ?? '0.5'));

    // ── Search cooldown ───────────────────────────────────────────────────
    this._searchCooldown = 0;
    this.scene.get('SearchScene').events.on('shutdown', () => { this._searchCooldown = 500; });
  }

  // ──────────────────────────────────────────────── update ─────────────
  update(time, delta) {
    if (this._gameEnded) return;

    if (this._searchCooldown > 0) this._searchCooldown -= delta;

    this.enemies = this.enemies.filter(e => e.active);
    this.player.update(this.inputCtrl.cursors, this.inputCtrl.wasd);
    this.enemies.forEach(e => e.update(this.player));
    this.combat.update([this.player, ...this.enemies]);

    if (this.player.hp <= 0) return this._endGame('over', 'DEAD');

    this.registry.set('runTimer', this.runTimer);

    // ── Search proximity ───────────────────────────────────────────────────
    const searchResult = this.lootSystem.update(this.player, this.enemies);
    if (searchResult) {
      const gp = this.registry.get('inputMode') === 'gp';
      this._searchPrompt.setText(gp ? '[Y] Search' : '[E] Search').setVisible(true);
      this._searchPrompt.setPosition(
        searchResult.target.x,
        (searchResult.target.y ?? searchResult.target.image?.y ?? this.player.y) - 60,
      );
    } else {
      this._searchPrompt.setVisible(false);
    }

    // ── Transit zone detection ────────────────────────────────────────────
    let inZone = null;
    for (const zone of this._levelConfig.transitZones) {
      const zoneRight = zone.x + (zone.width ?? 120);
      const zoneTop   = zone.y      ?? (this.laneTop - 30);
      const zoneBot   = zoneTop + (zone.height ?? (this.laneBottom - this.laneTop + 60));
      if (this.player.x >= zone.x && this.player.x <= zoneRight
       && this.player.y >= zoneTop && this.player.y <= zoneBot) {
        inZone = zone;
        break;
      }
    }
    this._transitZone = inZone;

    // Cancel countdown if player left the zone
    if (this._transitActive && !inZone) {
      this._cancelTransit();
    }

    // Advance countdown
    if (this._transitActive && inZone) {
      this._transitTimer += delta;
      const pct = Math.min(1, this._transitTimer / TRANSIT_DURATION);
      this._updateTransitBar(pct, inZone);
      if (this._transitTimer >= TRANSIT_DURATION) {
        if (inZone.type === 'extract') {
          this.player.wallet = this.inventory.totalValue;
          return this._endGame('win', '');
        }
        if (inZone.type === 'warp' && inZone.targetLevel) {
          return this._warpToLevel(inZone.targetLevel);
        }
      }
    }

    // Show/hide zone entry prompt (only when not counting down)
    if (inZone && !this._transitActive) {
      const gp    = this.registry.get('inputMode') === 'gp';
      const key   = gp ? '[Y]' : '[E]';
      const action = inZone.type === 'extract' ? 'Extraire' : (inZone.label ?? 'Entrer');
      const zoneW  = inZone.width ?? 120;
      const zoneTopY = inZone.y ?? (this.laneTop - 30);
      this._transitPrompt
        .setText(`${key} ${action}`)
        .setPosition(inZone.x + zoneW / 2, zoneTopY - 18)
        .setVisible(true);
    } else {
      this._transitPrompt.setVisible(false);
    }

    this.net.sendState(
      this.player.x, this.player.y,
      this.player.body.velocity.x, this.player.body.velocity.y,
      this.player.state, this.player.facing, this.player.hp,
    );

    for (const [, rp] of this.remotePlayers) rp.update(time, delta);

    this.world.updateParallax(this.cameras.main.scrollX);
  }

  // ── Transit zone countdown ────────────────────────────────────────────
  _startTransit() {
    this._transitActive = true;
    this._transitTimer  = 0;
    this._transitPrompt.setVisible(false);
    this._updateTransitBar(0, this._transitZone);
  }

  _cancelTransit() {
    this._transitActive = false;
    this._transitTimer  = 0;
    this._transitBarBg.setVisible(false);
    this._transitBarFill.setVisible(false);
    this._transitBarLabel.setVisible(false);
  }

  _updateTransitBar(pct, zone) {
    const secsLeft = ((TRANSIT_DURATION - this._transitTimer) / 1000).toFixed(1);
    const action   = zone.type === 'extract' ? 'EXTRACTION' : (zone.label?.toUpperCase() ?? 'WARP');

    this._transitBarBg.clear().setVisible(true);
    this._transitBarBg.fillStyle(0x000000, 0.75);
    this._transitBarBg.fillRect(TRANSIT_BAR_X - 2, TRANSIT_BAR_Y - 2, TRANSIT_BAR_W + 4, TRANSIT_BAR_H + 4);
    this._transitBarBg.lineStyle(1, 0x00ff88, 0.6);
    this._transitBarBg.strokeRect(TRANSIT_BAR_X - 2, TRANSIT_BAR_Y - 2, TRANSIT_BAR_W + 4, TRANSIT_BAR_H + 4);

    this._transitBarFill.clear().setVisible(true);
    this._transitBarFill.fillStyle(0x00ff88, 0.9);
    this._transitBarFill.fillRect(TRANSIT_BAR_X, TRANSIT_BAR_Y, Math.round(TRANSIT_BAR_W * pct), TRANSIT_BAR_H);

    this._transitBarLabel.setText(`${action}  ${secsLeft}s`).setVisible(true);
  }

  // ── Enemy sync (server-authoritative) ────────────────────────────────
  _syncEnemiesFromServer(enemyData) {
    const seen = new Set();
    for (const data of enemyData) {
      seen.add(data.netId);
      let enemy = this.enemies.find(e => e.netId === data.netId);
      if (!enemy) {
        enemy = new RemoteEnemy(this, data.x, data.y, this.combat, {});
        enemy.netId = data.netId;
        enemy._justCreated = true;
        this.enemies.push(enemy);
        this.enemiesGroup.add(enemy);
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
    this.enemies = this.enemies.filter(e => {
      if (seen.has(e.netId)) return true;
      e.destroy();
      return false;
    });
  }

  // ── World reset ───────────────────────────────────────────────────────
  _handleWorldReset(remainingTime) {
    if (this.scene.isActive('SearchScene')) {
      this.player.searching = false;
      this.scene.stop('SearchScene');
    }
    for (const e of this.enemies) e.destroy();
    this.enemies = [];
    this.enemiesGroup.clear(true, true);
    this._pendingCorpseLoot.clear();
    this.lootSystem.resetContainers();
    this.runTimer  = remainingTime;
    this.player.hp = this.player.maxHp;
    console.log('[Game] World reset complete');
  }

  // ── Warp to another level ─────────────────────────────────────────────
  _warpToLevel(targetLevelId) {
    if (this._gameEnded) return;
    this._gameEnded = true;
    this.net.disconnect();
    for (const [, rp] of this.remotePlayers) rp.destroy();
    this.remotePlayers.clear();
    ['HUDScene','SearchScene','InventoryScene','PauseScene'].forEach(k => this.scene.stop(k));
    this.player.searching = false;
    this.player.inMenu    = false;
    if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
    if (this._fromEditor) {
      this.scene.start('LevelEditorScene');
    } else {
      this.scene.start('GameScene', { levelId: targetLevelId });
    }
  }

  // ── End game ──────────────────────────────────────────────────────────
  _endGame(result, reason) {
    if (this._gameEnded) return;
    this._gameEnded = true;
    this.net.disconnect();
    for (const [, rp] of this.remotePlayers) rp.destroy();
    this.remotePlayers.clear();
    ['HUDScene','SearchScene','InventoryScene','PauseScene'].forEach(k => this.scene.stop(k));
    this.player.searching = false;
    this.player.inMenu    = false;
    if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
    if (this._fromEditor) {
      this.scene.start('LevelEditorScene');
    } else if (result === 'win') {
      this.scene.start('WinScene',    { wallet: this.player.wallet ?? 0, timeLeft: this.runTimer });
    } else {
      this.scene.start('GameOverScene', { wallet: this.player.wallet ?? 0, reason });
    }
  }

  // ── Settings toggle ───────────────────────────────────────────────────
  _toggleSettings() {
    if (this._gameEnded) return;
    if (this.scene.isActive('InventoryScene')) { this.player.inInventory = false; this.scene.stop('InventoryScene'); }
    if (this.scene.isActive('SearchScene'))    { this.player.searching   = false; this.scene.stop('SearchScene'); }
    if (this.scene.isActive('PauseScene'))     { this.player.inMenu      = false; this.scene.stop('PauseScene'); return; }
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.player.inMenu = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('PauseScene', { fromScene: 'GameScene', fromEditor: this._fromEditor });
  }

  // ── Interact ─────────────────────────────────────────────────────────
  _interact() {
    if (this._gameEnded || this.player.searching || this._searchCooldown > 0) return;
    // Start transit if inside a zone and not already counting down
    if (this._transitZone && !this._transitActive) {
      this._startTransit();
      return;
    }
    const target = this.lootSystem.nearestTarget;
    if (!target) return;
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.player.searching = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('SearchScene', { target, inventory: this.inventory, player: this.player, net: this.net });
  }

  // ── Open inventory ────────────────────────────────────────────────────
  _openInventory() {
    if (this._gameEnded || this.player.searching || this.player.inInventory) return;
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.player.inInventory = true;
    this.player.setVelocity(0, 0);
    this.scene.launch('InventoryScene', { inventory: this.inventory, player: this.player });
  }
}
