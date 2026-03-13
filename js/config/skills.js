/**
 * skills.js — Définitions de compétences et formule XP centralisées.
 *
 * Consommateurs :
 *   - js/scenes/InventoryScene.js  (SKILL_DEFS, xpProgress)
 *   - js/entities/Player.js        (_skillLevel → xpToLevel)
 */

// ── Définitions affichées dans InventoryScene onglet STATS ──────────────────
export const SKILL_DEFS = [
  { key: 'punchSkill', label: 'Poings',  icon: '👊', bonusLabel: 'dmg poings' },
  { key: 'kickSkill',  label: 'Pieds',   icon: '🦵', bonusLabel: 'dmg pieds' },
  { key: 'jabSkill',   label: 'Jab',     icon: '⚡',  bonusLabel: 'dmg jab' },
  { key: 'moveSkill',  label: 'Vitesse', icon: '🏃',  bonusLabel: 'vitesse' },
  { key: 'runSkill',   label: 'Sprint',  icon: '💨',  bonusLabel: '+vitesse/-conso sprint' },
  { key: 'jumpSkill',  label: 'Saut',    icon: '🦘',  bonusLabel: '+hauteur/-conso saut' },
  { key: 'lootSkill',  label: 'Loot',    icon: '📦',  bonusLabel: '-20ms/lv ident.' },
  { key: 'healSkill',  label: 'Soins',   icon: '💊',  bonusLabel: 'efficacité soins' },
  { key: 'eatSkill',   label: 'Manger',  icon: '🍕',  bonusLabel: 'efficacité nourriture' },
];

// ── Formule XP ───────────────────────────────────────────────────────────────
export const XP_BASE        = 100;
export const XP_EXPONENT    = 1.5;
export const SKILL_MAX_LEVEL = 50;

/** XP requis pour passer du niveau `level` au niveau `level+1`. */
export function xpForLevel(level) {
  return Math.round(XP_BASE * Math.pow(level + 1, XP_EXPONENT));
}

/**
 * Retourne le niveau atteint avec `totalXp` XP accumulés.
 * @param {number} totalXp
 * @returns {number} level (0–50)
 */
export function xpToLevel(totalXp) {
  let xp  = totalXp;
  let lvl = 0;
  while (xp >= xpForLevel(lvl)) {
    xp -= xpForLevel(lvl);
    lvl++;
    if (lvl >= SKILL_MAX_LEVEL) break;
  }
  return lvl;
}

/**
 * Retourne la progression détaillée pour l'affichage des barres XP.
 * @param {number} totalXp
 * @returns {{ level: number, progress: number, xpInLevel: number, xpForNextLevel: number }}
 */
export function xpProgress(totalXp) {
  let xp  = totalXp;
  let lvl = 0;
  while (xp >= xpForLevel(lvl)) {
    xp -= xpForLevel(lvl);
    lvl++;
    if (lvl >= SKILL_MAX_LEVEL) break;
  }
  const cap      = xpForLevel(lvl);
  const progress = lvl >= SKILL_MAX_LEVEL ? 1 : xp / cap;
  return { level: lvl, progress, xpInLevel: xp, xpForNextLevel: cap };
}

// ── Paramètres gameplay par skill ────────────────────────────────────────────
export const SKILL_PARAMS = {
  // Bonus génériques : +2% par niveau (géré dans Player._skillBonus)
  moveSkill: { distPerXp: 200 },
  runSkill:  { distPerXp: 300, staminaCostReductionPerLevel: 0.3, sprintMultPerLevel: 0.01 },
  jumpSkill: { staminaCostReductionPerLevel: 0.16, staminaMinCost: 4, heightBonusPerLevel: 0.02 },
  lootSkill: { identifyMsReductionPerLevel: 20 },
};
