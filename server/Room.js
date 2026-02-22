/**
 * Room — persistent game world that lives independently of players.
 * Server-authoritative: enemies, loot, and the world timer are all managed here.
 * When the timer expires the world resets (enemies, corpses, loot) and a new
 * cycle begins.  The room is NEVER destroyed — it stays alive even with 0 players.
 */

const Protocol    = require('./Protocol');
const Broadcaster = require('./Broadcaster');
const { WaveSpawner, MAX_ENEMIES } = require('./WaveSpawner');

const TICK_RATE = 20; // Hz
const TICK_MS   = 1000 / TICK_RATE;

// ── World timer (seconds) ──────────────────────────────────────────────────
const RUN_TIMER = 600;  // mirrors client lootTable.js

// ── Container spawn definitions ────────────────────────────────────────────
const CONTAINER_SPAWNS = [
  { x: 420,  y: 415, texture: 'barrel' },
  { x: 780,  y: 450, texture: 'barrel' },
  { x: 1200, y: 390, texture: 'barrel' },
  { x: 1700, y: 455, texture: 'barrel' },
  { x: 2350, y: 395, texture: 'barrel' },
  { x: 3100, y: 445, texture: 'barrel' },
];

// ── Loot tables ────────────────────────────────────────────────────────────
const CONTAINER_LOOT_TABLE = [
  { type: 'ethereum',  weight: 15 },
  { type: 'sushi',     weight: 30 },
  { type: 'pizza',     weight: 20 },
  { type: 'ice_cream', weight: 35 },
];

const CORPSE_LOOT_TABLE = [
  { type: 'ethereum',  weight: 40 },
  { type: 'sushi',     weight: 25 },
  { type: 'ice_cream', weight: 25 },
  { type: 'pizza',     weight: 10 },
];

const CONTAINER_ITEM_COUNT = { min: 1, max: 3 };
const CORPSE_ITEM_COUNT    = { min: 1, max: 2 };

/** Roll items from a weighted loot table. */
function rollLoot(table, count) {
  const total = table.reduce((s, e) => s + e.weight, 0);
  const results = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total;
    for (const entry of table) {
      r -= entry.weight;
      if (r <= 0) { results.push(entry.type); break; }
    }
  }
  return results;
}

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

class Room {
  /**
   * @param {string} name  Room/map identifier
   */
  constructor(name) {
    this.name = name;

    /** @type {Map<number, object>} playerId → player */
    this.players = new Map();

    /** @type {ServerEnemy[]} */
    this.enemies = [];

    /** @type {number} Next enemy network ID */
    this._nextEnemyId = 1;

    /** @type {number} Accumulated time for timer sync broadcast (ms) */
    this._timerSyncAccumulator = 0;

    /** @type {Array<{id:number, loot:string[]}>} Container loot */
    this.containerLoot = [];

    /** @type {number} World timer countdown (seconds) */
    this.worldTimer = RUN_TIMER;

    // ── Sub-systems ───────────────────────────────────────────────────────
    this.broadcaster = new Broadcaster(this.players);
    this.wavespawner = new WaveSpawner(() => this._nextEnemyId++);

    // ── Tick performance stats ────────────────────────────────────────────
    this.stats = {
      tickCount:    0,
      tickTimeSum:  0,
      tickTimeMax:  0,
    };

    this._generateContainerLoot();
    this._interval = setInterval(() => this._tick(), TICK_MS);
    console.log(`[Room ${this.name}] Created — world timer: ${this.worldTimer}s`);
  }

  // ── Player management ──────────────────────────────────────────────────

  addPlayer(player) {
    this.players.set(player.id, player);

    // Sync timer
    this.broadcaster.sendTo(player, Protocol.encodeTimerSync(this.worldTimer));

    // Send existing container loot
    for (const c of this.containerLoot) {
      this.broadcaster.sendTo(player, Protocol.encodeLootData(0, c.id, c.loot));
    }

    // Send loot for any already-dead enemies
    for (const e of this.enemies) {
      if (e.state === 'dead' && e.lootItems && e.lootItems.length > 0) {
        this.broadcaster.sendTo(player, Protocol.encodeLootData(1, e.netId, e.lootItems));
      }
    }
  }

