// js/network/NetConstants.js

export const C_JOIN          = 0x01;
export const C_PLAYER_STATE  = 0x02;
export const C_ATTACK        = 0x03;
export const C_CHANGE_MAP    = 0x05;
export const C_HIT_ENEMY     = 0x07;
export const C_TAKE_ITEM     = 0x08;
export const C_CHAR_LIST     = 0x10;
export const C_CHAR_SELECT   = 0x11;
export const C_CHAR_DELETE   = 0x12;
export const C_CHEST_SAVE    = 0x13;
export const C_SKILL_GAIN    = 0x14;
export const C_UPGRADE_BUILD = 0x15;
export const C_REVIVE_PLAYER = 0x16;

export const S_WELCOME       = 0x80;
export const S_ROOM_SNAPSHOT = 0x81;
export const S_PLAYER_JOIN   = 0x82;
export const S_PLAYER_LEAVE  = 0x83;
export const S_DAMAGE        = 0x84;
export const S_ENEMY_SNAPSHOT = 0x85;
export const S_LOOT_DATA      = 0x86;
export const S_WORLD_RESET    = 0x87;
export const S_TIMER_SYNC     = 0x88;
export const S_CHAR_LIST      = 0x90;
export const S_JOIN_REFUSED   = 0x91;
export const S_CHEST_DATA     = 0x92;
export const S_SKILLS         = 0x93;
export const S_UPGRADES       = 0x94;
export const S_REVIVE_PLAYER  = 0x95;

export const STATES = ['idle', 'walk', 'punch', 'kick', 'jab', 'jump', 'jump_kick', 'hurt', 'dead'];
export const ENEMY_STATES = ['patrol', 'chase', 'attack', 'hitstun', 'knockdown', 'dead'];