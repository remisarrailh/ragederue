/**
 * LevelEditorScene — éditeur de niveaux visuel pour RAGEDERUE Online.
 *
 * Accès : touche L depuis TitleScene.
 * Contrôles :
 *   A / ◄     Scroller vers la gauche
 *   D / ►     Scroller vers la droite
 *   ESC       Désélectionner / annuler saisie / retour menu
 *   DEL       Supprimer l'objet sélectionné
 *   Clic      Sélectionner un objet existant OU placer l'outil actif
 *   Drag      Déplacer l'objet sélectionné
 *
 * Sélection :
 *   - Cliquer sur un objet existant le sélectionne TOUJOURS (peu importe l'outil)
 *   - Cliquer sur le vide : place l'outil actif (ou désélectionne si SELECT)
 *   - La liste d'objets (panel droit) permet aussi de sélectionner
 */
import { LEVELS }          from '../config/levels.js';
import { BACKGROUND_KEYS } from '../config/backgrounds.js';
import { GAME_W, GAME_H, LANE_TOP, LANE_BOTTOM } from '../config/constants.js';

// ── Layout ───────────────────────────────────────────────────────────────
const PAL_W  = 120;   // palette gauche
const LIST_W = 160;   // panel liste droite
const TOOL_H = 36;    // toolbar haut
const PROP_H = 36;    // properties bas
const SCROLL_SPEED = 400;

// ── Outils palette ───────────────────────────────────────────────────────
const TOOLS = [
  { id: 'select',           label: '↖ SELECT',   color: '#ffffff' },
  { id: 'sep_props',        label: '─ PROPS ─',  color: '#555555', sep: true },
  { id: 'prop:car',         label: '  car',      color: '#cccccc', scale: 0.65 },
  { id: 'prop:barrel',      label: '  barrel',   color: '#cccccc', scale: 0.9  },
  { id: 'prop:hydrant',     label: '  hydrant',  color: '#cccccc', scale: 0.65 },
  { id: 'prop:banner-hor1', label: '  banner1',  color: '#cccccc', scale: 0.6  },
  { id: 'prop:banner-hor2', label: '  banner2',  color: '#cccccc', scale: 0.6  },
  { id: 'prop:fore',        label: '  fore',     color: '#ffaa44', scale: 1.2  },
  { id: 'sep_loot',         label: '─ LOOT ─',   color: '#555555', sep: true },
  { id: 'container',        label: '  container',color: '#88ff88' },
  { id: 'sep_zones',        label: '─ ZONES ─',  color: '#555555', sep: true },
  { id: 'transit',          label: '  transit',  color: '#00ccff' },
];

const DRAG_THRESHOLD = 5; // px avant de commencer un drag
const EDITOR_URL     = 'http://localhost:9001';

export default class LevelEditorScene extends Phaser.Scene {
  constructor() { super({ key: 'LevelEditorScene' }); }

  // ─────────────────────────────────────────────────────────────────────
  create() {
    // Priorité 1 : registry (retour depuis mode TEST, même session)
    // Priorité 2 : localStorage (persistance inter-rechargements sans serveur)
    // Priorité 3 : LEVELS statiques (premier démarrage)
    const registryLevels = this.registry.get('editorLevels');
    let localLevels = null;
    try {
      const raw = localStorage.getItem('RAGEDERUE_editor_levels');
      if (raw) localLevels = JSON.parse(raw);
    } catch {}
    this._levels = JSON.parse(JSON.stringify(registryLevels || localLevels || LEVELS));
    this._currentIdx     = 0;
    this._camScrollX     = 0;
    this._activeTool     = 'select';
    this._selected       = null;   // { obj: worldObject }
    this._worldObjects   = [];     // { data, sprite, graphics?, labelText?, type }
    this._bgGraphics     = [];
    this._capturingInput = false;
    this._inputBuffer    = '';
    this._inputTarget    = null;
    this._exportOverlay       = null;
    this._lootOverlay         = null;   // persistent overlay objects []
    this._lootContentObjs     = [];    // rebuilt on tab switch
    this._lootData            = null;  // { items, containerTable, corpseTable, … }
    this._lootTab             = 'tables';
    this._selRect             = null;
    this._availableBackgrounds = [null, ...BACKGROUND_KEYS]; // null = aucun fond
    this._dragActive     = false;
    this._dragOrigin     = null;   // { px, py } screen coords at mousedown
    this._resizeMode     = null;   // null | 'width' | 'height' (transit zones)
    this._zoom           = 1.0;   // zoom caméra [0.25 .. 2.0]

    // Layers Phaser : layer.add() retire l'objet de la DisplayList principale
    // → chaque caméra ne voit que son propre layer
    this._worldLayer = this.add.layer();  // objets monde (zoomés avec cameras.main)
    this._uiLayer    = this.add.layer();  // UI (toujours zoom=1)

    this.cameras.main.setBackgroundColor('#0a0a14');
    this.cameras.main.setScroll(0, 0);

    this._buildUI();
    this._loadLevel();

    // Caméra UI fixe (zoom=1) — rendue par-dessus la caméra monde
    this._uiCam = this.cameras.add(0, 0, GAME_W, GAME_H, false, 'ui');
    this._uiCam.setZoom(1).setScroll(0, 0);
    // Chaque caméra ignore le layer de l'autre
    this.cameras.main.ignore(this._uiLayer);
    this._uiCam.ignore(this._worldLayer);

    // Tente de charger les niveaux et la loot table depuis le serveur éditeur (async)
    this._fetchLevelsFromServer();
    this._fetchLootData();

    // ── Clavier ──────────────────────────────────────────────────────────
    this._keys = this.input.keyboard.addKeys({
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a:     Phaser.Input.Keyboard.KeyCodes.A,
      d:     Phaser.Input.Keyboard.KeyCodes.D,
      q:     Phaser.Input.Keyboard.KeyCodes.Q,   // AZERTY équivalent de A
    });
    this.input.keyboard.on('keydown', e => this._onKeyDown(e));

    // ── Souris ───────────────────────────────────────────────────────────
    this.input.on('pointerdown', p => this._onPointerDown(p));
    this.input.on('pointermove', p => this._onPointerMove(p));
    this.input.on('pointerup',   () => { this._dragActive = false; this._dragOrigin = null; this._resizeMode = null; });
    this.input.on('wheel', (pointer, _gos, _dx, deltaY) => this._onWheel(pointer, deltaY));
  }