  removePlayer(player) {
    this.players.delete(player.id);
    // Room stays alive even with 0 players
  }

  // ── Combat ─────────────────────────────────────────────────────────────

  hitEnemy(netId, damage, knockback, fromX) {
    const enemy = this.enemies.find(e => e.netId === netId);
    if (!enemy) return;
    if (enemy.state === 'dead') return;
    const died = enemy.takeHit(damage, knockback, fromX);
    if (died) {
      const count = randBetween(CORPSE_ITEM_COUNT.min, CORPSE_ITEM_COUNT.max);
      enemy.lootItems = rollLoot(CORPSE_LOOT_TABLE, count);
      this.broadcaster.broadcast(Protocol.encodeLootData(1, enemy.netId, enemy.lootItems));
    }
  }
  // ── Loot management ─────────────────────────────────────────────────

  /**
   * A player takes an item from a container or corpse.
   * Removes it from the server-side loot array and broadcasts the update.
   */
  takeItem(targetKind, targetId, itemIdx) {
    let lootArray = null;

    if (targetKind === 0) {
      // Container
      const c = this.containerLoot.find(c => c.id === targetId);
      if (c) lootArray = c;
    } else {
      // Corpse
      const e = this.enemies.find(e => e.netId === targetId);
      if (e && e.lootItems) lootArray = { id: e.netId, loot: e.lootItems };
    }

    if (!lootArray || itemIdx < 0 || itemIdx >= lootArray.loot.length) return;

    // Remove the item at the given index
    lootArray.loot.splice(itemIdx, 1);

    // If it was a corpse, sync back
    if (targetKind === 1) {
      const e = this.enemies.find(e => e.netId === targetId);
      if (e) e.lootItems = lootArray.loot;
    }

    // Broadcast updated loot to ALL players
    this.broadcaster.broadcast(Protocol.encodeLootData(targetKind, targetId, lootArray.loot));
  }

  // ── Networking proxy (public interface used by index.js) ───────────────

  broadcast(data, excludeId) { this.broadcaster.broadcast(data, excludeId); }
  recordIncoming(byteLength) { this.broadcaster.recordIncoming(byteLength); }

  // ── Tick loop ──────────────────────────────────────────────────────────

  _tick() {
    const tickStart = Date.now();
    const dtSec = TICK_MS / 1000;

    // ── World timer countdown (always ticking) ─────────────────────────
    this.worldTimer -= dtSec;
    if (this.worldTimer <= 0) {
      this._resetWorld();
      return;
    }

    // ── If no players, scatter living enemies so they don't clump ───────
    const playerList = Array.from(this.players.values());
    const hasPlayers = playerList.length > 0;

    if (!hasPlayers) this.wavespawner.scatter(this.enemies);

    // Update enemies (only if players are present to chase)
    if (hasPlayers) {
      for (const e of this.enemies) e.update(TICK_MS, playerList);
    }

    // Wave spawner (always runs, even with 0 players)
    this.wavespawner.tick(TICK_MS, this.enemies, playerList);

    // Broadcast timer sync every ~1s
    this._timerSyncAccumulator += TICK_MS;
    if (this._timerSyncAccumulator >= 1000) {
      this._timerSyncAccumulator -= 1000;
      this.broadcaster.broadcast(Protocol.encodeTimerSync(this.worldTimer));
    }

    // Build and send snapshots
    const playerBuf = Buffer.from(Protocol.encodeRoomSnapshot(playerList));
    const enemyBuf  = Protocol.encodeEnemySnapshot(this.enemies);

    for (const [, p] of this.players) {
      if (p.ws.readyState !== 1) continue;
      p.ws.send(playerBuf, { binary: true });
      p.ws.send(enemyBuf,  { binary: true });
      this.broadcaster.bytesSent += playerBuf.length + enemyBuf.length;
      this.broadcaster.msgsSent  += 2;
    }

    // Track tick performance
    const tickMs = Date.now() - tickStart;
    this.stats.tickCount++;
    this.stats.tickTimeSum += tickMs;
    if (tickMs > this.stats.tickTimeMax) this.stats.tickTimeMax = tickMs;
  }

