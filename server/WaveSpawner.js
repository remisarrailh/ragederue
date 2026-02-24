'use strict';

/**
 * WaveSpawner — manages periodic enemy wave spawning and no-player scatter logic.
 * Mutates the enemies array passed by reference from Room.
 *
 * Config fields (all optional — fall back to defaults):
 *   waveIntervalMs  {number}  ms between waves         (default 30 000)
 *   waveMin         {number}  min enemies per wave      (default 1)
 *   waveMax         {number}  max enemies per wave      (default 3)
 *   maxEnemies      {number}  alive cap                 (default 5)
 *   mapWidth        {number}  x bound for spawning      (default 3500)
 *   strongChance    {number}  0-1 chance of strong foe  (default 0.25)
 *   strongHp        {number}  HP of strong foe          (default 100)
 *   strongSpeed     {number}  speed of strong foe       (default 70)
 */
const ServerEnemy = require('./ServerEnemy');

const LANE_TOP    = 330;
const LANE_BOTTOM = 470;

const DEFAULTS = {
  waveIntervalMs: 30_000,
  waveMin:        1,
  waveMax:        3,
  maxEnemies:     5,
  mapWidth:       3500,
  strongChance:   0.25,
  strongHp:       100,
  strongSpeed:    70,
};

class WaveSpawner {
  /**
   * @param {() => number} getNextId  Callback returning the next unique enemy netId
   * @param {object}       [cfg]      Per-level spawn config (see DEFAULTS above)
   */
  constructor(getNextId, cfg = {}) {
    this._getNextId   = getNextId;
    this._accumulator = 0;
    this._cfg = { ...DEFAULTS, ...cfg };
  }

  /** Update spawn config at runtime (e.g. when the room config changes). */
  setConfig(cfg) {
    this._cfg = { ...DEFAULTS, ...cfg };
  }

  /**
   * Called every tick. Advances the wave timer and spawns if ready.
   * @param {number}   dtMs     Elapsed ms since last tick
   * @param {object[]} enemies  Room.enemies array (mutated in place)
   * @param {object[]} players  Current player list
   */
  tick(dtMs, enemies, players) {
    this._accumulator += dtMs;
    if (this._accumulator >= this._cfg.waveIntervalMs) {
      this._accumulator -= this._cfg.waveIntervalMs;
      this._spawnWave(enemies, players);
    }
  }

  /**
   * Redistribute living enemies evenly across the level.
   * Called when no players are present to prevent clumping.
   */
  scatter(enemies) {
    const living = enemies.filter(e => e.state !== 'dead');
    if (living.length === 0) return;

    const margin = 80;
    const totalWidth = this._cfg.mapWidth - margin * 2;
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

  /** Reset accumulator (called on world reset). */
  reset() { this._accumulator = 0; }

  /** Expose maxEnemies so Room.getStats() can read it. */
  get maxEnemies() { return this._cfg.maxEnemies; }

  // ── private ──────────────────────────────────────────────────────────────

  _spawnWave(enemies, players) {
    const { maxEnemies, waveMin, waveMax, mapWidth, strongChance, strongHp, strongSpeed } = this._cfg;
    const alive = enemies.filter(e => e.state !== 'dead').length;
    if (alive >= maxEnemies) return;

    let avgX;
    if (players.length > 0) {
      avgX = players.reduce((s, p) => s + p.x, 0) / players.length;
    } else {
      avgX = 60 + Math.random() * (mapWidth - 180);
    }

    const budget = maxEnemies - alive;
    const count = Math.min(budget, waveMin + Math.floor(Math.random() * (waveMax - waveMin + 1)));

    for (let i = 0; i < count; i++) {
      let sx;
      if (players.length > 0) {
        sx = Math.random() < 0.5
          ? avgX - 780 - Math.floor(Math.random() * 80)
          : avgX + 960 + 300 + Math.floor(Math.random() * 80);
      } else {
        sx = 60 + Math.floor(Math.random() * (mapWidth - 180));
      }
      sx = Math.max(60, Math.min(mapWidth - 120, sx));
      const sy  = LANE_TOP + 10 + Math.floor(Math.random() * (LANE_BOTTOM - LANE_TOP - 20));
      const cfg = Math.random() < strongChance ? { hp: strongHp, speed: strongSpeed } : {};
      enemies.push(new ServerEnemy(this._getNextId(), sx, sy, cfg));
    }
  }
}

module.exports = { WaveSpawner };
