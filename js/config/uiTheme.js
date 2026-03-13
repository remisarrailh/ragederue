/**
 * uiTheme.js — Constantes visuelles centralisées pour toutes les scènes.
 *
 * Source unique de vérité pour fontFamily, couleurs, opacités et tailles de texte.
 * Importez uniquement ce dont vous avez besoin :
 *   import { FONT, COLOR, SIZE } from '../config/uiTheme.js';
 */

export const FONT = {
  MONO: 'monospace',
};

export const COLOR = {
  // ── Textes ──────────────────────────────────────────────────────────────
  ACCENT:   '#ffaa00',   // orange — titres de sections, onglets actifs
  TITLE:    '#ff6600',   // orange vif — titre principal
  TEXT:     '#cccccc',   // gris clair — texte courant
  TEXT_DIM: '#888888',   // gris moyen — secondaire, inactif
  TEXT_HL:  '#ffffff',   // blanc — hover, sélectionné
  ALERT:    '#ff4444',   // rouge — erreur, mort, attention
  SUCCESS:  '#44ff88',   // vert — confirmation, ajout
  CYAN:     '#00ffcc',   // cyan — accent planque / spécial
  YELLOW:   '#ffff00',   // jaune — saisie active, curseur texte
  ORANGE:   '#ff8800',   // orange sombre — slider label, tab actif
  // ── Hex pour Phaser Graphics / FillStyle ────────────────────────────────
  BG_DARK:  0x111122,    // fond boîte dialogue
  BG_MED:   0x1a1a2e,    // fond grille inventaire
  BG_CELL:  0x333355,    // cellule vide inventaire
  BG_BLACK: 0x000000,    // noir overlay
  STROKE:   0x5555aa,    // bordure boîte
};

export const ALPHA = {
  OVERLAY: 0.65,   // overlay plein écran semi-transparent
  BOX:     0.95,   // boîte modale
  BOX_MED: 0.90,   // boîte secondaire
};

export const SIZE = {
  XS:  '9px',
  SM:  '11px',
  MD:  '13px',
  LG:  '16px',
  XL:  '22px',
  XXL: '40px',
};

export const STROKE_DEFAULT = { color: '#000000', thickness: 3 };