  // ─────────────────────────────────────────────────────────────────────
  update(_, delta) {
    if (this._capturingInput) return;
    const dt       = delta / 1000;
    const maxW     = this._levels[this._currentIdx]?.worldW ?? 3840;
    const maxScroll = Math.max(0, maxW - GAME_W / this._zoom);
    const spd      = SCROLL_SPEED / this._zoom;

    if (this._keys.left.isDown || this._keys.a.isDown || this._keys.q.isDown) {
      this._camScrollX = Math.max(0, this._camScrollX - spd * dt);
      this.cameras.main.setScroll(this._camScrollX, this._camScrollY());
    }
    if (this._keys.right.isDown || this._keys.d.isDown) {
      this._camScrollX = Math.min(maxScroll, this._camScrollX + spd * dt);
      this.cameras.main.setScroll(this._camScrollX, this._camScrollY());
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  UI
  // ══════════════════════════════════════════════════════════════════════

  _buildUI() {
    const ui = (go) => { this._uiLayer.add(go); return go; };

    // ── Fonds panels ─────────────────────────────────────────────────────
    ui(this.add.rectangle(PAL_W / 2,        GAME_H / 2,      PAL_W,  GAME_H,  0x0d0d1a).setDepth(600));
    ui(this.add.rectangle(GAME_W / 2,        TOOL_H / 2,      GAME_W, TOOL_H,  0x111122).setDepth(600));
    ui(this.add.rectangle(GAME_W / 2,        GAME_H-PROP_H/2, GAME_W, PROP_H,  0x111122).setDepth(600));
    ui(this.add.rectangle(GAME_W-LIST_W/2,   GAME_H / 2,      LIST_W, GAME_H,  0x080814).setDepth(600));

    // ── Séparateurs ──────────────────────────────────────────────────────
    ui(this.add.rectangle(PAL_W,           GAME_H/2, 1, GAME_H, 0x334455).setDepth(601));
    ui(this.add.rectangle(GAME_W-LIST_W,   GAME_H/2, 1, GAME_H, 0x334455).setDepth(601));
    ui(this.add.rectangle(GAME_W/2, TOOL_H,          GAME_W, 1, 0x334455).setDepth(601));
    ui(this.add.rectangle(GAME_W/2, GAME_H-PROP_H,   GAME_W, 1, 0x334455).setDepth(601));

    this._buildToolbar();
    this._buildPalette();
    this._buildPropsPanel();
    this._buildListPanel();

    // Hint scroll
    ui(this.add.text(PAL_W + 4, GAME_H - PROP_H - 14, 'A/D : scroll   molette / +- : zoom   0 : reset zoom   DEL : supprimer', {
      fontFamily: 'monospace', fontSize: '9px', color: '#333355',
    }).setDepth(601));
  }

  _buildToolbar() {
    const y = TOOL_H / 2;
    this._uiBtn(10, y, '[ MENU ]', '#888888', () => this.scene.start('TitleScene'), 0, 0.5);
    this._uiBtn(150, y, '◄', '#ff6600', () => this._prevLevel(), 0.5, 0.5);

    // Le nom du niveau est cliquable pour le renommer
    this._levelNameText = this.add.text(310, y, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(700).setInteractive({ useHandCursor: true });
    this._uiLayer.add(this._levelNameText);
    this._levelNameText.on('pointerdown', () => { if (!this._capturingInput) this._startRename(); });
    this._levelNameText.on('pointerover', () => { if (!this._capturingInput) this._levelNameText.setColor('#ffcc00'); });
    this._levelNameText.on('pointerout',  () => { if (!this._capturingInput) this._levelNameText.setColor('#ffffff'); });

    this._uiBtn(470, y, '►', '#ff6600', () => this._nextLevel(), 0.5, 0.5);
    this._uiBtn(510, y, '[ +NEW ]', '#ffcc00', () => this._newLevel(), 0, 0.5);
    this._uiBtn(580, y, '[ SAVE ]', '#ffcc00', () => this._saveToServer(), 0, 0.5);
    this._uiBtn(648, y, '[ TEST ]', '#00ff88', () => this._testLevel(),    0, 0.5);
    this._uiBtn(716, y, '[ EXPORT ]','#4488ff', () => this._showExport(),  0, 0.5);

    this._zoomLabel = this.add.text(GAME_W - LIST_W - 8, y, '100%', {
      fontFamily: 'monospace', fontSize: '10px', color: '#556677',
    }).setOrigin(1, 0.5).setDepth(700);
    this._uiLayer.add(this._zoomLabel);

    this._updateToolbarName();
  }

  _buildPalette() {
    this._paletteButtons = [];
    let y = TOOL_H + 10;

    for (const tool of TOOLS) {
      if (tool.sep) {
        const sep = this.add.text(4, y, tool.label, { fontFamily: 'monospace', fontSize: '10px', color: tool.color })
          .setDepth(700);
        this._uiLayer.add(sep);
        y += 18;
        continue;
      }
      const btn = this.add.text(4, y, tool.label, {
        fontFamily: 'monospace', fontSize: '11px', color: tool.color,
      }).setDepth(700).setInteractive({ useHandCursor: true });
      this._uiLayer.add(btn);
      btn.on('pointerdown', () => this._selectTool(tool.id));
      btn.on('pointerover', () => { if (this._activeTool !== tool.id) btn.setColor('#ffffff'); });
      btn.on('pointerout',  () => { if (this._activeTool !== tool.id) btn.setColor(tool.color); });
      this._paletteButtons.push({ tool, btn });
      y += 22;
    }
    this._updatePaletteHighlight();

    // Bouton spécial loot editor (en bas de palette)
    y += 8;
    const sepLoot = this.add.text(4, y, '──────────', {
      fontFamily: 'monospace', fontSize: '10px', color: '#333355',
    }).setDepth(700);
    this._uiLayer.add(sepLoot);
    y += 14;
    const lootBtn = this.add.text(4, y, '[LOOT ED.]', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ff88cc',
    }).setDepth(700).setInteractive({ useHandCursor: true });
    this._uiLayer.add(lootBtn);
    lootBtn.on('pointerdown', () => this._showLootEditor());
    lootBtn.on('pointerover', () => lootBtn.setColor('#ffffff'));
    lootBtn.on('pointerout',  () => lootBtn.setColor('#ff88cc'));
  }

  _buildPropsPanel() {
    const py = GAME_H - PROP_H / 2;
    const x0 = PAL_W + 8;

    this._propInfoText = this.add.text(x0, py, 'Aucun objet sélectionné', {
      fontFamily: 'monospace', fontSize: '11px', color: '#555555',
    }).setOrigin(0, 0.5).setDepth(700);
    this._uiLayer.add(this._propInfoText);

    this._fieldX     = this._makeEditField(x0,       py, 'x');
    this._fieldY     = this._makeEditField(x0 + 90,  py, 'y');
    this._fieldScale = this._makeEditField(x0 + 180, py, 'scale');

    this._btnDel = this._uiBtn(GAME_W - LIST_W - 80, py, '[ DEL ]', '#ff4444', () => this._deleteSelected(), 0, 0.5);
    this._btnDel.setVisible(false);

    this._btnBlock = this._uiBtn(x0 + 270, py, '[□ block]', '#555555', () => this._toggleBlocksPlayer(), 0, 0.5);
    this._btnBlock.setVisible(false);

    this._btnBlockEnemy = this._uiBtn(x0 + 340, py, '[□ enemy]', '#555555', () => this._toggleBlocksEnemy(), 0, 0.5);
    this._btnBlockEnemy.setVisible(false);

    this._lblTarget = this.add.text(x0 + 440, py, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false);
    this._uiLayer.add(this._lblTarget);

    this._btnTgtL = this._uiBtn(x0 + 540, py, '◄', '#ff6600', () => this._cycleTarget(-1), 0.5, 0.5);
    this._btnTgtR = this._uiBtn(x0 + 560, py, '►', '#ff6600', () => this._cycleTarget(1),  0.5, 0.5);
    this._btnTgtL.setVisible(false);
    this._btnTgtR.setVisible(false);

    this._lblTargetWarp = this.add.text(x0 + 580, py, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaaaa',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false);
    this._uiLayer.add(this._lblTargetWarp);
    this._btnWarpL = this._uiBtn(x0 + 690, py, '◄', '#ff9900', () => this._cycleTargetWarp(-1), 0.5, 0.5);
    this._btnWarpR = this._uiBtn(x0 + 710, py, '►', '#ff9900', () => this._cycleTargetWarp(1),  0.5, 0.5);
    this._btnWarpL.setVisible(false);
    this._btnWarpR.setVisible(false);

    // ── Propriétés niveau (visibles quand rien n'est sélectionné) ────────
    this._fieldBg  = this._makeLevelField(x0,       py, 'parallax.bg',  'px.bg');
    this._fieldMid = this._makeLevelField(x0 + 90,  py, 'parallax.mid', 'px.mid');
    this._fieldWW  = this._makeLevelField(x0 + 180, py, 'worldW',       'worldW');

    // ── Limites lane (laneTop / laneBottom) ──────────────────────────
    this._fieldLaneTop = this._makeLevelField(x0 + 480, py, 'laneTop',    'lane↑');
    this._fieldLaneBot = this._makeLevelField(x0 + 570, py, 'laneBottom', 'lane↓');

    // ── Spawn X ──────────────────────────────────────────────────────
    this._fieldSpawnX  = this._makeLevelField(x0 + 660, py, 'spawnX',     'spawnX');

    // ── Transit zone width + height + label ──────────────────────────
    this._fieldWidth  = this._makeEditField(x0 + 180, py, 'width');
    this._fieldHeight = this._makeEditField(x0 + 260, py, 'height');
    this._fieldLabel  = this._makeEditField(x0 + 340, py, 'label');

    // ── Sélecteur fond d'image ────────────────────────────────────────
    this._btnBgL    = this._uiBtn(x0 + 265, py, '◄', '#4488ff', () => this._cycleBackground(-1), 0.5, 0.5);
    this._lblBgName = this.add.text(x0 + 360, py, '(aucun)', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aaaacc',
    }).setOrigin(0.5, 0.5).setDepth(700).setVisible(false);
    this._uiLayer.add(this._lblBgName);
    this._btnBgR    = this._uiBtn(x0 + 455, py, '►', '#4488ff', () => this._cycleBackground(1), 0.5, 0.5);
    this._btnBgL.setVisible(false);
    this._btnBgR.setVisible(false);

    this._updatePropsPanel();
  }

  _buildListPanel() {
    const lx = GAME_W - LIST_W;

    // Titre
    const listTitle = this.add.text(lx + LIST_W / 2, TOOL_H + 8, 'OBJETS', {
      fontFamily: 'monospace', fontSize: '10px', color: '#4488ff',
    }).setOrigin(0.5, 0).setDepth(700);
    this._uiLayer.add(listTitle);

    // Container pour les items de la liste (on les recrée à chaque maj)
    this._listY0 = TOOL_H + 24;
    this._listItems = []; // { textObj, wo }
    this._listContainer = this.add.container(0, 0).setDepth(700);
    this._uiLayer.add(this._listContainer);
  }

  _makeEditField(x, y, field) {
    const lbl = this.add.text(x, y - 7, field + ':', {
      fontFamily: 'monospace', fontSize: '9px', color: '#555555',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false);
    this._uiLayer.add(lbl);

    const val = this.add.text(x, y + 6, '---', {
      fontFamily: 'monospace', fontSize: '11px', color: '#cccccc',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this._uiLayer.add(val);

    val.on('pointerdown', () => {
      if (this._selected) this._startNumInput(this._selected.obj, field, val);
    });
    val.on('pointerover', () => val.setColor('#ffffff'));
    val.on('pointerout',  () => { if (this._inputTarget?.textObj !== val) val.setColor('#cccccc'); });

    return { lbl, val };
  }

  _makeLevelField(x, y, path, label) {
    const lbl = this.add.text(x, y - 7, label + ':', {
      fontFamily: 'monospace', fontSize: '9px', color: '#445566',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false);
    this._uiLayer.add(lbl);

    const val = this.add.text(x, y + 6, '---', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aaaacc',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this._uiLayer.add(val);

    val.on('pointerdown', () => this._startLevelPropInput(path, val));
    val.on('pointerover', () => val.setColor('#ffffff'));
    val.on('pointerout',  () => { if (this._inputTarget?.textObj !== val) val.setColor('#aaaacc'); });

    return { lbl, val };
  }

  _uiBtn(x, y, label, color, cb, ox = 0, oy = 0.5) {
    const btn = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '11px', color,
    }).setOrigin(ox, oy).setDepth(700).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', cb);
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout',  () => btn.setColor(color));
    this._uiLayer.add(btn);
    return btn;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CHARGEMENT NIVEAU
  // ══════════════════════════════════════════════════════════════════════

  _loadLevel() {
    for (const wo of this._worldObjects) this._destroyWO(wo);
    this._worldObjects = [];
    for (const g of this._bgGraphics) g.destroy();
    this._bgGraphics = [];
    this._deselect();
    this._camScrollX = 0;
    this.cameras.main.setScroll(0, this._camScrollY());

    const level = this._levels[this._currentIdx];
    this._buildWorldBackground(level);
    for (const p of level.props)        this._spawnPropSprite(p);
    for (const c of level.containers)   this._spawnContainerSprite(c);
    for (const z of level.transitZones) this._spawnTransitSprite(z);

    this._updateToolbarName();
    this._updatePropsPanel();
    this._updatePaletteHighlight();
    this._updateListPanel();
  }

  /** Reconstruit uniquement le fond (grille, guides) sans toucher aux objets monde. */
  _rebuildBackground() {
    for (const g of this._bgGraphics) g.destroy();
    this._bgGraphics = [];
    const level    = this._levels[this._currentIdx];
    this._buildWorldBackground(level);
    const maxScroll = Math.max(0, (level.worldW ?? 3840) - GAME_W / this._zoom);
    this._camScrollX = Math.min(this._camScrollX, maxScroll);
    this.cameras.main.setScroll(this._camScrollX, this._camScrollY());
  }

  _buildWorldBackground(level) {
    // Si une image de fond est configurée, l'afficher et déduire worldW
    if (level.background && this.textures.exists(level.background)) {
      const tex   = this.textures.get(level.background);
      const src   = tex.source[0];
      const scale = GAME_H / src.height;
      const imgW  = Math.round(src.width * scale);
      level.worldW = imgW;  // worldW déduite automatiquement de l'image
      const bgImg = this.add.image(0, 0, level.background)
        .setOrigin(0, 0).setScale(scale).setDepth(0);
      this._bgGraphics.push(bgImg);
    } else {
      // Fond générique (placeholder couleur)
      const gfx = this.add.graphics().setDepth(1);
      gfx.fillStyle(0x1a1a2e);
      gfx.fillRect(0, 0, level.worldW ?? 3840, GAME_H);
      gfx.fillStyle(0x2a2a3a);
      gfx.fillRect(0, 290, level.worldW ?? 3840, GAME_H - 290);
      const lt = level.laneTop ?? LANE_TOP;
      const lb = level.laneBottom ?? LANE_BOTTOM;
      gfx.fillStyle(0x333345);
      gfx.fillRect(0, lt, level.worldW ?? 3840, lb - lt);
      gfx.fillStyle(0x888899, 0.25);
      gfx.fillRect(0, lt - 2, level.worldW ?? 3840, 3);
      this._bgGraphics.push(gfx);
    }

    const w = level.worldW ?? 3840;

    const lt = level.laneTop ?? LANE_TOP;
    const lb = level.laneBottom ?? LANE_BOTTOM;

    const guide = this.add.graphics().setDepth(2);
    guide.lineStyle(1, 0x445566, 0.4);
    guide.lineBetween(0, lt, w, lt);
    guide.lineBetween(0, lb, w, lb);
    this._bgGraphics.push(guide);

    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0x223344, 0.4);
    for (let x = 480; x < w; x += 480) {
      grid.lineBetween(x, 0, x, GAME_H);
      const lbl = this.add.text(x + 3, TOOL_H + 2, String(x), {
        fontFamily: 'monospace', fontSize: '9px', color: '#334455',
      }).setDepth(3);
      this._bgGraphics.push(lbl);
    }
    this._bgGraphics.push(grid);

    const endLine = this.add.graphics().setDepth(4);
    endLine.lineStyle(2, 0xff4444, 0.7);
    endLine.lineBetween(w, 0, w, GAME_H);
    this._bgGraphics.push(endLine);

    const endLbl = this.add.text(w - 4, TOOL_H + 4, `end  W:${w}`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
    }).setOrigin(1, 0).setDepth(5);
    this._bgGraphics.push(endLbl);

    // ── Spawn marker ─────────────────────────────────────────────────────
    const sx = level.spawnX ?? 150;
    const spawnLine = this.add.graphics().setDepth(6);
    spawnLine.lineStyle(2, 0x00ff88, 0.8);
    spawnLine.lineBetween(sx, lt - 30, sx, lb + 10);
    const spawnLbl = this.add.text(sx, lb + 12, `▲ spawn`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#00ff88',
    }).setOrigin(0.5, 0).setDepth(6);
    this._bgGraphics.push(spawnLine, spawnLbl);

    // Déplacer tous les objets de fond dans le world layer
    for (const go of this._bgGraphics) this._worldLayer.add(go);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SPAWN OBJETS MONDE (sans setInteractive — hit-test manuel)
  // ══════════════════════════════════════════════════════════════════════

  _spawnPropSprite(data) {
    if (!this.textures.exists(data.type)) {
      console.warn(`[Editor] Texture manquante : ${data.type}`);
      return null;
    }
    const sprite = this.add.image(data.x, data.y, data.type)
      .setOrigin(0.5, 1).setScale(data.scale ?? 1.0).setDepth(data.y + 10);
    this._worldLayer.add(sprite);
    const wo = { data, sprite, type: 'prop' };
    this._worldObjects.push(wo);
    return wo;
  }

  _spawnContainerSprite(data) {
    const sprite = this.add.image(data.x, data.y, 'barrel')
      .setOrigin(0.5, 1).setScale(1.0).setDepth(data.y + 10).setTint(0x88ff88);
    this._worldLayer.add(sprite);
    const wo = { data, sprite, type: 'container' };
    this._worldObjects.push(wo);
    return wo;
  }

  _spawnTransitSprite(data) {
    const level = this._levels[this._currentIdx];
    const lt    = level.laneTop    ?? LANE_TOP;
    const lb    = level.laneBottom ?? LANE_BOTTOM;
    const zoneW = data.width ?? 120;
    const zoneY = data.y      ?? (lt - 30);
    const zoneH = data.height ?? (lb - lt + 60);
    // Persist defaults into data so the fields show real values
    if (data.y      == null) data.y      = zoneY;
    if (data.height == null) data.height = zoneH;

    const gfx = this.add.graphics().setDepth(lt - 5);
    this._worldLayer.add(gfx);
    this._redrawTransitGfx(gfx, data, zoneY, zoneW, zoneH);

    const lbl = this.add.text(
      data.x + zoneW / 2, zoneY - 14,
      this._transitLabel(data),
      { fontFamily: 'monospace', fontSize: '10px', color: this._transitColor(data, true) }
    ).setOrigin(0.5, 1).setDepth(lt - 4);
    this._worldLayer.add(lbl);

    const wo = { data, sprite: null, graphics: gfx, labelText: lbl, type: 'transit', _zoneY: zoneY, _zoneH: zoneH };
    this._worldObjects.push(wo);
    return wo;
  }

  _redrawTransitGfx(gfx, data, zoneY, zoneW, zoneH) {
    const col = this._transitColor(data);
    gfx.clear();
    gfx.fillStyle(col, 0.18);
    gfx.fillRect(data.x, zoneY, zoneW, zoneH);
    gfx.lineStyle(2, col, 0.9);
    gfx.strokeRect(data.x, zoneY, zoneW, zoneH);
  }

  _transitColor(data, asHex = false) {
    const c = data.type === 'warp' ? (asHex ? '#00ccff' : 0x00ccff) : (asHex ? '#00ff88' : 0x00ff88);
    return c;
  }

  _transitLabel(data) {
    return data.type === 'warp'
      ? `► ${data.targetLevel ?? 'WARP'}`
      : `▼ ${data.label ?? 'EXTRACT'}`;
  }

  _destroyWO(wo) {
    wo.sprite?.destroy();
    wo.graphics?.destroy();
    wo.labelText?.destroy();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  HIT-TEST MANUEL (coords monde)
  // ══════════════════════════════════════════════════════════════════════

  /** Retourne le premier worldObject sous (wx, wy) en coords monde, ou null */
  _hitTestWorld(wx, wy) {
    // Parcourir à l'envers (dernier placé = prioritaire)
    for (let i = this._worldObjects.length - 1; i >= 0; i--) {
      const wo = this._worldObjects[i];
      if (this._woContains(wo, wx, wy)) return wo;
    }
    return null;
  }

  _woContains(wo, wx, wy) {
    if (wo.type === 'prop' || wo.type === 'container') {
      const s = wo.sprite;
      if (!s || !s.active) return false;
      // bounds en coords monde
      const hw = s.displayWidth  * 0.5;
      const hh = s.displayHeight;
      // origine (0.5, 1) → gauche = x - hw, droite = x + hw, haut = y - hh, bas = y
      return wx >= s.x - hw && wx <= s.x + hw && wy >= s.y - hh && wy <= s.y;
    }
    if (wo.type === 'transit') {
      const zoneW = wo.data.width ?? 120;
      return wx >= wo.data.x && wx <= wo.data.x + zoneW
          && wy >= wo._zoneY  && wy <= wo._zoneY + wo._zoneH;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SÉLECTION
  // ══════════════════════════════════════════════════════════════════════

  _selectObject(wo) {
    this._selected = { obj: wo };
    this._drawSelectionRect(wo);
    this._updatePropsPanel();
    this._updateListPanel();
  }

  _deselect() {
    this._selected = null;
    if (this._selRect) { this._selRect.destroy(); this._selRect = null; }
    this._updatePropsPanel();
    this._updateListPanel();
  }

  _drawSelectionRect(wo) {
    if (this._selRect) { this._selRect.destroy(); this._selRect = null; }
    if (!wo) return;

    let rx, ry, rw, rh;
    if (wo.type === 'transit') {
      rx = wo.data.x; ry = wo._zoneY; rw = wo.data.width ?? 120; rh = wo._zoneH;
    } else if (wo.type === 'fore') {
      const level = this._levels[this._currentIdx];
      const lt = level.laneTop    ?? LANE_TOP;
      const lb = level.laneBottom ?? LANE_BOTTOM;
      rx = wo.data.x - 20; ry = lt - 62; rw = 40; rh = lb - lt + 72;
    } else {
      const s = wo.sprite;
      const hw = s.displayWidth * 0.5;
      const hh = s.displayHeight;
      rx = s.x - hw; ry = s.y - hh; rw = s.displayWidth; rh = hh;
    }

    this._selRect = this.add.graphics().setDepth(9000);
    this._worldLayer.add(this._selRect);
    this._selRect.lineStyle(2, 0xffff00, 0.9);
    this._selRect.strokeRect(rx - 2, ry - 2, rw + 4, rh + 4);

    // Resize handles
    if (wo.type === 'transit') {
      // Orange squares: right-center = width, bottom-center = height
      this._selRect.fillStyle(0xff6600, 1);
      this._selRect.fillRect(rx + rw - 2, ry + rh / 2 - 5, 10, 10);
      this._selRect.fillRect(rx + rw / 2 - 5, ry + rh - 2, 10, 10);
    } else if (wo.type === 'prop') {
      // Green square: bottom-right corner = uniform scale (applies to all props of same type)
      this._selRect.fillStyle(0x00ff88, 1);
      this._selRect.fillRect(rx + rw - 2, ry + rh - 2, 10, 10);
    }
  }

  /** Returns 'width', 'height', 'scale', or null if (wx,wy) hits a resize handle of wo */
  _getResizeHandle(wo, wx, wy) {
    if (wo.type === 'transit') {
      const rx = wo.data.x;
      const ry = wo._zoneY;
      const rw = wo.data.width ?? 120;
      const rh = wo._zoneH;
      if (Math.abs(wx - (rx + rw)) <= 10 && Math.abs(wy - (ry + rh / 2)) <= 10) return 'width';
      if (Math.abs(wx - (rx + rw / 2)) <= 10 && Math.abs(wy - (ry + rh)) <= 10) return 'height';
    } else if (wo.type === 'prop' && wo.sprite) {
      const s  = wo.sprite;
      const hw = s.displayWidth * 0.5;
      // Scale handle: bottom-right corner (sprite origin is (0.5,1) so s.y = bottom)
      if (Math.abs(wx - (s.x + hw)) <= 10 && Math.abs(wy - s.y) <= 10) return 'scale';
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  EVENTS SOURIS
  // ══════════════════════════════════════════════════════════════════════

  _onPointerDown(pointer) {
    if (this._capturingInput) return;

    // Zones UI : palette gauche, toolbar haut, props bas, liste droite
    const inUI = pointer.x < PAL_W
              || pointer.x > GAME_W - LIST_W
              || pointer.y < TOOL_H
              || pointer.y > GAME_H - PROP_H;
    if (inUI) return;

    const { x: wx, y: wy } = this._screenToWorld(pointer.x, pointer.y);

    // ── Vérifier les poignées de redimensionnement en premier ─────────
    if (this._selected?.obj) {
      const handle = this._getResizeHandle(this._selected.obj, wx, wy);
      if (handle) {
        this._resizeMode = handle;
        this._dragOrigin = { px: pointer.x, py: pointer.y };
        this._dragActive = false;
        return;
      }
    }

    // ── Toujours essayer de sélectionner un objet existant en premier ──
    const hit = this._hitTestWorld(wx, wy);
    if (hit) {
      this._selectObject(hit);
      this._dragOrigin = { px: pointer.x, py: pointer.y };
      this._dragActive = false; // drag déclenché après seuil
      return;
    }

    // ── Clic dans le vide ──────────────────────────────────────────────
    this._deselect();
    if (this._activeTool !== 'select') {
      this._placeItem(wx, wy);
    }
  }

  _onPointerMove(pointer) {
    if (!pointer.isDown || this._capturingInput) return;
    if (!this._selected) return;
    if (pointer.x < PAL_W || pointer.x > GAME_W - LIST_W
     || pointer.y < TOOL_H || pointer.y > GAME_H - PROP_H) return;

    // Démarrer le drag après le seuil
    if (!this._dragActive && this._dragOrigin) {
      const dx = pointer.x - this._dragOrigin.px;
      const dy = pointer.y - this._dragOrigin.py;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) this._dragActive = true;
    }
    if (!this._dragActive) return;

    const { x: wx, y: wy } = this._screenToWorld(pointer.x, pointer.y);

    // ── Redimensionnement (poignées) ──────────────────────────────────
    if (this._resizeMode) {
      const wo = this._selected.obj;
      if (this._resizeMode === 'width') {
        wo.data.width = Math.max(20, Math.round(wx - wo.data.x));
        this._refreshTransitWO(wo);
        this._drawSelectionRect(wo);
        this._updatePropsPanel();
      } else if (this._resizeMode === 'height') {
        wo.data.height = Math.max(20, Math.round(wy - wo._zoneY));
        wo._zoneH = wo.data.height;
        this._refreshTransitWO(wo);
        this._drawSelectionRect(wo);
        this._updatePropsPanel();
      } else if (this._resizeMode === 'scale') {
        // Scale = distance horizontale depuis le centre du sprite / demi-largeur originale
        const baseHalfW = wo.sprite.width / 2;
        const newScale  = Phaser.Math.Clamp((wx - wo.sprite.x) / baseHalfW, 0.1, 4.0);
        // Appliquer à tous les props du même type dans le niveau courant
        const propType = wo.data.type;
        const level    = this._levels[this._currentIdx];
        for (const p of level.props) {
          if (p.type === propType) p.scale = newScale;
        }
        for (const w of this._worldObjects) {
          if (w.type === 'prop' && w.data.type === propType && w.sprite) {
            w.sprite.setScale(newScale);
          }
        }
        this._drawSelectionRect(wo);
        this._updatePropsPanel();
      }
      return;
    }

    this._moveObject(this._selected.obj, Math.round(wx), Math.round(wy));
  }

  _screenToWorld(sx, sy) {
    const wp = this.cameras.main.getWorldPoint(sx, sy);
    return { x: Math.round(wp.x), y: Math.round(wp.y) };
  }

  _moveObject(wo, wx, wy) {
    wo.data.x = wx;
    if (wo.type === 'prop' || wo.type === 'container') {
      wo.data.y = wy;
      wo.sprite.setPosition(wx, wy).setDepth(wy + 10);
    } else if (wo.type === 'transit') {
      wo.data.y = wy;
      wo._zoneY = wy;
      const zoneW = wo.data.width ?? 120;
      this._redrawTransitGfx(wo.graphics, wo.data, wo._zoneY, zoneW, wo._zoneH);
      wo.labelText.setPosition(wx + zoneW / 2, wo._zoneY - 14);
    }

    this._drawSelectionRect(wo);
    this._updatePropsPanel();
    this._updateListPanel();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ZOOM
  // ══════════════════════════════════════════════════════════════════════

  /** Vertical scroll offset so the world center stays centered when zoomed */
  _camScrollY() {
    return Math.max(0, GAME_H / 2 * (1 - 1 / this._zoom));
  }

  _onWheel(pointer, deltaY) {
    if (this._capturingInput) return;
    const inUI = pointer.x < PAL_W || pointer.x > GAME_W - LIST_W
              || pointer.y < TOOL_H || pointer.y > GAME_H - PROP_H;
    const focusX = inUI ? GAME_W / 2 : pointer.x;
    this._applyZoom(deltaY > 0 ? 1 / 1.12 : 1.12, focusX);
  }

  /**
   * Apply a zoom factor, keeping the world point at focusScreenX fixed.
   * @param {number} factor   Multiplicative factor (> 1 = zoom in)
   * @param {number} focusScreenX  Screen X to zoom toward (default: center)
   */
  _applyZoom(factor, focusScreenX = GAME_W / 2) {
    const maxW = this._levels[this._currentIdx]?.worldW ?? 3840;
    // World X currently under the focus point
    const worldFocusX = this._camScrollX + focusScreenX / this._zoom;

    this._zoom = Phaser.Math.Clamp(this._zoom * factor, 0.25, 2.0);
    this.cameras.main.setZoom(this._zoom);

    // Reposition scroll so the focus point stays under the cursor
    const maxScroll = Math.max(0, maxW - GAME_W / this._zoom);
    this._camScrollX = Phaser.Math.Clamp(worldFocusX - focusScreenX / this._zoom, 0, maxScroll);
    this.cameras.main.setScroll(this._camScrollX, this._camScrollY());

    this._updateZoomLabel();
  }

  _updateZoomLabel() {
    if (this._zoomLabel) this._zoomLabel.setText(`${Math.round(this._zoom * 100)}%`);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PLACEMENT
  // ══════════════════════════════════════════════════════════════════════

  _placeItem(wx, wy) {
    const level = this._levels[this._currentIdx];

    if (this._activeTool.startsWith('prop:')) {
      const propType = this._activeTool.slice(5);
      const toolDef  = TOOLS.find(t => t.id === this._activeTool);
      const entry = { type: propType, x: wx, y: wy, scale: toolDef?.scale ?? 1.0 };
      level.props.push(entry);
      const wo = this._spawnPropSprite(entry);
      if (wo) { this._selectObject(wo); this._dragOrigin = null; }
      return;
    }

    if (this._activeTool === 'container') {
      const entry = { x: wx, y: wy, texture: 'barrel' };
      level.containers.push(entry);
      const wo = this._spawnContainerSprite(entry);
      if (wo) { this._selectObject(wo); this._dragOrigin = null; }
      return;
    }

    if (this._activeTool === 'transit') {
      const entry = { id: `zone_${Date.now()}`, type: 'warp', x: wx, width: 120, targetLevel: null, label: 'WARP' };
      level.transitZones.push(entry);
      const wo = this._spawnTransitSprite(entry);
      if (wo) { this._selectObject(wo); this._dragOrigin = null; }
      return;
    }

  }

  // ══════════════════════════════════════════════════════════════════════
  //  PALETTE
  // ══════════════════════════════════════════════════════════════════════

  _selectTool(id) {
    this._activeTool = id;
    if (id !== 'select') this._deselect();
    this._updatePaletteHighlight();
  }

  _updatePaletteHighlight() {
    for (const { tool, btn } of this._paletteButtons) {
      btn.setColor(tool.id === this._activeTool ? '#ff6600' : (tool.color ?? '#cccccc'));
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANEL LISTE
  // ══════════════════════════════════════════════════════════════════════

  _updateListPanel() {
    // Détruire les anciens items de liste
    for (const item of this._listItems) item.textObj.destroy();
    this._listItems = [];

    const lx   = GAME_W - LIST_W + 4;
    let   y    = this._listY0;
    const sel  = this._selected?.obj;
    const maxY = GAME_H - PROP_H - 14;

    for (const wo of this._worldObjects) {
      if (y > maxY) break;

      const isSelected = wo === sel;
      const label = this._woShortLabel(wo);
      const color = isSelected ? '#ffff00'
        : wo.type === 'container' ? '#88ff88'
        : wo.type === 'transit'   ? '#00ccff'
        : '#aaaaaa';

      const txt = this.add.text(lx, y, label, {
        fontFamily: 'monospace', fontSize: '9px', color,
      }).setDepth(700).setInteractive({ useHandCursor: true });
      this._uiLayer.add(txt);

      txt.on('pointerdown', () => {
        this._selectObject(wo);
        // Centrer la caméra sur l'objet
        const objX = wo.data.x;
        const maxW = this._levels[this._currentIdx]?.worldW ?? 3840;
        const viewW = GAME_W / this._zoom;
        this._camScrollX = Phaser.Math.Clamp(objX - viewW / 2, 0, Math.max(0, maxW - viewW));
        this.cameras.main.setScroll(this._camScrollX, this._camScrollY());
      });
      txt.on('pointerover', () => txt.setColor('#ffffff'));
      txt.on('pointerout',  () => txt.setColor(isSelected ? '#ffff00' : color));

      this._listItems.push({ textObj: txt, wo });
      y += 13;
    }

    // Message si liste vide
    if (this._worldObjects.length === 0) {
      const empty = this.add.text(lx, this._listY0, '(vide)', {
        fontFamily: 'monospace', fontSize: '9px', color: '#444444',
      }).setDepth(700);
      this._uiLayer.add(empty);
      this._listItems.push({ textObj: empty, wo: null });
    }
  }

  _woShortLabel(wo) {
    const x = wo.data.x;
    const y = wo.data.y;
    if (wo.type === 'transit')   return `[T] ${wo.data.type} x${x}`;
    if (wo.type === 'container') return `[C] x${x} y${y}`;
    const blockMark = (wo.data.blocksPlayer ? '■' : '') + (wo.data.blocksEnemy ? 'E' : '');
    return `[P] ${wo.data.type} x${x} ${blockMark}`.trimEnd();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PANEL PROPRIÉTÉS
  // ══════════════════════════════════════════════════════════════════════

  _updatePropsPanel() {
    const wo = this._selected?.obj;
    const py = GAME_H - PROP_H / 2;
    const x0 = PAL_W + 8;

    this._propInfoText.setVisible(false);
    this._btnDel.setVisible(!!wo);

    for (const f of [this._fieldX, this._fieldY, this._fieldScale,
                     this._fieldBg, this._fieldMid, this._fieldWW,
                     this._fieldLaneTop, this._fieldLaneBot, this._fieldSpawnX,
                     this._fieldWidth, this._fieldHeight, this._fieldLabel]) {
      f.lbl.setVisible(false); f.val.setVisible(false);
    }
    this._lblTarget.setVisible(false);
    this._btnTgtL.setVisible(false);
    this._btnTgtR.setVisible(false);
    this._lblTargetWarp.setVisible(false);
    this._btnWarpL.setVisible(false);
    this._btnWarpR.setVisible(false);
    this._btnBgL.setVisible(false);
    this._lblBgName.setVisible(false);
    this._btnBgR.setVisible(false);
    this._btnBlock.setVisible(false);
    this._btnBlockEnemy.setVisible(false);

    if (!wo) {
      // Aucun objet sélectionné → afficher les propriétés du niveau courant
      const level = this._levels[this._currentIdx];

      // Sélecteur de fond d'image
      const bgKey = level.background ?? null;
      this._lblBgName.setText(bgKey ?? '(aucun)').setVisible(true);
      this._btnBgL.setVisible(true);
      this._btnBgR.setVisible(true);

      // Champs parallax/worldW uniquement sans image de fond
      if (!level.background) {
        this._showField(this._fieldBg,  x0,       py, 'px.bg',  level.parallax?.bg  ?? 0.06);
        this._fieldBg.val.setColor('#aaaacc');
        this._showField(this._fieldMid, x0 + 90,  py, 'px.mid', level.parallax?.mid ?? 0.25);
        this._fieldMid.val.setColor('#aaaacc');
        this._showField(this._fieldWW,  x0 + 180, py, 'worldW', level.worldW ?? 3840);
        this._fieldWW.val.setColor('#aaaacc');
      }

      // Lane bounds + spawnX — toujours visibles
      this._showField(this._fieldLaneTop, x0 + 480, py, 'lane↑', level.laneTop    ?? LANE_TOP);
      this._fieldLaneTop.val.setColor('#aaaacc');
      this._showField(this._fieldLaneBot, x0 + 570, py, 'lane↓', level.laneBottom ?? LANE_BOTTOM);
      this._fieldLaneBot.val.setColor('#aaaacc');
      this._showField(this._fieldSpawnX,  x0 + 660, py, 'spawnX', level.spawnX ?? 150);
      this._fieldSpawnX.val.setColor('#aaaacc');
      return;
    }

    this._showField(this._fieldX, x0,      py, 'x', wo.data.x);
    this._showField(this._fieldY, x0 + 90, py, 'y', wo.data.y);

    if (wo.type === 'transit') {
      this._showField(this._fieldWidth,  x0 + 180, py, 'width',  wo.data.width  ?? 120);
      this._showField(this._fieldHeight, x0 + 260, py, 'height', wo.data.height ?? 0);
      this._showField(this._fieldLabel,  x0 + 340, py, 'label',  wo.data.label  ?? '');
      this._lblTarget.setText(`→ ${wo.data.targetLevel ?? '(none)'}`).setPosition(x0 + 440, py).setVisible(true);
      this._btnTgtL.setPosition(x0 + 540, py).setVisible(true);
      this._btnTgtR.setPosition(x0 + 560, py).setVisible(true);
      const twarpLabel = wo.data.targetWarpId ?? '(none)';
      this._lblTargetWarp.setText(`↪ ${twarpLabel}`).setPosition(x0 + 580, py).setVisible(!!wo.data.targetLevel);
      this._btnWarpL.setPosition(x0 + 690, py).setVisible(!!wo.data.targetLevel);
      this._btnWarpR.setPosition(x0 + 710, py).setVisible(!!wo.data.targetLevel);
    } else {
      this._showField(this._fieldScale, x0 + 180, py, 'scale', Number((wo.data.scale ?? 1.0).toFixed(2)));
      // Toggles collision uniquement pour les props
      if (wo.type === 'prop') {
        const blocking = !!wo.data.blocksPlayer;
        this._btnBlock
          .setText(blocking ? '[■ BLOCK]' : '[□ block]')
          .setColor(blocking ? '#ff6600' : '#555555')
          .setPosition(x0 + 270, py).setVisible(true);
        const blockingE = !!wo.data.blocksEnemy;
        this._btnBlockEnemy
          .setText(blockingE ? '[■ ENEMY]' : '[□ enemy]')
          .setColor(blockingE ? '#ff6600' : '#555555')
          .setPosition(x0 + 340, py).setVisible(true);
      }
    }
  }

  _showField(field, x, y, label, value) {
    field.lbl.setPosition(x, y - 7).setText(label + ':').setVisible(true);
    field.val.setPosition(x, y + 6).setText(String(value)).setVisible(true).setColor('#cccccc');
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SAISIE NUMÉRIQUE INLINE
  // ══════════════════════════════════════════════════════════════════════

  _startNumInput(wo, field, textObj) {
    if (this._capturingInput) return;
    this._capturingInput = true;
    this._inputBuffer    = String(wo.data[field] ?? '');
    this._inputTarget    = { obj: wo, field, textObj };
    textObj.setColor('#ffff00').setText(this._inputBuffer + '_');
  }

  _startLevelPropInput(path, textObj) {
    if (this._capturingInput) return;
    const level = this._levels[this._currentIdx];
    let cur;
    if (path === 'parallax.bg')  cur = level.parallax?.bg  ?? 0.06;
    if (path === 'parallax.mid') cur = level.parallax?.mid ?? 0.25;
    if (path === 'worldW')       cur = level.worldW ?? 3840;
    if (path === 'laneTop')      cur = level.laneTop    ?? LANE_TOP;
    if (path === 'laneBottom')   cur = level.laneBottom ?? LANE_BOTTOM;
    if (path === 'spawnX')       cur = level.spawnX     ?? 150;
    this._capturingInput = true;
    this._inputBuffer    = String(cur);
    this._inputTarget    = { obj: null, field: '__levelProp', levelPath: path, textObj };
    textObj.setColor('#ffff00').setText(this._inputBuffer + '_');
  }

  _startRename() {
    const level = this._levels[this._currentIdx];
    this._capturingInput = true;
    this._inputBuffer    = level.name ?? '';
    this._inputTarget    = { obj: null, field: 'name', textObj: this._levelNameText };
    this._levelNameText.setColor('#ffff00').setText(this._inputBuffer + '_');
  }

  _commitInput() {
    if (!this._capturingInput) return;
    // Déléguer au sous-système loot si nécessaire
    if (this._inputTarget?.source === 'loot') { this._commitLootInput(); return; }
    const { obj, field, textObj } = this._inputTarget;
    const level = this._levels[this._currentIdx];

    if (field === 'name') {
      if (this._inputBuffer.trim()) level.name = this._inputBuffer.trim();
      this._updateToolbarName();
      textObj.setColor('#ffffff');
    } else if (field === '__levelProp') {
      const val  = parseFloat(this._inputBuffer);
      const path = this._inputTarget.levelPath;
      if (!isNaN(val)) {
        if (path === 'parallax.bg')       { if (!level.parallax) level.parallax = {}; level.parallax.bg  = val; }
        else if (path === 'parallax.mid') { if (!level.parallax) level.parallax = {}; level.parallax.mid = val; }
        else if (path === 'worldW')       { level.worldW = Math.round(Math.max(200, val)); this._rebuildBackground(); }
        else if (path === 'laneTop')      { level.laneTop    = Math.round(val); this._loadLevel(); }
        else if (path === 'laneBottom')   { level.laneBottom = Math.round(val); this._loadLevel(); }
        else if (path === 'spawnX')       { level.spawnX = Math.round(Math.max(0, val)); this._rebuildBackground(); }
      }
      textObj.setColor('#aaaacc');
    } else if (obj) {
      if (field === 'label') {
        const trimmed = this._inputBuffer.trim();
        if (trimmed) obj.data.label = trimmed;
        if (obj.type === 'transit') this._refreshTransitWO(obj);
      } else {
        const val = parseFloat(this._inputBuffer);
        if (!isNaN(val)) {
          if (field === 'scale') {
            obj.data.scale = val;
            if (obj.sprite) obj.sprite.setScale(val);
          } else if (field === 'width') {
            obj.data.width = Math.max(20, Math.round(val));
            if (obj.type === 'transit') { this._refreshTransitWO(obj); this._drawSelectionRect(obj); }
          } else if (field === 'height') {
            obj.data.height = Math.max(20, Math.round(val));
            obj._zoneH = obj.data.height;
            if (obj.type === 'transit') { this._refreshTransitWO(obj); this._drawSelectionRect(obj); }
          } else {
            obj.data[field] = Math.round(val);
            if (field === 'x' || field === 'y') this._moveObject(obj, obj.data.x, obj.data.y);
          }
        }
      }
      textObj.setColor('#cccccc');
    }

    this._capturingInput = false;
    this._inputTarget    = null;
    this._updatePropsPanel();
    this._updateListPanel();
  }

  _cancelInput() {
    if (!this._capturingInput) return;
    if (this._inputTarget?.source === 'loot') {
      this._inputTarget.textObj.setColor(this._inputTarget.cancelColor ?? '#ffcc44');
      this._capturingInput = false;
      this._inputTarget    = null;
      this._lootRedrawContent();
      return;
    }
    const { field, textObj } = this._inputTarget;
    if (field === '__levelProp')  textObj.setColor('#aaaacc');
    else if (field === 'name')    { textObj.setColor('#ffffff'); this._updateToolbarName(); }
    else                          textObj.setColor('#cccccc');
    this._capturingInput = false;
    this._inputTarget    = null;
    this._updatePropsPanel();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CLAVIER
  // ══════════════════════════════════════════════════════════════════════

  _onKeyDown(e) {
    if (this._capturingInput) {
      if (e.key === 'Enter')     { this._commitInput(); return; }
      if (e.key === 'Escape')    { this._cancelInput(); return; }
      if (e.key === 'Backspace') {
        this._inputBuffer = this._inputBuffer.slice(0, -1);
        this._inputTarget.textObj.setText(this._inputBuffer + '_');
        return;
      }
      const isText = this._inputTarget.field === 'label' || this._inputTarget.field === 'name';
      const valid  = isText
        ? (/^[\w \-]$/.test(e.key) && this._inputBuffer.length < 30)
        : (/^[\d.\-]$/.test(e.key) && this._inputBuffer.length < 10);
      if (valid) {
        this._inputBuffer += e.key;
        this._inputTarget.textObj.setText(this._inputBuffer + '_');
      }
      return;
    }

    if (e.key === 'Escape') {
      if (this._selected) this._deselect();
      else this.scene.start('TitleScene');
      return;
    }
    if (e.key === 'Delete' && this._selected) { this._deleteSelected(); return; }
    if (e.key === '+' || e.key === '=') { this._applyZoom(1.15); return; }
    if (e.key === '-')                   { this._applyZoom(1 / 1.15); return; }
    if (e.key === '0')                   { this._applyZoom(1 / this._zoom); return; }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ACTIONS OBJETS
  // ══════════════════════════════════════════════════════════════════════

  _deleteSelected() {
    if (!this._selected) return;
    const wo    = this._selected.obj;
    const level = this._levels[this._currentIdx];

    if (wo.type === 'prop')      level.props        = level.props.filter(p => p !== wo.data);
    if (wo.type === 'container') level.containers   = level.containers.filter(c => c !== wo.data);
    if (wo.type === 'transit')   level.transitZones = level.transitZones.filter(z => z !== wo.data);

    this._destroyWO(wo);
    this._worldObjects = this._worldObjects.filter(o => o !== wo);
    this._deselect();
    this._updateListPanel();
  }

  _cycleBackground(dir) {
    const level = this._levels[this._currentIdx];
    const list  = this._availableBackgrounds;          // [null, 'bar_backgrounds', ...]
    const cur   = list.indexOf(level.background ?? null);
    const next  = Phaser.Math.Wrap(cur + dir, 0, list.length);
    level.background = list[next];                     // null → aucun fond
    this._rebuildBackground();
    this._updatePropsPanel();
    this._updateToolbarName();
  }

  _cycleTarget(dir) {
    const wo = this._selected?.obj;
    if (!wo || wo.type !== 'transit') return;
    const ids  = [null, ...this._levels.map(l => l.id)];
    const cur  = ids.indexOf(wo.data.targetLevel);
    const next = Phaser.Math.Wrap(cur + dir, 0, ids.length);
    wo.data.targetLevel = ids[next];
    this._refreshTransitWO(wo);
    this._updatePropsPanel();
    this._updateListPanel();
  }

  _cycleTargetWarp(dir) {
    const wo = this._selected?.obj;
    if (!wo || wo.type !== 'transit' || !wo.data.targetLevel) return;
    const targetLevel = this._levels.find(l => l.id === wo.data.targetLevel);
    if (!targetLevel) return;
    const warps = (targetLevel.transitZones ?? []).filter(z => z.type === 'warp');
    if (!warps.length) return;
    const ids  = [null, ...warps.map(z => z.id)];
    const cur  = ids.indexOf(wo.data.targetWarpId ?? null);
    const next = Phaser.Math.Wrap(cur + dir, 0, ids.length);
    wo.data.targetWarpId = ids[next];
    this._updatePropsPanel();
  }

  _toggleBlocksPlayer() {
    const wo = this._selected?.obj;
    if (!wo || wo.type !== 'prop') return;
    wo.data.blocksPlayer = !wo.data.blocksPlayer;
    this._updatePropsPanel();
    this._updateListPanel();
  }

  _toggleBlocksEnemy() {
    const wo = this._selected?.obj;
    if (!wo || wo.type !== 'prop') return;
    wo.data.blocksEnemy = !wo.data.blocksEnemy;
    this._updatePropsPanel();
    this._updateListPanel();
  }

  _refreshTransitWO(wo) {
    const zoneW = wo.data.width ?? 120;
    this._redrawTransitGfx(wo.graphics, wo.data, wo._zoneY, zoneW, wo._zoneH);
    wo.labelText.setText(this._transitLabel(wo.data))
      .setColor(this._transitColor(wo.data, true))
      .setPosition(wo.data.x + zoneW / 2, wo._zoneY - 14);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  GESTION NIVEAUX
  // ══════════════════════════════════════════════════════════════════════

  _updateToolbarName() {
    const level = this._levels[this._currentIdx];
    this._levelNameText.setText(`${this._currentIdx + 1}/${this._levels.length}  ${level.name}`);
  }

  _prevLevel() { if (this._currentIdx > 0) { this._currentIdx--; this._loadLevel(); } }
  _nextLevel() { if (this._currentIdx < this._levels.length - 1) { this._currentIdx++; this._loadLevel(); } }

  _newLevel() {
    const newIdx = this._levels.length + 1;
    const base   = JSON.parse(JSON.stringify(this._levels[this._currentIdx]));
    base.id   = `level_${String(newIdx).padStart(2, '0')}`;
    base.name = `Level ${newIdx}`;
    base.props = [];
    base.containers = [];
    base.transitZones = [{
      id: 'zone_warp_01', type: 'warp',
      x: Math.max(200, (base.worldW ?? 3840) - 200),
      width: 120, targetLevel: null, label: 'WARP',
    }];
    this._levels.push(base);
    this._currentIdx = this._levels.length - 1;
    this._loadLevel();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  TEST & EXPORT
  // ══════════════════════════════════════════════════════════════════════

  async _testLevel() {
    await this._saveToServer(true);   // sauvegarde silencieuse avant le test
    const level = this._levels[this._currentIdx];
    this.registry.set('editorLevels', this._levels);
    this.scene.start('GameScene', { levelId: level.id, fromEditor: true });
  }

  _showExport() {
    if (this._exportOverlay) return;
    const code = this._generateExportCode();

    const bg = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.94)
      .setDepth(9990).setInteractive();
    const title = this.add.text(GAME_W / 2, 12, '── EXPORT : js/config/levels.js ──', {
      fontFamily: 'monospace', fontSize: '13px', color: '#4488ff',
    }).setOrigin(0.5, 0).setDepth(9991);
    const hint = this.add.text(GAME_W / 2, 30, 'Copier ce code → coller dans js/config/levels.js  puis recharger', {
      fontFamily: 'monospace', fontSize: '9px', color: '#888888',
    }).setOrigin(0.5, 0).setDepth(9991);

    const codeText = this.add.text(6, 48, code, {
      fontFamily: 'monospace', fontSize: '8px', color: '#aaffaa',
    }).setDepth(9991);

    const btnClose = this.add.text(GAME_W - 8, 8, '[ FERMER ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff6600',
    }).setOrigin(1, 0).setDepth(9992).setInteractive({ useHandCursor: true });

    this._uiLayer.add([bg, title, hint, codeText, btnClose]);

    const close = () => { [bg, title, hint, codeText, btnClose].forEach(o => o.destroy()); this._exportOverlay = null; };
    btnClose.on('pointerdown', close);
    btnClose.on('pointerover', () => btnClose.setColor('#ffffff'));
    btnClose.on('pointerout',  () => btnClose.setColor('#ff6600'));
    this._exportOverlay = { bg, codeText, btnClose };
  }

  _generateExportCode() {
    const ln = [];
    ln.push('export const LEVELS = [');
    for (const lv of this._levels) {
      ln.push('  {');
      ln.push(`    id: '${lv.id}',`);
      ln.push(`    name: '${lv.name}',`);
      ln.push(`    worldW: ${lv.worldW ?? 3840},`);
      ln.push(`    parallax: { bg: ${lv.parallax?.bg ?? 0.06}, mid: ${lv.parallax?.mid ?? 0.25} },`);
      if (lv.background)         ln.push(`    background: '${lv.background}',`);
      if (lv.laneTop    != null) ln.push(`    laneTop: ${lv.laneTop},`);
      if (lv.laneBottom != null) ln.push(`    laneBottom: ${lv.laneBottom},`);
      if (lv.spawnX     != null) ln.push(`    spawnX: ${lv.spawnX},`);
      ln.push('    props: [');
      for (const p of (lv.props ?? [])) {
        const blockStr = (p.blocksPlayer ? ', blocksPlayer: true' : '') + (p.blocksEnemy ? ', blocksEnemy: true' : '');
        ln.push(`      { type: '${p.type}', x: ${p.x}, y: ${p.y}, scale: ${p.scale ?? 1}${blockStr} },`);
      }
      ln.push('    ],');
      ln.push('    containers: [');
      for (const c of (lv.containers ?? []))
        ln.push(`      { x: ${c.x}, y: ${c.y}, texture: '${c.texture ?? 'barrel'}' },`);
      ln.push('    ],');
      ln.push('    transitZones: [');
      for (const z of (lv.transitZones ?? [])) {
        const tgt     = z.targetLevel  ? `'${z.targetLevel}'`  : 'null';
        const twarpId = z.targetWarpId ? `'${z.targetWarpId}'` : 'null';
        const yStr = (z.y      != null) ? `, y: ${z.y}` : '';
        const hStr = (z.height != null) ? `, height: ${z.height}` : '';
        ln.push(`      { id: '${z.id}', type: '${z.type}', x: ${z.x}${yStr}, width: ${z.width ?? 120}${hStr}, targetLevel: ${tgt}, targetWarpId: ${twarpId}, label: '${z.label ?? ''}' },`);
      }
      ln.push('    ],');
      ln.push('  },');
    }
    ln.push('];');
    ln.push('');
    ln.push("export const LEVEL_MAP = Object.fromEntries(LEVELS.map(l => [l.id, l]));");
    return ln.join('\n');
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SERVEUR ÉDITEUR (persistance)
  // ══════════════════════════════════════════════════════════════════════

  /** Charge les niveaux depuis le serveur éditeur au démarrage de la scène.
   *  Ignoré si les niveaux ont déjà été restaurés depuis le registry ou localStorage
   *  (données plus récentes que les fichiers serveur). */
  async _fetchLevelsFromServer() {
    // Si on a des données plus fraîches (registry = même session, localStorage = SAVE explicite),
    // le serveur n'a rien de plus récent à offrir.
    if (this.registry.get('editorLevels')) return;
    try {
      const res = await fetch(`${EDITOR_URL}/levels`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw    = await res.json();
      const levels = Array.isArray(raw) ? raw.filter(l => l != null && l.id) : [];
      if (levels.length === 0) return;
      // N'écraser que si on était sur les LEVELS statiques (aucune source locale)
      try {
        if (!localStorage.getItem('RAGEDERUE_editor_levels')) {
          this._levels     = levels;
          this._currentIdx = 0;
          this._loadLevel();
        }
      } catch {
        this._levels     = levels;
        this._currentIdx = 0;
        this._loadLevel();
      }
      console.log(`[Editor] ${levels.length} niveau(x) chargé(s) depuis le serveur.`);
    } catch (e) {
      console.info('[Editor] Serveur éditeur non disponible — niveaux locaux utilisés.', e.message);
    }
  }

  /** Sauvegarde tous les niveaux sur le serveur éditeur.
   *  @param {boolean} silent — si true, pas de toast (ex. autosave avant TEST) */
  async _saveToServer(silent = false) {
    const levels = this._levels.filter(l => l != null && l.id);

    // Toujours persister en local (backup sans serveur + retour TEST)
    try {
      const json = JSON.stringify(levels);
      localStorage.setItem('RAGEDERUE_editor_levels', json);
      this.registry.set('editorLevels', levels);
    } catch {}

    try {
      const res = await fetch(`${EDITOR_URL}/levels`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(levels),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!silent) this._showSaveFeedback(true);
    } catch (e) {
      console.error('[Editor] Erreur sauvegarde :', e.message);
      if (!silent) this._showSaveFeedback(false);
    }
  }

  /** Affiche un toast de confirmation (succès ou échec). */
  _showSaveFeedback(success) {
    const msg   = success ? '✓  Sauvegardé' : '✗  Serveur non disponible — utiliser [ EXPORT ]';
    const color = success ? '#00ff88' : '#ff6600';
    const txt   = this.add.text(GAME_W / 2, TOOL_H + 28, msg, {
      fontFamily: 'monospace', fontSize: '12px', color,
      backgroundColor: '#000000cc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0).setDepth(9999);
    this._uiLayer.add(txt);
    this.tweens.add({
      targets: txt, alpha: 0, duration: 900, delay: 1000,
      onComplete: () => txt.destroy(),
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LOOT EDITOR OVERLAY
  // ══════════════════════════════════════════════════════════════════════

  async _fetchLootData() {
    try {
      const res = await fetch(`${EDITOR_URL}/loot`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._lootData = await res.json();
    } catch (e) {
      console.info('[Editor] Loot data non disponible :', e.message);
    }
  }

  _showLootEditor() {
    if (this._lootOverlay) return;
    if (!this._lootData) {
      this._showSaveFeedback(false);
      return;
    }
    this._lootTab = 'tables';
    const D   = 8000;
    const all = [];   // tous les objets persistants de l'overlay
    const ui  = (go) => { this._uiLayer.add(go); all.push(go); return go; };

    // Fond bloquant les clics vers le level editor
    ui(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x060614, 0.97)
      .setDepth(D).setInteractive());

    // Barre de titre
    ui(this.add.rectangle(GAME_W / 2, 16, GAME_W, 32, 0x111133).setDepth(D + 1));
    ui(this.add.text(8, 4, '◆ LOOT EDITOR', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff88cc',
    }).setDepth(D + 2));

    // Helper bouton header
    const hBtn = (x, label, color, cb) => {
      const b = ui(this.add.text(x, 16, label, {
        fontFamily: 'monospace', fontSize: '11px', color,
      }).setOrigin(0.5, 0.5).setDepth(D + 2).setInteractive({ useHandCursor: true }));
      b._col = color;
      b.on('pointerdown', cb);
      b.on('pointerover', () => b.setColor('#ffffff'));
      b.on('pointerout',  () => b.setColor(b._col));
      return b;
    };

    this._lootBtnTables = hBtn(200, '[TABLES]', '#aaaacc', () => this._lootSetTab('tables'));
    this._lootBtnItems  = hBtn(280, '[ITEMS]',  '#aaaacc', () => this._lootSetTab('items'));
    hBtn(GAME_W - 130, '[SAVE]',  '#ffcc00', () => this._saveLootToServer());
    hBtn(GAME_W -  50, '[CLOSE]', '#ff4444', () => this._hideLootEditor());

    this._lootOverlay     = all;
    this._lootContentObjs = [];
    this._lootRedrawContent();
  }

  _hideLootEditor() {
    if (!this._lootOverlay) return;
    for (const go of this._lootOverlay)     go.destroy();
    for (const go of this._lootContentObjs) go.destroy();
    this._lootOverlay     = null;
    this._lootContentObjs = [];
    if (this._inputTarget?.source === 'loot') {
      this._capturingInput = false;
      this._inputTarget    = null;
    }
  }

  _lootSetTab(tab) {
    this._lootTab = tab;
    this._lootRedrawContent();
  }

  _lootRedrawContent() {
    for (const go of this._lootContentObjs) go.destroy();
    this._lootContentObjs = [];
    if (this._lootTab === 'tables') this._lootBuildTables();
    else                            this._lootBuildItems();
    // Highlighter les onglets actifs
    this._lootBtnTables?.setColor(this._lootTab === 'tables' ? '#ff88cc' : '#aaaacc');
    this._lootBtnItems ?.setColor(this._lootTab === 'items'  ? '#ff88cc' : '#aaaacc');
  }

  _lootBuildTables() {
    const D    = 8003;
    const Y0   = 36;
    const RH   = 18;   // row height
    const BMAX = 170;  // max bar width px
    const co   = (go) => { this._uiLayer.add(go); this._lootContentObjs.push(go); return go; };

    const drawTable = (title, tableArr, tableKey, xOff) => {
      const total = tableArr.reduce((s, e) => s + e.weight, 0) || 1;
      co(this.add.text(xOff, Y0 + 4, title, {
        fontFamily: 'monospace', fontSize: '10px', color: '#aaaacc',
      }).setDepth(D));
      co(this.add.rectangle(xOff + 175, Y0 + 16, 350, 1, 0x334455).setOrigin(0, 0.5).setDepth(D));

      tableArr.forEach((entry, idx) => {
        const y      = Y0 + 22 + idx * RH;
        const ratio  = entry.weight / total;
        const barW   = Math.max(1, Math.round(ratio * BMAX));
        const pct    = Math.round(ratio * 100);

        // Nom
        co(this.add.text(xOff, y, entry.type.slice(0, 13), {
          fontFamily: 'monospace', fontSize: '10px', color: '#cccccc',
        }).setDepth(D));

        // Poids (cliquable)
        const wtxt = co(this.add.text(xOff + 108, y, String(entry.weight).padStart(3), {
          fontFamily: 'monospace', fontSize: '10px', color: '#ffcc44',
        }).setDepth(D).setInteractive({ useHandCursor: true }));
        wtxt.on('pointerover', () => wtxt.setColor('#ffffff'));
        wtxt.on('pointerout',  () => {
          if (!(this._inputTarget?.source === 'loot' && this._inputTarget.idx === idx
             && this._inputTarget.table === tableKey)) wtxt.setColor('#ffcc44');
        });
        wtxt.on('pointerdown', () => {
          if (this._capturingInput) return;
          this._capturingInput = true;
          this._inputBuffer    = String(entry.weight);
          this._inputTarget    = { source: 'loot', type: 'weight', table: tableKey, idx, textObj: wtxt, cancelColor: '#ffcc44' };
          wtxt.setColor('#ffff00').setText(this._inputBuffer + '_');
        });

        // Pourcentage
        co(this.add.text(xOff + 132, y, `${pct}%`.padStart(4), {
          fontFamily: 'monospace', fontSize: '9px', color: '#556677',
        }).setDepth(D));

        // Barre fond + remplissage
        co(this.add.rectangle(xOff + 165, y + 4, BMAX, 8, 0x1a1a33).setOrigin(0, 0.5).setDepth(D));
        co(this.add.rectangle(xOff + 165, y + 4, barW, 8, 0x4466cc).setOrigin(0, 0.5).setDepth(D + 1));
      });

      // Séparateur + total
      const botY = Y0 + 22 + tableArr.length * RH;
      co(this.add.rectangle(xOff + 175, botY, 350, 1, 0x334455).setOrigin(0, 0.5).setDepth(D));
      co(this.add.text(xOff, botY + 4, `Total : ${total}`, {
        fontFamily: 'monospace', fontSize: '9px', color: '#445566',
      }).setDepth(D));

      // Count items
      const isContainer = tableKey === 'container';
      const count = isContainer ? this._lootData.containerItemCount : this._lootData.corpseItemCount;
      const countY = botY + 20;
      co(this.add.text(xOff, countY, `Drops : ${count?.min ?? 0}–${count?.max ?? 1} items`, {
        fontFamily: 'monospace', fontSize: '9px', color: '#445566',
      }).setDepth(D));

      // Boutons +/- pour min / max
      const editCount = (field, dx) => {
        const obj = isContainer ? this._lootData.containerItemCount : this._lootData.corpseItemCount;
        obj[field] = Math.max(0, (obj[field] ?? 0) + dx);
        if (obj.min > obj.max) obj[field === 'min' ? 'max' : 'min'] = obj[field];
        this._lootRedrawContent();
      };
      const mkCntBtn = (x, y, lbl, cb) => {
        const b = co(this.add.text(x, y, lbl, {
          fontFamily: 'monospace', fontSize: '10px', color: '#556677',
        }).setDepth(D).setInteractive({ useHandCursor: true }));
        b.on('pointerdown', cb);
        b.on('pointerover', () => b.setColor('#ffffff'));
        b.on('pointerout',  () => b.setColor('#556677'));
        return b;
      };
      mkCntBtn(xOff + 165, countY, '[-min]', () => editCount('min', -1));
      mkCntBtn(xOff + 210, countY, '[+min]', () => editCount('min', +1));
      mkCntBtn(xOff + 255, countY, '[-max]', () => editCount('max', -1));
      mkCntBtn(xOff + 300, countY, '[+max]', () => editCount('max', +1));
    };

    // Séparateur vertical centre
    co(this.add.rectangle(GAME_W / 2, GAME_H / 2, 1, GAME_H, 0x222244).setDepth(D));

    drawTable('CONTAINER TABLE', this._lootData.containerTable, 'container', 8);
    drawTable('CORPSE TABLE',    this._lootData.corpseTable,    'corpse',    GAME_W / 2 + 8);
  }

  _lootBuildItems() {
    const D   = 8003;
    const Y0  = 36;
    const RH  = 16;
    const co  = (go) => { this._uiLayer.add(go); this._lootContentObjs.push(go); return go; };

    // Colonnes : key, texture, INV, TIME, HEAL, HUNG, THIR, VAL, [✕]
    const COLS  = [8, 125, 220, 255, 300, 340, 380, 415, 460];
    const HDRS  = ['KEY', 'TEXTURE', 'INV', 'TIME', 'HEAL', 'HUNG', 'THIR', 'VAL'];
    const COLS2 = [470, 580, 670, 700, 745, 785, 825, 860, 900];

    const drawHeader = (offsets) => {
      HDRS.forEach((h, i) => co(this.add.text(offsets[i], Y0 + 4, h, {
        fontFamily: 'monospace', fontSize: '9px', color: '#556677',
      }).setDepth(D)));
    };
    drawHeader(COLS);
    drawHeader(COLS2);
    co(this.add.rectangle(GAME_W / 2, Y0 + 17, GAME_W - 8, 1, 0x334455).setOrigin(0.5, 0.5).setDepth(D));

    const allItems = Object.entries(this._lootData.items ?? {});
    const usedKeys = new Set([
      ...(this._lootData.containerTable ?? []).map(e => e.type),
      ...(this._lootData.corpseTable    ?? []).map(e => e.type),
    ]);

    // Afficher en 2 colonnes (max ~15 items par colonne)
    const COL1 = allItems.slice(0, Math.ceil(allItems.length / 2));
    const COL2 = allItems.slice(Math.ceil(allItems.length / 2));

    const drawItemRow = (key, it, rowIdx, colOffsets) => {
      const y      = Y0 + 22 + rowIdx * RH;
      const isUsed = usedKeys.has(key);

      const cellStyle = (col) => ({ fontFamily: 'monospace', fontSize: '9px', color: col });
      co(this.add.text(colOffsets[0], y, key.slice(0, 12),            cellStyle('#cccccc')).setDepth(D));
      co(this.add.text(colOffsets[1], y, (it.texture ?? '?').slice(0,10), cellStyle('#aaaacc')).setDepth(D));
      co(this.add.text(colOffsets[2], y, `${it.invW ?? 1}×${it.invH ?? 1}`, cellStyle('#aaaaaa')).setDepth(D));
      co(this.add.text(colOffsets[3], y, String(it.useTime     ?? 0), cellStyle('#888888')).setDepth(D));
      co(this.add.text(colOffsets[4], y, String(it.healAmount  ?? 0), cellStyle('#ff8888')).setDepth(D));
      co(this.add.text(colOffsets[5], y, String(it.hungerRestore ?? 0), cellStyle('#ffaa44')).setDepth(D));
      co(this.add.text(colOffsets[6], y, String(it.thirstRestore ?? 0), cellStyle('#44aaff')).setDepth(D));
      co(this.add.text(colOffsets[7], y, String(it.value        ?? 0), cellStyle('#00ffcc')).setDepth(D));

      // Bouton supprimer
      const delColor = isUsed ? '#443333' : '#ff4444';
      const delBtn   = co(this.add.text(colOffsets[8], y, '[✕]', cellStyle(delColor))
        .setDepth(D).setInteractive({ useHandCursor: true }));
      delBtn.on('pointerover', () => delBtn.setColor(isUsed ? '#665555' : '#ffffff'));
      delBtn.on('pointerout',  () => delBtn.setColor(delColor));
      delBtn.on('pointerdown', () => {
        if (isUsed) {
          this._showSaveFeedback(false);  // toast "non disponible" = item utilisé
          return;
        }
        delete this._lootData.items[key];
        this._lootRedrawContent();
      });
    };

    COL1.forEach(([k, it], i) => drawItemRow(k, it, i, COLS));
    COL2.forEach(([k, it], i) => drawItemRow(k, it, i, COLS2));

    // Séparateur vertical
    co(this.add.rectangle(GAME_W / 2, GAME_H / 2, 1, GAME_H, 0x222244).setDepth(D));

    // Bouton + ADD item
    const addY = Y0 + 22 + Math.ceil(allItems.length / 2) * RH + 8;
    const addBtn = co(this.add.text(8, addY, '[+ NOUVEL ITEM]', {
      fontFamily: 'monospace', fontSize: '10px', color: '#44ff88',
    }).setDepth(D).setInteractive({ useHandCursor: true }));
    addBtn.on('pointerover', () => addBtn.setColor('#ffffff'));
    addBtn.on('pointerout',  () => addBtn.setColor('#44ff88'));
    addBtn.on('pointerdown', () => {
      const newKey = `item_${Date.now()}`;
      this._lootData.items[newKey] = {
        texture: 'barrel', invW: 1, invH: 1, useTime: 0,
        healAmount: 0, value: 0, displayW: 32, displayH: 32,
        glowColor: 0xffffff, description: 'New item',
      };
      this._lootRedrawContent();
    });
  }

  _commitLootInput() {
    const { type, table, idx, textObj } = this._inputTarget;
    if (type === 'weight') {
      const val = parseInt(this._inputBuffer, 10);
      if (!isNaN(val) && val >= 0) {
        const arr = table === 'container'
          ? this._lootData.containerTable
          : this._lootData.corpseTable;
        arr[idx].weight = val;
      }
    }
    this._capturingInput = false;
    this._inputTarget    = null;
    this._lootRedrawContent();
  }

  async _saveLootToServer() {
    if (!this._lootData) return;
    try {
      const res = await fetch(`${EDITOR_URL}/loot`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(this._lootData),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._showSaveFeedback(true);
    } catch (e) {
      console.error('[Editor] Loot save error:', e.message);
      this._showSaveFeedback(false);
    }
  }
}
