/**
 * CharacterStore — Persistent character management.
 * Reads/writes server/characters.json synchronously (file stays small).
 */

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'characters.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { characters: [] };
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  getAll() {
    return load().characters;
  },

  getById(id) {
    return load().characters.find(c => c.id === id) ?? null;
  },

  create(name) {
    const data = load();
    const char = {
      id:         `char_${Date.now()}`,
      name:       name.slice(0, 24).trim(),
      chestItems: [],
      createdAt:  Date.now(),
    };
    data.characters.push(char);
    save(data);
    return char;
  },

  updateChest(id, items) {
    const data = load();
    const char = data.characters.find(c => c.id === id);
    if (char) {
      char.chestItems = items;
      save(data);
    }
  },

  delete(id) {
    const data = load();
    data.characters = data.characters.filter(c => c.id !== id);
    save(data);
  },
};
