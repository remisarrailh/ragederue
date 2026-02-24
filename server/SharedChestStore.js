/**
 * SharedChestStore — Coffre commun à tous les joueurs.
 * Persisté dans server/shared_chest.json.
 */

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'shared_chest.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { items: [] };
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  getItems() {
    return load().items;
  },

  setItems(items) {
    save({ items });
  },
};
