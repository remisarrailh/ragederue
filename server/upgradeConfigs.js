'use strict';
/**
 * upgradeConfigs.js — Miroir CommonJS de js/config/upgrades.js pour le serveur.
 * Utilisé pour valider le coût des améliorations côté serveur.
 */

const UPGRADE_IDS = ['cuisine', 'filtration', 'coffre', 'gym', 'atelier'];
const MAX_LEVEL   = 3;

const UPGRADES = {
  cuisine: {
    levels: [
      { cost: { planche: 3, vis: 2 } },
      { cost: { planche: 5, vis: 4, clou: 3 } },
      { cost: { planche: 8, vis: 8, clou: 5, tuyau: 2 } },
    ],
  },
  filtration: {
    levels: [
      { cost: { tuyau: 2, vis: 2 } },
      { cost: { tuyau: 4, vis: 4, clou: 3 } },
      { cost: { tuyau: 6, vis: 8, planche: 2, clou: 5 } },
    ],
  },
  coffre: {
    levels: [
      { cost: { planche: 4, clou: 4 } },
      { cost: { planche: 8, clou: 8, vis: 4 } },
      { cost: { planche: 12, clou: 12, vis: 6, tuyau: 3 } },
    ],
  },
  gym: {
    levels: [
      { cost: { planche: 3, clou: 3 } },
      { cost: { planche: 6, clou: 6, vis: 4 } },
      { cost: { planche: 10, clou: 10, tuyau: 3 } },
    ],
  },
  atelier: {
    levels: [
      { cost: { vis: 4, tuyau: 3 } },
      { cost: { vis: 8, tuyau: 6, clou: 5 } },
      { cost: { vis: 12, tuyau: 10, clou: 8 } },
    ],
  },
};

/**
 * Retourne le coût pour construire le prochain niveau d'une amélioration.
 * @param {string} upgradeId
 * @param {number} currentLevel  (0 = pas encore construit)
 * @returns {{ [item: string]: number } | null}  null si déjà au max ou inconnu
 */
function getNextCost(upgradeId, currentLevel) {
  const def = UPGRADES[upgradeId];
  if (!def) return null;
  if (currentLevel >= MAX_LEVEL) return null;
  return def.levels[currentLevel].cost;
}

module.exports = { UPGRADES, UPGRADE_IDS, MAX_LEVEL, getNextCost };
