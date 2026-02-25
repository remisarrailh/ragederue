/**
 * NetProtocol — shared binary message encoding/decoding.
 *
 * All messages start with 1 byte (message type).
 * Uses DataView for cross-platform endianness safety.
 *
 * This file is used by BOTH the client (ES module) and the server (CommonJS).
 * The server copies the constants; the client imports this file directly.
 */

// ─── Message types ──────────────────────────────────────────────────────────
// Client → Server
export const C_JOIN          = 0x01;
export const C_PLAYER_STATE  = 0x02;
export const C_ATTACK        = 0x03;
export const C_CHANGE_MAP    = 0x05;
export const C_HIT_ENEMY     = 0x07;
export const C_TAKE_ITEM     = 0x08;
export const C_CHAR_LIST     = 0x10;  // Request character list
export const C_CHAR_SELECT   = 0x11;  // Select (action=0) or create (action=1) a character
export const C_CHAR_DELETE   = 0x12;  // Delete a character
export const C_CHEST_SAVE    = 0x13;  // Save chest contents to server
export const C_SKILL_GAIN    = 0x14;  // Notify server of XP gain for a skill
export const C_UPGRADE_BUILD = 0x15;  // Build next level of a hideout upgrade
export const C_REVIVE_PLAYER = 0x16;  // Revive a downed player (targetPlayerId)

// Server → Client
export const S_WELCOME       = 0x80;
export const S_ROOM_SNAPSHOT  = 0x81;
export const S_PLAYER_JOIN   = 0x82;
export const S_PLAYER_LEAVE  = 0x83;
export const S_DAMAGE        = 0x84;
export const S_ENEMY_SNAPSHOT = 0x85;
export const S_LOOT_DATA      = 0x86;
export const S_WORLD_RESET    = 0x87;
export const S_TIMER_SYNC     = 0x88;
export const S_CHAR_LIST      = 0x90;  // Character list response
export const S_JOIN_REFUSED   = 0x91;  // Character already in-game
export const S_CHEST_DATA     = 0x92;  // Chest contents after character selection
export const S_SKILLS         = 0x93;  // Full skill state for the selected character
export const S_UPGRADES       = 0x94;  // Hideout upgrade levels for the selected character

// ─── Item types (shared with server) ────────────────────────────────────────
export const ITEM_TYPES = ['ethereum', 'sushi', 'pizza', 'ice_cream'];

// ─── State enum (fits in 1 byte) ────────────────────────────────────────────
export const STATES = [
  'idle', 'walk', 'punch', 'kick', 'jab',
  'jump', 'jump_kick', 'hurt', 'dead',
];
const stateToIdx = {};
STATES.forEach((s, i) => { stateToIdx[s] = i; });

// ─── Enemy state enum ──────────────────────────────────────────────────────
export const ENEMY_STATES = [
  'patrol', 'chase', 'attack', 'hitstun', 'knockdown', 'dead',
];
const enemyStateToIdx = {};
ENEMY_STATES.forEach((s, i) => { enemyStateToIdx[s] = i; });

// ─── Encode helpers ─────────────────────────────────────────────────────────

/**
 * C_JOIN: type(1) + nameLen(1) + name(N) + roomLen(1) + room(M) + charIdLen(1) + charId(K)
 */
export function encodeJoin(name, room, charId = '') {
  const nameBytes   = new TextEncoder().encode(name);
  const roomBytes   = new TextEncoder().encode(room);
  const charIdBytes = new TextEncoder().encode(charId);
  const buf = new ArrayBuffer(1 + 1 + nameBytes.length + 1 + roomBytes.length + 1 + charIdBytes.length);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let off = 0;
  view.setUint8(off++, C_JOIN);
  view.setUint8(off++, nameBytes.length);
  u8.set(nameBytes, off); off += nameBytes.length;
  view.setUint8(off++, roomBytes.length);
  u8.set(roomBytes, off); off += roomBytes.length;
  view.setUint8(off++, charIdBytes.length);
  u8.set(charIdBytes, off);
  return buf;
}

/**
 * C_PLAYER_STATE: type(1) + x(f32) + y(f32) + velX(i16) + velY(i16)
 *   + state(u8) + packed[facing(1bit)|hp(7bits)](u8)
 * Total: 15 bytes
 */
