'use strict';

/**
 * WaveSpawner — manages periodic enemy wave spawning and no-player scatter logic.
 * Mutates the enemies array passed by reference from Room.
 */
const ServerEnemy = require('./ServerEnemy');

const WAVE_INTERVAL_MS = 30_000;
const WAVE_MIN    = 1;
const WAVE_MAX    = 3;
const MAX_ENEMIES = 5;
const LANE_TOP    = 330;
const LANE_BOTTOM = 470;
const EXTRACT_X   = 3500;

class WaveSpawner {
  /**
   * @param {() => number} getNextId  Callback returning the next unique enemy netId
   */
  constructor(getNextId) {
    this._getNextId   = getNextId;
    this._accumulator = 0;
  }

  /**
   * Called every tick. Advances the wave timer and spawns if ready.
   * @param {number}   dtMs     Elapsed ms since last tick
   * @param {object[]} enemies  Room.enemies array (mutated in place)
   * @param {object[]} players  Current player list
   */
  tick(dtMs, enemies, players) {
    this._accumulator += dtMs;
    if (this._accumulator >= WAVE_INTERVAL_MS) {
      this._accumulator -= WAVE_INTERVAL_MS;
      this._spawnWave(enemies, players);
    }
  }

  /**
   * Redistribute living enemies evenly across the level.
   * Called when no players are present to prevent clumping.
   * @param {object[]} enemies  Room.enemies array
   */
  scatter(enemies) {
    const living = enemies.filter(e => e.state !== 'dead');
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

  /** Reset accumulator (called on world reset). */
  reset() { this._accumulator = 0; }

  // ── private ──────────────────────────────────────────────────────────────

  _spawnWave(enemies, players) {
    const alive = enemies.filter(e => e.state !== 'dead').length;
    if (alive >= MAX_ENEMIES) return;

    let avgX;
    if (players.length > 0) {
      avgX = players.reduce((s, p) => s + p.x, 0) / players.length;
    } else {
      avgX = 60 + Math.random() * (EXTRACT_X - 180);
    }

    const budget = MAX_ENEMIES - alive;
    const count = Math.min(budget, WAVE_MIN + Math.floor(Math.random() * (WAVE_MAX - WAVE_MIN + 1)));

    for (let i = 0; i < count; i++) {
      let sx;
      if (players.length > 0) {
        sx = Math.random() < 0.5
          ? avgX - 780 - Math.floor(Math.random() * 80)
          : avgX + 960 + 300 + Math.floor(Math.random() * 80);
      } else {
        sx = 60 + Math.floor(Math.random() * (EXTRACT_X - 180));
      }
      sx = Math.max(60, Math.min(EXTRACT_X - 120, sx));
      const sy  = LANE_TOP + 10 + Math.floor(Math.random() * (LANE_BOTTOM - LANE_TOP - 20));
      const cfg = Math.random() < 0.25 ? { hp: 100, speed: 70 } : {};
      enemies.push(new ServerEnemy(this._getNextId(), sx, sy, cfg));
    }
  }
}

module.exports = { WaveSpawner, MAX_ENEMIES };
