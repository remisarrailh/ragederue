import Player          from '../entities/Player.js';
import Enemy           from '../entities/Enemy.js';
import RemoteEnemy     from '../entities/RemoteEnemy.js';
import CombatSystem    from '../systems/CombatSystem.js';
import LootSystem      from '../systems/LootSystem.js';
import Inventory       from '../systems/Inventory.js';
import NetworkManager  from '../network/NetworkManager.js';
import { LANE_BOTTOM } from '../config/constants.js';
import { RUN_TIMER, EXTRACT_X } from '../config/lootTable.js';

import WorldBuilder    from './game/WorldBuilder.js';
import InputController from './game/InputController.js';
import NetworkHandlers from './game/NetworkHandlers.js';

export default class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  create() {
    this._gameEnded         = false;
    this.runTimer           = RUN_TIMER;
    this._pendingCorpseLoot = new Map();
    this.registry.set('inputMode', 'kb');

    // ── Network ───────────────────────────────────────────────────────────
    this.net           = new NetworkManager();
    this.remotePlayers = new Map();
    this.net.autoConnect('Player');

    // ── World ─────────────────────────────────────────────────────────────
    this.world = new WorldBuilder(this);
    this.world.build();

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
    this.player        = new Player(this, 150, LANE_BOTTOM - 10, this.combat);
    this.player.wallet = 0;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Enemies ───────────────────────────────────────────────────────────
    this.enemies      = [];
    this.enemiesGroup = this.physics.add.group();

    // ── Inventory & loot ─────────────────────────────────────────────────
    this.inventory  = new Inventory();
    this.lootSystem = new LootSystem(this);
    this.lootSystem.spawnContainers();

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

  // ──────────────────────────────────────────────────── update ─────────────
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

    if (this.player.x >= EXTRACT_X) {
      this.player.wallet = this.inventory.totalValue;
      return this._endGame('win', '');
    }

    this.net.sendState(
      this.player.x, this.player.y,
      this.player.body.velocity.x, this.player.body.velocity.y,
      this.player.state, this.player.facing, this.player.hp,
    );

    for (const [, rp] of this.remotePlayers) rp.update(time, delta);

    this.world.updateParallax(this.cameras.main.scrollX);
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
    if (result === 'win')
      this.scene.start('WinScene',    { wallet: this.player.wallet ?? 0, timeLeft: this.runTimer });
    else
      this.scene.start('GameOverScene', { wallet: this.player.wallet ?? 0, reason });
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
    this.scene.launch('PauseScene', { fromScene: 'GameScene' });
  }

  // ── Interact ─────────────────────────────────────────────────────────
  _interact() {
    if (this._gameEnded || this.player.searching || this._searchCooldown > 0) return;
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
