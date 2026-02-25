// ── Item definitions for the extraction-shooter inventory system ───────────
// Each item has:
//   texture        – key for the preloaded sprite
//   invW, invH     – grid size in inventory (1×1, 1×2, 2×1, 2×2 …)
//   useTime        – ms to consume the item (0 = instant / not consumable)
//   healAmount     – hp restored on use (0 = none)
//   hungerRestore  – hunger points restored on use (0 = none)
//   thirstRestore  – thirst points restored on use (0 = none)
//   value          – extraction value (ETH payout)
//   displayW/H     – world sprite display size
//   glowColor      – colour for world glow / UI accent
//   description    – short tooltip

export const ITEM_DEFS = {
  ethereum: {
    texture:     'eth',
    category:    'argent',
    invW: 1, invH: 1,
    useTime:     0,
    healAmount:  0,
    value:       100,
    displayW: 32, displayH: 32,
    glowColor:   0x00ffcc,
    description: 'Ethereum token — extract it!',
  },
  sushi: {
    texture:     'sushi',
    category:    'soin',
    invW: 2, invH: 1,
    useTime:     1500,
    healAmount:  20,
    hungerRestore:  35,
    value:       0,
    displayW: 40, displayH: 29,
    glowColor:   0xff88aa,
    description: 'Sushi — +20 HP, +35 faim',
  },
  pizza: {
    texture:     'pizza',
    category:    'soin',
    invW: 2, invH: 2,
    useTime:     2000,
    healAmount:  35,
    hungerRestore:  50,
    value:       0,
    displayW: 40, displayH: 21,
    glowColor:   0xff6622,
    description: 'Pizza — +35 HP, +50 faim',
  },
  ice_cream: {
    texture:     'ice_cream',
    category:    'soin',
    invW: 1, invH: 2,
    useTime:     1200,
    healAmount:  15,
    hungerRestore:  20,
    thirstRestore:  15,
    value:       0,
    displayW: 28, displayH: 42,
    glowColor:   0xaaddff,
    description: 'Ice Cream — +15 HP, +20 faim, +15 soif',
  },
  water_bottle: {
    texture:     'water_bottle',
    category:    'soin',
    invW: 1, invH: 1,
    useTime:     800,
    healAmount:  0,
    thirstRestore:  50,
    value:       0,
    displayW: 28, displayH: 42,
    glowColor:   0x44aaff,
    description: 'Bouteille d\'eau — +50 soif',
  },
  vis: {
    texture:     'vis',
    category:    'craft',
    invW: 1, invH: 1,
    useTime:     0,
    healAmount:  0,
    value:       0,
    displayW: 24, displayH: 24,
    glowColor:   0xaaaaaa,
    description: 'Vis — matériau de fabrication',
  },
  clou: {
    texture:     'clou',
    category:    'craft',
    invW: 1, invH: 1,
    useTime:     0,
    healAmount:  0,
    value:       0,
    displayW: 24, displayH: 24,
    glowColor:   0xbbbbbb,
    description: 'Clou — matériau de fabrication',
  },
  planche: {
    texture:     'planche',
    category:    'craft',
    invW: 2, invH: 1,
    useTime:     0,
    healAmount:  0,
    value:       0,
    displayW: 48, displayH: 24,
    glowColor:   0xaa8844,
    description: 'Planche — matériau de fabrication',
  },
  tuyau: {
    texture:     'tuyau',
    category:    'craft',
    invW: 1, invH: 2,
    useTime:     0,
    healAmount:  0,
    value:       0,
    displayW: 24, displayH: 48,
    glowColor:   0x6699aa,
    description: 'Tuyau — matériau de fabrication',
  },
};

// ── Loot tables par type de container (clé = texture) ──────────────────────────
export const CONTAINER_LOOT_TABLES = {
  default: [
    { type: 'sushi', weight: 25 },
    { type: 'pizza', weight: 15 },
    { type: 'ice_cream', weight: 20 },
    { type: 'water_bottle', weight: 20 },
    { type: 'ethereum', weight: 10 },
    { type: 'vis', weight: 5 },
    { type: 'clou', weight: 5 },
  ],
  barrel: [
    { type: 'sushi', weight: 28 },
    { type: 'pizza', weight: 18 },
    { type: 'ice_cream', weight: 22 },
    { type: 'water_bottle', weight: 15 },
  ],
  toolbox: [
    { type: 'vis', weight: 40 },
    { type: 'clou', weight: 35 },
    { type: 'planche', weight: 15 },
    { type: 'tuyau', weight: 5 },
  ],
};

// ── Nombre d'items par type de container ─────────────────────────────────────
export const CONTAINER_ITEM_COUNTS = {
  default: { min: 1, max: 3 },
  barrel: { min: 1, max: 3 },
  toolbox: { min: 2, max: 4 },
};

// ── Loot tables par type d'ennemi (clé = type) ───────────────────────────────
export const ENEMY_LOOT_TABLES = {
  default: [
    { type: 'ethereum', weight: 35 },
    { type: 'sushi', weight: 22 },
    { type: 'ice_cream', weight: 18 },
    { type: 'pizza', weight: 10 },
    { type: 'water_bottle', weight: 15 },
  ],
  punk: [
    { type: 'sushi', weight: 22 },
    { type: 'water_bottle', weight: 15 },
  ],
  brute: [
    { type: 'ethereum', weight: 20 },
    { type: 'pizza', weight: 30 },
    { type: 'sushi', weight: 25 },
    { type: 'tuyau', weight: 10 },
  ],
};

// ── Nombre d'items par type d'ennemi ─────────────────────────────────────────
export const ENEMY_ITEM_COUNTS = {
  default: { min: 0, max: 2 },
  punk: { min: 1, max: 2 },
  brute: { min: 1, max: 3 },
};

// ── Search timing ─────────────────────────────────────────────────────────
export const SEARCH_OPEN_MS       = 800;   // time to open a container/body
export const SEARCH_IDENTIFY_MS   = 600;   // time to identify each item inside

// ── Run parameters ────────────────────────────────────────────────────────
export const RUN_TIMER = 6400;   // seconds
// Note: EXTRACT_X and CONTAINER_SPAWNS are now defined per-level in js/config/levels.js

/**
 * Roll items from a loot table.
 * @param {Array<{type:string,weight:number}>} table
 * @param {number} count  How many items to generate
 * @returns {string[]}    Array of item type keys
 */
export function rollLoot(table, count) {
  const totalWeight = table.reduce((s, e) => s + e.weight, 0);
  const results = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalWeight;
    for (const entry of table) {
      r -= entry.weight;
      if (r <= 0) { results.push(entry.type); break; }
    }
  }
  return results;
}