export function encodePlayerState(x, y, velX, velY, state, facing, hp) {
  const buf = new ArrayBuffer(15);
  const v = new DataView(buf);
  v.setUint8(0, C_PLAYER_STATE);
  v.setFloat32(1, x, true);
  v.setFloat32(5, y, true);
  v.setInt16(9, Math.round(velX), true);
  v.setInt16(11, Math.round(velY), true);
  v.setUint8(13, stateToIdx[state] ?? 0);
  const facingBit = facing > 0 ? 0 : 0x80;
  v.setUint8(14, facingBit | (Math.min(hp, 127) & 0x7F));
  return buf;
}

/**
 * Decode C_PLAYER_STATE (15 bytes)
 */
export function decodePlayerState(buf, offset = 1) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const x    = v.getFloat32(offset, true);
  const y    = v.getFloat32(offset + 4, true);
  const velX = v.getInt16(offset + 8, true);
  const velY = v.getInt16(offset + 10, true);
  const stateIdx = v.getUint8(offset + 12);
  const packed = v.getUint8(offset + 13);
  const facing = (packed & 0x80) ? -1 : 1;
  const hp = packed & 0x7F;
  return { x, y, velX, velY, state: STATES[stateIdx] || 'idle', facing, hp };
}

/**
 * S_WELCOME: type(1) + playerId(u16)
 */
export function encodeWelcome(playerId) {
  const buf = new ArrayBuffer(3);
  const v = new DataView(buf);
  v.setUint8(0, S_WELCOME);
  v.setUint16(1, playerId, true);
  return buf;
}

export function decodeWelcome(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
  return { playerId: v.getUint16(1, true) };
}

/**
 * S_ROOM_SNAPSHOT: type(1) + count(u8) + [playerId(u16) + state(14 bytes)] * count
 * Total: 1 + 1 + count * 16
 */
export function encodeRoomSnapshot(players) {
  const count = players.length;
  const buf = new ArrayBuffer(2 + count * 16);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  v.setUint8(0, S_ROOM_SNAPSHOT);
  v.setUint8(1, count);
  let off = 2;
  for (const p of players) {
    v.setUint16(off, p.id, true); off += 2;
    v.setFloat32(off, p.x, true); off += 4;
    v.setFloat32(off, p.y, true); off += 4;
    v.setInt16(off, Math.round(p.velX || 0), true); off += 2;
    v.setInt16(off, Math.round(p.velY || 0), true); off += 2;
    v.setUint8(off, stateToIdx[p.state] ?? 0); off += 1;
    const facingBit = (p.facing > 0) ? 0 : 0x80;
    v.setUint8(off, facingBit | (Math.min(p.hp || 100, 127) & 0x7F)); off += 1;
  }
  return buf;
}

export function decodeRoomSnapshot(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const count = v.getUint8(1);
  const players = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const id = v.getUint16(off, true); off += 2;
    const x = v.getFloat32(off, true); off += 4;
    const y = v.getFloat32(off, true); off += 4;
    const velX = v.getInt16(off, true); off += 2;
    const velY = v.getInt16(off, true); off += 2;
    const stateIdx = v.getUint8(off); off += 1;
    const packed = v.getUint8(off); off += 1;
    const facing = (packed & 0x80) ? -1 : 1;
    const hp = packed & 0x7F;
    players.push({ id, x, y, velX, velY, state: STATES[stateIdx] || 'idle', facing, hp });
  }
  return { players };
}

/**
 * S_PLAYER_JOIN: type(1) + id(u16) + nameLen(u8) + name(N)
 */
export function encodePlayerJoin(id, name) {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new ArrayBuffer(4 + nameBytes.length);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  v.setUint8(0, S_PLAYER_JOIN);
  v.setUint16(1, id, true);
  v.setUint8(3, nameBytes.length);
  u8.set(nameBytes, 4);
  return buf;
}

export function decodePlayerJoin(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const u8 = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  const id = v.getUint16(1, true);
  const nameLen = v.getUint8(3);
  const name = new TextDecoder().decode(u8.slice(4, 4 + nameLen));
  return { id, name };
}

/**
 * S_PLAYER_LEAVE: type(1) + id(u16)
 */
export function encodePlayerLeave(id) {
  const buf = new ArrayBuffer(3);
  const v = new DataView(buf);
  v.setUint8(0, S_PLAYER_LEAVE);
  v.setUint16(1, id, true);
  return buf;
}

export function decodePlayerLeave(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  return { id: v.getUint16(1, true) };
}

/**
 * Get message type from a raw buffer
 */
export function getMsgType(buf) {
  const u8 = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  return u8[0];
}

