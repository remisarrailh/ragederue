/**
 * Protocol — server-side binary message encoding/decoding.
 * Mirrors js/network/NetProtocol.js but in CommonJS for Node.
 */

// ─── Message types ──────────────────────────────────────────────────────────
const C_JOIN          = 0x01;
const C_PLAYER_STATE  = 0x02;
const C_ATTACK        = 0x03;
const C_CHANGE_MAP    = 0x05;
const C_HIT_ENEMY     = 0x07;
const C_TAKE_ITEM     = 0x08;
const C_CHAR_LIST     = 0x10;  // C→S : demande liste des personnages
const C_CHAR_SELECT   = 0x11;  // C→S : sélectionne (action=0) ou crée (action=1) un personnage
const C_CHAR_DELETE   = 0x12;  // C→S : supprime un personnage
const C_CHEST_SAVE    = 0x13;  // C→S : sauvegarde le contenu du coffre
const C_SKILL_GAIN    = 0x14;  // C→S : XP gagné pour une compétence
const C_UPGRADE_BUILD = 0x15;  // C→S : construire prochain niveau d'une amélioration
const C_REVIVE_PLAYER = 0x16;  // C→S : revive un joueur à terre (targetPlayerId u16)

const S_WELCOME       = 0x80;
const S_ROOM_SNAPSHOT = 0x81;
const S_PLAYER_JOIN   = 0x82;
const S_PLAYER_LEAVE  = 0x83;
const S_DAMAGE        = 0x84;
const S_ENEMY_SNAPSHOT = 0x85;
const S_LOOT_DATA      = 0x86;
const S_WORLD_RESET    = 0x87;
const S_TIMER_SYNC     = 0x88;
const S_CHAR_LIST      = 0x90;  // S→C : liste des personnages
const S_JOIN_REFUSED   = 0x91;  // S→C : personnage déjà en jeu
const S_CHEST_DATA     = 0x92;  // S→C : contenu du coffre du personnage sélectionné
const S_SKILLS         = 0x93;  // S→C : état complet des compétences du personnage
const S_UPGRADES       = 0x94;  // S→C : niveaux des améliorations de la planque
const S_REVIVE_PLAYER  = 0x95;  // S→C : broadcast revive (targetPlayerId u16)

// ─── Item types (shared with client) ────────────────────────────────────────
const ITEM_TYPES = ['ethereum', 'sushi', 'pizza', 'ice_cream'];
const itemTypeToIdx = {};
ITEM_TYPES.forEach((t, i) => { itemTypeToIdx[t] = i; });

// ─── State enum ─────────────────────────────────────────────────────────────
const STATES = [
  'idle', 'walk', 'punch', 'kick', 'jab',
  'jump', 'jump_kick', 'hurt', 'dead',
];
const stateToIdx = {};
STATES.forEach((s, i) => { stateToIdx[s] = i; });

const ENEMY_STATES = [
  'patrol', 'chase', 'attack', 'hitstun', 'knockdown', 'dead',
];
const enemyStateToIdx = {};
ENEMY_STATES.forEach((s, i) => { enemyStateToIdx[s] = i; });

// ─── Decode helpers ─────────────────────────────────────────────────────────

function decodeJoin(buf) {
  let off = 1;
  const nameLen = buf[off++];
  const name = buf.slice(off, off + nameLen).toString('utf8');
  off += nameLen;
  const roomLen = buf[off++];
  const room = buf.slice(off, off + roomLen).toString('utf8');
  off += roomLen;
  const charIdLen = off < buf.length ? buf[off++] : 0;
  const charId = charIdLen > 0 ? buf.slice(off, off + charIdLen).toString('utf8') : null;
  return { name, room, charId };
}

function decodePlayerState(buf, offset = 1) {
  const x    = buf.readFloatLE(offset);
  const y    = buf.readFloatLE(offset + 4);
  const velX = buf.readInt16LE(offset + 8);
  const velY = buf.readInt16LE(offset + 10);
  const stateIdx = buf[offset + 12];
  const packed   = buf[offset + 13];
  const facing = (packed & 0x80) ? -1 : 1;
  const hp     = packed & 0x7F;
  return { x, y, velX, velY, state: STATES[stateIdx] || 'idle', facing, hp };
}

// ─── Encode helpers ─────────────────────────────────────────────────────────

