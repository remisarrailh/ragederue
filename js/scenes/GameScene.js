import Player          from '../entities/Player.js';
import RemoteEnemy     from '../entities/RemoteEnemy.js';
import CombatSystem    from '../systems/CombatSystem.js';
import LootSystem      from '../systems/LootSystem.js';
import Inventory       from '../systems/Inventory.js';
import NetworkManager  from '../network/NetworkManager.js';
import { GAME_W, GAME_H, LANE_TOP, LANE_BOTTOM, IS_MOBILE } from '../config/constants.js';
import { RUN_TIMER }   from '../config/lootTable.js';
import { LEVELS } from '../config/levels.js';

import WorldBuilder    from './game/WorldBuilder.js';
import InputController from './game/InputController.js';
import NetworkHandlers from './game/NetworkHandlers.js';

const TRANSIT_DURATION = 5000; // ms to hold E before transit triggers
const TRANSIT_BAR_W    = 280;
const TRANSIT_BAR_H    = 12;
const TRANSIT_BAR_X    = (GAME_W - TRANSIT_BAR_W) / 2;
const TRANSIT_BAR_Y    = GAME_H - 56;

const REVIVE_DURATION  = 4000;  // ms to hold E to revive a downed player
const HEAL_DURATION    = 2000;  // ms to hold E to heal an ally
const ALLY_RADIUS      = 90;    // px proximity to interact with a remote player
const DOWN_TIMEOUT     = 30000; // ms before a downed player auto-dies if not revived

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
    this._levelSource = levelSource;  // kept for warp label resolution
    this._levelConfig = levelSource.find(l => l.id === levelId) || LEVELS[0];

    // ── Lane bounds (per-level, fallback to global constants) ─────────────
    this.laneTop    = this._levelConfig.laneTop    ?? LANE_TOP;
    this.laneBottom = this._levelConfig.laneBottom ?? LANE_BOTTOM;

    // ── Network ───────────────────────────────────────────────────────────
    // Reuse the existing connection if we're warping between levels
    // (avoids disconnect/reconnect on zone change, especially on remote servers)
    const params   = new URLSearchParams(window.location.search);
    const server   = params.get('server') || 'localhost';
    const port     = params.get('port')   || '9000';
    const ssl      = params.get('ssl') === 'true' || window.location.protocol === 'https:';
    const protocol = ssl ? 'wss' : 'ws';
    const playerName = this.registry.get('charName') || params.get('name') || 'Player';
    const roomName   = params.get('room') || 'street_01';
    const charId     = this.registry.get('charId') || '';

    // La room = l'id du niveau (level_01, level_03…) sauf si ?room= est forcé en URL
    const levelRoomName = params.get('room') || this._levelConfig.id || roomName;

    const existingNet = this.registry.get('sharedNet');
    if (existingNet && existingNet.connected) {
      // Reuse the open connection — joinRoom will be sent after netHandlers.setup()
      this.net = existingNet;
      this._netOwner = false;
    } else {
      this.net = new NetworkManager();
      this._netOwner = true;
      this.registry.set('sharedNet', this.net);
      const url = `${protocol}://${server}:${port}`;
      this.net.connect(url, playerName, levelRoomName, charId);
    }
    this.remotePlayers = new Map();

    // ── World ─────────────────────────────────────────────────────────────
    this.world = new WorldBuilder(this);
    this.world.build(this._levelConfig);

    // ── Net handlers (callbacks set up before any enemy/loot objects needed) ──
    this.netHandlers = new NetworkHandlers(this);
    this.netHandlers.setup();

    // ── (Re-)join room after callbacks are wired ──────────────────────────
    // For reused connections: send C_JOIN now that onWelcome etc. are registered.
    // For fresh connections: connect() handles the JOIN internally.
    if (!this._netOwner) {
      this.net.joinRoom(playerName, levelRoomName, charId);
    }

    // ── Combat ────────────────────────────────────────────────────────────
    this.combat = new CombatSystem(this);
    this.combat.onHit = (owner, target, damage, knockback) => {
      if (owner === this.player && target.netId != null)
        this.net.sendHitEnemy(target.netId, damage, knockback, owner.x);
    };

    // ── Player ────────────────────────────────────────────────────────────
    let spawnX = this._levelConfig.spawnX ?? 150;
    const spawnAtWarpId = (data && data.spawnAtWarpId) ?? null;
    if (spawnAtWarpId) {
      const destZone = (this._levelConfig.transitZones ?? []).find(z => z.id === spawnAtWarpId);
      if (destZone) {
        // Place the player just to the right of the destination warp to avoid re-triggering it
        spawnX = destZone.x + (destZone.width ?? 120) + 32;
      }
    }
    this.player        = new Player(this, spawnX, this.laneBottom - 10, this.combat);
    // Restore wallet across level transitions (stored in registry)
    this.player.wallet = this.registry.get('playerWallet') ?? 0;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.physics.add.collider(this.player, this.world.blockingGroup);

    // ── Enemies ───────────────────────────────────────────────────────────
    this.enemies      = [];
    this.enemiesGroup = this.physics.add.group();

    // ── Inventory & loot ─────────────────────────────────────────────────
    // Reuse the inventory across level transitions (stored in registry)
    this.inventory = this.registry.get('playerInventory') ?? new Inventory();
    this.registry.set('playerInventory', this.inventory);
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

    // ── Action bar (revive / heal ally) — same position as transit bar ────
    this._actionBarBg    = this.add.graphics().setScrollFactor(0).setDepth(9998).setVisible(false);
    this._actionBarFill  = this.add.graphics().setScrollFactor(0).setDepth(9999).setVisible(false);
    this._actionBarLabel = this.add.text(GAME_W / 2, TRANSIT_BAR_Y - 18, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ff88cc',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9999).setVisible(false);

    // ── Ally interaction state ────────────────────────────────────────────
    this._allyAction        = null;   // null | 'revive' | 'heal'
    this._allyActionTimer   = 0;      // ms elapsed
    this._allyActionTarget  = null;   // RemotePlayer being acted on
    this._allyPrompts       = new Map(); // netId → Phaser.Text (world-space prompts)

    // ── Down state (local player is downed, waiting for revive) ──────────
    this._downTimer = 0;    // ms spent down — auto-death at DOWN_TIMEOUT
    this._downOverlay = null;

    // ── Music ─────────────────────────────────────────────────────────────
    this.sound.stopByKey('music_street');
    this.sound.stopByKey('music_naval');
    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');
    this.bgMusic = this.sound.add('music_street', { loop: true, volume: savedVol });
    this.bgMusic.play();
    this.registry.set('sfxVol', parseFloat(localStorage.getItem('RAGEDERUE_sfx_vol') ?? '0.5'));

    // ── Mobile controls (touch devices only) ─────────────────────────────
    this._mobileActive = IS_MOBILE;
    if (this._mobileActive) {
      this.scene.launch('MobileControlsScene', {
        player:      this.player,
        onInteract:  () => this._interact(),
        onInventory: () => this._openInventory(),
        onPause:     () => this._toggleSettings(),
      });
    }

    // ── Search cooldown ───────────────────────────────────────────────────
    this._searchCooldown = 0;
    this.scene.get('SearchScene').events.on('shutdown', () => { this._searchCooldown = 500; });
    this.scene.get('HideoutChestScene').events.on('shutdown', () => { this._searchCooldown = 500; });
  }

  // ──────────────────────────────────────────────── update ─────────────
  update(time, delta) {
    if (this._gameEnded) return;

    if (this._searchCooldown > 0) this._searchCooldown -= delta;

    // Decrement timer locally so it runs even without server sync
    if (!this._levelConfig.isPlanque) {
      this.runTimer = Math.max(0, this.runTimer - delta / 1000);
    }

    this.enemies = this.enemies.filter(e => e.active);
    this.player.update(this.inputCtrl.cursors, this.inputCtrl.wasd);
    this.enemies.forEach(e => e.update(this.player));
    this.combat.update([this.player, ...this.enemies]);

    if (this.player.hp <= 0) {
      // If allies are present, go down and wait for revive
      if (this.remotePlayers.size > 0 && this.player.state === 'dead') {
        this._handleDownState(delta);
        return;  // don't process the rest of update while down
      }
      return this._endGame('over', 'DEAD');
    }

    // If player was just revived (hp > 0 again after being down), clean up overlay
    if (this._downOverlay) { this._clearDownOverlay(); }

    // ── Ally prompts (revive / heal) ──────────────────────────────────────
    this._updateAllyPrompts();

    // ── Ally action countdown ─────────────────────────────────────────────
    this._updateAllyAction(delta);

    this.registry.set('runTimer', this.runTimer);

    // ── Search proximity ───────────────────────────────────────────────────
    const searchResult = this.lootSystem.update(this.player, this.enemies);
    if (searchResult) {
      const gp  = this.registry.get('inputMode') === 'gp';
      const key = gp ? '[Y]' : '[E]';
      const t   = searchResult.target;
      const lbl = t.isHideoutChest    ? `${key} Coffre`
                : t.isUpgradeStation ? `${key} Améliorations`
                : t.texture === 'toolbox' ? `${key} Toolbox`
                : `${key} Search`;
      this._searchPrompt.setText(lbl).setVisible(true);
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

    // Auto-start countdown on zone entry; cancel if player leaves
    const zoneValid = inZone && !(inZone.type === 'warp' && !inZone.targetLevel);
    if (this._transitActive && !inZone) {
      this._cancelTransit();
    } else if (zoneValid && !this._transitActive) {
      this._startTransit();
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
          return this._warpToLevel(inZone.targetLevel, inZone.targetWarpId ?? null);
        }
      }
    }

    // Prompt visible seulement pour les warps sans destination (non configurés)
    if (inZone && inZone.type === 'warp' && !inZone.targetLevel) {
      const zoneW    = inZone.width ?? 120;
      const zoneTopY = inZone.y ?? (this.laneTop - 30);
      this._transitPrompt
        .setText('(warp non configuré)')
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
    const action   = zone.type === 'extract' ? 'EXTRACTION' : this._warpLabel(zone).toUpperCase();

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

  // ── Down state (local player downed, waiting for revive) ─────────────
  _handleDownState(delta) {
    this._downTimer += delta;

    // Show / update "À TERRE" overlay
    if (!this._downOverlay) {
      const bg = this.add.rectangle(GAME_W / 2, GAME_H / 2 - 30, 320, 60, 0x000000, 0.75)
        .setScrollFactor(0).setDepth(50001);
      const txt = this.add.text(GAME_W / 2, GAME_H / 2 - 30, 'À TERRE — Attendez le revive', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ff4444',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(50002);
      const timer = this.add.text(GAME_W / 2, GAME_H / 2 + 4, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#aaaaaa',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(50002);
      this.tweens.add({ targets: txt, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
      this._downOverlay = { bg, txt, timer };
    }
    const secsLeft = Math.max(0, (DOWN_TIMEOUT - this._downTimer) / 1000).toFixed(0);
    this._downOverlay.timer.setText(`${secsLeft}s avant mort définitive`);

    if (this._downTimer >= DOWN_TIMEOUT) {
      this._clearDownOverlay();
      this._endGame('over', 'DEAD');
    }
  }

  _clearDownOverlay() {
    if (this._downOverlay) {
      this._downOverlay.bg.destroy();
      this._downOverlay.txt.destroy();
      this._downOverlay.timer.destroy();
      this._downOverlay = null;
    }
    this._downTimer = 0;
  }

  // ── Ally prompts on nearby remote players ─────────────────────────────
  _updateAllyPrompts() {
    const gp  = this.registry.get('inputMode') === 'gp';
    const key = gp ? '[Y]' : '[E]';
    const seen = new Set();

    for (const [id, rp] of this.remotePlayers) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
      if (dist > ALLY_RADIUS) {
        const p = this._allyPrompts.get(id);
        if (p) { p.destroy(); this._allyPrompts.delete(id); }
        continue;
      }

      const isDown   = rp.state === 'dead';
      const isHurt   = !isDown && rp.hp < 60;
      const canHeal  = isHurt && this.inventory.items.some(i => i.identified && (i.def.healAmount ?? 0) > 0);

      if (!isDown && !canHeal) {
        const p = this._allyPrompts.get(id);
        if (p) { p.destroy(); this._allyPrompts.delete(id); }
        continue;
      }

      seen.add(id);
      const label = isDown
        ? `${key} Relever ${rp.netName}`
        : `${key} Soigner ${rp.netName}`;

      let prompt = this._allyPrompts.get(id);
      if (!prompt) {
        prompt = this.add.text(rp.x, rp.y - 68, label, {
          fontFamily: 'monospace', fontSize: '11px', color: isDown ? '#ff6666' : '#66ff99',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(9999);
        this.tweens.add({ targets: prompt, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
        this._allyPrompts.set(id, prompt);
      } else {
        prompt.setPosition(rp.x, rp.y - 68).setText(label)
          .setColor(isDown ? '#ff6666' : '#66ff99');
      }
    }

    // Remove prompts for players who left
    for (const [id, p] of this._allyPrompts) {
      if (!seen.has(id) && !this.remotePlayers.has(id)) {
        p.destroy(); this._allyPrompts.delete(id);
      }
    }
  }

  // ── Ally action bar (revive / heal) ──────────────────────────────────
  _updateAllyAction(delta) {
    if (!this._allyAction) return;
    const rp = this._allyActionTarget;

    // Cancel if ally moved away or is no longer in the right state
    if (!rp || !rp.active) { this._cancelAllyAction(); return; }
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
    if (dist > ALLY_RADIUS + 20) { this._cancelAllyAction(); return; }
    if (this._allyAction === 'revive' && rp.state !== 'dead') { this._cancelAllyAction(); return; }

    this._allyActionTimer += delta;
    const duration = this._allyAction === 'revive' ? REVIVE_DURATION : HEAL_DURATION;
    const pct      = Math.min(1, this._allyActionTimer / duration);
    const color    = this._allyAction === 'revive' ? 0xff6666 : 0x66ff99;
    const label    = this._allyAction === 'revive'
      ? `REVIVE  ${rp.netName}  ${((duration - this._allyActionTimer) / 1000).toFixed(1)}s`
      : `SOIN    ${rp.netName}  ${((duration - this._allyActionTimer) / 1000).toFixed(1)}s`;

    this._actionBarBg.clear().setVisible(true)
      .fillStyle(0x000000, 0.75)
      .fillRect(TRANSIT_BAR_X - 2, TRANSIT_BAR_Y - 2, TRANSIT_BAR_W + 4, TRANSIT_BAR_H + 4)
      .lineStyle(1, color, 0.6)
      .strokeRect(TRANSIT_BAR_X - 2, TRANSIT_BAR_Y - 2, TRANSIT_BAR_W + 4, TRANSIT_BAR_H + 4);
    this._actionBarFill.clear().setVisible(true)
      .fillStyle(color, 0.9)
      .fillRect(TRANSIT_BAR_X, TRANSIT_BAR_Y, Math.round(TRANSIT_BAR_W * pct), TRANSIT_BAR_H);
    this._actionBarLabel.setText(label).setVisible(true);

    if (this._allyActionTimer >= duration) {
      this._completeAllyAction();
    }
  }

  _cancelAllyAction() {
    this._allyAction       = null;
    this._allyActionTimer  = 0;
    this._allyActionTarget = null;
    this._actionBarBg.setVisible(false);
    this._actionBarFill.setVisible(false);
    this._actionBarLabel.setVisible(false);
  }

  _completeAllyAction() {
    const rp = this._allyActionTarget;
    if (!rp) { this._cancelAllyAction(); return; }

    if (this._allyAction === 'revive') {
      // Patch RemotePlayer locally for immediate visual feedback
      rp.hp    = 30;
      rp.state = 'idle';
      rp.play('player_idle', true);
      // Send C_REVIVE_PLAYER → server broadcasts S_REVIVE_PLAYER to all clients in the room
      // The revived player's client calls player.revive(30) and clears their down overlay
      if (this.net.connected) this.net.sendRevive(rp.netId);
    } else if (this._allyAction === 'heal') {
      // Use the best heal item in the inventory on the ally
      const healItem = [...this.inventory.items]
        .filter(i => i.identified && (i.def.healAmount ?? 0) > 0)
        .sort((a, b) => (a.def.healAmount ?? 0) - (b.def.healAmount ?? 0))[0];
      if (healItem) {
        this.inventory.removeItem(healItem);
        // Remote player gains HP (local visual only until server message added)
        rp.hp = Math.min(100, rp.hp + (healItem.def.healAmount ?? 20));
        if (this.net.sendSkillGain) this.net.sendSkillGain('healSkill', 15);
      }
    }
    this._cancelAllyAction();
  }

  // ── Human-readable label for a warp zone ─────────────────────────────
  _warpLabel(zone) {
    if (!zone.targetLevel) return zone.label ?? 'WARP';
    const tgtLevel = this._levelSource?.find(l => l.id === zone.targetLevel);
    if (!tgtLevel) return zone.label ?? zone.targetLevel;
    const tgtWarp  = (tgtLevel.transitZones ?? []).find(z => z.type === 'warp' && z.id === zone.targetWarpId);
    const warpName = tgtWarp ? (tgtWarp.label ?? '') : '';
    return warpName ? `${tgtLevel.name} / ${warpName}` : tgtLevel.name;
  }

  // ── Warp to another level ─────────────────────────────────────────────
  _warpToLevel(targetLevelId, targetWarpId = null) {
    if (this._gameEnded) return;
    this._gameEnded = true;
    // Persist wallet so it survives the scene restart
    this.registry.set('playerWallet', this.player.wallet ?? 0);
    // Keep the shared net connection alive for the next scene — don't disconnect
    // (only disconnect if we own it AND we're going to the editor, not another game level)
    if (this._fromEditor) {
      if (this._netOwner) this.net.disconnect();
      this.registry.remove('sharedNet');
    }
    // Clear net callbacks so they don't fire during the transition gap
    this.net.onDisconnect    = null;
    this.net.onSnapshot      = null;
    this.net.onEnemySnapshot = null;
    this.net.onTimerSync     = null;
    this.net.onWorldReset    = null;
    this.net.onPlayerLeave   = null;
    for (const [, rp] of this.remotePlayers) rp.destroy();
    this.remotePlayers.clear();
    ['HUDScene','SearchScene','HideoutChestScene','InventoryScene','PauseScene','MobileControlsScene'].forEach(k => this.scene.stop(k));
    this.player.searching = false;
    this.player.inMenu    = false;
    if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
    if (this._fromEditor) {
      this.scene.start('LevelEditorScene');
    } else {
      this.scene.start('GameScene', { levelId: targetLevelId, spawnAtWarpId: targetWarpId });
    }
  }

  // ── End game ──────────────────────────────────────────────────────────
  _endGame(result, reason) {
    if (this._gameEnded) return;
    this._gameEnded = true;
    // Clear persistent inventory/wallet so the next run starts fresh
    this.registry.remove('playerInventory');
    this.registry.remove('playerWallet');
    // End of run — always disconnect and clear shared net
    this.net.disconnect();
    this.registry.remove('sharedNet');
    for (const [, rp] of this.remotePlayers) rp.destroy();
    this.remotePlayers.clear();
    ['HUDScene','SearchScene','HideoutChestScene','InventoryScene','PauseScene','MobileControlsScene'].forEach(k => this.scene.stop(k));
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
    if (this.scene.isActive('PauseScene'))     { this.player.inMenu = false; this.input.keyboard.enabled = true; this.scene.stop('PauseScene'); return; }
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.player.inMenu = true;
    this.player.setVelocity(0, 0);
    this.input.keyboard.enabled = false;  // évite que les flèches du menu traversent vers le joueur
    this.scene.launch('PauseScene', { fromScene: 'GameScene', fromEditor: this._fromEditor });
  }

  // ── Interact ─────────────────────────────────────────────────────────
  _interact() {
    if (this._gameEnded || this.player.searching || this._searchCooldown > 0) return;
    // Don't interact with world while downed
    if (this.player.state === 'dead') return;

    // ── Cancel ongoing ally action if E pressed again ─────────────────
    if (this._allyAction) { this._cancelAllyAction(); return; }

    // ── Check for nearby ally to revive / heal ────────────────────────
    let bestAlly = null, bestDist = ALLY_RADIUS;
    for (const [, rp] of this.remotePlayers) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
      if (dist > bestDist) continue;
      const isDown  = rp.state === 'dead';
      const canHeal = !isDown && rp.hp < 60
        && this.inventory.items.some(i => i.identified && (i.def.healAmount ?? 0) > 0);
      if (isDown || canHeal) { bestDist = dist; bestAlly = { rp, isDown }; }
    }
    if (bestAlly) {
      this._allyAction       = bestAlly.isDown ? 'revive' : 'heal';
      this._allyActionTimer  = 0;
      this._allyActionTarget = bestAlly.rp;
      return;
    }

    const target = this.lootSystem.nearestTarget;
    if (!target) return;
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.player.searching = true;
    this.player.setVelocity(0, 0);
    if (target.isHideoutChest) {
      this.scene.launch('HideoutChestScene', { inventory: this.inventory, player: this.player, net: this.net });
    } else if (target.isUpgradeStation) {
      const upgrades   = { ...(this.player.upgrades ?? {}) };
      const chestItems = (this.registry.get('chestItems') ?? []).slice();
      this.scene.launch('HideoutUpgradeScene', { upgrades, chestItems, player: this.player, net: this.net });
    } else {
      this.scene.launch('SearchScene', { target, inventory: this.inventory, player: this.player, net: this.net });
    }
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
