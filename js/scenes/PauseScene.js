import { GAME_W, GAME_H } from '../config/constants.js';

const SLIDER_W = 200;
const SLIDER_H = 6;

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PauseScene' });
  }

  create(data) {
    this._fromScene  = (data && data.fromScene)  || 'GameScene';
    this._fromEditor = !!(data && data.fromEditor);

    // ── Semi-transparent overlay ──────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.7)
      .setOrigin(0.5);

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, GAME_H * 0.08, 'SETTINGS', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // ── Sound sliders ─────────────────────────────────────────────────────
    this._sliders = [];
    this._activeSlider = 0;

    this._buildSlider({
      y: GAME_H * 0.40,
      label: 'MUSIC VOLUME',
      lsKey: 'RAGEDERUE_music_vol',
      color: 0xff6600,
      apply: (vol) => {
        for (const key of ['GameScene', 'TitleScene']) {
          const s = this.scene.get(key);
          if (s && s.bgMusic) s.bgMusic.setVolume(vol);
        }
      },
    });

    this._buildSlider({
      y: GAME_H * 0.56,
      label: 'SFX VOLUME',
      lsKey: 'RAGEDERUE_sfx_vol',
      color: 0x00ccff,
      apply: (vol) => {
        this.registry.set('sfxVol', vol);
      },
    });

    this._highlightSlider();

    this.add.text(GAME_W / 2, GAME_H * 0.68, '▲▼ select slider   ◄► adjust', {
      fontFamily: 'monospace', fontSize: '11px', color: '#666666',
    }).setOrigin(0.5);

    // ── Bouton retour éditeur (mode test uniquement) ──────────────────────
    if (this._fromEditor) {
      const btnEditor = this.add.text(GAME_W / 2, GAME_H * 0.82, '[ RETOUR ÉDITEUR ]', {
        fontFamily: 'monospace', fontSize: '18px', color: '#4488ff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btnEditor.on('pointerdown', () => this._exitToEditor());
      btnEditor.on('pointerover', () => btnEditor.setColor('#88bbff'));
      btnEditor.on('pointerout',  () => btnEditor.setColor('#4488ff'));

      this.add.text(GAME_W / 2, GAME_H * 0.88, 'Touche  R  — quitter le test', {
        fontFamily: 'monospace', fontSize: '11px', color: '#446688',
      }).setOrigin(0.5);
    }

    // ── Hint ──────────────────────────────────────────────────────────────
    const hint = this.add.text(GAME_W / 2, GAME_H * 0.94, 'ESC / Start: fermer', {
      fontFamily: 'monospace', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ESC', () => this._resume());
    this._kbUp    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this._kbDown  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this._kbLeft  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this._kbRight = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this._kbCd    = { horiz: 0, vert: 0 };
    if (this._fromEditor) {
      this.input.keyboard.on('keydown-R', () => this._exitToEditor());
    }
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 9) this._resume();  // Start
    });
  }

  // ── Slider builder ───────────────────────────────────────────────────────

  _buildSlider({ y, label, lsKey, color, apply }) {
    const cx = GAME_W / 2;
    const saved = parseFloat(localStorage.getItem(lsKey) ?? '0.5');
    const trackX = cx - SLIDER_W / 2;

    const lbl = this.add.text(cx, y - 22, label, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff8800',
    }).setOrigin(0.5);

    const track = this.add.rectangle(cx, y, SLIDER_W, SLIDER_H, 0x333333).setOrigin(0.5);
    const fill  = this.add.rectangle(trackX, y, SLIDER_W * saved, SLIDER_H, color).setOrigin(0, 0.5);
    const knob  = this.add.circle(trackX + SLIDER_W * saved, y, 10, 0xffffff)
      .setInteractive({ draggable: true, useHandCursor: true });
    const pct   = this.add.text(cx + SLIDER_W / 2 + 30, y, `${Math.round(saved * 100)}%`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#cccccc',
    }).setOrigin(0.5);

    const applyVol = (vol) => {
      fill.width = SLIDER_W * vol;
      knob.x = trackX + SLIDER_W * vol;
      pct.setText(`${Math.round(vol * 100)}%`);
      localStorage.setItem(lsKey, vol.toFixed(2));
      apply(vol);
    };

    const hitZone = this.add.rectangle(cx, y, SLIDER_W + 20, 30, 0x000000, 0)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    let dragging = false;
    const applyPointer = (pointer) => {
      const clamped = Phaser.Math.Clamp(pointer.x, trackX, trackX + SLIDER_W);
      const v = (clamped - trackX) / SLIDER_W;
      state.vol = v;
      applyVol(v);
      this._activeSlider = this._sliders.indexOf(state);
      this._highlightSlider();
    };
    hitZone.on('pointerdown', (p) => { dragging = true;  applyPointer(p); });
    hitZone.on('pointermove', (p) => { if (dragging) applyPointer(p); });
    hitZone.on('pointerup',   ()  => { dragging = false; });
    hitZone.on('pointerout',  ()  => { dragging = false; });
    knob.on('pointerdown',    (p) => { dragging = true;  applyPointer(p); });
    this.input.on('drag', (pointer, go, dragX) => {
      if (go !== knob) return;
      const clamped = Phaser.Math.Clamp(dragX, trackX, trackX + SLIDER_W);
      knob.x = clamped;
      const v = (clamped - trackX) / SLIDER_W;
      state.vol = v;
      applyVol(v);
    });

    const state = { vol: saved, applyVol, trackX, lbl, knob, fill, track, pct, hitZone };
    this._sliders.push(state);
    apply(saved);
  }

  _highlightSlider() {
    if (!this._sliders) return;
    this._sliders.forEach((s, i) => {
      const active = i === this._activeSlider;
      s.lbl.setColor(active ? '#ffcc00' : '#ff8800');
      s.knob.setFillStyle(active ? 0xffcc00 : 0xffffff);
    });
  }

  // ── Update: keyboard/gamepad slider control ──────────────────────────────

  update(time, delta) {
    if (!this._sliders || this._sliders.length === 0) return;

    this._kbCd.horiz -= delta;
    this._kbCd.vert  -= delta;

    const gp   = this.input.gamepad;
    const pad  = (gp && gp.total > 0) ? gp.getPad(0) : null;
    const DEAD = 0.2;

    const kbUp    = this._kbUp?.isDown;
    const kbDown  = this._kbDown?.isDown;
    const kbLeft  = this._kbLeft?.isDown;
    const kbRight = this._kbRight?.isDown;
    const gpUp    = pad && (pad.up    || pad.leftStick.y < -DEAD);
    const gpDown  = pad && (pad.down  || pad.leftStick.y >  DEAD);
    const gpLeft  = pad && (pad.left  || pad.leftStick.x < -DEAD);
    const gpRight = pad && (pad.right || pad.leftStick.x >  DEAD);

    // ▲▼ : switch active slider
    let vert = 0;
    if ((kbUp   || gpUp)   && this._kbCd.vert <= 0) { vert = -1; this._kbCd.vert = 220; }
    if ((kbDown || gpDown) && this._kbCd.vert <= 0) { vert =  1; this._kbCd.vert = 220; }
    if (vert !== 0) {
      this._activeSlider = Phaser.Math.Clamp(this._activeSlider + vert, 0, this._sliders.length - 1);
      this._highlightSlider();
    }
    if (!kbUp && !kbDown && !gpUp && !gpDown) this._kbCd.vert = 0;

    // ◄► : adjust value (continuous)
    let hdir = 0;
    if (kbLeft  || gpLeft)  hdir = -1;
    if (kbRight || gpRight) hdir =  1;
    if (pad && Math.abs(pad.leftStick.x) > DEAD) hdir = pad.leftStick.x;
    if (hdir !== 0) {
      const s  = this._sliders[this._activeSlider];
      const nv = Phaser.Math.Clamp(s.vol + hdir * 0.8 * (delta / 1000), 0, 1);
      s.vol = nv;
      s.applyVol(nv);
    }
  }

  // ── Close ────────────────────────────────────────────────────────────────

  _resume() {
    if (this._fromScene === 'GameScene') {
      const gameScene = this.scene.get('GameScene');
      if (gameScene) {
        if (gameScene.player) gameScene.player.inMenu = false;
        gameScene.input.keyboard.enabled = true;
      }
    }
    this.scene.stop();
  }

  _exitToEditor() {
    const gameScene = this.scene.get('GameScene');
    if (gameScene) {
      gameScene.input.keyboard.enabled = true;
      if (gameScene.player) {
        gameScene.player.inMenu = false;
        gameScene._endGame('over', '');
      }
    }
    this.scene.stop();
  }
}