function encodeWelcome(playerId) {
  const buf = Buffer.alloc(3);
  buf[0] = S_WELCOME;
  buf.writeUInt16LE(playerId, 1);
  return buf;
}

function encodeRoomSnapshot(players) {
  const count = players.length;
  const buf = Buffer.alloc(2 + count * 16);
  buf[0] = S_ROOM_SNAPSHOT;
  buf[1] = count;
  let off = 2;
  for (const p of players) {
    buf.writeUInt16LE(p.id, off); off += 2;
    buf.writeFloatLE(p.x, off); off += 4;
    buf.writeFloatLE(p.y, off); off += 4;
    buf.writeInt16LE(Math.round(p.velX || 0), off); off += 2;
    buf.writeInt16LE(Math.round(p.velY || 0), off); off += 2;
    buf[off++] = stateToIdx[p.state] ?? 0;
    const facingBit = (p.facing > 0) ? 0 : 0x80;
    buf[off++] = facingBit | (Math.min(p.hp || 100, 127) & 0x7F);
  }
  return buf;
}

function encodePlayerJoin(id, name) {
  const nameBytes = Buffer.from(name, 'utf8');
  const buf = Buffer.alloc(4 + nameBytes.length);
  buf[0] = S_PLAYER_JOIN;
  buf.writeUInt16LE(id, 1);
  buf[3] = nameBytes.length;
  nameBytes.copy(buf, 4);
  return buf;
}

function encodePlayerLeave(id) {
  const buf = Buffer.alloc(3);
  buf[0] = S_PLAYER_LEAVE;
  buf.writeUInt16LE(id, 1);
  return buf;
}

/**
 * Decode C_TAKE_ITEM: type(1) + targetKind(u8) + targetId(u16) + itemIdx(u8)
 */
function decodeTakeItem(buf) {
  return {
    targetKind: buf[1],       // 0=container, 1=corpse
    targetId:   buf.readUInt16LE(2),
    itemIdx:    buf[4],
  };
}

// ─── Enemy messages ─────────────────────────────────────────────────────────

/**
 * Decode C_HIT_ENEMY: type(1) + enemyNetId(u16) + damage(u8) + knockback(u8) + fromX(f32)
 */
function decodeHitEnemy(buf) {
  const netId    = buf.readUInt16LE(1);
  const damage   = buf[3];
  const knockback = buf[4];
  const fromX    = buf.readFloatLE(5);
  return { netId, damage, knockback, fromX };
}

/**
 * S_ENEMY_SNAPSHOT: type(1) + count(u8) + [netId(u16)+x(f32)+y(f32)+hp(u8)+stateIdx(u8)+facing(u8)]*count
 */
function encodeEnemySnapshot(enemies) {
  const count = enemies.length;
  const buf = Buffer.alloc(2 + count * 13);
  buf[0] = S_ENEMY_SNAPSHOT;
  buf[1] = count;
  let off = 2;
  for (const e of enemies) {
    buf.writeUInt16LE(e.netId, off); off += 2;
    buf.writeFloatLE(e.x, off); off += 4;
    buf.writeFloatLE(e.y, off); off += 4;
    buf[off++] = Math.min(Math.max(e.hp, 0), 255);
    buf[off++] = enemyStateToIdx[e.state] ?? 0;
    buf[off++] = e.facing > 0 ? 1 : 0;
  }
  return buf;
}

// ─── Loot messages ──────────────────────────────────────────────────────────

/**
 * S_LOOT_DATA: type(1) + targetKind(u8: 0=container, 1=corpse) + targetId(u16)
 *              + itemCount(u8) + [itemTypeIdx(u8)] * count
 */
function encodeLootData(targetKind, targetId, itemTypes) {
  const count = itemTypes.length;
  const buf = Buffer.alloc(1 + 1 + 2 + 1 + count);
  buf[0] = S_LOOT_DATA;
  buf[1] = targetKind; // 0 = container, 1 = corpse
  buf.writeUInt16LE(targetId, 2);
  buf[4] = count;
  for (let i = 0; i < count; i++) {
    buf[5 + i] = itemTypeToIdx[itemTypes[i]] ?? 0;
  }
  return buf;
}

// ─── World reset / timer sync ───────────────────────────────────────────────

/**
 * S_WORLD_RESET: type(1) + remainingTime(f32)  — world has been reset
 */
