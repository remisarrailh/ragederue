// ─── World dimensions ─────────────────────────────────────────────────────
export const GAME_W       = 960;
export const GAME_H       = 540;
export const WORLD_W      = 3840;   // scrollable world width

// ─── 2.5D Belt / Lane ─────────────────────────────────────────────────────
export const LANE_TOP     = 330;    // y = furthest back  (smallest scale)
export const LANE_BOTTOM  = 470;    // y = closest camera (largest scale)
export const SCALE_MIN    = 0.6;
export const SCALE_MAX    = 1.0;

// ─── Sprites ───────────────────────────────────────────────────────────────
export const FRAME_W      = 96;
export const FRAME_H      = 63;

// ─── Player ───────────────────────────────────────────────────────────────
export const PLAYER_SPEED       = 220;
export const PLAYER_MAX_HP      = 100;
export const PLAYER_INVINCIBLE_MS = 600;

// ─── Combat ───────────────────────────────────────────────────────────────
export const COMBO_WINDOW       = 500;   // ms between attacks to maintain combo
export const JUMP_DURATION      = 500;   // ms for full arc
export const JUMP_HEIGHT        = 80;    // pixels offset at peak

// ─── Enemy ────────────────────────────────────────────────────────────────
export const ENEMY_SPEED        = 90;
export const ENEMY_MAX_HP       = 60;
export const ENEMY_CHASE_DIST   = 280;
export const ENEMY_ATTACK_DIST  = 70;
export const ENEMY_KNOCKDOWN_THRESHOLD  = 35;   // accumulated dmg before knockdown
export const ENEMY_HITSTUN_MS           = 220;  // brief flinch duration
export const ENEMY_KNOCKDOWN_RECOVERY_MS = 900; // time on ground before getting up
// ─── Debug ────────────────────────────────────────────────────────────────
export const DEBUG_HITBOXES     = false;
export const DEBUG_DEPTH        = false;