// ─── Enemy messages ─────────────────────────────────────────────────────────

/**
 * C_TAKE_ITEM: type(1) + targetKind(u8) + targetId(u16) + itemIdx(u8)
 * Total: 5 bytes
 */
export function encodeTakeItem(targetKind, targetId, itemIdx) {
  const buf = new ArrayBuffer(5);
  const v = new DataView(buf);
  v.setUint8(0, C_TAKE_ITEM);
  v.setUint8(1, targetKind);
  v.setUint16(2, targetId, true);
  v.setUint8(4, itemIdx);
  return buf;
}

/**
 * C_HIT_ENEMY: type(1) + enemyNetId(u16) + damage(u8) + knockback(u8) + fromX(f32)
 * Total: 9 bytes
 */
export function encodeHitEnemy(enemyNetId, damage, knockback, fromX) {
  const buf = new ArrayBuffer(9);
  const v = new DataView(buf);
  v.setUint8(0, C_HIT_ENEMY);
  v.setUint16(1, enemyNetId, true);
  v.setUint8(3, Math.min(damage, 255));
  v.setUint8(4, Math.min(knockback, 255));
  v.setFloat32(5, fromX, true);
  return buf;
}

/**
 * Decode S_ENEMY_SNAPSHOT (same format as old enemy states):
 * type(1) + count(u8) + [netId(u16) + x(f32) + y(f32) + hp(u8) + stateIdx(u8) + facing(u8)] * count
 */
/**
 * Decode S_LOOT_DATA:
 * type(1) + targetKind(u8) + targetId(u16) + count(u8) + [itemIdx(u8)]*count
 */
export function decodeLootData(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const targetKind = v.getUint8(1);  // 0=container, 1=corpse
  const targetId   = v.getUint16(2, true);
  const count      = v.getUint8(4);
  const items = [];
  for (let i = 0; i < count; i++) {
    const idx = v.getUint8(5 + i);
    items.push(ITEM_TYPES[idx] || 'ethereum');
  }
  return { targetKind, targetId, items };
}

/**
 * Decode S_WORLD_RESET / S_TIMER_SYNC: type(1) + remainingTime(f32)
 */
export function decodeTimerMsg(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  return { remainingTime: v.getFloat32(1, true) };
}

export function decodeEnemySnapshot(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const count = v.getUint8(1);
  const enemies = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const netId = v.getUint16(off, true); off += 2;
    const x = v.getFloat32(off, true); off += 4;
    const y = v.getFloat32(off, true); off += 4;
    const hp = v.getUint8(off); off += 1;
    const stateIdx = v.getUint8(off); off += 1;
    const facing = v.getUint8(off) ? 1 : -1; off += 1;
    enemies.push({ netId, x, y, hp, state: ENEMY_STATES[stateIdx] || 'patrol', facing });
  }
  return { enemies };
}

// ─── Character messages (client-side encode) ─────────────────────────────────

/** C_CHAR_LIST: type(1) — request character list */
export function encodeCharListReq() {
  return new Uint8Array([C_CHAR_LIST]);
}

/** C_CHAR_SELECT: type(1) + action(u8) + len(u8) + value(N) */
export function encodeCharSelect(action, value) {
  const bytes = new TextEncoder().encode(value);
  const buf = new Uint8Array(3 + bytes.length);
  buf[0] = C_CHAR_SELECT;
  buf[1] = action;
  buf[2] = bytes.length;
  buf.set(bytes, 3);
  return buf;
}

/** C_CHAR_DELETE: type(1) + len(u8) + charId(N) */
export function encodeCharDelete(charId) {
  const bytes = new TextEncoder().encode(charId);
  const buf = new Uint8Array(2 + bytes.length);
  buf[0] = C_CHAR_DELETE;
  buf[1] = bytes.length;
  buf.set(bytes, 2);
  return buf;
}

/** S_CHAR_LIST: type(1) + count(u8) + [ idLen+id + nameLen+name + inGame(u8) ]* */
export function decodeCharList(buf) {
  const u8    = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const count = u8[1];
  const chars = [];
  const dec   = new TextDecoder();
  let off = 2;
  for (let i = 0; i < count; i++) {
    const idLen = u8[off++];
    const id    = dec.decode(u8.slice(off, off + idLen)); off += idLen;
    const nameLen = u8[off++];
    const name  = dec.decode(u8.slice(off, off + nameLen)); off += nameLen;
    const inGame = u8[off++] === 1;
    chars.push({ id, name, inGame });
  }
  return chars;
}

