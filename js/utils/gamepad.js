/**
 * gamepad.js — Utilitaires gamepad réutilisables.
 *
 * Élimine la copie des 4 blocs identiques de lecture D-pad dans
 * InventoryScene, SearchScene, HideoutChestScene, CharacterScene.
 *
 * Usage : import { getDpadDir, isGamepad } from '../utils/gamepad.js';
 */

const DEAD = 0.4;   // zone morte joystick analogique

/**
 * Retourne la direction D-pad normalisée { x, y } avec des valeurs -1, 0 ou 1.
 * Prend en compte les boutons D-pad ET le stick analogique gauche.
 * @param {Phaser.Input.Gamepad.Gamepad} pad
 * @returns {{ x: number, y: number }}
 */
export function getDpadDir(pad) {
  return {
    x: (pad.left  || pad.leftStick.x < -DEAD) ? -1
      : (pad.right || pad.leftStick.x >  DEAD) ?  1 : 0,
    y: (pad.up    || pad.leftStick.y < -DEAD) ? -1
      : (pad.down  || pad.leftStick.y >  DEAD) ?  1 : 0,
  };
}

/**
 * Retourne true si le mode de saisie actuel est gamepad.
 * @param {Phaser.Scene} scene
 * @returns {boolean}
 */
export function isGamepad(scene) {
  return scene.registry.get('inputMode') === 'gp';
}

/**
 * Lit le gamepad sélectionné par l'utilisateur (padIndex depuis le registry).
 * @param {Phaser.Scene} scene
 * @returns {Phaser.Input.Gamepad.Gamepad | null}
 */
export function getActivePad(scene) {
  const padIndex = scene.registry.get('padIndex') ?? 0;
  const gp = scene.input.gamepad;
  if (!gp || gp.total === 0 || !document.hasFocus()) return null;
  return gp.getPad(padIndex) ?? null;
}
