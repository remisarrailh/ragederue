/**
 * levels.js — Agrégateur auto-généré par le serveur éditeur.
 *
 * NE PAS MODIFIER MANUELLEMENT : éditer via l'éditeur (touche L)
 * puis cliquer [ SAVE ].
 */

import level_01 from './levels/level_01.js';
import level_02 from './levels/level_02.js';
import level_03 from './levels/level_03.js';

export const LEVELS = [level_01, level_02, level_03];

export const LEVEL_MAP = Object.fromEntries(LEVELS.map(l => [l.id, l]));

if (import.meta.hot) import.meta.hot.accept(() => {});
