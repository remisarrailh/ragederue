'use strict';

/**
 * levelConfigs.js — Server-side level configuration.
 *
 * Mirrors the per-level settings from js/config/levels/*.js but in CommonJS
 * format (the client files use ES modules which Node can't require() directly).
 *
 * Only the server-relevant fields are included:
 *   containers          — loot container positions
 *   containerLootTable  — weighted loot table for containers
 *   corpseLootTable     — weighted loot table for enemy corpses
 *   containerItemCount  — {min, max} items per container
 *   corpseItemCount     — {min, max} items per corpse
 *   enemies             — WaveSpawner config (see WaveSpawner.js for all fields)
 *
 * All fields are optional — Room and WaveSpawner fall back to hardcoded defaults.
 */

const LEVEL_CONFIGS = {

  // ── level_01 — Street Shops ─────────────────────────────────────────────
  level_01: {
    containers: [
      { x: 371,  y: 410, texture: 'barrel' },
      { x: 780,  y: 450, texture: 'barrel' },
      { x: 1200, y: 390, texture: 'barrel' },
      { x: 1700, y: 455, texture: 'barrel' },
      { x: 2350, y: 395, texture: 'barrel' },
      { x: 3100, y: 445, texture: 'barrel' },
    ],
    enemies: {
      waveIntervalMs: 30_000,
      waveMin:        1,
      waveMax:        3,
      maxEnemies:     5,
      mapWidth:       10170,
      strongChance:   0.25,
      strongHp:       100,
      strongSpeed:    70,
    },
    containerLootTable: [
      { type: 'ethereum',     weight: 15 },
      { type: 'sushi',        weight: 30 },
      { type: 'pizza',        weight: 20 },
      { type: 'ice_cream',    weight: 25 },
      { type: 'water_bottle', weight: 10 },
    ],
    corpseLootTable: [
      { type: 'ethereum',     weight: 40 },
      { type: 'sushi',        weight: 25 },
      { type: 'ice_cream',    weight: 20 },
      { type: 'pizza',        weight: 10 },
      { type: 'water_bottle', weight: 5  },
    ],
    containerItemCount: { min: 1, max: 3 },
    corpseItemCount:    { min: 1, max: 2 },
  },

  // ── level_02 — Bar ──────────────────────────────────────────────────────
  level_02: {
    containers: [],   // no containers in the bar
    enemies: {
      waveIntervalMs: 20_000,
      waveMin:        2,
      waveMax:        4,
      maxEnemies:     8,
      mapWidth:       3005,
      strongChance:   0.40,
      strongHp:       120,
      strongSpeed:    80,
    },
    containerLootTable: [
      { type: 'ethereum',  weight: 30 },
      { type: 'sushi',     weight: 25 },
      { type: 'pizza',     weight: 25 },
      { type: 'ice_cream', weight: 20 },
    ],
    corpseLootTable: [
      { type: 'ethereum',  weight: 55 },
      { type: 'sushi',     weight: 20 },
      { type: 'ice_cream', weight: 15 },
      { type: 'pizza',     weight: 10 },
    ],
    containerItemCount: { min: 2, max: 4 },
    corpseItemCount:    { min: 1, max: 3 },
  },

  // ── level_03 — Planque ──────────────────────────────────────────────────
  // Safe zone: no enemies, no random loot (chest is handled separately)
  level_03: {
    containers: [],
    enemies: {
      maxEnemies:    0,
      waveIntervalMs: 999_999_999,  // effectively never
      waveMin: 0,
      waveMax: 0,
    },
    containerLootTable: [],
    corpseLootTable:    [],
  },

};

/**
 * Get the server-side config for a given level ID.
 * Falls back to empty object (Room uses its own defaults) if the level is unknown.
 * @param {string} levelId
 * @returns {object}
 */
function getLevelConfig(levelId) {
  return LEVEL_CONFIGS[levelId] || {};
}

module.exports = { getLevelConfig };
