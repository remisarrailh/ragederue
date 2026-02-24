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
      skills: {
        punchSkill: 0, kickSkill: 0, jabSkill: 0,
        moveSkill: 0, lootSkill: 0, healSkill: 0, eatSkill: 0,
      },
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

  updateSkills(id, gains) {
    const data = load();
    const char = data.characters.find(c => c.id === id);
    if (!char) return null;
    if (!char.skills) char.skills = {};
    for (const [k, v] of Object.entries(gains)) {
      char.skills[k] = (char.skills[k] ?? 0) + v;
    }
    save(data);
    return char.skills;
  },

  getSkills(id) {
    const char = load().characters.find(c => c.id === id);
    return char?.skills ?? {};
  },

  delete(id) {
    const data = load();
    data.characters = data.characters.filter(c => c.id !== id);
    save(data);
  },
};

// Calcule le niveau à partir du XP total d'une compétence
function xpToLevel(xp) {
  let lvl = 0;
  while (xp >= Math.round(100 * Math.pow(lvl + 1, 1.5))) {
    xp -= Math.round(100 * Math.pow(lvl + 1, 1.5));
    lvl++;
    if (lvl >= 50) break;
  }
  return lvl;
}
module.exports.xpToLevel = xpToLevel;
