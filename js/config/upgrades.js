/**
 * upgrades.js — Définition des améliorations de la planque.
 *
 * Chaque amélioration a jusqu'à 3 niveaux (index 0 = niv.1, 1 = niv.2, 2 = niv.3).
 * `cost` : objets requis dans le coffre pour débloquer ce niveau.
 *
 * Les effets sont consommés par :
 *   - Player.js  (hungerRegenMult, thirstRegenMult)
 *   - HideoutChestScene.js  (chestBonus)
 *   - (placeholder) gym, atelier
 */

export const UPGRADE_IDS = ['cuisine', 'filtration', 'coffre', 'gym', 'atelier'];

export const UPGRADES = {

  cuisine: {
    name: 'Cuisine',
    description: 'Regen faim + rapide en planque',
    levels: [
      { cost: { planche: 3, vis: 2 },                  hungerRegenMult: 2.0 },
      { cost: { planche: 5, vis: 4, clou: 3 },          hungerRegenMult: 3.5 },
      { cost: { planche: 8, vis: 8, clou: 5, tuyau: 2 }, hungerRegenMult: 6.0 },
    ],
  },

  filtration: {
    name: 'Filtration',
    description: 'Regen eau + rapide en planque',
    levels: [
      { cost: { tuyau: 2, vis: 2 },                     thirstRegenMult: 2.0 },
      { cost: { tuyau: 4, vis: 4, clou: 3 },             thirstRegenMult: 3.5 },
      { cost: { tuyau: 6, vis: 8, planche: 2, clou: 5 }, thirstRegenMult: 6.0 },
    ],
  },

  coffre: {
    name: 'Coffre',
    description: 'Augmente la capacite du coffre',
    levels: [
      { cost: { planche: 4, clou: 4 },                  chestBonus: 10 },
      { cost: { planche: 8, clou: 8, vis: 4 },           chestBonus: 25 },
      { cost: { planche: 12, clou: 12, vis: 6, tuyau: 3 }, chestBonus: 50 },
    ],
  },

  gym: {
    name: 'Gym',
    description: 'Entrainement des competences (bientot)',
    levels: [
      { cost: { planche: 3, clou: 3 },                  placeholder: true },
      { cost: { planche: 6, clou: 6, vis: 4 },           placeholder: true },
      { cost: { planche: 10, clou: 10, tuyau: 3 },       placeholder: true },
    ],
  },

  atelier: {
    name: 'Atelier',
    description: 'Fabrication d\'armes (bientot)',
    levels: [
      { cost: { vis: 4, tuyau: 3 },                      placeholder: true },
      { cost: { vis: 8, tuyau: 6, clou: 5 },              placeholder: true },
      { cost: { vis: 12, tuyau: 10, clou: 8 },            placeholder: true },
    ],
  },

};

/**
 * Retourne les multiplicateurs de regen selon les niveaux d'upgrade actuels.
 * @param {{ [id: string]: number }} upgradeLevels
 */
export function getUpgradeBonuses(upgradeLevels = {}) {
  const cuisine    = upgradeLevels.cuisine    ?? 0;
  const filtration = upgradeLevels.filtration ?? 0;
  const coffre     = upgradeLevels.coffre     ?? 0;

  const hungerRegenMult  = cuisine    > 0 ? UPGRADES.cuisine.levels[cuisine - 1].hungerRegenMult  : 1;
  const thirstRegenMult  = filtration > 0 ? UPGRADES.filtration.levels[filtration - 1].thirstRegenMult : 1;
  const chestBonus       = coffre     > 0 ? UPGRADES.coffre.levels[coffre - 1].chestBonus         : 0;

  return { hungerRegenMult, thirstRegenMult, chestBonus };
}
