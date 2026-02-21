import { ITEM_DEFS } from '../config/lootTable.js';

// ── Grid-based inventory ──────────────────────────────────────────────────
// The inventory is a 2D grid. Items occupy invW × invH cells.
// Each cell stores null (empty) or a reference to an InventoryItem.

const GRID_COLS = 6;
const GRID_ROWS = 4;

export class InventoryItem {
  /**
   * @param {string} type   key in ITEM_DEFS
   * @param {number} gridX  top-left column in the grid
   * @param {number} gridY  top-left row in the grid
   * @param {boolean} identified  whether the item has been identified
   */
  constructor(type, gridX = 0, gridY = 0, identified = true) {
    this.type       = type;
    this.def        = ITEM_DEFS[type];
    this.gridX      = gridX;
    this.gridY      = gridY;
    this.identified = identified;
  }
}

export default class Inventory {
  constructor() {
    this.cols  = GRID_COLS;
    this.rows  = GRID_ROWS;
    this.grid  = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
    this.items = [];  // flat list of InventoryItem
  }

  /**
   * Try to add an item to the inventory. Auto-finds the first available slot.
   * @param {string} type  key in ITEM_DEFS
   * @param {boolean} identified
   * @returns {InventoryItem|null}  the added item, or null if inventory full
   */
  addItem(type, identified = true) {
    const def = ITEM_DEFS[type];
    if (!def) return null;

    const pos = this._findSlot(def.invW, def.invH);
    if (!pos) return null;

    const item = new InventoryItem(type, pos.x, pos.y, identified);
    this._placeItem(item);
    this.items.push(item);
    return item;
  }

  /**
   * Remove an item from the inventory and free its grid cells.
   * @param {InventoryItem} item
   */
  removeItem(item) {
    const idx = this.items.indexOf(item);
    if (idx === -1) return;
    this.items.splice(idx, 1);
    this._clearCells(item);
  }

  /**
   * Use (consume) an item — returns true if it's consumable.
   * Caller should handle the useTime delay before calling this.
   * @param {InventoryItem} item
   * @param {object} player  Player entity
   * @returns {boolean}
   */
  useItem(item, player) {
    if (!item.def.useTime && !item.def.healAmount && !item.def.value) return false;

    if (item.def.healAmount > 0) {
      player.hp = Math.min(player.maxHp, player.hp + item.def.healAmount);
    }
    if (item.def.value > 0) {
      player.wallet = (player.wallet ?? 0) + item.def.value;
    }

    this.removeItem(item);
    return true;
  }

  /**
   * Check if there's room for an item of given size.
   */
  hasRoom(type) {
    const def = ITEM_DEFS[type];
    if (!def) return false;
    return this._findSlot(def.invW, def.invH) !== null;
  }

  /**
   * Calculate total extracted ETH value.
   */
  get totalValue() {
    return this.items.reduce((s, i) => s + (i.def.value ?? 0), 0);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  _findSlot(w, h) {
    for (let gy = 0; gy <= this.rows - h; gy++) {
      for (let gx = 0; gx <= this.cols - w; gx++) {
        if (this._canPlace(gx, gy, w, h)) return { x: gx, y: gy };
      }
    }
    return null;
  }

  _canPlace(gx, gy, w, h) {
    for (let r = gy; r < gy + h; r++) {
      for (let c = gx; c < gx + w; c++) {
        if (this.grid[r][c] !== null) return false;
      }
    }
    return true;
  }

  _placeItem(item) {
    const { invW, invH } = item.def;
    for (let r = item.gridY; r < item.gridY + invH; r++) {
      for (let c = item.gridX; c < item.gridX + invW; c++) {
        this.grid[r][c] = item;
      }
    }
  }

  _clearCells(item) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] === item) this.grid[r][c] = null;
      }
    }
  }
}
