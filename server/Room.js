/**
 * Room — persistent game world that lives independently of players.
 * Server-authoritative: enemies, loot, and the world timer are all managed here.
 * When the timer expires the world resets (enemies, corpses, loot) and a new
 * cycle begins.  The room is NEVER destroyed — it stays alive even with 0 players.
 */

const Protocol = require('./Protocol');
const ServerEnemy = require('./ServerEnemy');

const TICK_RATE = 20; // Hz
const TICK_MS   = 1000 / TICK_RATE;

// ── World timer (seconds) ──────────────────────────────────────────────────
const RUN_TIMER = 600;  // mirrors client lootTable.js

// ── Enemy spawn definitions ────────────────────────────────────────────────
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

// ── Wave spawner config ────────────────────────────────────────────────────
const WAVE_INTERVAL_MS = 10_000;
const WAVE_MIN = 1;
const WAVE_MAX = 3;
const MAX_ENEMIES = 30;
const LANE_TOP = 330;
const LANE_BOTTOM = 470;
const EXTRACT_X = 3500;

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

    /** @type {number} Accumulated time for wave spawner (ms) */
    this._waveAccumulator = 0;

    /** @type {number} Accumulated time for timer sync broadcast (ms) */
    this._timerSyncAccumulator = 0;

    /** @type {Array<{id:number, loot:string[]}>} Container loot */
    this.containerLoot = [];

    /** @type {number} World timer countdown (seconds) */
    this.worldTimer = RUN_TIMER;

    // Initial world population (no enemies at startup — waves handle spawning)
    this._generateContainerLoot();

    // Start tick loop (runs forever, even with 0 players)
    this._interval = setInterval(() => this._tick(), TICK_MS);
    console.log(`[Room ${this.name}] Created — world timer: ${this.worldTimer}s`);
  }

  // ── Player management ──────────────────────────────────────────────────

  addPlayer(player) {
    this.players.set(player.id, player);

    // Sync timer
    this._sendTo(player, Protocol.encodeTimerSync(this.worldTimer));

    // Send existing container loot
    for (const c of this.containerLoot) {
      this._sendTo(player, Protocol.encodeLootData(0, c.id, c.loot));
    }

    // Send loot for any already-dead enemies
    for (const e of this.enemies) {
      if (e.state === 'dead' && e.lootItems && e.lootItems.length > 0) {
        this._sendTo(player, Protocol.encodeLootData(1, e.netId, e.lootItems));
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
      this.broadcast(Protocol.encodeLootData(1, enemy.netId, enemy.lootItems));
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
    this.broadcast(Protocol.encodeLootData(targetKind, targetId, lootArray.loot));
  }
  // ── Networking helpers ─────────────────────────────────────────────────

  /** Send data to a single player. */
  _sendTo(player, data) {
    if (player.ws.readyState === 1) {
      const buf = data instanceof ArrayBuffer ? Buffer.from(data) : data;
      player.ws.send(buf, { binary: true });
    }
  }

  /** Broadcast to all (optionally exclude one id). */
  broadcast(data, excludeId) {
    const buf = data instanceof ArrayBuffer ? Buffer.from(data) : data;
    for (const [id, p] of this.players) {
      if (id === excludeId) continue;
      if (p.ws.readyState === 1) {
        p.ws.send(buf, { binary: true });
      }
    }
  }

  // ── Tick loop ──────────────────────────────────────────────────────────

  _tick() {
    const dtSec = TICK_MS / 1000;

    // ── World timer countdown (always ticking) ─────────────────────────
    this.worldTimer -= dtSec;
    if (this.worldTimer <= 0) {
      this._resetWorld();
      return;
    }

    // ── If no players, scatter living enemies so they don't clump ───────
    const playerList = Array.from(this.players.values());
    if (playerList.length === 0) {
      this._scatterEnemies();
      return;
    }

    // Update enemies
    for (const e of this.enemies) {
      e.update(TICK_MS, playerList);
    }

    // Wave spawner (respect MAX_ENEMIES cap)
    this._waveAccumulator += TICK_MS;
    if (this._waveAccumulator >= WAVE_INTERVAL_MS) {
      this._waveAccumulator -= WAVE_INTERVAL_MS;
      this._spawnWave(playerList);
    }

    // Broadcast timer sync every ~1s
    this._timerSyncAccumulator += TICK_MS;
    if (this._timerSyncAccumulator >= 1000) {
      this._timerSyncAccumulator -= 1000;
      this.broadcast(Protocol.encodeTimerSync(this.worldTimer));
    }

    // Build and send snapshots
    const playerSnapshot = Protocol.encodeRoomSnapshot(playerList);
    const playerBuf = Buffer.from(playerSnapshot);
    const enemyBuf = Protocol.encodeEnemySnapshot(this.enemies);

    for (const [, p] of this.players) {
      if (p.ws.readyState === 1) {
        p.ws.send(playerBuf, { binary: true });
        p.ws.send(enemyBuf, { binary: true });
      }
    }
  }

  // ── World reset ────────────────────────────────────────────────────────

  _resetWorld() {
    console.log(`[Room ${this.name}] ⏰ Timer expired — resetting world`);

    // Reset timer
    this.worldTimer = RUN_TIMER;

    // Clear enemies (no initial spawn — waves handle population)
    this.enemies = [];
    this._nextEnemyId = 1;
    this._waveAccumulator = 0;

    // Regenerate container loot
    this.containerLoot = [];
    this._generateContainerLoot();

    // Broadcast reset to all connected players (with new timer)
    const resetBuf = Protocol.encodeWorldReset(this.worldTimer);
    this.broadcast(resetBuf);

    // Send new container loot to all
    for (const c of this.containerLoot) {
      this.broadcast(Protocol.encodeLootData(0, c.id, c.loot));
    }

    console.log(`[Room ${this.name}] World reset complete — ${this.enemies.length} enemies, ${this.containerLoot.length} containers`);
  }

  // ── Enemy spawning ─────────────────────────────────────────────────────

  _spawnWave(players) {
    // Count living enemies (exclude dead/corpses)
    const alive = this.enemies.filter(e => e.state !== 'dead').length;
    if (alive >= MAX_ENEMIES) return;

    let avgX = 0;
    for (const p of players) avgX += p.x;
    avgX /= players.length;

    const budget = MAX_ENEMIES - alive;
    const count = Math.min(budget, WAVE_MIN + Math.floor(Math.random() * (WAVE_MAX - WAVE_MIN + 1)));
    for (let i = 0; i < count; i++) {
      let sx;
      if (Math.random() < 0.5) {
        sx = avgX - 780 - Math.floor(Math.random() * 80);
      } else {
        sx = avgX + 960 + 300 + Math.floor(Math.random() * 80);
      }
      sx = Math.max(60, Math.min(EXTRACT_X - 120, sx));
      const sy = LANE_TOP + 10 + Math.floor(Math.random() * (LANE_BOTTOM - LANE_TOP - 20));
      const tough = Math.random() < 0.25;
      const cfg = tough ? { hp: 100, speed: 70 } : {};
      const e = new ServerEnemy(this._nextEnemyId++, sx, sy, cfg);
      this.enemies.push(e);
    }
  }

  /**
   * Scatter living enemies evenly across the level when no players are present.
   * Prevents clumping: resets patrol bounds around each enemy's new position.
   */
  _scatterEnemies() {
    const living = this.enemies.filter(e => e.state !== 'dead');
    if (living.length === 0) return;

    const margin = 80;
    const totalWidth = EXTRACT_X - margin * 2;
    const spacing = totalWidth / living.length;

    for (let i = 0; i < living.length; i++) {
      const e = living[i];
      e.x = margin + spacing * i + spacing * 0.5;
      e.y = LANE_TOP + 10 + Math.floor(Math.random() * (LANE_BOTTOM - LANE_TOP - 20));
      e.velX = 0;
      e.velY = 0;
      e.state = 'patrol';
      e._patrolLeft  = e.x - 160;
      e._patrolRight = e.x + 160;
      e._patrolDir   = Math.random() < 0.5 ? 1 : -1;
    }
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
