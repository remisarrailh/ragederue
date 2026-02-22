/**
 * NetworkHandlers — binds all net.onXxx callbacks for GameScene.
 * Keeps network wiring isolated so GameScene stays readable.
 */
import RemotePlayer from '../../network/RemotePlayer.js';

export default class NetworkHandlers {
  constructor(scene) {
    this.scene = scene;
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

    net.onDisconnect = () => {
      console.log('[Game] Disconnected from server');
      scene._endGame('over', 'DISCONNECTED');
    };
  }
}
