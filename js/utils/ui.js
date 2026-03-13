/**
 * ui.js — Helpers de construction d'UI Phaser réutilisables.
 *
 * Élimine les patterns répétés dans toutes les scènes :
 *   - Boutons texte avec hover
 *   - Overlays plein écran
 *   - Titres avec stroke
 *   - Tween blink (curseur)
 *   - Barres de progression
 *   - Bouton close standard
 *
 * Usage : import { makeBtn, makeOverlay } from '../utils/ui.js';
 */

import { GAME_W, GAME_H } from '../config/constants.js';
import { FONT, COLOR, SIZE, ALPHA } from '../config/uiTheme.js';

/**
 * Bouton texte interactif avec hover intégré.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} label
 * @param {Function} onDown
 * @param {object} [opts]
 * @param {string}   [opts.color=COLOR.TEXT_HL]
 * @param {string}   [opts.hoverColor=COLOR.ACCENT]
 * @param {number}   [opts.depth=100]
 * @param {string}   [opts.fontSize=SIZE.MD]
 * @param {number[]} [opts.origin=[0.5, 0.5]]
 * @returns {Phaser.GameObjects.Text}
 */
export function makeBtn(scene, x, y, label, onDown, opts = {}) {
  const {
    color      = COLOR.TEXT_HL,
    hoverColor = COLOR.ACCENT,
    depth      = 100,
    fontSize   = SIZE.MD,
    origin     = [0.5, 0.5],
  } = opts;

  const btn = scene.add.text(x, y, label, {
    fontFamily: FONT.MONO,
    fontSize,
    color,
  }).setOrigin(...origin).setDepth(depth).setInteractive({ useHandCursor: true });

  btn.on('pointerdown', onDown);
  btn.on('pointerover',  () => btn.setColor(hoverColor));
  btn.on('pointerout',   () => btn.setColor(color));

  return btn;
}

/**
 * Rectangle semi-transparent plein écran (bloque les clics derrière).
 * @param {Phaser.Scene} scene
 * @param {number} [depth=1000]
 * @param {number} [alpha=ALPHA.OVERLAY]
 * @returns {Phaser.GameObjects.Rectangle}
 */
export function makeOverlay(scene, depth = 1000, alpha = ALPHA.OVERLAY) {
  return scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLOR.BG_BLACK, alpha)
    .setDepth(depth)
    .setInteractive();  // bloque les clics sous le modal
}

/**
 * Texte de titre avec stroke (pour les titres de modaux).
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.color=COLOR.ACCENT]
 * @param {string} [opts.fontSize=SIZE.MD]
 * @param {number} [opts.depth=100]
 * @param {number} [opts.strokeThickness=3]
 * @returns {Phaser.GameObjects.Text}
 */
export function makeTitle(scene, x, y, text, opts = {}) {
  const {
    color          = COLOR.ACCENT,
    fontSize       = SIZE.MD,
    depth          = 100,
    strokeThickness = 3,
  } = opts;

  return scene.add.text(x, y, text, {
    fontFamily: FONT.MONO,
    fontSize,
    color,
    stroke: '#000000',
    strokeThickness,
  }).setOrigin(0.5).setDepth(depth);
}

/**
 * Tween alpha yoyo infini (effet curseur clignotant).
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} target
 * @param {number} [minAlpha=0.5]
 * @param {number} [duration=400]
 * @returns {Phaser.Tweens.Tween}
 */
export function blink(scene, target, minAlpha = 0.5, duration = 400) {
  return scene.tweens.add({
    targets: target,
    alpha:   minAlpha,
    duration,
    yoyo:   true,
    repeat: -1,
  });
}

/**
 * Barre de progression (fond + fill séparés).
 * @param {Phaser.Scene} scene
 * @param {number} x         Centre X
 * @param {number} y         Centre Y
 * @param {number} w         Largeur totale
 * @param {number} h         Hauteur
 * @param {number} fillColor Couleur hex fill (ex: 0x00ff88)
 * @param {number} [depth=200]
 * @returns {{ bg: Phaser.GameObjects.Rectangle, fill: Phaser.GameObjects.Rectangle }}
 */
export function makeProgressBar(scene, x, y, w, h, fillColor, depth = 200) {
  const bg   = scene.add.rectangle(x, y, w, h, 0x333333).setOrigin(0.5).setDepth(depth);
  const fill = scene.add.rectangle(x - w / 2, y, 0, h, fillColor).setOrigin(0, 0.5).setDepth(depth + 1);
  return { bg, fill };
}

/**
 * Bouton close ✕ standard (cercle rouge + lettre X).
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {Function} onDown
 * @param {number} [depth=200]
 * @returns {{ circle: Phaser.GameObjects.Arc, label: Phaser.GameObjects.Text }}
 */
export function makeCloseBtn(scene, x, y, onDown, depth = 200) {
  const circle = scene.add.circle(x, y, 18, 0xaa2222, 0.9)
    .setStrokeStyle(2, 0xff4444, 0.8)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });

  const label = scene.add.text(x, y, 'X', {
    fontFamily: FONT.MONO,
    fontSize:   SIZE.LG,
    color:      COLOR.TEXT_HL,
    stroke:     '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(depth + 1);

  circle.on('pointerdown', onDown);

  return { circle, label };
}
