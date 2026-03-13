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
import { PROP_DEFS, getPropDef } from '../config/propDefs.js';
import { TextInput } from '../utils/TextInput.js';

// ── Layout ───────────────────────────────────────────────────────────────
const PAL_W  = 120;   // palette gauche
const LIST_W = 160;   // panel liste droite
const TOOL_H = 36;    // toolbar haut
const PROP_H = 36;    // properties bas
const SCROLL_SPEED = 400;

// ── Outils palette ───────────────────────────────────────────────────────
// Build TOOLS from PROP_DEFS — unified palette (no more prop:/container: split)
function _buildTools() {
  const tools = [{ id: 'select', label: '↖ SELECT', color: '#ffffff' }];
  tools.push({ id: 'sep_objects', label: '─ OBJETS ─', color: '#555555', sep: true });
  for (const [key, def] of Object.entries(PROP_DEFS)) {
    const color = def.isContainer
      ? (def.specialType === 'chest' ? '#ffdd66' : def.specialType === 'upgradeStation' ? '#ff9944' : '#88ff88')
      : (def.blocksPlayer ? '#ff8844' : '#cccccc');
    tools.push({ id: `obj:${key}`, label: `  ${key}`, color });
  }
  tools.push({ id: 'sep_zones', label: '─ ZONES ─', color: '#555555', sep: true });
  tools.push({ id: 'transit', label: '  transit', color: '#00ccff' });
  return tools;
}
const TOOLS = _buildTools();

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
    this._capturingInput = false;   // encore utilisé pour saisie poids loot (numérique)
    this._inputBuffer    = '';
    this._inputTarget    = null;
    this._activeTextInput = null;   // instance TextInput DOM active (text fields)
    this._exportOverlay       = null;
    this._lootOverlay         = null;   // persistent overlay objects []
    this._lootContentObjs     = [];    // rebuilt on tab switch
    this._lootData            = null;  // { items, containerLootTables, containerItemCounts, enemyLootTables, enemyItemCounts }
    this._lootTab             = 'tables';
    this._lootSelectedType    = null;  // { kind: 'container'|'enemy', key: string }
    this._selRect             = null;
    this._availableBackgrounds = [null, ...BACKGROUND_KEYS]; // null = aucun fond
    this._dragActive     = false;
    this._dragOrigin     = null;   // { px, py } screen coords at mousedown
    this._resizeMode     = null;   // null | 'width' | 'height' (transit zones)
    this._zoom           = 1.0;   // zoom caméra [0.25 .. 2.0]
    this._showHitboxes   = false;  // H key toggle
    this._hitboxGraphics = [];     // Graphics objects for all-props hitbox overlay
    this._propsEdOverlay = null;   // Props Editor overlay objects
    this._propsEdSelected = null;  // Currently selected texture key in Props Editor
    this._propsEdDefs    = null;   // Local copy of PROP_DEFS being edited
    this._propsEdDrag         = null;   // Active drag-scrub state { startY, startVal, onChange, step, textObj }
    this._propsEdAddingTexture = false; // true quand le champ "ajouter texture" est actif
    this._editorScrub    = null;   // Drag-scrub pour champs numériques principaux { startY, startVal, step, decimals, textObj, resetColor, onApply, currentVal }

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
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });
    this.input.keyboard.on('keydown', e => this._onKeyDown(e));

    // ── Souris ───────────────────────────────────────────────────────────
    this.input.on('pointerdown', p => this._onPointerDown(p));
    this.input.on('pointermove', p => this._onPointerMove(p));
    this.input.on('pointerup',   () => {
      if (this._editorScrub) {
        const sc = this._editorScrub;
        sc.onApply(sc.currentVal);
        sc.textObj.setColor(sc.resetColor);
        this._editorScrub = null;
      }
      this._dragActive = false; this._dragOrigin = null; this._resizeMode = null;
    });
    this.input.on('wheel', (pointer, _gos, _dx, deltaY) => this._onWheel(pointer, deltaY));
  }

  // ─────────────────────────────────────────────────────────────────────
  update(_, delta) {
    if (this._capturingInput || this._activeTextInput) return;
    const dt       = delta / 1000;
    const maxW     = this._levels[this._currentIdx]?.worldW ?? 3840;
    const maxScroll = Math.max(0, maxW - GAME_W / this._zoom);
    const spd      = SCROLL_SPEED / this._zoom * (this._keys.shift.isDown ? 3 : 1);

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
    ui(this.add.text(PAL_W + 4, GAME_H - PROP_H - 14, 'A/D : scroll   molette / +- : zoom   0 : reset zoom   DEL : supprimer   H : hitboxes', {
      fontFamily: 'monospace', fontSize: '9px', color: '#333355',
    }).setDepth(601));
  }

  _buildToolbar() {
    const y = TOOL_H / 2;
    this._toolbarBtns = [];
    this._toolbarBtns.push(this._uiBtn(10, y, '[ MENU ]', '#888888', () => { if (this._lootOverlay) return; this.scene.start('TitleScene'); }, 0, 0.5));
    this._toolbarBtns.push(this._uiBtn(150, y, '◄', '#ff6600', () => { if (this._lootOverlay) return; this._prevLevel(); }, 0.5, 0.5));

    // Le nom du niveau est cliquable pour le renommer
    this._levelNameText = this.add.text(310, y, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(700).setInteractive({ useHandCursor: true });
    this._uiLayer.add(this._levelNameText);
    this._levelNameText.on('pointerdown', () => {
      if (this._activeTextInput || this._capturingInput) return;
      const level = this._levels[this._currentIdx];
      this._levelNameText.setColor('#ffcc00');
      this._activeTextInput = new TextInput(this, {
        gameX: this._levelNameText.x - 90, gameY: this._levelNameText.y,
        width: 180, value: level.name ?? '',
        onCommit: (val) => {
          if (val) level.name = val;
          this._levelNameText.setColor('#ffffff');
          this._activeTextInput = null;
          this._updateToolbarName();
        },
        onCancel: () => {
          this._levelNameText.setColor('#ffffff');
          this._activeTextInput = null;
          this._updateToolbarName();
        },
      });
    });
    this._levelNameText.on('pointerover', () => { if (!this._activeTextInput) this._levelNameText.setColor('#ffcc00'); });
    this._levelNameText.on('pointerout',  () => { if (!this._activeTextInput) this._levelNameText.setColor('#ffffff'); });
    this._toolbarBtns.push(this._levelNameText);

    this._toolbarBtns.push(this._uiBtn(470, y, '►', '#ff6600', () => { if (this._lootOverlay) return; this._nextLevel(); }, 0.5, 0.5));
    this._toolbarBtns.push(this._uiBtn(510, y, '[ +NEW ]', '#ffcc00', () => { if (this._lootOverlay) return; this._newLevel(); }, 0, 0.5));
    this._toolbarBtns.push(this._uiBtn(580, y, '[ SAVE ]', '#ffcc00', () => { if (this._lootOverlay) return; this._saveToServer(); }, 0, 0.5));
    this._toolbarBtns.push(this._uiBtn(648, y, '[ TEST ]', '#00ff88', () => { if (this._lootOverlay) return; this._testLevel(); },    0, 0.5));
    this._toolbarBtns.push(this._uiBtn(716, y, '[ EXPORT ]','#4488ff', () => { if (this._lootOverlay) return; this._showExport(); },  0, 0.5));

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

    y += 18;
    const propsBtn = this.add.text(4, y, '[PROPS ED.]', {
      fontFamily: 'monospace', fontSize: '11px', color: '#44ccff',
    }).setDepth(700).setInteractive({ useHandCursor: true });
    this._uiLayer.add(propsBtn);
    propsBtn.on('pointerdown', () => this._showPropsEditor());
    propsBtn.on('pointerover', () => propsBtn.setColor('#ffffff'));
    propsBtn.on('pointerout',  () => propsBtn.setColor('#44ccff'));
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

    this._btnDel = this._uiBtn(GAME_W - LIST_W - 80, py, '[ DEL ]', '#ff4444', () => this._deleteSelected(), 0, 0.5);
    this._btnDel.setVisible(false);

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
    this._fieldBg  = this._makeLevelField(x0,       py, 'parallax.bg',  'px.bg',  0.005, 3);
    this._fieldMid = this._makeLevelField(x0 + 90,  py, 'parallax.mid', 'px.mid', 0.005, 3);
    this._fieldWW  = this._makeLevelField(x0 + 180, py, 'worldW',       'worldW', 4,     0);

    // ── Limites lane (laneTop / laneBottom) ──────────────────────────
    this._fieldLaneTop = this._makeLevelField(x0 + 480, py, 'laneTop',    'lane↑', 1, 0);
    this._fieldLaneBot = this._makeLevelField(x0 + 570, py, 'laneBottom', 'lane↓', 1, 0);

    // ── Spawn X ──────────────────────────────────────────────────────
    this._fieldSpawnX  = this._makeLevelField(x0 + 660, py, 'spawnX',     'spawnX', 2, 0);

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

    val.on('pointerdown', (pointer) => {
      if (!this._selected) return;
      if (field === 'label') {
        // Champ texte : TextInput DOM natif (copy/paste, vrai curseur)
        if (this._activeTextInput) { this._activeTextInput.destroy(); this._activeTextInput = null; }
        val.setColor('#ffff00');
        this._activeTextInput = new TextInput(this, {
          gameX: val.x, gameY: val.y, width: 140,
          value: this._selected.obj.data.label ?? '',
          onCommit: (newVal) => {
            if (newVal) {
              this._selected.obj.data.label = newVal;
              if (this._selected.obj.type === 'transit') this._refreshTransitWO(this._selected.obj);
            }
            val.setColor('#cccccc');
            this._activeTextInput = null;
            this._updatePropsPanel();
            this._updateListPanel();
          },
          onCancel: () => {
            val.setColor('#cccccc');
            this._activeTextInput = null;
          },
        });
        return;
      }
      // Champs numériques : scrub vertical
      const wo = this._selected.obj;
      const curVal = parseFloat(wo.data[field] ?? 0) || 0;
      this._startEditorScrub(pointer, curVal, 1, 0, val, '#cccccc', (newVal) => {
        this._applyObjectField(wo, field, newVal);
      });
    });
    val.on('pointerover', () => { if (this._editorScrub?.textObj !== val) val.setColor('#ffffff'); });
    val.on('pointerout',  () => { if (this._editorScrub?.textObj !== val && this._activeTextInput === null) val.setColor('#cccccc'); });

    return { lbl, val };
  }


  _makeLevelField(x, y, path, label, step = 1, decimals = 0) {
    const lbl = this.add.text(x, y - 7, label + ':', {
      fontFamily: 'monospace', fontSize: '9px', color: '#445566',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false);
    this._uiLayer.add(lbl);

    const val = this.add.text(x, y + 6, '---', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aaaacc',
    }).setOrigin(0, 0.5).setDepth(700).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this._uiLayer.add(val);

    val.on('pointerdown', (pointer) => {
      const level = this._levels[this._currentIdx];
      let curVal = 0;
      if (path === 'parallax.bg')  curVal = level.parallax?.bg  ?? 0.06;
      if (path === 'parallax.mid') curVal = level.parallax?.mid ?? 0.25;
      if (path === 'worldW')       curVal = level.worldW   ?? 3840;
      if (path === 'laneTop')      curVal = level.laneTop    ?? LANE_TOP;
      if (path === 'laneBottom')   curVal = level.laneBottom ?? LANE_BOTTOM;
      if (path === 'spawnX')       curVal = level.spawnX     ?? 150;
      this._startEditorScrub(pointer, curVal, step, decimals, val, '#aaaacc', (newVal) => {
        this._applyLevelProp(path, newVal);
      });
    });
    val.on('pointerover', () => { if (this._editorScrub?.textObj !== val) val.setColor('#ffffff'); });
    val.on('pointerout',  () => { if (this._editorScrub?.textObj !== val) val.setColor('#aaaacc'); });

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
    this._clearHitboxOverlay();
    this._deselect();
    this._camScrollX = 0;
    this.cameras.main.setScroll(0, this._camScrollY());

    const level = this._levels[this._currentIdx];
    this._buildWorldBackground(level);
    for (const obj of (level.objects ?? []))  this._spawnObjectSprite(obj);
    for (const z of level.transitZones)       this._spawnTransitSprite(z);

    this._updateToolbarName();
    this._updatePropsPanel();
    this._updatePaletteHighlight();
    this._updateListPanel();
    if (this._showHitboxes) this._rebuildHitboxOverlay();
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

  _spawnObjectSprite(data) {
    const tex = data.type;
    if (!this.textures.exists(tex)) {
      console.warn(`[Editor] Texture manquante : ${tex}`);
      return null;
    }
    const def   = getPropDef(tex);
    const scale = def.scale ?? 1;
    const sprite = this.add.image(data.x, data.y, tex)
      .setOrigin(0.5, 1).setScale(scale).setDepth(data.y + 10);

    // Tint containers to distinguish them visually
    if (def.isContainer) {
      const tint = def.specialType === 'chest'          ? 0xffdd66
                 : def.specialType === 'upgradeStation' ? 0xff9944
                 : tex === 'toolbox'                    ? 0x44ddff
                 : 0x88ff88;
      sprite.setTint(tint);
    }

    this._worldLayer.add(sprite);
    const wo = { data, sprite, type: 'object' };
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
    if (data.type !== 'warp') return `▼ ${data.label ?? 'EXTRACT'}`;
    const tgtLevel = this._levels?.find(l => l.id === data.targetLevel);
    if (!tgtLevel) return `► ${data.label ?? 'WARP'}`;
    const tgtWarp  = (tgtLevel.transitZones ?? []).find(z => z.type === 'warp' && z.id === data.targetWarpId);
    const warpName = tgtWarp ? (tgtWarp.label ?? tgtWarp.id) : '?';
    return `► ${tgtLevel.name} / ${warpName}`;
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
    if (wo.type === 'object') {
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
    } else if (wo.type === 'object') {
      // Show collision bounds from PropDef if blocksPlayer
      const def = getPropDef(wo.data.type);
      if (def.blocksPlayer && wo.sprite && def.collision) {
        const s   = wo.sprite;
        const dw  = s.displayWidth;
        const dh  = s.displayHeight;
        const col = def.collision;
        const cw  = col.width   ?? dw;
        const ch  = col.height  ?? dh;
        const cox = (dw - cw) / 2 + (col.offsetX ?? 0);
        const coy = (dh - ch)     + (col.offsetY ?? 0);
        const bx  = s.x - dw / 2 + cox;
        const by  = s.y - dh     + coy;
        this._selRect.lineStyle(2, 0x00ccff, 0.9);
        this._selRect.strokeRect(bx, by, cw, ch);
      }
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
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  EVENTS SOURIS
  // ══════════════════════════════════════════════════════════════════════

  _onPointerDown(pointer) {
    if (this._editorScrub) return;
    if (this._capturingInput || this._activeTextInput) return;

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
    // Scrub numérique — priorité absolue, fonctionne partout sur l'écran
    if (this._editorScrub && pointer.isDown) {
      const sc = this._editorScrub;
      const dy = sc.startY - pointer.y;  // déplacement vers le haut = positif
      const newVal = sc.startVal + dy * sc.step;
      sc.currentVal = newVal;
      const disp = sc.decimals > 0 ? Number(newVal).toFixed(sc.decimals) : String(Math.round(newVal));
      sc.textObj.setText(disp);
      return;
    }

    if (!pointer.isDown || this._capturingInput || this._activeTextInput) return;
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
        // Scale drag disabled — scale is managed via PropDefs now
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
    if (wo.type === 'object') {
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
    if (this._capturingInput || this._activeTextInput) return;
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

    if (this._activeTool.startsWith('obj:')) {
      const objType = this._activeTool.slice(4);
      const entry = { type: objType, x: wx, y: wy };
      if (!level.objects) level.objects = [];
      level.objects.push(entry);
      const wo = this._spawnObjectSprite(entry);
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
      let baseColor = '#aaaaaa';
      if (wo.type === 'transit') baseColor = '#00ccff';
      else if (wo.type === 'object') {
        const def = getPropDef(wo.data.type);
        baseColor = def.isContainer ? '#88ff88' : def.blocksPlayer ? '#ff8844' : '#aaaaaa';
      }
      const color = isSelected ? '#ffff00' : baseColor;

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
    if (wo.type === 'transit') {
      if (wo.data.type === 'extract') return `[T] extract x${x}`;
      const tgtLevel = this._levels.find(l => l.id === wo.data.targetLevel);
      const tgtWarp  = tgtLevel
        ? (tgtLevel.transitZones ?? []).find(z => z.type === 'warp' && z.id === wo.data.targetWarpId)
        : null;
      const dest = tgtLevel
        ? `${tgtLevel.name}/${tgtWarp ? (tgtWarp.label ?? tgtWarp.id) : '?'}`
        : '(none)';
      return `[W] ${wo.data.label ?? 'warp'} → ${dest}`;
    }
    if (wo.type === 'object') {
      const def = getPropDef(wo.data.type);
      const tag = def.isContainer ? 'C' : def.blocksPlayer ? 'B' : 'P';
      const special = def.specialType === 'chest' ? ' ★coffre' : def.specialType === 'upgradeStation' ? ' ★upgrade' : '';
      return `[${tag}] ${wo.data.type}${special} x${x}`;
    }
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

    for (const f of [this._fieldX, this._fieldY,
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
      const tgtLevel = this._levels.find(l => l.id === wo.data.targetLevel);
      const tgtLevelName = tgtLevel ? tgtLevel.name : '(none)';
      this._lblTarget.setText(`→ ${tgtLevelName}`).setPosition(x0 + 440, py).setVisible(true);
      this._btnTgtL.setPosition(x0 + 540, py).setVisible(true);
      this._btnTgtR.setPosition(x0 + 560, py).setVisible(true);
      const tgtWarp = tgtLevel
        ? (tgtLevel.transitZones ?? []).find(z => z.type === 'warp' && z.id === wo.data.targetWarpId)
        : null;
      const twarpLabel = tgtWarp ? (tgtWarp.label ?? tgtWarp.id) : '(none)';
      this._lblTargetWarp.setText(`↪ ${twarpLabel}`).setPosition(x0 + 580, py).setVisible(!!wo.data.targetLevel);
      this._btnWarpL.setPosition(x0 + 690, py).setVisible(!!wo.data.targetLevel);
      this._btnWarpR.setPosition(x0 + 710, py).setVisible(!!wo.data.targetLevel);
    } else if (wo.type === 'object') {
      // Object properties: just type + position (scale/collision/container managed via PropDefs)
      const def = getPropDef(wo.data.type);
      const info = [];
      if (def.isContainer)  info.push('container');
      if (def.blocksPlayer) info.push('bloque');
      if (def.specialType)  info.push(def.specialType);
      this._propInfoText.setText(`${wo.data.type}  (${info.join(', ') || 'décoratif'})  scale=${def.scale}`)
        .setVisible(true);
    }
  }

  _showField(field, x, y, label, value) {
    field.lbl.setPosition(x, y - 7).setText(label + ':').setVisible(true);
    field.val.setPosition(x, y + 6).setText(String(value)).setVisible(true).setColor('#cccccc');
  }


  // ══════════════════════════════════════════════════════════════════════
  //  SAISIE NUMÉRIQUE (poids loot — keyboard capture)
  //  Note : saisie TEXTE (label, nom niveau, texture) → TextInput DOM natif
  // ══════════════════════════════════════════════════════════════════════

  _commitInput() {
    if (!this._capturingInput) return;
    if (this._inputTarget?.source === 'loot') { this._commitLootInput(); return; }
    this._capturingInput = false;
    this._inputTarget    = null;
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
    this._capturingInput = false;
    this._inputTarget    = null;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SCRUB NUMÉRIQUE (drag vertical sur un champ)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Démarre un scrub sur un champ numérique.
   * @param {Phaser.Input.Pointer} pointer
   * @param {number}  startVal    Valeur actuelle du champ
   * @param {number}  step        Unités par pixel draggé
   * @param {number}  decimals    Décimales à afficher (0 = entier)
   * @param {Phaser.GameObjects.Text} textObj
   * @param {string}  resetColor  Couleur de restauration après drag
   * @param {function} onApply   (finalVal) → void, appelé sur pointerup
   */
  _startEditorScrub(pointer, startVal, step, decimals, textObj, resetColor, onApply) {
    if (this._editorScrub) return;
    this._editorScrub = { startY: pointer.y, startVal, step, decimals, textObj, resetColor, onApply, currentVal: startVal };
    textObj.setColor('#ffff00');
  }

  /** Applique une propriété de niveau et déclenche le rebuild si besoin. */
  _applyLevelProp(path, val) {
    if (isNaN(val)) return;
    const level = this._levels[this._currentIdx];
    if (path === 'parallax.bg')       { if (!level.parallax) level.parallax = {}; level.parallax.bg  = val; }
    else if (path === 'parallax.mid') { if (!level.parallax) level.parallax = {}; level.parallax.mid = val; }
    else if (path === 'worldW')       { level.worldW = Math.round(Math.max(200, val)); this._rebuildBackground(); }
    else if (path === 'laneTop')      { level.laneTop    = Math.round(val); this._loadLevel(); }
    else if (path === 'laneBottom')   { level.laneBottom = Math.round(val); this._loadLevel(); }
    else if (path === 'spawnX')       { level.spawnX = Math.round(Math.max(0, val)); this._rebuildBackground(); }
    this._updatePropsPanel();
  }

  /** Applique une modification sur un champ numérique d'un objet monde. */
  _applyObjectField(wo, field, val) {
    if (field === 'width') {
      wo.data.width = Math.max(20, Math.round(val));
      if (wo.type === 'transit') { this._refreshTransitWO(wo); this._drawSelectionRect(wo); }
    } else if (field === 'height') {
      wo.data.height = Math.max(20, Math.round(val));
      wo._zoneH = wo.data.height;
      if (wo.type === 'transit') { this._refreshTransitWO(wo); this._drawSelectionRect(wo); }
    } else {
      wo.data[field] = Math.round(val);
      if (field === 'x' || field === 'y') this._moveObject(wo, wo.data.x, wo.data.y);
    }
    this._updatePropsPanel();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CLAVIER
  // ══════════════════════════════════════════════════════════════════════

  _onKeyDown(e) {
    // Saisie numérique clavier (poids loot) — les champs texte utilisent TextInput DOM
    if (this._capturingInput) {
      if (e.key === 'Enter')     { this._commitInput(); return; }
      if (e.key === 'Escape')    { this._cancelInput(); return; }
      if (e.key === 'Backspace') {
        this._inputBuffer = this._inputBuffer.slice(0, -1);
        this._inputTarget.textObj.setText(this._inputBuffer + '_');
        return;
      }
      // Saisie numérique uniquement (source === 'loot')
      if (/^[\d.\-]$/.test(e.key) && this._inputBuffer.length < 10) {
        this._inputBuffer += e.key;
        this._inputTarget.textObj.setText(this._inputBuffer + '_');
      }
      return;
    }

    if (e.key === 'Escape') {
      if (this._propsEdOverlay) { this._closePropsEditor(); return; }
      if (this._lootOverlay) { this._hideLootEditor(); return; }
      if (this._selected) this._deselect();
      else this.scene.start('TitleScene');
      return;
    }
    if (e.key === 'Delete' && this._selected) { this._deleteSelected(); return; }
    if (e.key === '+' || e.key === '=') { this._applyZoom(1.15); return; }
    if (e.key === '-')                   { this._applyZoom(1 / 1.15); return; }
    if (e.key === '0')                   { this._applyZoom(1 / this._zoom); return; }
    if (e.key === 'h' || e.key === 'H')  { this._toggleHitboxes(); return; }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ACTIONS OBJETS
  // ══════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════════
  //  HITBOX OVERLAY (H key)
  // ══════════════════════════════════════════════════════════════════════

  _toggleHitboxes() {
    this._showHitboxes = !this._showHitboxes;
    if (this._showHitboxes) {
      this._rebuildHitboxOverlay();
    } else {
      this._clearHitboxOverlay();
    }
  }

  _clearHitboxOverlay() {
    for (const g of this._hitboxGraphics) g.destroy();
    this._hitboxGraphics = [];
  }

  /** Draw cyan collision rectangles for all blocksPlayer objects (from PropDefs). */
  _rebuildHitboxOverlay() {
    this._clearHitboxOverlay();
    for (const wo of this._worldObjects) {
      if (wo.type !== 'object' || !wo.sprite) continue;
      const def = getPropDef(wo.data.type);
      if (!def.blocksPlayer || !def.collision) continue;
      const col = def.collision;
      const s   = wo.sprite;
      const dw  = s.displayWidth;
      const dh  = s.displayHeight;
      const cw  = col.width   ?? dw;
      const ch  = col.height  ?? dh;
      const cox = (dw - cw) / 2 + (col.offsetX ?? 0);
      const coy = (dh - ch)     + (col.offsetY ?? 0);
      const bx  = s.x - dw / 2 + cox;
      const by  = s.y - dh     + coy;

      const g = this.add.graphics().setDepth(8999);
      this._worldLayer.add(g);
      g.lineStyle(1, 0x00ccff, 0.7);
      g.strokeRect(bx, by, cw, ch);
      const lbl = this.add.text(bx + 2, by + 2, `${Math.round(cw)}×${Math.round(ch)}`, {
        fontFamily: 'monospace', fontSize: '8px', color: '#00ccff',
      }).setDepth(8999).setAlpha(0.8);
      this._worldLayer.add(lbl);
      this._hitboxGraphics.push(g, lbl);
    }
  }

  _deleteSelected() {
    if (!this._selected) return;
    const wo    = this._selected.obj;
    const level = this._levels[this._currentIdx];

    if (wo.type === 'object')    level.objects       = (level.objects ?? []).filter(o => o !== wo.data);
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
    const curLevelId = this._levels[this._currentIdx]?.id;
    // Exclude current level — a warp always targets another level
    const ids  = [null, ...this._levels.filter(l => l.id !== curLevelId).map(l => l.id)];
    const cur  = ids.indexOf(wo.data.targetLevel ?? null);
    const next = Phaser.Math.Wrap(cur + dir, 0, ids.length);
    wo.data.targetLevel  = ids[next];
    wo.data.targetWarpId = null;  // reset warp destination when level changes
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
    // No null option — a warp must always land on a specific destination warp
    const ids  = warps.map(z => z.id);
    const cur  = ids.indexOf(wo.data.targetWarpId ?? null);
    const next = Phaser.Math.Wrap(cur + dir, 0, ids.length);
    wo.data.targetWarpId = ids[next];
    this._updatePropsPanel();
    this._updateListPanel();
  }

  // Toggle functions removed — all prop properties managed via PropDefs now

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
    base.objects = [];
    delete base.props;
    delete base.containers;
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
      ln.push('    objects: [');
      for (const obj of (lv.objects ?? [])) {
        ln.push(`      { type: '${obj.type}', x: ${obj.x}, y: ${obj.y} },`);
      }
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
    // Désactiver la toolbar principale pour éviter les clics parasites
    this._toolbarBtns?.forEach(b => b.disableInteractive());
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
    // Réactiver la toolbar principale
    this._toolbarBtns?.forEach(b => b.setInteractive({ useHandCursor: true }));
  }

  _lootSetTab(tab) {
    this._lootTab = tab;
    this._lootRedrawContent();
  }

  _lootRedrawContent() {
    for (const go of this._lootContentObjs) go.destroy();
    this._lootContentObjs = [];
    this._lootPickerObjs  = null;
    if (this._lootTab === 'tables') this._lootBuildTables();
    else                            this._lootBuildItems();
    // Highlighter les onglets actifs
    this._lootBtnTables?.setColor(this._lootTab === 'tables' ? '#ff88cc' : '#aaaacc');
    this._lootBtnItems ?.setColor(this._lootTab === 'items'  ? '#ff88cc' : '#aaaacc');
  }

  _lootBuildTables() {
    const D    = 8003;
    const Y0   = 36;
    const RH   = 17;
    const BMAX = 200;
    const LW   = 180;  // largeur panneau gauche (liste des types)
    const RX   = LW + 8; // x de départ du panneau droit
    const co   = (go) => { this._uiLayer.add(go); this._lootContentObjs.push(go); return go; };

    // ── Panneau gauche : liste des types ─────────────────────────────────
    co(this.add.rectangle(LW / 2, GAME_H / 2, LW, GAME_H, 0x0a0a18).setDepth(D - 1));
    co(this.add.rectangle(LW, GAME_H / 2, 1, GAME_H, 0x222244).setDepth(D));

    const containerMap = this._lootData.containerLootTables ?? {};
    const enemyMap     = this._lootData.enemyLootTables     ?? {};

    let ly = Y0 + 4;
    const mkTypeBtn = (label, kind, key) => {
      const isSel = this._lootSelectedType?.kind === kind && this._lootSelectedType?.key === key;
      const col   = isSel ? '#ffffff' : (kind === 'container' ? '#88ffcc' : '#ffaa44');
      const bg    = isSel ? 0x1a2233 : 0x0a0a18;
      co(this.add.rectangle(LW / 2, ly + 6, LW - 2, 14, bg).setDepth(D));
      const btn = co(this.add.text(6, ly, label.slice(0, 20), {
        fontFamily: 'monospace', fontSize: '9px', color: col,
      }).setDepth(D + 1).setInteractive({ useHandCursor: true }));
      btn.on('pointerover', () => { if (!isSel) btn.setColor('#ffffff'); });
      btn.on('pointerout',  () => { if (!isSel) btn.setColor(col); });
      btn.on('pointerdown', () => {
        this._lootSelectedType = { kind, key };
        this._lootRedrawContent();
      });
      ly += 15;
    };

    co(this.add.text(6, ly, '── CONTAINERS ──', {
      fontFamily: 'monospace', fontSize: '8px', color: '#334455',
    }).setDepth(D));
    ly += 13;
    for (const key of Object.keys(containerMap)) mkTypeBtn(key, 'container', key);

    // Bouton [+ nouveau type container]
    const addCBtn = co(this.add.text(6, ly, '[+ type]', {
      fontFamily: 'monospace', fontSize: '8px', color: '#44ff88',
    }).setDepth(D + 1).setInteractive({ useHandCursor: true }));
    addCBtn.on('pointerover', () => addCBtn.setColor('#ffffff'));
    addCBtn.on('pointerout',  () => addCBtn.setColor('#44ff88'));
    addCBtn.on('pointerdown', () => {
      const newKey = `container_${Date.now()}`;
      this._lootData.containerLootTables[newKey]  = [];
      this._lootData.containerItemCounts[newKey]  = { min: 1, max: 3 };
      this._lootSelectedType = { kind: 'container', key: newKey };
      this._lootRedrawContent();
    });
    ly += 18;

    co(this.add.text(6, ly, '── ENNEMIS ──', {
      fontFamily: 'monospace', fontSize: '8px', color: '#334455',
    }).setDepth(D));
    ly += 13;
    for (const key of Object.keys(enemyMap)) mkTypeBtn(key, 'enemy', key);

    // Bouton [+ nouveau type ennemi]
    const addEBtn = co(this.add.text(6, ly, '[+ type]', {
      fontFamily: 'monospace', fontSize: '8px', color: '#44ff88',
    }).setDepth(D + 1).setInteractive({ useHandCursor: true }));
    addEBtn.on('pointerover', () => addEBtn.setColor('#ffffff'));
    addEBtn.on('pointerout',  () => addEBtn.setColor('#44ff88'));
    addEBtn.on('pointerdown', () => {
      const newKey = `enemy_${Date.now()}`;
      this._lootData.enemyLootTables[newKey]  = [];
      this._lootData.enemyItemCounts[newKey]  = { min: 0, max: 2 };
      this._lootSelectedType = { kind: 'enemy', key: newKey };
      this._lootRedrawContent();
    });

    // ── Panneau droit : table du type sélectionné ─────────────────────────
    if (!this._lootSelectedType) return;

    const { kind, key } = this._lootSelectedType;
    const isContainer = kind === 'container';
    const tableArr  = isContainer
      ? (this._lootData.containerLootTables[key] ?? [])
      : (this._lootData.enemyLootTables[key]     ?? []);
    const countObj  = isContainer
      ? (this._lootData.containerItemCounts[key] ?? { min: 1, max: 3 })
      : (this._lootData.enemyItemCounts[key]     ?? { min: 0, max: 2 });

    // En-tête
    const hdrColor = isContainer ? '#88ffcc' : '#ffaa44';
    co(this.add.text(RX, Y0 + 4, `${isContainer ? 'CONTAINER' : 'ENNEMI'} : ${key}`, {
      fontFamily: 'monospace', fontSize: '10px', color: hdrColor,
    }).setDepth(D));

    // Bouton supprimer ce type
    const delTypeBtn = co(this.add.text(RX + 380, Y0 + 4, '[SUPPRIMER CE TYPE]', {
      fontFamily: 'monospace', fontSize: '8px', color: '#664444',
    }).setDepth(D).setInteractive({ useHandCursor: true }));
    delTypeBtn.on('pointerover', () => delTypeBtn.setColor('#ff4444'));
    delTypeBtn.on('pointerout',  () => delTypeBtn.setColor('#664444'));
    delTypeBtn.on('pointerdown', () => {
      if (isContainer) delete this._lootData.containerLootTables[key];
      else             delete this._lootData.enemyLootTables[key];
      this._lootSelectedType = null;
      this._lootRedrawContent();
    });

    co(this.add.rectangle(RX + 240, Y0 + 17, GAME_W - RX - 8, 1, 0x334455).setOrigin(0.5, 0.5).setDepth(D));

    const total = tableArr.reduce((s, e) => s + e.weight, 0) || 1;

    tableArr.forEach((entry, idx) => {
      const y     = Y0 + 22 + idx * RH;
      const ratio = entry.weight / total;
      const barW  = Math.max(1, Math.round(ratio * BMAX));
      const pct   = Math.round(ratio * 100);

      co(this.add.text(RX, y, entry.type.slice(0, 14), {
        fontFamily: 'monospace', fontSize: '10px', color: '#cccccc',
      }).setDepth(D));

      const wtxt = co(this.add.text(RX + 118, y, String(entry.weight).padStart(3), {
        fontFamily: 'monospace', fontSize: '10px', color: '#ffcc44',
      }).setDepth(D).setInteractive({ useHandCursor: true }));
      wtxt.on('pointerover', () => wtxt.setColor('#ffffff'));
      wtxt.on('pointerout',  () => {
        if (!(this._inputTarget?.source === 'loot' && this._inputTarget.idx === idx
           && this._inputTarget.typeKey === key)) wtxt.setColor('#ffcc44');
      });
      wtxt.on('pointerdown', () => {
        if (this._capturingInput) return;
        this._capturingInput = true;
        this._inputBuffer    = String(entry.weight);
        this._inputTarget    = { source: 'loot', type: 'weight', typeKey: key, idx, textObj: wtxt, cancelColor: '#ffcc44' };
        wtxt.setColor('#ffff00').setText(this._inputBuffer + '_');
      });

      co(this.add.text(RX + 142, y, `${pct}%`.padStart(4), {
        fontFamily: 'monospace', fontSize: '9px', color: '#556677',
      }).setDepth(D));
      co(this.add.rectangle(RX + 178, y + 4, BMAX, 8, 0x1a1a33).setOrigin(0, 0.5).setDepth(D));
      co(this.add.rectangle(RX + 178, y + 4, barW, 8, 0x4466cc).setOrigin(0, 0.5).setDepth(D + 1));

      const delT = co(this.add.text(RX + 388, y, '[✕]', {
        fontFamily: 'monospace', fontSize: '9px', color: '#ff4444',
      }).setDepth(D).setInteractive({ useHandCursor: true }));
      delT.on('pointerover', () => delT.setColor('#ffffff'));
      delT.on('pointerout',  () => delT.setColor('#ff4444'));
      delT.on('pointerdown', () => { tableArr.splice(idx, 1); this._lootRedrawContent(); });
    });

    // Séparateur + total + drops count
    const botY = Y0 + 22 + tableArr.length * RH;
    co(this.add.rectangle(RX + 240, botY, GAME_W - RX - 8, 1, 0x334455).setOrigin(0.5, 0.5).setDepth(D));
    co(this.add.text(RX, botY + 4, `Total : ${total}`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#445566',
    }).setDepth(D));

    // [+ ADD ITEM]
    const addTBtn = co(this.add.text(RX + 90, botY + 4, '[+ ADD ITEM]', {
      fontFamily: 'monospace', fontSize: '9px', color: '#44ff88',
    }).setDepth(D).setInteractive({ useHandCursor: true }));
    addTBtn.on('pointerover', () => addTBtn.setColor('#ffffff'));
    addTBtn.on('pointerout',  () => addTBtn.setColor('#44ff88'));
    addTBtn.on('pointerdown', () => {
      const existingTypes = new Set(tableArr.map(e => e.type));
      const available = Object.keys(this._lootData.items ?? {}).filter(k => !existingTypes.has(k));
      if (available.length === 0) return;
      if (this._lootPickerObjs) {
        this._lootPickerObjs.forEach(o => o.destroy());
        this._lootPickerObjs = null;
        if (this._lootPickerKey === key) return;
      }
      this._lootPickerKey = key;
      const PD = 8010;
      const px = RX + 90;
      const py = botY + 18;
      const pw = 160;
      const ph = available.length * 14 + 6;
      this._lootPickerObjs = [];
      const pc = (go) => { this._uiLayer.add(go); this._lootPickerObjs.push(go); this._lootContentObjs.push(go); return go; };
      pc(this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph, 0x111122).setDepth(PD));
      pc(this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph).setStrokeStyle(1, 0x334455).setDepth(PD));
      available.forEach((k, i) => {
        const rt = pc(this.add.text(px + 4, py + 4 + i * 14, k.slice(0, 18), {
          fontFamily: 'monospace', fontSize: '9px', color: '#aaccff',
        }).setDepth(PD + 1).setInteractive({ useHandCursor: true }));
        rt.on('pointerover', () => rt.setColor('#ffffff'));
        rt.on('pointerout',  () => rt.setColor('#aaccff'));
        rt.on('pointerdown', () => {
          tableArr.push({ type: k, weight: 10 });
          this._lootPickerObjs.forEach(o => o.destroy());
          this._lootPickerObjs = null;
          this._lootRedrawContent();
        });
      });
    });

    // Drops count
    const countY = botY + 22;
    co(this.add.text(RX, countY, `Drops : ${countObj.min}–${countObj.max} items`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#445566',
    }).setDepth(D));
    const editCount = (field, dx) => {
      countObj[field] = Math.max(0, (countObj[field] ?? 0) + dx);
      if (countObj.min > countObj.max) countObj[field === 'min' ? 'max' : 'min'] = countObj[field];
      this._lootRedrawContent();
    };
    const mkCntBtn = (x, lbl, cb) => {
      const b = co(this.add.text(x, countY, lbl, {
        fontFamily: 'monospace', fontSize: '9px', color: '#556677',
      }).setDepth(D).setInteractive({ useHandCursor: true }));
      b.on('pointerdown', cb);
      b.on('pointerover', () => b.setColor('#ffffff'));
      b.on('pointerout',  () => b.setColor('#556677'));
    };
    mkCntBtn(RX + 130, '[-min]', () => editCount('min', -1));
    mkCntBtn(RX + 168, '[+min]', () => editCount('min', +1));
    mkCntBtn(RX + 206, '[-max]', () => editCount('max', -1));
    mkCntBtn(RX + 244, '[+max]', () => editCount('max', +1));
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
    const usedKeys = new Set();
    for (const table of Object.values(this._lootData.containerLootTables ?? {}))
      for (const e of table) usedKeys.add(e.type);
    for (const table of Object.values(this._lootData.enemyLootTables ?? {}))
      for (const e of table) usedKeys.add(e.type);

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
    const { type, typeKey, idx } = this._inputTarget;
    if (type === 'weight' && typeKey) {
      const val = parseInt(this._inputBuffer, 10);
      if (!isNaN(val) && val >= 0) {
        const { kind, key } = this._lootSelectedType ?? {};
        const arr = kind === 'container'
          ? this._lootData.containerLootTables[key]
          : this._lootData.enemyLootTables[key];
        if (arr) arr[idx].weight = val;
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

  // ══════════════════════════════════════════════════════════════════════
  //  PROPS EDITOR OVERLAY
  // ══════════════════════════════════════════════════════════════════════

  _showPropsEditor() {
    if (this._propsEdOverlay) return;
    // Deep copy of PROP_DEFS for editing
    this._propsEdDefs = JSON.parse(JSON.stringify(PROP_DEFS));
    this._propsEdSelected = Object.keys(this._propsEdDefs)[0] ?? null;

    const D = 9990;
    const objs = [];
    const co = (o) => { objs.push(o); this._uiLayer.add(o); return o; };

    // Background
    co(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.96)
      .setDepth(D).setInteractive());

    // Title
    co(this.add.text(GAME_W / 2, 10, '◆ PROPS EDITOR', {
      fontFamily: 'monospace', fontSize: '14px', color: '#44ccff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(D + 1));

    // Close button
    const btnClose = co(this.add.text(GAME_W - 12, 8, '[ CLOSE ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff6600',
    }).setOrigin(1, 0).setDepth(D + 2).setInteractive({ useHandCursor: true }));
    btnClose.on('pointerdown', () => this._closePropsEditor());
    btnClose.on('pointerover', () => btnClose.setColor('#ffffff'));
    btnClose.on('pointerout',  () => btnClose.setColor('#ff6600'));

    // Save button
    const btnSave = co(this.add.text(GAME_W - 100, 8, '[ SAVE ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#00ff88',
    }).setOrigin(1, 0).setDepth(D + 2).setInteractive({ useHandCursor: true }));
    btnSave.on('pointerdown', () => this._savePropsEditor());
    btnSave.on('pointerover', () => btnSave.setColor('#ffffff'));
    btnSave.on('pointerout',  () => btnSave.setColor('#00ff88'));

    this._propsEdOverlay = objs;
    this._propsEdContent = [];  // rebuilt each redraw

    // Global pointer handlers for drag-scrub
    this._propsEdMoveHandler = (pointer) => {
      const drag = this._propsEdDrag;
      if (!drag) return;
      const dy    = drag.startY - pointer.y;  // up = positive
      const delta = dy * drag.step;
      const newVal = drag.startVal + delta;
      drag.onChange(newVal);
      const disp = drag.decimals > 0 ? Number(newVal).toFixed(drag.decimals) : String(Math.round(newVal));
      drag.textObj.setText(disp);
      // Live update preview (no full redraw for perf)
      this._propsEdUpdatePreview();
    };
    this._propsEdUpHandler = () => {
      if (!this._propsEdDrag) return;
      this._propsEdDrag.textObj.setColor('#cccccc');
      this._propsEdDrag = null;
      this._propsEdRedraw();  // full redraw to sync everything
    };
    this.input.on('pointermove', this._propsEdMoveHandler);
    this.input.on('pointerup',  this._propsEdUpHandler);

    this._propsEdRedraw();
  }

  _closePropsEditor() {
    if (!this._propsEdOverlay) return;
    // Remove global handlers
    if (this._propsEdMoveHandler) this.input.off('pointermove', this._propsEdMoveHandler);
    if (this._propsEdUpHandler)   this.input.off('pointerup',  this._propsEdUpHandler);
    this._propsEdMoveHandler = null;
    this._propsEdUpHandler   = null;
    this._propsEdDrag = null;
    // Fermer tout TextInput DOM ouvert depuis le Props Editor
    if (this._activeTextInput) { this._activeTextInput.destroy(); this._activeTextInput = null; }
    this._propsEdAddingTexture = false;
    for (const o of this._propsEdOverlay) o.destroy();
    for (const o of this._propsEdContent) o.destroy();
    this._propsEdOverlay = null;
    this._propsEdContent = [];
    this._propsEdDefs    = null;
    this._propsEdSelected = null;
  }

  _propsEdRedraw() {
    for (const o of this._propsEdContent) o.destroy();
    this._propsEdContent = [];

    const D = 9991;
    const co = (o) => { this._propsEdContent.push(o); this._uiLayer.add(o); return o; };
    const defs = this._propsEdDefs;
    const keys = Object.keys(defs);
    const sel  = this._propsEdSelected;

    // ── Left column: texture list ──────────────────────────────────
    const listX = 20;
    let   listY = 38;

    co(this.add.text(listX, listY, 'TEXTURES', {
      fontFamily: 'monospace', fontSize: '10px', color: '#666688',
    }).setDepth(D));
    listY += 16;

    for (const key of keys) {
      const def = defs[key];
      const isSel = key === sel;
      const color = isSel ? '#ffffff'
        : def.isContainer ? '#88ff88'
        : def.blocksPlayer ? '#ff8844'
        : '#aaaaaa';

      const btn = co(this.add.text(listX, listY, `${isSel ? '► ' : '  '}${key}`, {
        fontFamily: 'monospace', fontSize: '11px', color,
      }).setDepth(D).setInteractive({ useHandCursor: true }));
      btn.on('pointerdown', () => {
        this._propsEdSelected = key;
        this._propsEdRedraw();
      });
      btn.on('pointerover', () => btn.setColor('#ffffff'));
      btn.on('pointerout',  () => btn.setColor(isSel ? '#ffffff' : color));
      listY += 16;
    }

    // ── Bouton d'ajout de texture ─────────────────────────────────
    listY += 6;
    const addBtn = co(this.add.text(listX, listY, '[+ ajouter]', {
      fontFamily: 'monospace', fontSize: '10px', color: '#44ff88',
    }).setDepth(D).setInteractive({ useHandCursor: true }));
    addBtn.on('pointerdown', () => {
      if (this._activeTextInput) return;
      this._activeTextInput = new TextInput(this, {
        gameX: listX, gameY: listY + 12, width: 150, value: '',
        onCommit: (key) => {
          this._activeTextInput = null;
          if (key && !this._propsEdDefs[key]) {
            this._propsEdDefs[key] = { scale: 1, isContainer: false, blocksPlayer: false, collision: null, specialType: null };
            this._propsEdSelected = key;
          }
          this._propsEdRedraw();
        },
        onCancel: () => { this._activeTextInput = null; },
      });
    });
    addBtn.on('pointerover', () => addBtn.setColor('#ffffff'));
    addBtn.on('pointerout',  () => addBtn.setColor('#44ff88'));

    // ── Right column: properties of selected texture ────────────────
    if (!sel || !defs[sel]) return;
    const def = defs[sel];
    const rx  = 200;
    let   ry  = 38;

    co(this.add.text(rx, ry, `PROPRIÉTÉS : ${sel}`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#44ccff',
    }).setDepth(D));
    ry += 22;

    // Sprite preview
    if (this.textures.exists(sel)) {
      const preview = co(this.add.image(rx + 120, ry + 60, sel)
        .setOrigin(0.5, 0.5).setScale(def.scale ?? 1).setDepth(D));
      preview.__previewImg = true;
      // Clamp preview size
      const maxPreviewSize = 120;
      const pw = preview.displayWidth;
      const ph = preview.displayHeight;
      if (pw > maxPreviewSize || ph > maxPreviewSize) {
        const factor = maxPreviewSize / Math.max(pw, ph);
        preview.setScale((def.scale ?? 1) * factor);
      }

      // Draw collision box on preview if blocksPlayer
      if (def.blocksPlayer && def.collision) {
        const ps   = preview.scaleX;
        const rawW = this.textures.get(sel).source[0].width;
        const rawH = this.textures.get(sel).source[0].height;
        const dw   = rawW * ps;
        const dh   = rawH * ps;
        const col  = def.collision;
        const cw   = (col.width ?? dw) * (ps / (def.scale ?? 1));
        const ch   = (col.height ?? dh) * (ps / (def.scale ?? 1));
        const g = co(this.add.graphics().setDepth(D + 1));
        g.__colGfx = true;
        const bx = preview.x - dw / 2 + (dw - cw) / 2 + (col.offsetX ?? 0) * (ps / (def.scale ?? 1));
        const by = preview.y + dh / 2 - ch + (col.offsetY ?? 0) * (ps / (def.scale ?? 1));
        g.lineStyle(2, 0x00ccff, 0.9);
        g.strokeRect(bx, by, cw, ch);
        g.fillStyle(0x00ccff, 0.15);
        g.fillRect(bx, by, cw, ch);
      }
      ry += 130;
    } else {
      co(this.add.text(rx, ry, '(texture non chargée)', {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff4444',
      }).setDepth(D));
      ry += 20;
    }

    ry += 8;

    // ── Toggle buttons ──────────────────────────────────────────────
    const mkToggle = (x, y, label, active, onToggle) => {
      const txt = co(this.add.text(x, y, `${active ? '[■]' : '[□]'} ${label}`, {
        fontFamily: 'monospace', fontSize: '11px', color: active ? '#00ff88' : '#666666',
      }).setDepth(D).setInteractive({ useHandCursor: true }));
      txt.on('pointerdown', onToggle);
      txt.on('pointerover', () => txt.setColor('#ffffff'));
      txt.on('pointerout',  () => txt.setColor(active ? '#00ff88' : '#666666'));
      return txt;
    };

    mkToggle(rx, ry, 'Bloque joueur', !!def.blocksPlayer, () => {
      def.blocksPlayer = !def.blocksPlayer;
      if (!def.blocksPlayer) def.collision = null;
      else if (!def.collision) def.collision = { width: 50, height: 30, offsetX: 0, offsetY: 0 };
      this._propsEdRedraw();
    });
    ry += 18;

    mkToggle(rx, ry, 'Conteneur', !!def.isContainer, () => {
      def.isContainer = !def.isContainer;
      this._propsEdRedraw();
    });
    ry += 18;

    // Special type cycle
    const specials = [null, 'chest', 'upgradeStation'];
    const specLabel = def.specialType ?? 'aucun';
    const specBtn = co(this.add.text(rx, ry, `Spécial: < ${specLabel} >`, {
      fontFamily: 'monospace', fontSize: '11px', color: def.specialType ? '#ffcc44' : '#666666',
    }).setDepth(D).setInteractive({ useHandCursor: true }));
    specBtn.on('pointerdown', () => {
      const idx = specials.indexOf(def.specialType ?? null);
      def.specialType = specials[(idx + 1) % specials.length];
      this._propsEdRedraw();
    });
    specBtn.on('pointerover', () => specBtn.setColor('#ffffff'));
    specBtn.on('pointerout',  () => specBtn.setColor(def.specialType ? '#ffcc44' : '#666666'));
    ry += 24;

    // ── Numeric fields (drag-scrub: click+drag up/down to change value) ──
    // step = increment per pixel of mouse movement
    const mkField = (x, y, label, value, onChange, step = 1, decimals = 0) => {
      co(this.add.text(x, y, label + ':', {
        fontFamily: 'monospace', fontSize: '9px', color: '#556688',
      }).setDepth(D));
      const dispVal = decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(value));
      const valTxt = co(this.add.text(x + 60, y, dispVal, {
        fontFamily: 'monospace', fontSize: '11px', color: '#cccccc',
      }).setDepth(D).setInteractive({ useHandCursor: true, draggable: false }));

      valTxt.on('pointerdown', (pointer) => {
        this._propsEdDrag = {
          startY:   pointer.y,
          startVal: value,
          onChange, step, decimals, textObj: valTxt,
        };
        valTxt.setColor('#ffff00');
      });
      valTxt.on('pointerover', () => { if (!this._propsEdDrag) valTxt.setColor('#ffffff'); });
      valTxt.on('pointerout',  () => { if (!this._propsEdDrag || this._propsEdDrag.textObj !== valTxt) valTxt.setColor('#cccccc'); });
    };

    mkField(rx, ry, 'Scale', def.scale ?? 1, (val) => {
      def.scale = Math.max(0.05, val);
    }, 0.01, 3);
    ry += 20;

    // Collision fields (only if blocksPlayer)
    if (def.blocksPlayer) {
      ry += 4;
      co(this.add.text(rx, ry, '── Collision ──', {
        fontFamily: 'monospace', fontSize: '9px', color: '#00aacc',
      }).setDepth(D));
      ry += 16;

      const col = def.collision ?? { width: 50, height: 30, offsetX: 0, offsetY: 0 };
      const ensureCol = () => { if (!def.collision) def.collision = { width: 50, height: 30, offsetX: 0, offsetY: 0 }; };

      mkField(rx, ry, 'width', col.width ?? 50, (v) => {
        ensureCol(); def.collision.width = Math.max(1, Math.round(v));
      }, 1);
      ry += 18;
      mkField(rx, ry, 'height', col.height ?? 30, (v) => {
        ensureCol(); def.collision.height = Math.max(1, Math.round(v));
      }, 1);
      ry += 18;
      mkField(rx, ry, 'offX', col.offsetX ?? 0, (v) => {
        ensureCol(); def.collision.offsetX = Math.round(v);
      }, 1);
      ry += 18;
      mkField(rx, ry, 'offY', col.offsetY ?? 0, (v) => {
        ensureCol(); def.collision.offsetY = Math.round(v);
      }, 1);
      ry += 24;
    }

    // ── TEST HITBOX button ──────────────────────────────────────────
    const testBtn = co(this.add.text(rx, ry, '[ TEST HITBOX ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ff88cc',
    }).setDepth(D).setInteractive({ useHandCursor: true }));
    testBtn.on('pointerdown', () => this._testHitbox(sel));
    testBtn.on('pointerover', () => testBtn.setColor('#ffffff'));
    testBtn.on('pointerout',  () => testBtn.setColor('#ff88cc'));
  }

  /** Live-update the sprite preview + collision box during drag (no full redraw) */
  _propsEdUpdatePreview() {
    // Find the preview image in content — tagged with __previewImg
    const preview = this._propsEdContent.find(o => o.__previewImg);
    if (!preview) return;
    const sel = this._propsEdSelected;
    const def = this._propsEdDefs?.[sel];
    if (!def) return;
    const scale = def.scale ?? 1;
    const maxPreviewSize = 120;
    let s = scale;
    if (this.textures.exists(sel)) {
      const rawW = this.textures.get(sel).source[0].width  * s;
      const rawH = this.textures.get(sel).source[0].height * s;
      if (rawW > maxPreviewSize || rawH > maxPreviewSize) {
        s *= maxPreviewSize / Math.max(rawW, rawH);
      }
    }
    preview.setScale(s);

    // Update collision box graphics
    const colGfx = this._propsEdContent.find(o => o.__colGfx);
    if (colGfx && def.blocksPlayer && def.collision) {
      const col = def.collision;
      const ps  = preview.scaleX;
      const ratio = ps / (def.scale ?? 1);
      const rawW = this.textures.get(sel).source[0].width;
      const rawH = this.textures.get(sel).source[0].height;
      const dw = rawW * ps;
      const dh = rawH * ps;
      const cw = (col.width ?? dw) * ratio;
      const ch = (col.height ?? dh) * ratio;
      const bx = preview.x - dw / 2 + (dw - cw) / 2 + (col.offsetX ?? 0) * ratio;
      const by = preview.y + dh / 2 - ch + (col.offsetY ?? 0) * ratio;
      colGfx.clear();
      colGfx.lineStyle(2, 0x00ccff, 0.9);
      colGfx.strokeRect(bx, by, cw, ch);
      colGfx.fillStyle(0x00ccff, 0.15);
      colGfx.fillRect(bx, by, cw, ch);
    }
  }

  /** Launch a minimal test level with the selected prop for hitbox testing */
  _testHitbox(textureKey) {
    if (!textureKey) return;
    // Create a minimal test level
    const testLevel = {
      id: '__hitbox_test',
      name: 'Hitbox Test',
      worldW: 960,
      laneTop: 0,
      laneBottom: GAME_H,
      objects: [{ type: textureKey, x: 480, y: 400 }],
      transitZones: [],
    };
    // Store the edited defs so the game uses them
    // We need to save them first so the game loads the right values
    this._applyPropsEdDefs();
    this.registry.set('editorLevels', [testLevel, ...this._levels]);
    this.scene.start('GameScene', { levelId: '__hitbox_test', fromEditor: true });
  }

  /** Apply edited PropDefs to the live PROP_DEFS object (in-memory) */
  _applyPropsEdDefs() {
    if (!this._propsEdDefs) return;
    // Update the live PROP_DEFS object
    for (const key of Object.keys(PROP_DEFS)) {
      if (!this._propsEdDefs[key]) delete PROP_DEFS[key];
    }
    for (const [key, def] of Object.entries(this._propsEdDefs)) {
      PROP_DEFS[key] = def;
    }
  }

  async _savePropsEditor() {
    if (!this._propsEdDefs) return;
    // Apply to live PROP_DEFS
    this._applyPropsEdDefs();

    // Persist to server
    try {
      const res = await fetch(`${EDITOR_URL}/propdefs`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(this._propsEdDefs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._showSaveFeedback(true);
    } catch (e) {
      console.error('[Editor] PropDefs save error:', e.message);
      this._showSaveFeedback(false);
    }

    // Reload level to reflect changes (new scales, etc.)
    this._loadLevel();
  }
}
