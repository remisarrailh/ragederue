'use strict';

/**
 * levelConfigs.js — Server-side level configuration.
 *
 * Les configs de vague (wave timings, ennemis) sont lues depuis js/config/waveDefs.json.
 * Les containers sont lus dynamiquement depuis js/config/levels/<id>.js (vm.runInNewContext).
 * Les loot tables sont lues depuis js/config/lootTable.js via vm.
 */

const fs       = require('fs');
const path     = require('path');
const vm       = require('vm');
const WAVE_DEFS = require('../js/config/waveDefs.json');

// ── Lecture de PropDefs (cache singleton) ─────────────────────────────────────
let _propDefsCache = null;
function _getPropDefs() {
  if (_propDefsCache) return _propDefsCache;
  try {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'config', 'propDefs.js'), 'utf8'
    )
      .replace(/^export\s+const\s+/gm,    'var ')
      .replace(/^export\s+function\s+/gm, 'function ');
    const ctx = {};
    vm.runInNewContext(src, ctx);
    _propDefsCache = ctx.PROP_DEFS ?? {};
  } catch (e) {
    console.warn('[levelConfigs] Impossible de lire propDefs.js :', e.message);
    _propDefsCache = {};
  }
  return _propDefsCache;
}

// ── Lecture dynamique des containers depuis le fichier de niveau client ───────
function _readLevelContainers(levelId) {
  try {
    const levelPath = path.join(__dirname, '..', 'js', 'config', 'levels', `${levelId}.js`);
    const src = fs.readFileSync(levelPath, 'utf8')
      .replace(/^export\s+default\s+/m, 'var _level = ');
    const ctx = {};
    vm.runInNewContext(src, ctx);

    const PROP_DEFS = _getPropDefs();

    // Nouveau format : objects[] avec type = clé PropDef.
    // On garde les containers normaux (isContainer true, pas de specialType).
    const objects = ctx._level?.objects ?? [];
    const containers = objects
      .filter(obj => {
        const def = PROP_DEFS[obj.type];
        return def && def.isContainer && !def.specialType;
      })
      .map(obj => ({ x: obj.x, y: obj.y, texture: obj.type }));

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
    enemies:    WAVE_DEFS.level_01,
    containerLootTables: LOOT.containerLootTables,
    containerItemCounts: LOOT.containerItemCounts,
    enemyLootTables:     LOOT.enemyLootTables,
    enemyItemCounts:     LOOT.enemyItemCounts,
  },

  // ── level_02 — Bar ──────────────────────────────────────────────────────
  level_02: {
    containers: _readLevelContainers('level_02'),
    enemies:    WAVE_DEFS.level_02,
    containerLootTables: LOOT.containerLootTables,
    containerItemCounts: LOOT.containerItemCounts,
    enemyLootTables:     LOOT.enemyLootTables,
    enemyItemCounts:     LOOT.enemyItemCounts,
  },

  // ── level_03 — Planque ──────────────────────────────────────────────────
  // Safe zone: no enemies, no random loot (chest is handled separately)
  level_03: {
    containers:         _readLevelContainers('level_03'),
    enemies:            WAVE_DEFS.level_03,
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
