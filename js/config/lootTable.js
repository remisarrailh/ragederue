// ── Item definitions for the extraction-shooter inventory system ───────────
// Each item has:
//   texture      – key for the preloaded sprite
//   invW, invH   – grid size in inventory (1×1, 1×2, 2×1, 2×2 …)
//   useTime      – ms to consume the item (0 = instant / not consumable)
//   healAmount   – hp restored on use (0 = none)
//   value        – extraction value (ETH payout)
//   displayW/H   – world sprite display size
//   glowColor    – colour for world glow / UI accent
//   description  – short tooltip

export const ITEM_DEFS = {
  ethereum: {
    texture:     'eth',
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
    invW: 2, invH: 1,
    useTime:     1500,
    healAmount:  20,
    value:       0,
    displayW: 40, displayH: 29,
    glowColor:   0xff88aa,
    description: 'Sushi — restores 20 HP',
  },
  pizza: {
    texture:     'pizza',
    invW: 2, invH: 2,
    useTime:     2000,
    healAmount:  35,
    value:       0,
    displayW: 40, displayH: 21,
    glowColor:   0xff6622,
    description: 'Pizza — restores 35 HP',
  },
  ice_cream: {
    texture:     'ice_cream',
    invW: 1, invH: 2,
    useTime:     1200,
    healAmount:  15,
    value:       0,
    displayW: 28, displayH: 42,
    glowColor:   0xaaddff,
    description: 'Ice Cream — restores 15 HP',
  },
};

// ── Loot tables for containers and enemy corpses ──────────────────────────
// Each entry: { type, weight }  — weight is relative probability
export const CONTAINER_LOOT_TABLE = [
  { type: 'ethereum',  weight: 15 },
  { type: 'sushi',     weight: 30 },
  { type: 'pizza',     weight: 20 },
  { type: 'ice_cream', weight: 35 },
];

export const CORPSE_LOOT_TABLE = [
  { type: 'ethereum',  weight: 40 },
  { type: 'sushi',     weight: 25 },
  { type: 'ice_cream', weight: 25 },
  { type: 'pizza',     weight: 10 },
];

// How many items a container / corpse can hold (random between min–max)
export const CONTAINER_ITEM_COUNT = { min: 1, max: 3 };
export const CORPSE_ITEM_COUNT   = { min: 0, max: 2 };

// ── Search timing ─────────────────────────────────────────────────────────
export const SEARCH_OPEN_MS       = 800;   // time to open a container/body
export const SEARCH_IDENTIFY_MS   = 600;   // time to identify each item inside

// ── Run parameters ────────────────────────────────────────────────────────
export const RUN_TIMER = 6400;   // seconds
export const EXTRACT_X = 3500;  // player.x threshold to trigger extraction

// ── Container spawn positions ─────────────────────────────────────────────
export const CONTAINER_SPAWNS = [
  { x: 420,  y: 415, texture: 'barrel' },
  { x: 780,  y: 450, texture: 'barrel' },
  { x: 1200, y: 390, texture: 'barrel' },
  { x: 1700, y: 455, texture: 'barrel' },
  { x: 2350, y: 395, texture: 'barrel' },
  { x: 3100, y: 445, texture: 'barrel' },
];

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
