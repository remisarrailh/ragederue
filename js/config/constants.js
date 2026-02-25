// ─── Mobile detection ─────────────────────────────────────────────────────
// Vrai mobile/tablette = pointeur tactile grossier SANS souris précise.
// Évite les faux-positifs sur PC hybrides (Surface, laptop avec écran tactile)
// qui ont `maxTouchPoints > 0` mais aussi une souris `pointer:fine`.
export const IS_MOBILE = window.matchMedia('(pointer:coarse)').matches
                      && !window.matchMedia('(hover:hover)').matches;

// ─── World dimensions ─────────────────────────────────────────────────────
export const GAME_W       = 960;
export const GAME_H       = 540;
export const WORLD_W      = 3840;   // scrollable world width

// ─── 2.5D Belt / Lane ─────────────────────────────────────────────────────
export const LANE_TOP     = 330;    // y = furthest back  (smallest scale)
export const LANE_BOTTOM  = 470;    // y = closest camera (largest scale)
export const SCALE_MIN    = 1.0;
export const SCALE_MAX    = 1.0;

// ─── Sprites ───────────────────────────────────────────────────────────────
export const FRAME_W      = 96;
export const FRAME_H      = 63;

// ─── Player ───────────────────────────────────────────────────────────────
export const PLAYER_SPEED       = 220;
export const PLAYER_MAX_HP      = 100;
export const PLAYER_INVINCIBLE_MS = 600;

// ─── Stamina ──────────────────────────────────────────────────────────────
export const PLAYER_MAX_STAMINA     = 100;
export const STAMINA_REGEN_RATE     = 12;     // points/s après délai
export const STAMINA_REGEN_DELAY_MS = 1500;   // ms sans action avant regen
export const STAMINA_COST_PUNCH     = 10;
export const STAMINA_COST_KICK      = 15;
export const STAMINA_COST_JAB       = 8;
export const STAMINA_COST_JUMP      = 12;
export const STAMINA_LOW_THRESHOLD  = 0.1;    // fraction — saut bloqué en dessous
export const STAMINA_DMG_MIN_MULT   = 0.3;    // multiplicateur de dégâts minimum (stamina vide)
export const STAMINA_SPD_MIN_MULT   = 0.5;    // vitesse d'animation minimum (stamina vide)

// ─── Sprint ────────────────────────────────────────────────────────────────
export const SPRINT_MULTIPLIER       = 1.65;   // vitesse x1.65 en sprint
export const STAMINA_COST_SPRINT     = 18;     // pts/s consommés pendant le sprint
export const SPRINT_STAMINA_MIN      = 20;     // stamina minimale pour démarrer le sprint
export const MOBILE_SPRINT_THRESHOLD = 0.75;   // magnitude joystick ≥ 0.75 → sprint auto

// ─── Faim ─────────────────────────────────────────────────────────────────
export const PLAYER_MAX_HUNGER   = 100;
export const HUNGER_DRAIN_RATE   = 0.5;   // points/s (vide en ~200s ≈ 3min)
export const HUNGER_DAMAGE_RATE  = 1;     // HP perdus/s quand faim = 0

// ─── Soif ─────────────────────────────────────────────────────────────────
export const PLAYER_MAX_THIRST   = 100;
export const THIRST_DRAIN_RATE   = 0.8;   // points/s (plus rapide que la faim)
export const THIRST_DAMAGE_RATE  = 1;     // HP perdus/s quand soif = 0

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
// ─── Spawn ────────────────────────────────────────────────────────────────
export const SPAWN_LEVEL        = 'level_03';  // niveau de départ après sélection du perso

// ─── Version ──────────────────────────────────────────────────────────────
export const GAME_VERSION       = '0.4.4';

// ─── Debug ────────────────────────────────────────────────────────────────
export const DEBUG_HITBOXES     = false;
export const DEBUG_DEPTH        = false;
