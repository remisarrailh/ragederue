import { GAME_W, GAME_H } from '../config/constants.js';

const SLIDER_W = 200;
const SLIDER_H = 6;
const TAB_CONTROLS = 0;
const TAB_SOUND    = 1;
const TAB_NAMES    = ['CONTROLS', 'SOUND'];

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

    // ── Tabs ──────────────────────────────────────────────────────────────
    this._activeTab = TAB_CONTROLS;
    this._tabLabels = [];
    this._tabGroups = [[], []]; // gameObjects per tab

    const tabY = GAME_H * 0.17;
    const tabSpacing = 180;
    const tabStartX = GAME_W / 2 - tabSpacing / 2;

    for (let i = 0; i < TAB_NAMES.length; i++) {
      const tx = tabStartX + i * tabSpacing;
      const lbl = this.add.text(tx, tabY, TAB_NAMES[i], {
        fontFamily: 'monospace', fontSize: '16px', color: '#888888',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      lbl.on('pointerdown', () => this._switchTab(i));
      this._tabLabels.push(lbl);
    }

    // Tab underline indicator
    this._tabLine = this.add.rectangle(0, tabY + 14, 100, 2, 0xff6600).setOrigin(0.5, 0);

    // ── Build tab contents ────────────────────────────────────────────────
    this._buildControlsTab();
    this._buildSoundTab();
    this._switchTab(TAB_CONTROLS);

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

    // ── Resume hint ───────────────────────────────────────────────────────
    const hint = this.add.text(GAME_W / 2, GAME_H * 0.94, 'ESC / Start: close   Q / L1: switch tab', {
      fontFamily: 'monospace', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ESC', () => this._resume());
    this.input.keyboard.on('keydown-Q',   () => this._nextTab());
    if (this._fromEditor) {
      this.input.keyboard.on('keydown-R', () => this._exitToEditor());
    }
    this.input.gamepad.on('down', (pad, button) => {
      if (button.index === 9) this._resume();   // Start
      if (button.index === 4) this._nextTab();   // L1
      if (button.index === 5) this._nextTab();   // R1
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Tab: CONTROLS
  // ═══════════════════════════════════════════════════════════════════════

  _buildControlsTab() {
    const grp = this._tabGroups[TAB_CONTROLS];
    const cx = GAME_W / 2;
    const topY = GAME_H * 0.25;

    // ── Controller selector ──────────────────────────────────────────────
    const selectorLabel = this.add.text(cx, topY, 'CONTROLLER', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff8800',
    }).setOrigin(0.5);
    grp.push(selectorLabel);

    const currentPad = this.registry.get('padIndex') ?? 0;
    this._padOptions = ['KEYBOARD', 'GAMEPAD 1', 'GAMEPAD 2', 'GAMEPAD 3', 'GAMEPAD 4'];
    // padIndex: -1 = keyboard only, 0-3 = gamepad indices
    this._padIdx = currentPad < 0 ? 0 : currentPad + 1; // index into _padOptions

    const arrowLeft = this.add.text(cx - 120, topY + 26, '◄', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff6600',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    grp.push(arrowLeft);

    const arrowRight = this.add.text(cx + 120, topY + 26, '►', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff6600',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    grp.push(arrowRight);

    this._padLabel = this.add.text(cx, topY + 26, this._padOptions[this._padIdx], {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5);
    grp.push(this._padLabel);

    arrowLeft.on('pointerdown', () => this._changePad(-1));
    arrowRight.on('pointerdown', () => this._changePad(1));

    // Gamepad D-pad left/right on controls tab to switch controller
    this._ctrlGpCd = 0;

    // ── Key/button reference ─────────────────────────────────────────────
    const refY = topY + 64;

    const kbLines = [
      '── KEYBOARD ──',
      '',
      'WASD / Arrows      Move',
      'X                  Punch',
      'C                  Kick',
      'V                  Jab',
      'SPACE              Jump',
      'E                  Search',
      'TAB                Inventory',
      'ESC                Settings',
    ];

    const gpLines = [
      '── GAMEPAD ──',
      '',
      'Left Stick / D-Pad Move',
      'Square  (X)        Punch',
      'Circle  (B)        Kick',
      'Triangle(Y)        Search',
      'Cross   (A)        Jump',
      'Select             Inventory',
      'Start              Settings',
    ];

    const kbText = this.add.text(cx, refY, kbLines.join('\n'), {
      fontFamily: 'monospace', fontSize: '12px', color: '#cccccc',
      align: 'left', lineSpacing: 3,
    }).setOrigin(0.5, 0);
    grp.push(kbText);

    const gpText = this.add.text(cx, refY + kbText.height + 14, gpLines.join('\n'), {
      fontFamily: 'monospace', fontSize: '12px', color: '#cccccc',
      align: 'left', lineSpacing: 3,
    }).setOrigin(0.5, 0);
    grp.push(gpText);
  }

  _changePad(dir) {
    this._padIdx = Phaser.Math.Clamp(this._padIdx + dir, 0, this._padOptions.length - 1);
    this._padLabel.setText(this._padOptions[this._padIdx]);

    // Save: _padIdx 0 = keyboard (-1), 1-4 = gamepad 0-3
    const padIndex = this._padIdx === 0 ? -1 : this._padIdx - 1;
    this.registry.set('padIndex', padIndex);
    localStorage.setItem('RAGEDERUE_padIndex', padIndex.toString());
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Tab: SOUND
  // ═══════════════════════════════════════════════════════════════════════

  _buildSoundTab() {
    this._sliders = [];
    this._activeSlider = 0;

    this._buildSlider({
      y: GAME_H * 0.40,
      label: 'MUSIC VOLUME',
      lsKey: 'RAGEDERUE_music_vol',
      color: 0xff6600,
      tab: TAB_SOUND,
      apply: (vol) => {
        // Apply to whichever scene has bgMusic
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
      tab: TAB_SOUND,
      apply: (vol) => {
        this.registry.set('sfxVol', vol);
      },
    });

    this._highlightSlider();

    // Hint for gamepad navigation
    const gpHint = this.add.text(GAME_W / 2, GAME_H * 0.68, '▲▼ select slider   ◄► adjust', {
      fontFamily: 'monospace', fontSize: '11px', color: '#666666',
    }).setOrigin(0.5);
    this._tabGroups[TAB_SOUND].push(gpHint);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Tab switching
  // ═══════════════════════════════════════════════════════════════════════

  _switchTab(idx) {
    this._activeTab = idx;

    // Update tab label styles + underline
    this._tabLabels.forEach((lbl, i) => {
      const active = i === idx;
      lbl.setColor(active ? '#ff6600' : '#555555');
      lbl.setFontSize(active ? '16px' : '14px');
    });
    this._tabLine.setPosition(this._tabLabels[idx].x, this._tabLine.y);
    this._tabLine.setSize(this._tabLabels[idx].width + 16, 2);

    // Show/hide tab groups
    for (let t = 0; t < this._tabGroups.length; t++) {
      const visible = t === idx;
      for (const go of this._tabGroups[t]) {
        go.setVisible(visible);
      }
    }

    // Also show/hide slider knobs + interactive elements
    if (this._sliders) {
      for (const s of this._sliders) {
        const vis = idx === TAB_SOUND;
        s.knob.setVisible(vis);
        s.lbl.setVisible(vis);
        s.fill.setVisible(vis);
        s.track.setVisible(vis);
        s.pct.setVisible(vis);
        s.hitZone.setVisible(vis);
        if (vis) s.hitZone.setInteractive(); else s.hitZone.disableInteractive();
        if (vis) s.knob.setInteractive({ draggable: true }); else s.knob.disableInteractive();
      }
    }
  }

  _nextTab() {
    this._switchTab((this._activeTab + 1) % TAB_NAMES.length);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Slider builder
  // ═══════════════════════════════════════════════════════════════════════

  _buildSlider({ y, label, lsKey, color, tab, apply }) {
    const cx = GAME_W / 2;
    const saved = parseFloat(localStorage.getItem(lsKey) ?? '0.5');
    const grp = this._tabGroups[tab];

    // Label
    const lbl = this.add.text(cx, y - 22, label, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff8800',
    }).setOrigin(0.5);
    grp.push(lbl);

    // Track
    const trackX = cx - SLIDER_W / 2;
    const track = this.add.rectangle(cx, y, SLIDER_W, SLIDER_H, 0x333333).setOrigin(0.5);
    grp.push(track);

    // Fill
    const fill = this.add.rectangle(trackX, y, SLIDER_W * saved, SLIDER_H, color)
      .setOrigin(0, 0.5);
    grp.push(fill);

    // Knob
    const knob = this.add.circle(trackX + SLIDER_W * saved, y, 10, 0xffffff)
      .setInteractive({ draggable: true, useHandCursor: true });

    // Percentage
    const pct = this.add.text(cx + SLIDER_W / 2 + 30, y, `${Math.round(saved * 100)}%`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#cccccc',
    }).setOrigin(0.5);
    grp.push(pct);

    const applyVol = (vol) => {
      fill.width = SLIDER_W * vol;
      knob.x = trackX + SLIDER_W * vol;
      pct.setText(`${Math.round(vol * 100)}%`);
      localStorage.setItem(lsKey, vol.toFixed(2));
      apply(vol);
    };

    // Hit zone for clicking on track
    const hitZone = this.add.rectangle(cx, y, SLIDER_W + 20, 30, 0x000000, 0)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    hitZone.on('pointerdown', (pointer) => {
      const clamped = Phaser.Math.Clamp(pointer.x, trackX, trackX + SLIDER_W);
      const v = (clamped - trackX) / SLIDER_W;
      state.vol = v;
      applyVol(v);
      this._activeSlider = this._sliders.indexOf(state);
      this._highlightSlider();
    });

    const state = { vol: saved, applyVol, trackX, lbl, knob, fill, track, pct, hitZone };
    this._sliders.push(state);

    // Drag
    this.input.on('drag', (pointer, go, dragX) => {
      if (go !== knob) return;
      const clamped = Phaser.Math.Clamp(dragX, trackX, trackX + SLIDER_W);
      knob.x = clamped;
      const v = (clamped - trackX) / SLIDER_W;
      state.vol = v;
      applyVol(v);
    });

    // Apply initial value so registry is set
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

  // ═══════════════════════════════════════════════════════════════════════
  //  Gamepad: adjust sliders / controller selector (runs every frame)
  // ═══════════════════════════════════════════════════════════════════════

  update(time, delta) {
    const gp = this.input.gamepad;
    if (!gp || gp.total === 0) return;
    const pad = gp.getPad(0); // always use pad 0 for menu navigation
    if (!pad) return;

    const DEAD = 0.2;

    // ── Controls tab: D-pad left/right to change controller ───────────
    if (this._activeTab === TAB_CONTROLS) {
      this._ctrlGpCd = (this._ctrlGpCd || 0) - delta;
      let dir = 0;
      if (pad.left  || pad.leftStick.x < -DEAD) dir = -1;
      if (pad.right || pad.leftStick.x >  DEAD) dir =  1;
      if (dir !== 0 && this._ctrlGpCd <= 0) {
        this._changePad(dir);
        this._ctrlGpCd = 250;
      }
      if (dir === 0) this._ctrlGpCd = 0;
      return;
    }

    // ── Sound tab: slider controls ────────────────────────────────────
    if (this._activeTab !== TAB_SOUND) return;
    if (!this._sliders || this._sliders.length === 0) return;

    const SPEED = 0.8;

    // ── vertical: switch slider ───────────────────────────────────────
    this._gpVertCd = (this._gpVertCd || 0) - delta;
    let vert = 0;
    if (pad.up    || pad.leftStick.y < -DEAD) vert = -1;
    if (pad.down  || pad.leftStick.y >  DEAD) vert =  1;
    if (vert !== 0 && this._gpVertCd <= 0) {
      this._activeSlider = Phaser.Math.Clamp(this._activeSlider + vert, 0, this._sliders.length - 1);
      this._highlightSlider();
      this._gpVertCd = 220;
    }
    if (vert === 0) this._gpVertCd = 0;

    // ── horizontal: adjust value ──────────────────────────────────────
    let hdir = 0;
    if (pad.left)  hdir = -1;
    if (pad.right) hdir =  1;
    if (Math.abs(pad.leftStick.x) > DEAD) hdir = pad.leftStick.x;

    if (hdir !== 0) {
      const dt = delta / 1000;
      const s = this._sliders[this._activeSlider];
      const nv = Phaser.Math.Clamp(s.vol + hdir * SPEED * dt, 0, 1);
      s.vol = nv;
      s.applyVol(nv);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Close menu
  // ═══════════════════════════════════════════════════════════════════════

  _resume() {
    if (this._fromScene === 'GameScene') {
      const gameScene = this.scene.get('GameScene');
      if (gameScene && gameScene.player) {
        gameScene.player.inMenu = false;
      }
    }
    this.scene.stop();
  }

  _exitToEditor() {
    // Déclenche _endGame sur GameScene → qui retourne à LevelEditorScene (fromEditor=true)
    const gameScene = this.scene.get('GameScene');
    if (gameScene && gameScene.player) {
      gameScene.player.inMenu = false;
      gameScene._endGame('over', '');
    }
    this.scene.stop();
  }
}
