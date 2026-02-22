import {
  encodeJoin,
  encodePlayerState,
  encodeHitEnemy,
  encodeTakeItem,
  getMsgType,
  decodeWelcome,
  decodeRoomSnapshot,
  decodePlayerJoin,
  decodePlayerLeave,
  decodeEnemySnapshot,
  decodeLootData,
  decodeTimerMsg,
  S_WELCOME,
  S_ROOM_SNAPSHOT,
  S_PLAYER_JOIN,
  S_PLAYER_LEAVE,
  S_ENEMY_SNAPSHOT,
  S_LOOT_DATA,
  S_WORLD_RESET,
  S_TIMER_SYNC,
} from './NetProtocol.js';

/**
 * NetworkManager — manages the WebSocket connection to the game server.
 *
 * Usage:
 *   const net = new NetworkManager();
 *   net.connect('ws://localhost:9000', 'MyName', 'street_01');
 *
 * Events (via callbacks):
 *   onWelcome(playerId)
 *   onSnapshot(players[])
 *   onPlayerJoin(id, name)
 *   onPlayerLeave(id)
 *   onDisconnect()
 */
export default class NetworkManager {
  constructor() {
    /** @type {WebSocket|null} */
    this.ws = null;
    this.connected = false;
    this.playerId = -1;

    // ── Callbacks (set by consumer) ───────────────────────────────────────
    this.onWelcome       = null;  // (playerId) => {}
    this.onSnapshot      = null;  // (players[]) => {}
    this.onPlayerJoin    = null;  // (id, name) => {}
    this.onPlayerLeave   = null;  // (id) => {}
    this.onEnemySnapshot = null;  // (enemies[]) => {}
    this.onLootData      = null;  // (targetKind, targetId, items[]) => {}
    this.onWorldReset    = null;  // (remainingTime) => {}
    this.onTimerSync     = null;  // (remainingTime) => {}
    this.onDisconnect    = null;  // () => {}

    // ── Rate limiter ──────────────────────────────────────────────────────
    this._sendInterval = 50;  // ms (20 Hz)
    this._lastSendTime = 0;
  }

  /**
   * Parse URL query params and connect if server info is present.
   * @returns {boolean} true if connecting, false if solo mode
   */
  autoConnect(playerName = 'Player') {
    const params = new URLSearchParams(window.location.search);
    const server = params.get('server') || 'localhost';
    const port   = params.get('port') || '9000';
    const name   = params.get('name') || playerName;
    const room   = params.get('room') || 'street_01';

    // Use wss:// if ssl=true param, or if page served over HTTPS
    const ssl = params.get('ssl') === 'true' || window.location.protocol === 'https:';
    const protocol = ssl ? 'wss' : 'ws';
    const url = `${protocol}://${server}:${port}`;
    this.connect(url, name, room);
    return true;
  }

  /**
   * Connect to WebSocket server.
   */
  connect(url, name, room) {
    console.log(`[Net] Connecting to ${url}...`);
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[Net] Connected');
      this.connected = true;
      // Send JOIN
      this.ws.send(encodeJoin(name, room));
    };

    this.ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this.ws.onclose = () => {
      console.log('[Net] Disconnected');
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
    };

    this.ws.onerror = (err) => {
      console.warn('[Net] WebSocket error', err);
    };
  }

  /**
   * Send local player state (rate-limited to 20 Hz).
   */
  sendState(x, y, velX, velY, state, facing, hp) {
    if (!this.connected) return;
    const now = performance.now();
    if (now - this._lastSendTime < this._sendInterval) return;
    this._lastSendTime = now;

    this.ws.send(encodePlayerState(x, y, velX, velY, state, facing, hp));
  }

  /**
   * Notify server that the local player hit an enemy.
   */
  sendHitEnemy(enemyNetId, damage, knockback, fromX) {
    if (!this.connected) return;
    this.ws.send(encodeHitEnemy(enemyNetId, damage, knockback, fromX));
  }

  /**
   * Notify server that the local player took an item from a container/corpse.
   * @param {number} targetKind  0=container, 1=corpse
   * @param {number} targetId    Container netId or enemy netId
   * @param {number} itemIdx     Index of the item in the loot array
   */
  sendTakeItem(targetKind, targetId, itemIdx) {
    if (!this.connected) return;
    this.ws.send(encodeTakeItem(targetKind, targetId, itemIdx));
  }

  /**
   * Disconnect cleanly.
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _handleMessage(data) {
    const type = getMsgType(data);

    switch (type) {
      case S_WELCOME: {
        const { playerId } = decodeWelcome(data);
        this.playerId = playerId;
        console.log(`[Net] Welcome! id=${playerId}`);
        if (this.onWelcome) this.onWelcome(playerId);
        break;
      }
      case S_ROOM_SNAPSHOT: {
        const { players } = decodeRoomSnapshot(data);
        if (this.onSnapshot) this.onSnapshot(players);
        break;
      }
      case S_PLAYER_JOIN: {
        const { id, name } = decodePlayerJoin(data);
        console.log(`[Net] Player joined: ${name} (id=${id})`);
        if (this.onPlayerJoin) this.onPlayerJoin(id, name);
        break;
      }
      case S_PLAYER_LEAVE: {
        const { id } = decodePlayerLeave(data);
        console.log(`[Net] Player left: id=${id}`);
        if (this.onPlayerLeave) this.onPlayerLeave(id);
        break;
      }
      case S_ENEMY_SNAPSHOT: {
        const { enemies } = decodeEnemySnapshot(data);
        if (this.onEnemySnapshot) this.onEnemySnapshot(enemies);
        break;
      }
      case S_LOOT_DATA: {
        const { targetKind, targetId, items } = decodeLootData(data);
        if (this.onLootData) this.onLootData(targetKind, targetId, items);
        break;
      }
      case S_WORLD_RESET: {
        const { remainingTime } = decodeTimerMsg(data);
        console.log(`[Net] World reset! Timer: ${remainingTime}s`);
        if (this.onWorldReset) this.onWorldReset(remainingTime);
        break;
      }
      case S_TIMER_SYNC: {
        const { remainingTime } = decodeTimerMsg(data);
        if (this.onTimerSync) this.onTimerSync(remainingTime);
        break;
      }
      default:
        console.warn(`[Net] Unknown message type: 0x${type.toString(16)}`);
    }
  }
}