  // ── World reset ────────────────────────────────────────────────────────

  _resetWorld() {
    console.log(`[Room ${this.name}] ⏰ Timer expired — resetting world`);

    // Reset timer
    this.worldTimer = RUN_TIMER;

    // Clear enemies (no initial spawn — waves handle population)
    this.enemies = [];
    this._nextEnemyId = 1;
    this.wavespawner.reset();

    // Regenerate container loot
    this.containerLoot = [];
    this._generateContainerLoot();

    // Broadcast reset to all connected players (with new timer)
    this.broadcaster.broadcast(Protocol.encodeWorldReset(this.worldTimer));

    // Send new container loot to all
    for (const c of this.containerLoot) {
      this.broadcaster.broadcast(Protocol.encodeLootData(0, c.id, c.loot));
    }

    console.log(`[Room ${this.name}] World reset complete — ${this.enemies.length} enemies, ${this.containerLoot.length} containers`);
  }

  // ── Enemy spawning ─────────────────────────────────────────────────────

  /** Return a snapshot of room stats for monitoring. */
  getStats() {
    const b = this.broadcaster;
    const elapsed = (Date.now() - b._lastReset) / 1000 || 1;
    const alive = this.enemies.filter(e => e.state !== 'dead').length;
    const dead  = this.enemies.length - alive;
    const totalLoot = this.containerLoot.reduce((s, c) => s + c.loot.length, 0)
      + this.enemies.reduce((s, e) => s + (e.lootItems ? e.lootItems.length : 0), 0);

    return {
      room: this.name,
      players: this.players.size,
      playerList: Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, state: p.state,
      })),
      enemiesAlive: alive,
      enemiesDead: dead,
      enemiesTotal: this.enemies.length,
      maxEnemies: MAX_ENEMIES,
      lootItems: totalLoot,
      worldTimer: Math.round(this.worldTimer),
      worldTimerMax: RUN_TIMER,
      bandwidth: {
        bytesSentTotal:  b.bytesSent,
        bytesRecvTotal:  b.bytesReceived,
        bytesSentPerSec: Math.round(b.bytesSent     / elapsed),
        bytesRecvPerSec: Math.round(b.bytesReceived / elapsed),
        msgsSentPerSec:  Math.round(b.msgsSent      / elapsed),
        msgsRecvPerSec:  Math.round(b.msgsReceived  / elapsed),
      },
      tick: {
        rate:  TICK_RATE,
        avgMs: this.stats.tickCount ? +(this.stats.tickTimeSum / this.stats.tickCount).toFixed(2) : 0,
        maxMs: this.stats.tickTimeMax,
        count: this.stats.tickCount,
      },
    };
  }

  /** Reset rolling stats counters. */
  resetStats() {
    this.broadcaster.resetStats();
    this.stats.tickCount   = 0;
    this.stats.tickTimeSum = 0;
    this.stats.tickTimeMax = 0;
  }

  stop() {
    clearInterval(this._interval);
  }

  // ── Container loot generation ─────────────────────────────────────────

  _generateContainerLoot() {
    for (let i = 0; i < CONTAINER_SPAWNS.length; i++) {
      const count = randBetween(CONTAINER_ITEM_COUNT.min, CONTAINER_ITEM_COUNT.max);
      const loot = rollLoot(CONTAINER_LOOT_TABLE, count);
      this.containerLoot.push({ id: i, loot });
    }
    console.log(`[Room ${this.name}] Generated loot for ${this.containerLoot.length} containers`);
  }
}

module.exports = Room;
