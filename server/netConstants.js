'use strict';
/**
 * netConstants.js — Miroir CJS de js/network/NetConstants.js pour le serveur.
 *
 * Remplace le hack vm.runInNewContext dans server/Protocol.js.
 * Doit rester en sync avec js/network/NetConstants.js.
 *
 * ⚠  Si vous ajoutez un message type côté client, ajoutez-le ici aussi.
 */

// ── Messages Client → Serveur ────────────────────────────────────────────────
const C_JOIN          = 0x01;
const C_PLAYER_STATE  = 0x02;
const C_ATTACK        = 0x03;
const C_CHANGE_MAP    = 0x05;
const C_HIT_ENEMY     = 0x07;
const C_TAKE_ITEM     = 0x08;
const C_CHAR_LIST     = 0x10;
const C_CHAR_SELECT   = 0x11;
const C_CHAR_DELETE   = 0x12;
const C_CHEST_SAVE    = 0x13;
const C_SKILL_GAIN    = 0x14;
const C_UPGRADE_BUILD = 0x15;
const C_REVIVE_PLAYER = 0x16;

// ── Messages Serveur → Client ────────────────────────────────────────────────
const S_WELCOME        = 0x80;
const S_ROOM_SNAPSHOT  = 0x81;
const S_PLAYER_JOIN    = 0x82;
const S_PLAYER_LEAVE   = 0x83;
const S_DAMAGE         = 0x84;
const S_ENEMY_SNAPSHOT = 0x85;
const S_LOOT_DATA      = 0x86;
const S_WORLD_RESET    = 0x87;
const S_TIMER_SYNC     = 0x88;
const S_CHAR_LIST      = 0x90;
const S_JOIN_REFUSED   = 0x91;
const S_CHEST_DATA     = 0x92;
const S_SKILLS         = 0x93;
const S_UPGRADES       = 0x94;
const S_REVIVE_PLAYER  = 0x95;

// ── États (index = valeur encodée dans le protocole binaire) ─────────────────
const STATES       = ['idle', 'walk', 'punch', 'kick', 'jab', 'jump', 'jump_kick', 'hurt', 'dead'];
const ENEMY_STATES = ['patrol', 'chase', 'attack', 'hitstun', 'knockdown', 'dead'];

module.exports = {
  C_JOIN, C_PLAYER_STATE, C_ATTACK, C_CHANGE_MAP, C_HIT_ENEMY, C_TAKE_ITEM,
  C_CHAR_LIST, C_CHAR_SELECT, C_CHAR_DELETE, C_CHEST_SAVE, C_SKILL_GAIN,
  C_UPGRADE_BUILD, C_REVIVE_PLAYER,
  S_WELCOME, S_ROOM_SNAPSHOT, S_PLAYER_JOIN, S_PLAYER_LEAVE, S_DAMAGE,
  S_ENEMY_SNAPSHOT, S_LOOT_DATA, S_WORLD_RESET, S_TIMER_SYNC,
  S_CHAR_LIST, S_JOIN_REFUSED, S_CHEST_DATA, S_SKILLS, S_UPGRADES, S_REVIVE_PLAYER,
  STATES, ENEMY_STATES,
};