function encodeWorldReset(remainingTime) {
  const buf = Buffer.alloc(5);
  buf[0] = S_WORLD_RESET;
  buf.writeFloatLE(remainingTime, 1);
  return buf;
}

/**
 * S_TIMER_SYNC: type(1) + remainingTime(f32)  — current timer value
 */
function encodeTimerSync(remainingTime) {
  const buf = Buffer.alloc(5);
  buf[0] = S_TIMER_SYNC;
  buf.writeFloatLE(remainingTime, 1);
  return buf;
}

// ─── Character messages ──────────────────────────────────────────────────────

/**
 * C_CHAR_SELECT: type(1) + action(u8: 0=select, 1=create) + len(u8) + value(N)
 */
function decodeCharSelect(buf) {
  const action = buf[1];
  const len    = buf[2];
  const value  = buf.slice(3, 3 + len).toString('utf8');
  return { action, value };
}

/**
 * C_CHAR_DELETE: type(1) + len(u8) + charId(N)
 */
function decodeCharDelete(buf) {
  const len = buf[1];
  return { charId: buf.slice(2, 2 + len).toString('utf8') };
}

/**
 * S_CHAR_LIST: type(1) + count(u8) + [ idLen(u8)+id + nameLen(u8)+name + inGame(u8) ]*count
 */
function encodeCharList(characters, activeCharsSet) {
  const parts = characters.map(c => ({
    idB:    Buffer.from(c.id,   'utf8'),
    nameB:  Buffer.from(c.name, 'utf8'),
    inGame: activeCharsSet && activeCharsSet.has(c.id) ? 1 : 0,
  }));
  const size = 2 + parts.reduce((s, p) => s + 3 + p.idB.length + p.nameB.length, 0);
  const buf  = Buffer.alloc(size);
  buf[0] = S_CHAR_LIST;
  buf[1] = characters.length;
  let off = 2;
  for (const p of parts) {
    buf[off++] = p.idB.length;
    p.idB.copy(buf, off); off += p.idB.length;
    buf[off++] = p.nameB.length;
    p.nameB.copy(buf, off); off += p.nameB.length;
    buf[off++] = p.inGame;
  }
  return buf;
}

/**
 * S_JOIN_REFUSED: type(1) + reasonLen(u8) + reason(N)
 */
function encodeJoinRefused(reason) {
  const rb  = Buffer.from(reason, 'utf8');
  const buf = Buffer.alloc(2 + rb.length);
  buf[0] = S_JOIN_REFUSED;
  buf[1] = rb.length;
  rb.copy(buf, 2);
  return buf;
}

/**
 * C_CHEST_SAVE: type(1) + charIdLen(u8) + charId(N) + count(u8) + [itemLen(u8) + item(N)]*count
 * Sent by client to persist chest contents on the server.
 * charId is included so the server can identify the character even on a raw connection.
 */
function decodeChestSave(buf) {
  let off = 1;
  const charIdLen = buf[off++];
  const charId    = buf.slice(off, off + charIdLen).toString('utf8');
  off += charIdLen;
  const count = buf[off++];
  const items = [];
  for (let i = 0; i < count; i++) {
    const len  = buf[off++];
    items.push(buf.slice(off, off + len).toString('utf8'));
    off += len;
  }
  return { charId, items };
}

/**
 * S_CHEST_DATA: type(1) + count(u8) + [itemLen(u8) + item(N)]*count
 * Sent by server after character selection to restore chest contents.
 */
function encodeChestData(items) {
  const parts = items.map(s => Buffer.from(s, 'utf8'));
  const size  = 2 + parts.reduce((s, b) => s + 1 + b.length, 0);
  const buf   = Buffer.alloc(size);
  buf[0] = S_CHEST_DATA;
  buf[1] = items.length;
  let off = 2;
  for (const b of parts) {
    buf[off++] = b.length;
    b.copy(buf, off); off += b.length;
  }
  return buf;
}

// ─── Skills messages ────────────────────────────────────────────────────────

/**
 * C_SKILL_GAIN: type(1) + skillNameLen(u8) + skillName(N) + xpGain(u16 BE)
 */
function decodeSkillGain(buf) {
  const nameLen   = buf[1];
  const skillName = buf.slice(2, 2 + nameLen).toString('utf8');
  const xp        = buf.readUInt16BE(2 + nameLen);
  return { skillName, xp };
}

