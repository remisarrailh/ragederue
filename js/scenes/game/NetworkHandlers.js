/**
 * NetworkHandlers — binds all net.onXxx callbacks for GameScene.
 * Keeps network wiring isolated so GameScene stays readable.
 *
 * On disconnect: shows a "reconnexion…" overlay and lets the auto-reconnect
 * logic in NetworkManager handle the retry. The game keeps running locally
 * (paused enemy AI, player frozen) until the connection comes back.
 * If the server gives up after max attempts, _endGame is called.
 */
import RemotePlayer from '../../network/RemotePlayer.js';
import { GAME_W, GAME_H } from '../../config/constants.js';

export default class NetworkHandlers {
  constructor(scene) {
    this.scene = scene;
    this._overlay = null;  // reconnect overlay group
  }

  setup() {
    const scene = this.scene;
    const net   = scene.net;

    net.onWelcome = (id) => {
      console.log(`[Game] Connected as player #${id}`);
    };

    net.onSnapshot = (players) => {
      const seen = new Set();
      for (const p of players) {
        if (p.id === net.playerId) continue;
        seen.add(p.id);
        let rp = scene.remotePlayers.get(p.id);
        if (!rp) {
          rp = new RemotePlayer(scene, p.id, `Player ${p.id}`, p.x, p.y);
          scene.remotePlayers.set(p.id, rp);
        }
        rp.applySnapshot(p);
      }
      for (const [id, rp] of scene.remotePlayers) {
        if (!seen.has(id)) {
          rp.destroy();
          scene.remotePlayers.delete(id);
        }
      }
    };

    net.onEnemySnapshot = (enemyData) => {
      scene._syncEnemiesFromServer(enemyData);
    };

    net.onLootData = (targetKind, targetId, items) => {
      if (targetKind === 0) {
        // Container
        const c = scene.lootSystem.containers.find(c => c.netId === targetId);
        if (c) c.lootItems = items;
      } else {
        // Corpse
        const e = scene.enemies.find(e => e.netId === targetId);
        if (e) {
          e.lootItems  = items;
          e.searchable = true;
          e.searched   = false;
        } else {
          scene._pendingCorpseLoot.set(targetId, items);
        }
      }
    };

    net.onTimerSync = (remainingTime) => {
      scene.runTimer = remainingTime;
    };

    net.onSkills = (skills) => {
      if (scene.player) scene.player.skills = skills;
    };

    net.onWorldReset = (remainingTime) => {
      console.log('[Game] World reset received — new timer:', remainingTime);
      scene._handleWorldReset(remainingTime);
    };

    net.onPlayerLeave = (id) => {
      const rp = scene.remotePlayers.get(id);
      if (rp) {
        rp.destroy();
        scene.remotePlayers.delete(id);
      }
    };

    // ── Disconnect: show overlay, let NetworkManager retry ───────────────
    net.onDisconnect = () => {
      if (scene._gameEnded) return;
      console.warn('[Game] Disconnected — showing reconnect overlay');
      this._showReconnectOverlay();
      // Freeze the player
      if (scene.player) scene.player.setVelocity(0, 0);
    };

    // ── Reconnect succeeded: hide overlay ────────────────────────────────
    net.onReconnect = () => {
      console.log('[Game] Reconnected — resuming');
      this._hideReconnectOverlay();
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Reconnect overlay (screen-space, above everything)
  // ─────────────────────────────────────────────────────────────────────────

  _showReconnectOverlay() {
    if (this._overlay) return;  // already shown

    const scene = this.scene;
    const depth = 50000;

    const bg = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.65)
      .setScrollFactor(0).setDepth(depth);

    const title = scene.add.text(GAME_W / 2, GAME_H / 2 - 22, 'CONNEXION PERDUE', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff4444',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);

    const sub = scene.add.text(GAME_W / 2, GAME_H / 2 + 14, 'Reconnexion en cours…', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaacc',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);

    scene.tweens.add({ targets: sub, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    // "Quitter" button in case reconnect never succeeds
    const btnBg = scene.add.rectangle(GAME_W / 2, GAME_H / 2 + 52, 140, 36, 0x553333, 0.9)
      .setInteractive({ useHandCursor: true }).setScrollFactor(0).setDepth(depth + 1)
      .setStrokeStyle(2, 0xffffff, 0.4);
    const btnLbl = scene.add.text(GAME_W / 2, GAME_H / 2 + 52, 'QUITTER', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 2);

    btnBg.on('pointerdown', () => {
      // User explicitly gives up — end the game
      scene.net.disconnect();
      scene.registry.remove('sharedNet');
      scene._endGame('over', 'DISCONNECTED');
    });

    this._overlay = { bg, title, sub, btnBg, btnLbl };
  }

  _hideReconnectOverlay() {
    if (!this._overlay) return;
    const { bg, title, sub, btnBg, btnLbl } = this._overlay;
    [bg, title, sub, btnBg, btnLbl].forEach(o => o.destroy());
    this._overlay = null;
  }
}
