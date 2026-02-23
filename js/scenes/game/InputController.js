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
    // ZQSD = AZERTY equivalent of WASD (same physical positions).
    // We support both simultaneously so AZERTY/QWERTY users need no setup.
    this.cursors = scene.input.keyboard.createCursorKeys();
    const kb = scene.input.keyboard;
    const w = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    const a = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    const s = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    const d = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    const z = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    const q = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    // Composite keys: .isDown if either WASD or ZQSD key is held
    const combo = (k1, k2) => ({ get isDown() { return k1.isDown || k2.isDown; } });
    this.wasd = {
      up:    combo(w, z),
      down:  combo(s, s),   // S is the same key in both layouts
      left:  combo(a, q),
      right: combo(d, d),   // D is the same key in both layouts
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
