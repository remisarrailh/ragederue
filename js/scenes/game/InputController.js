import { KB_BINDS, PAD_BINDS } from '../../config/controls.js';

/**
 * InputController — sets up all keyboard and gamepad input for GameScene.
 * Exposes `cursors` and `wasd` for use in player movement.
 */
export default class InputController {
  constructor(scene) {
    this.scene   = scene;
    this.cursors = null;
    this.wasd    = null;
  }

  /**
   * @param {object} callbacks  { onInteract, onInventory, onSettings }
   */
  setup(callbacks) {
    const scene = this.scene;
    const { onInteract, onInventory, onSettings } = callbacks;

    // ── Cursor / WASD+ZQSD keys ──────────────────────────────────────────
    // Support both layouts simultaneously: W+Z for up, A+Q for left.
    this.cursors = scene.input.keyboard.createCursorKeys();
    const kb = scene.input.keyboard;
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;

    const wKey = kb.addKey(KeyCodes.W);
    const zKey = kb.addKey(KeyCodes.Z);
    const aKey = kb.addKey(KeyCodes.A);
    const qKey = kb.addKey(KeyCodes.Q);
    const sKey = kb.addKey(KeyCodes.S);
    const dKey = kb.addKey(KeyCodes.D);

    // Composite key: isDown if either key is held
    const makeCombo = (k1, k2) => ({ get isDown() { return k1.isDown || k2.isDown; } });

    this.wasd = {
      up:    makeCombo(wKey, zKey),
      down:  sKey,
      left:  makeCombo(aKey, qKey),
      right: dKey,
    };

    // ── Keyboard event listeners ─────────────────────────────────────────
    scene.input.keyboard.on(`keydown-${KB_BINDS.INTERACT}`, () => {
      if (scene.player?.searching || scene.player?.inMenu) return;
      scene.registry.set('inputMode', 'kb');
      onInteract();
    });
    scene.input.keyboard.on(`keydown-${KB_BINDS.INVENTORY}`, (e) => {
      e.preventDefault();
      if (scene.player?.inMenu) return;
      scene.registry.set('inputMode', 'kb');
      onInventory();
    });
    scene.input.keyboard.on(`keydown-${KB_BINDS.MENU}`, () => {
      scene.registry.set('inputMode', 'kb');
      onSettings();
    });
    scene.input.keyboard.on('keydown', () => {
      scene.registry.set('inputMode', 'kb');
    });

    // ── Gamepad event listeners ──────────────────────────────────────────
    scene.input.gamepad.on('down', (pad, button) => {
      if (!document.hasFocus()) return;
      const chosenPad = scene.registry.get('padIndex') ?? 0;
      if (chosenPad < 0) return;
      if (pad.index !== chosenPad) return;
      scene.registry.set('inputMode', 'gp');
      if (scene.player.searching || scene.player.inMenu || scene.player.inInventory) return;
      // Guard: don't reopen inventory if it was just closed this frame
      const closedAt = scene.registry.get('inventoryClosedAt') ?? 0;
      if (button.index === PAD_BINDS.INVENTORY && Date.now() - closedAt < 200) return;
      if (button.index === PAD_BINDS.MENU)      onSettings();
      if (button.index === PAD_BINDS.INTERACT)  onInteract();
      if (button.index === PAD_BINDS.INVENTORY) onInventory();
    });

    // ── Restore saved pad index ──────────────────────────────────────────
    if (scene.registry.get('padIndex') === undefined) {
      const saved = parseInt(localStorage.getItem('RAGEDERUE_padIndex') ?? '0', 10);
      scene.registry.set('padIndex', saved);
    }
  }
}
