'use strict';

/**
 * levelConfigs.js — Server-side level configuration.
 *
 * Les containers sont lus dynamiquement depuis js/config/levels/<id>.js
 * afin d'être toujours synchronisés avec ce que l'éditeur a sauvegardé.
 * Les loot tables sont lues depuis js/config/lootTable.js via vm.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ── Lecture dynamique des containers depuis le fichier de niveau client ───────
function _readLevelContainers(levelId) {
  try {
    const levelPath = path.join(__dirname, '..', 'js', 'config', 'levels', `${levelId}.js`);
    const src = fs.readFileSync(levelPath, 'utf8')
      .replace(/^export\s+default\s+/m, 'var _level = ');
    const ctx = {};
    vm.runInNewContext(src, ctx);
    // Exclure les containers spéciaux (coffre planque, établi) — gérés séparément
    const containers = (ctx._level?.containers ?? [])
      .filter(c => !c.isHideoutChest && !c.isUpgradeStation);
    console.log(`[levelConfigs] ${levelId}: ${containers.length} containers lus depuis le fichier niveau`);
    return containers;
  } catch (e) {
    console.warn(`[levelConfigs] Impossible de lire les containers de ${levelId} :`, e.message);
    return [];
  }
}

// ── Lecture dynamique de lootTable.js ────────────────────────────────────────
function _readLootConfig() {
  try {
    const lootPath = path.join(__dirname, '..', 'js', 'config', 'lootTable.js');
    const src = fs.readFileSync(lootPath, 'utf8');
    const cleaned = src
      .replace(/^export\s+const\s+/gm, 'var ')
      .replace(/^export\s+function\s+/gm, 'function ');
    const ctx = {};
    vm.runInNewContext(cleaned, ctx);
    return {
      containerLootTables: ctx.CONTAINER_LOOT_TABLES ?? { default: [] },
      containerItemCounts: ctx.CONTAINER_ITEM_COUNTS ?? { default: { min: 1, max: 3 } },
      enemyLootTables:     ctx.ENEMY_LOOT_TABLES     ?? { default: [] },
      enemyItemCounts:     ctx.ENEMY_ITEM_COUNTS      ?? { default: { min: 0, max: 2 } },
    };
  } catch (e) {
    console.warn('[levelConfigs] Impossible de lire lootTable.js :', e.message);
    return {};
  }
}

const LOOT = _readLootConfig();

const LEVEL_CONFIGS = {

  // ── level_01 — Street Shops ─────────────────────────────────────────────
  level_01: {
    containers: _readLevelContainers('level_01'),
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
    containerLootTables: LOOT.containerLootTables,
    containerItemCounts: LOOT.containerItemCounts,
    enemyLootTables:     LOOT.enemyLootTables,
    enemyItemCounts:     LOOT.enemyItemCounts,
  },

  // ── level_02 — Bar ──────────────────────────────────────────────────────
  level_02: {
    containers: _readLevelContainers('level_02'),
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
    containerLootTables: LOOT.containerLootTables,
    containerItemCounts: LOOT.containerItemCounts,
    enemyLootTables:     LOOT.enemyLootTables,
    enemyItemCounts:     LOOT.enemyItemCounts,
  },

  // ── level_03 — Planque ──────────────────────────────────────────────────
  // Safe zone: no enemies, no random loot (chest is handled separately)
  level_03: {
    containers: _readLevelContainers('level_03'),
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