/**
 * S_SKILLS: type(1) + count(u8) + [nameLen(u8)+name + xpTotal(u32 BE)]*count
 */
function encodeSkills(skills) {
  const entries = Object.entries(skills);
  const parts   = entries.map(([k, v]) => ({ kb: Buffer.from(k, 'utf8'), xp: v }));
  const size    = 2 + parts.reduce((s, p) => s + 1 + p.kb.length + 4, 0);
  const buf     = Buffer.alloc(size);
  buf[0] = S_SKILLS;
  buf[1] = entries.length;
  let off = 2;
  for (const { kb, xp } of parts) {
    buf[off++] = kb.length;
    kb.copy(buf, off); off += kb.length;
    buf.writeUInt32BE(xp >>> 0, off); off += 4;
  }
  return buf;
}

// ─── Upgrade messages ────────────────────────────────────────────────────────

/**
 * C_UPGRADE_BUILD: type(1) + upgradeIdLen(u8) + upgradeId(N)
 */
function decodeUpgradeBuild(buf) {
  const len       = buf[1];
  const upgradeId = buf.slice(2, 2 + len).toString('utf8');
  return { upgradeId };
}

/**
 * S_UPGRADES: type(1) + count(u8) + [idLen(u8)+id + level(u8)]*count
 * @param {{ [id: string]: number }} upgrades
 */
function encodeUpgrades(upgrades) {
  const entries = Object.entries(upgrades);
  const parts   = entries.map(([k, v]) => ({ kb: Buffer.from(k, 'utf8'), level: v }));
  const size    = 2 + parts.reduce((s, p) => s + 1 + p.kb.length + 1, 0);
  const buf     = Buffer.alloc(size);
  buf[0] = S_UPGRADES;
  buf[1] = entries.length;
  let off = 2;
  for (const { kb, level } of parts) {
    buf[off++] = kb.length;
    kb.copy(buf, off); off += kb.length;
    buf[off++] = level;
  }
  return buf;
}

// ─── Revive messages ────────────────────────────────────────────────────────

/**
 * C_REVIVE_PLAYER: type(1) + targetPlayerId(u16)
 */
function decodeRevivePlayer(buf) {
  return { targetPlayerId: buf.readUInt16LE(1) };
}

/**
 * S_REVIVE_PLAYER: type(1) + targetPlayerId(u16)
 * Broadcast to everyone in the room so the target client can call player.revive().
 */
function encodeReviveMsg(targetPlayerId) {
  const buf = Buffer.alloc(3);
  buf[0] = S_REVIVE_PLAYER;
  buf.writeUInt16LE(targetPlayerId, 1);
  return buf;
}

// ─── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  C_JOIN, C_PLAYER_STATE, C_ATTACK, C_CHANGE_MAP, C_HIT_ENEMY, C_TAKE_ITEM,
  C_CHAR_LIST, C_CHAR_SELECT, C_CHAR_DELETE, C_CHEST_SAVE, C_SKILL_GAIN, C_UPGRADE_BUILD,
  C_REVIVE_PLAYER,
  S_WELCOME, S_ROOM_SNAPSHOT, S_PLAYER_JOIN, S_PLAYER_LEAVE, S_DAMAGE,
  S_ENEMY_SNAPSHOT, S_LOOT_DATA, S_WORLD_RESET, S_TIMER_SYNC,
  S_CHAR_LIST, S_JOIN_REFUSED, S_CHEST_DATA, S_SKILLS, S_UPGRADES, S_REVIVE_PLAYER,
  STATES, stateToIdx, ENEMY_STATES, enemyStateToIdx,
  ITEM_TYPES, itemTypeToIdx,
  decodeJoin, decodePlayerState, decodeHitEnemy, decodeTakeItem,
  decodeCharSelect, decodeCharDelete, decodeChestSave, decodeSkillGain, decodeUpgradeBuild,
  decodeRevivePlayer,
  encodeWelcome, encodeRoomSnapshot, encodePlayerJoin, encodePlayerLeave,
  encodeEnemySnapshot, encodeLootData, encodeWorldReset, encodeTimerSync,
  encodeCharList, encodeJoinRefused, encodeChestData, encodeSkills, encodeUpgrades,
  encodeReviveMsg,
};
