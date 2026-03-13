/**
 * Fonction pour lier les actions d'interface (UI) dans n'importe quelle scène.
 * @param {Phaser.Scene} scene - La scène actuelle
 * @param {Object} actions - Les fonctions à appeler { onAccept, onCancel, onMenu, onTabLeft, onTabRight }
 */



// Mapping pour le Clavier (correspond aux codes de touches Phaser)
export const KB_BINDS = {
  UP:        'UP',
  DOWN:      'DOWN',
  LEFT:      'LEFT',
  RIGHT:     'RIGHT',
  ACCEPT:    'X',      // Touche pour valider dans les menus / ramasser un objet
  CANCEL:    'ESC',    // Touche pour fermer / annuler
  INTERACT:  'E',      // Touche pour ouvrir les coffres/parler
  INVENTORY: 'TAB',
  MENU:      'ESC',
  SPRINT:    'SHIFT'
};

// Mapping pour la Manette (Index des boutons standards)
export const PAD_BINDS = {
  ACCEPT:    0, // A / Croix
  CANCEL:    1, // B / Rond
  INTERACT:  3, // Y / Triangle
  INVENTORY: 8, // Select / Share
  MENU:      9, // Start / Options
  TAB_LEFT:  4, // LB / L1
  TAB_RIGHT: 5  // RB / R1
};

/**
 * Enregistre des listeners clavier pour les 4 directions.
 * Écoute simultanément : flèches, WASD (QWERTY) et ZQSD (AZERTY).
 * @param {Phaser.Scene} scene
 * @param {{ onUp?, onDown?, onLeft?, onRight? }} callbacks
 */
export function addDirListeners(scene, { onUp, onDown, onLeft, onRight }) {
  const kb = scene.input.keyboard;
  const wrap = (fn) => () => { scene.registry.set('inputMode', 'kb'); fn(); };
  if (onUp)    ['UP',    'W', 'Z'].forEach(k => kb.on(`keydown-${k}`, wrap(onUp)));
  if (onDown)  ['DOWN',  'S'     ].forEach(k => kb.on(`keydown-${k}`, wrap(onDown)));
  if (onLeft)  ['LEFT',  'A', 'Q'].forEach(k => kb.on(`keydown-${k}`, wrap(onLeft)));
  if (onRight) ['RIGHT', 'D'     ].forEach(k => kb.on(`keydown-${k}`, wrap(onRight)));
}

export function setupUIControls(scene, actions) {
  // 1. Clavier
  if (actions.onCancel) {
    scene.input.keyboard.on(`keydown-${KB_BINDS.CANCEL}`, () => { scene.registry.set('inputMode', 'kb'); actions.onCancel(); });
  }
  if (actions.onAccept) {
    scene.input.keyboard.on(`keydown-${KB_BINDS.ACCEPT}`, () => { scene.registry.set('inputMode', 'kb'); actions.onAccept(); });
  }

  // 2. Manette
  scene.input.gamepad.on('down', (pad, button) => {
    scene.registry.set('inputMode', 'gp');
    if (actions.onAccept && button.index === PAD_BINDS.ACCEPT) actions.onAccept();
    if (actions.onCancel && button.index === PAD_BINDS.CANCEL) actions.onCancel();
    if (actions.onMenu && button.index === PAD_BINDS.MENU) actions.onMenu();
    if (actions.onTabLeft && button.index === PAD_BINDS.TAB_LEFT) actions.onTabLeft();
    if (actions.onTabRight && button.index === PAD_BINDS.TAB_RIGHT) actions.onTabRight();
  });
}