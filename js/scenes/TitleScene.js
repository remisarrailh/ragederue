import { GAME_W, GAME_H } from '../config/constants.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    // ── Background ────────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor('#0a0a14');

    // ── Pad index from localStorage → registry ────────────────────────────
    if (this.registry.get('padIndex') === undefined) {
      const saved = parseInt(localStorage.getItem('RAGEDERUE_padIndex') ?? '0', 10);
      this.registry.set('padIndex', saved);
    }

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GAME_H * 0.28, 'RAGEDERUE ONLINE', {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // ── "Press Start" label ───────────────────────────────────────────────
    const prompt = this.add.text(GAME_W / 2, GAME_H * 0.50, 'ENTER / START : PLAY', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Blink
    this.tweens.add({
      targets: prompt,
      alpha: 0,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    // ── Settings hint ─────────────────────────────────────────────────────
    const settingsHint = this.add.text(GAME_W / 2, GAME_H * 0.62, 'ESC / SELECT : SETTINGS', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5);

    // ── Level editor hint ─────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GAME_H * 0.71, 'L : LEVEL EDITOR', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#4488ff',
    }).setOrigin(0.5);

    // ── Controls hint (layout-aware) ──────────────────────────────────────
    const controlsText = this.add.text(GAME_W / 2, GAME_H * 0.84, [
      'WASD / ZQSD / Arrows ── Move',
      'X ── Punch    C ── Kick    V ── Jab',
      'SPACE ── Jump',
    ].join('\n'), {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#666666',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Détecte la disposition du clavier de façon asynchrone
    // et affine le hint de mouvement si possible.
    this._detectLayout().then(layout => {
      if (!this.scene.isActive()) return;   // scène déjà quittée
      this.registry.set('kbLayout', layout);
      const moveHint = layout === 'azerty'
        ? 'ZQSD / Flèches ── Déplacement'
        : 'WASD / Arrows ── Move';
      controlsText.setText([
        moveHint,
        'X ── Punch    C ── Kick    V ── Jab',
        'SPACE ── Jump',
      ].join('\n'));
    });

    // ── Music (naval) ─────────────────────────────────────────────────────
    this.sound.stopByKey('music_naval');
    this.sound.stopByKey('music_street');
    const savedVol = parseFloat(localStorage.getItem('RAGEDERUE_music_vol') ?? '0.5');
    this.bgMusic = this.sound.add('music_naval', { loop: true, volume: savedVol });
    this.bgMusic.play();

    // ── SFX volume from localStorage → registry ──────────────────────────
    const sfxVol = parseFloat(localStorage.getItem('RAGEDERUE_sfx_vol') ?? '0.5');
    this.registry.set('sfxVol', sfxVol);

    // ── Input: only ENTER / START to play ─────────────────────────────────
    this._started = false;

    this.input.keyboard.on('keydown-ENTER', () => this._go());
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 9) this._go();    // Start
      if (button.index === 8) this._openSettings();  // Select
    });
    this.input.keyboard.on('keydown-ESC', () => this._openSettings());
    this.input.keyboard.on('keydown-L',   () => this._openEditor());
  }

  _go() {
    if (this._started) return;
    this._started = true;
    if (this.bgMusic) {
      this.bgMusic.stop();
      this.bgMusic.destroy();
      this.bgMusic = null;
    }
    this.scene.start('CharacterScene');
  }

  _openSettings() {
    if (this._started) return;
    if (this.scene.isActive('PauseScene')) {
      this.scene.stop('PauseScene');
      return;
    }
    this.sound.play('sfx_menu', { volume: this.registry.get('sfxVol') ?? 0.5 });
    this.scene.launch('PauseScene', { fromScene: 'TitleScene' });
  }

  _openEditor() {
    if (this._started) return;
    this._started = true;
    if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
    this.scene.start('LevelEditorScene');
  }

  /**
   * Détecte la disposition du clavier.
   * Méthode 1 : navigator.keyboard.getLayoutMap() — précis, Chrome uniquement.
   * Méthode 2 : navigator.language — heuristique (fr/be → AZERTY).
   * @returns {Promise<'azerty'|'qwerty'>}
   */
  async _detectLayout() {
    try {
      if (navigator.keyboard?.getLayoutMap) {
        const map = await navigator.keyboard.getLayoutMap();
        // Sur AZERTY : la touche physique Q (KeyQ) produit 'a'
        // Sur QWERTY : la touche physique Q (KeyQ) produit 'q'
        return map.get('KeyQ') === 'a' ? 'azerty' : 'qwerty';
      }
    } catch { /* API non disponible ou refusée */ }
    // Fallback : langue du navigateur
    const lang = (navigator.language ?? '').toLowerCase();
    return (lang.startsWith('fr') || lang.startsWith('be')) ? 'azerty' : 'qwerty';
  }
}
