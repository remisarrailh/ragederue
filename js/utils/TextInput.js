/**
 * TextInput.js — Overlay natif HTML `<input>` pour saisie texte dans Phaser.
 *
 * Remplace le système _capturingInput/_inputBuffer maison dans LevelEditorScene.
 * Avantages : copier/coller natif, curseur positionnable, sélection de texte.
 * Aucune dépendance externe — fonctionne avec Phaser CDN ou npm.
 *
 * Usage :
 *   const inp = new TextInput(scene, {
 *     gameX: obj.x, gameY: obj.y,
 *     value: 'valeur initiale',
 *     onCommit: (val) => { ... },
 *     onCancel: () => { ... },
 *   });
 *   // Détruire manuellement si nécessaire :
 *   inp.destroy();
 */

export class TextInput {
  /**
   * Convertit des coordonnées scène UI (uiCam zoom=1 scroll=0) en coordonnées écran.
   * @param {Phaser.Scene} scene
   * @param {number} gameX   coordonnée X scène
   * @param {number} gameY   coordonnée Y scène
   * @returns {{ screenX: number, screenY: number, scaleX: number, scaleY: number }}
   */
  static toScreen(scene, gameX, gameY) {
    const canvas = scene.game.canvas;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = rect.width  / scene.game.config.width;
    const scaleY = rect.height / scene.game.config.height;
    return {
      screenX: rect.left + gameX * scaleX,
      screenY: rect.top  + gameY * scaleY,
      scaleX,
      scaleY,
    };
  }

  /**
   * @param {Phaser.Scene} scene
   * @param {object}   opts
   * @param {number}   opts.gameX          X en coordonnées scène UI (uiCam)
   * @param {number}   opts.gameY          Y en coordonnées scène UI (uiCam)
   * @param {number}   [opts.width=200]    Largeur en coordonnées scène
   * @param {number}   [opts.fontSize=13]  Taille de police en coordonnées scène
   * @param {string}   [opts.value='']     Valeur initiale
   * @param {number}   [opts.maxLength=30] Longueur max
   * @param {Function} [opts.onCommit]     Appelé avec la valeur trimmée quand Enter
   * @param {Function} [opts.onCancel]     Appelé quand Escape ou perte de focus
   */
  constructor(scene, opts = {}) {
    this._onCommit = opts.onCommit;
    this._onCancel = opts.onCancel;
    this._committed = false;

    const { screenX, screenY, scaleX, scaleY } = TextInput.toScreen(
      scene, opts.gameX ?? 0, opts.gameY ?? 0
    );

    const w = (opts.width    ?? 200) * scaleX;
    const h = (opts.fontSize ?? 13)  * scaleY * 2.2;

    const el = document.createElement('input');
    el.type      = 'text';
    el.value     = opts.value ?? '';
    el.maxLength = opts.maxLength ?? 30;

    Object.assign(el.style, {
      position:   'fixed',
      left:       `${screenX}px`,
      top:        `${screenY - h / 2}px`,
      width:      `${w}px`,
      height:     `${h}px`,
      fontFamily: 'monospace',
      fontSize:   `${(opts.fontSize ?? 13) * scaleY}px`,
      color:      '#ffff00',
      background: 'rgba(17, 17, 34, 0.97)',
      border:     '1px solid #5555aa',
      padding:    '1px 4px',
      outline:    'none',
      boxSizing:  'border-box',
      zIndex:     '10000',
    });

    // Arrêter la propagation pour que les raccourcis Phaser ne reçoivent pas les touches
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this._committed = true;
        opts.onCommit?.(el.value.trim());
        this.destroy();
      } else if (e.key === 'Escape') {
        opts.onCancel?.();
        this.destroy();
      }
    }, { capture: true });

    // Perte de focus = annulation (clic ailleurs dans l'éditeur)
    el.addEventListener('blur', () => {
      if (!this._committed) {
        opts.onCancel?.();
      }
      this.destroy();
    }, { once: true });

    document.body.appendChild(el);
    this._el = el;

    // Petite astuce : requestAnimationFrame évite que le clic qui a ouvert l'input
    // soit traité comme un clic "ailleurs" et déclenche immédiatement blur
    requestAnimationFrame(() => {
      if (this._el) {
        this._el.focus();
        this._el.select();
      }
    });
  }

  /** Valeur courante de l'input (avant commit). */
  get value() { return this._el?.value ?? ''; }

  /** Détruire l'élément DOM (safe si déjà détruit). */
  destroy() {
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  }
}
