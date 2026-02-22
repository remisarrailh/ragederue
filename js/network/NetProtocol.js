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
 * C_JOIN: type(1) + nameLen(1) + name(N) + roomLen(1) + room(M)
 */
export function encodeJoin(name, room) {
  const nameBytes = new TextEncoder().encode(name);
  const roomBytes = new TextEncoder().encode(room);
  const buf = new ArrayBuffer(1 + 1 + nameBytes.length + 1 + roomBytes.length);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let off = 0;
  view.setUint8(off++, C_JOIN);
  view.setUint8(off++, nameBytes.length);
  u8.set(nameBytes, off); off += nameBytes.length;
  view.setUint8(off++, roomBytes.length);
  u8.set(roomBytes, off);
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
