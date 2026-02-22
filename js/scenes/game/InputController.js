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

    // ── Cursor / WASD keys ───────────────────────────────────────────────
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── Keyboard event listeners ─────────────────────────────────────────
    scene.input.keyboard.on('keydown-E', () => {
      scene.registry.set('inputMode', 'kb');
      onInteract();
    });
    scene.input.keyboard.on('keydown-TAB', (e) => {
      e.preventDefault();
      scene.registry.set('inputMode', 'kb');
      onInventory();
    });
    scene.input.keyboard.on('keydown-ESC', () => {
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
      if (scene.player.searching || scene.player.inMenu) return;
      if (button.index === 9) onSettings();   // Start
      if (button.index === 3) onInteract();   // Y / Triangle
      if (button.index === 8) onInventory();  // Select
    });

    // ── Restore saved pad index ──────────────────────────────────────────
    if (scene.registry.get('padIndex') === undefined) {
      const saved = parseInt(localStorage.getItem('RAGEDERUE_padIndex') ?? '0', 10);
      scene.registry.set('padIndex', saved);
    }
  }
}
