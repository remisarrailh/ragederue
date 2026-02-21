// ── Loot definitions ──────────────────────────────────────────────────────────
// texture keys match what PreloadScene registers
export const LOOT_DEFS = {
  ethereum: {
    texture:     'eth',
    value:       100,
    isConsumable: false,
    healAmount:  0,
    displayW:    32,
    displayH:    32,
    glowColor:   0x00ffcc,
  },
  sushi: {
    texture:     'sushi',
    value:       0,
    isConsumable: true,
    healAmount:  20,
    displayW:    40,
    displayH:    29,   // keep ~ratio of 402×290
    glowColor:   0xff88aa,
  },
  pizza: {
    texture:     'pizza',
    value:       0,
    isConsumable: true,
    healAmount:  35,
    displayW:    40,
    displayH:    21,   // keep ~ratio of 127×68
    glowColor:   0xff6622,
  },
  ice_cream: {
    texture:     'ice_cream',
    value:       0,
    isConsumable: true,
    healAmount:  15,
    displayW:    28,
    displayH:    42,   // keep ~ratio of 42×62
    glowColor:   0xaaddff,
  },
};

// ── Run parameters ────────────────────────────────────────────────────────────
export const RUN_TIMER = 120;   // seconds
export const EXTRACT_X = 3500;  // player.x threshold to trigger extraction

// ── Loot spawn positions ──────────────────────────────────────────────────────
export const LOOT_SPAWNS = [
  // ETH ×6
  { type: 'ethereum',  x: 420,  y: 415 },
  { type: 'ethereum',  x: 780,  y: 450 },
  { type: 'ethereum',  x: 1200, y: 390 },
  { type: 'ethereum',  x: 1700, y: 455 },
  { type: 'ethereum',  x: 2350, y: 395 },
  { type: 'ethereum',  x: 3100, y: 445 },
  // Consommables ×4
  { type: 'sushi',     x: 600,  y: 430 },
  { type: 'pizza',     x: 1450, y: 410 },
  { type: 'ice_cream', x: 2100, y: 460 },
  { type: 'pizza',     x: 2900, y: 425 },
];
