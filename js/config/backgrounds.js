/**
 * backgrounds.js — Auto-discovery des images de fond via Vite glob.
 *
 * Ajouter un fichier dans assets/Stage Layers/backgrounds/ suffit :
 * il sera chargé automatiquement dans Phaser et disponible dans l'éditeur.
 *
 * Convention de nommage : le nom de fichier sans extension devient la clé Phaser.
 *   ex. "bar_backgrounds.png"  →  clé = "bar_backgrounds"
 */

const _glob = import.meta.glob(
  '/assets/Stage Layers/backgrounds/*.{png,jpg,jpeg}',
  { eager: true, query: '?url', import: 'default' }
);

/** @type {{ key: string, url: string }[]} */
export const BACKGROUNDS = Object.entries(_glob).map(([path, url]) => ({
  key: path.split('/').pop().replace(/\.[^.]+$/, ''),
  url,
}));

/** Clés Phaser des backgrounds (ex. ["bar_backgrounds"]) */
export const BACKGROUND_KEYS = BACKGROUNDS.map(b => b.key);