/** S_JOIN_REFUSED: type(1) + reasonLen(u8) + reason(N) */
export function decodeJoinRefused(buf) {
  const u8  = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const len = u8[1];
  return new TextDecoder().decode(u8.slice(2, 2 + len));
}

/** C_CHEST_SAVE: type(1) + charIdLen(u8) + charId(N) + count(u8) + [itemLen(u8) + item(N)]* */
export function encodeChestSave(charId, items) {
  const enc     = new TextEncoder();
  const charIdB = enc.encode(charId);
  const parts   = items.map(s => enc.encode(s));
  const size    = 1 + 1 + charIdB.length + 1 + parts.reduce((s, b) => s + 1 + b.length, 0);
  const buf     = new Uint8Array(size);
  let off = 0;
  buf[off++] = C_CHEST_SAVE;
  buf[off++] = charIdB.length;
  buf.set(charIdB, off); off += charIdB.length;
  buf[off++] = items.length;
  for (const b of parts) {
    buf[off++] = b.length;
    buf.set(b, off); off += b.length;
  }
  return buf;
}

/** C_SKILL_GAIN: type(1) + skillNameLen(u8) + skillName(N) + xpGain(u16 BE) */
export function encodeSkillGain(skillName, xp) {
  const nb  = new TextEncoder().encode(skillName);
  const buf = new Uint8Array(1 + 1 + nb.length + 2);
  buf[0] = C_SKILL_GAIN;
  buf[1] = nb.length;
  buf.set(nb, 2);
  const dv = new DataView(buf.buffer);
  dv.setUint16(2 + nb.length, xp, false); // big-endian
  return buf;
}

/** S_SKILLS: type(1) + count(u8) + [nameLen(u8)+name + xpTotal(u32 BE)]* */
export function decodeSkills(buf) {
  const dv    = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const u8    = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const count = dv.getUint8(1);
  const skills = {};
  let off = 2;
  for (let i = 0; i < count; i++) {
    const nLen = dv.getUint8(off++);
    const name = new TextDecoder().decode(u8.slice(off, off + nLen)); off += nLen;
    skills[name] = dv.getUint32(off, false); off += 4;
  }
  return skills;
}

/** C_REVIVE_PLAYER: type(1) + targetPlayerId(u16) */
export function encodeRevivePlayer(targetPlayerId) {
  const buf = new ArrayBuffer(3);
  const v = new DataView(buf);
  v.setUint8(0, C_REVIVE_PLAYER);
  v.setUint16(1, targetPlayerId, true);
  return buf;
}

/** S_REVIVE_PLAYER: type(1) + targetPlayerId(u16) — broadcast to room */
export const S_REVIVE_PLAYER = 0x95;
export function encodeReviveMsg(targetPlayerId) {
  const buf = new ArrayBuffer(3);
  const v = new DataView(buf);
  v.setUint8(0, S_REVIVE_PLAYER);
  v.setUint16(1, targetPlayerId, true);
  return buf;
}
export function decodeReviveMsg(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  return { targetPlayerId: v.getUint16(1, true) };
}

/** C_UPGRADE_BUILD: type(1) + upgradeIdLen(u8) + upgradeId(N) */
export function encodeUpgradeBuild(upgradeId) {
  const nb  = new TextEncoder().encode(upgradeId);
  const buf = new Uint8Array(2 + nb.length);
  buf[0] = C_UPGRADE_BUILD;
  buf[1] = nb.length;
  buf.set(nb, 2);
  return buf;
}

/**
 * S_UPGRADES: type(1) + count(u8) + [idLen(u8)+id + level(u8)]*count
 * Decodes to { [upgradeId]: level } object.
 */
export function decodeUpgrades(buf) {
  const u8    = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const count = u8[1];
  const dec   = new TextDecoder();
  const upgrades = {};
  let off = 2;
  for (let i = 0; i < count; i++) {
    const len = u8[off++];
    const id  = dec.decode(u8.slice(off, off + len)); off += len;
    upgrades[id] = u8[off++];
  }
  return upgrades;
}

/** S_CHEST_DATA: type(1) + count(u8) + [itemLen(u8) + item(N)]* */
export function decodeChestData(buf) {
  const u8    = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset ?? 0);
  const count = u8[1];
  const dec   = new TextDecoder();
  const items = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const len = u8[off++];
    items.push(dec.decode(u8.slice(off, off + len)));
    off += len;
  }
  return items;
}
