import {
  encodeJoin,
  encodePlayerState,
  encodeHitEnemy,
  encodeTakeItem,
  encodeCharListReq,
  encodeCharSelect,
  encodeCharDelete,
  encodeChestSave,
  encodeSkillGain,
  getMsgType,
  decodeWelcome,
  decodeRoomSnapshot,
  decodePlayerJoin,
  decodePlayerLeave,
  decodeEnemySnapshot,
  decodeLootData,
  decodeTimerMsg,
  decodeCharList,
  decodeJoinRefused,
  decodeChestData,
  decodeSkills,
  S_WELCOME,
  S_ROOM_SNAPSHOT,
  S_PLAYER_JOIN,
  S_PLAYER_LEAVE,
  S_ENEMY_SNAPSHOT,
  S_LOOT_DATA,
  S_WORLD_RESET,
  S_TIMER_SYNC,
  S_CHAR_LIST,
  S_JOIN_REFUSED,
  S_CHEST_DATA,
  S_SKILLS,
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
    this.onReconnect     = null;  // () => void — called when reconnection succeeds
    this.onCharList      = null;  // (characters[]) => {}
    this.onJoinRefused   = null;  // (reason: string) => {}
    this.onChestData     = null;  // (items: string[]) => {}
    this.onSkills        = null;  // (skills: {skillName: totalXP}) => {}

    // ── Rate limiter ──────────────────────────────────────────────────────
    this._sendInterval = 50;  // ms (20 Hz)
    this._lastSendTime = 0;

    // ── Reconnect state ───────────────────────────────────────────────────
    this._reconnectUrl     = null;   // last URL used by connect() or connectRaw()
    this._reconnectName    = null;   // player name for C_JOIN
    this._reconnectRoom    = null;   // room name for C_JOIN
    this._reconnectCharId  = '';     // charId sent in C_JOIN
    this._reconnectRaw     = false;  // true if last connect was connectRaw
    this._reconnectTimer   = null;   // setTimeout handle
    this._reconnectAttempt = 0;
    this._reconnectMax     = 10;     // give up after 10 attempts
    this._reconnecting     = false;
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
   * Connect to WebSocket server without sending C_JOIN.
   * Used by CharacterScene to browse characters before entering a room.
   */
  connectRaw(url) {
    this._reconnectUrl  = url;
    this._reconnectRaw  = true;
    this._reconnecting  = false;
    this._reconnectAttempt = 0;
    this._openRaw(url);
  }

  _openRaw(url) {
    console.log(`[Net] Connecting (raw) to ${url}...`);
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[Net] Connected (raw)');
      this.connected = true;
      this._reconnectAttempt = 0;
      this._reconnecting = false;
      if (this._reconnecting) return;
      if (this.onConnect) this.onConnect();
      if (this.onReconnect && this._reconnectAttempt > 0) this.onReconnect();
    };

    this.ws.onmessage = (event) => { this._handleMessage(event.data); };

    this.ws.onclose = () => {
      console.log('[Net] Disconnected (raw)');
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
      // No auto-reconnect for raw connections (CharacterScene handles it)
    };

    this.ws.onerror = (err) => { console.warn('[Net] WebSocket error', err); };
  }

  /**
   * Connect to WebSocket server.
   */
  connect(url, name, room, charId = '') {
    this._reconnectUrl    = url;
    this._reconnectName   = name;
    this._reconnectRoom   = room;
    this._reconnectCharId = charId;
    this._reconnectRaw    = false;
    this._reconnecting    = false;
    this._reconnectAttempt = 0;
    this._openConnect(url, name, room, charId);
  }

  _openConnect(url, name, room, charId = '') {
    console.log(`[Net] Connecting to ${url}${this._reconnecting ? ' (retry)' : ''}...`);
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      const wasReconnecting = this._reconnecting;
      console.log('[Net] Connected');
      this.connected = true;
      this._reconnectAttempt = 0;
      this._reconnecting = false;
      this.ws.send(encodeJoin(name, room, charId));
      if (wasReconnecting && this.onReconnect) this.onReconnect();
    };

    this.ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this.ws.onclose = () => {
      console.log('[Net] Disconnected');
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
      this._scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.warn('[Net] WebSocket error', err);
    };
  }

  /**
   * Attempt to reconnect after a disconnect (only for non-raw connections).
   */
  _scheduleReconnect() {
    if (this._reconnectRaw) return;           // CharacterScene handles its own disconnect
    if (this._reconnecting) return;            // already in progress
    if (this._reconnectAttempt >= this._reconnectMax) {
      console.warn('[Net] Max reconnect attempts reached — giving up');
      return;
    }
    this._reconnecting = true;
    this._reconnectAttempt++;
    const delay = Math.min(1000 * this._reconnectAttempt, 8000); // 1s, 2s, ... up to 8s
    console.log(`[Net] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempt}/${this._reconnectMax})...`);
    this._reconnectTimer = setTimeout(() => {
      if (!this._reconnectUrl) return;
      this._openConnect(this._reconnectUrl, this._reconnectName, this._reconnectRoom, this._reconnectCharId ?? '');
    }, delay);
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
   * (Re-)join a room on an already-open connection.
   * Called when warping between zones so the server knows the new room.
   */
  joinRoom(name, room, charId = '') {
    this._reconnectName   = name;
    this._reconnectRoom   = room;
    this._reconnectCharId = charId;
    this._send(encodeJoin(name, room, charId));
  }

  /** Request full character list from server. */
  sendCharListReq() { this._send(encodeCharListReq()); }

  /** Select (action=0) or create (action=1) a character. */
  sendCharSelect(action, value) { this._send(encodeCharSelect(action, value)); }

  /** Delete a character by id. */
  sendCharDelete(charId) { this._send(encodeCharDelete(charId)); }

  /** Save chest contents to server (charId included in message for raw connections). */
  sendChestSave(charId, items) { this._send(encodeChestSave(charId, items)); }

  /** Notify server of XP gained for a skill. */
  sendSkillGain(skillName, xp) { this._send(encodeSkillGain(skillName, xp)); }

  /**
   * Disconnect cleanly (cancels any pending reconnect).
   */
  disconnect() {
    // Cancel any scheduled reconnect
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    this._reconnecting = false;
    this._reconnectAttempt = 0;
    // Suppress the onDisconnect callback that the close event would fire
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _send(data) {
    if (this.connected && this.ws) this.ws.send(data);
  }

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
      case S_CHAR_LIST: {
        const chars = decodeCharList(data);
        if (this.onCharList) this.onCharList(chars);
        break;
      }
      case S_JOIN_REFUSED: {
        const reason = decodeJoinRefused(data);
        console.warn(`[Net] Join refused: ${reason}`);
        if (this.onJoinRefused) this.onJoinRefused(reason);
        break;
      }
      case S_CHEST_DATA: {
        const items = decodeChestData(data);
        if (this.onChestData) this.onChestData(items);
        break;
      }
      case S_SKILLS: {
        const skills = decodeSkills(data);
        if (this.onSkills) this.onSkills(skills);
        break;
      }
      default:
        console.warn(`[Net] Unknown message type: 0x${type.toString(16)}`);
    }
  }
}
