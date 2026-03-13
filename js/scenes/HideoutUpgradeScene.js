import { GAME_W, GAME_H, IS_MOBILE } from '../config/constants.js';
import { UPGRADES, UPGRADE_IDS } from '../config/upgrades.js';
import { KB_BINDS, PAD_BINDS } from '../config/controls.js';

/**
 * HideoutUpgradeScene — overlay UI for hideout upgrades.
 *
 * Affiche les 5 améliorations de la planque avec leur niveau actuel,
 * les matériaux requis et un bouton pour construire le prochain niveau.
 * Les matériaux sont prélevés dans le COFFRE (chestItems).
 *
 * Data reçue via init():
 *   upgrades    {object}          niveaux actuels { cuisine: 0, ... }
 *   chestItems  {string[]}        contenu actuel du coffre
 *   net         {NetworkManager}  pour envoyer C_UPGRADE_BUILD
 *   player      {Player}
 */

const BOX_W = 440;
const BOX_H = 340;
const BOX_X = Math.round((GAME_W - BOX_W) / 2);
const BOX_Y = Math.round((GAME_H - BOX_H) / 2);

const ROW_H   = 54;
const ROW_START_Y = BOX_Y + 54;
const MAX_LEVEL   = 3;

export default class HideoutUpgradeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HideoutUpgradeScene' });
  }

  init(data) {
    // Mutable copies — updated when server responds
    this._upgrades   = { ...(data.upgrades   ?? {}) };
    this._chestItems = [...(data.chestItems  ?? [])];
    this.net         = data.net;
    this.player      = data.player;
  }

  create() {
    // ── Overlay ─────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.7);

    // ── Box ─────────────────────────────────────────────────────────────
    this.add.rectangle(GAME_W / 2, GAME_H / 2, BOX_W + 8, BOX_H + 8, 0x111122, 0.97)
      .setStrokeStyle(2, 0x5555aa, 0.8);

    // ── Title ───────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, BOX_Y + 16, 'AMELIORATIONS DE LA PLANQUE', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffaa00',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── Close button ────────────────────────────────────────────────────
    const closeBg = this.add.circle(BOX_X + BOX_W - 4, BOX_Y + 4, 18, 0xaa2222, 0.9)
      .setStrokeStyle(2, 0xff4444, 0.8).setInteractive({ useHandCursor: true });
    this.add.text(BOX_X + BOX_W - 4, BOX_Y + 4, 'X', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    closeBg.on('pointerdown', () => this._close());

    // ── Keyboard / Gamepad close ─────────────────────────────────────────
    this.input.keyboard.on(`keydown-${KB_BINDS.CANCEL}`,    () => this._close());
    this.input.keyboard.on(`keydown-${KB_BINDS.INTERACT}`,  () => this._close());
    this.input.keyboard.on(`keydown-${KB_BINDS.INVENTORY}`, () => this._close());
    this.input.gamepad.on('down', (pad, btn) => {
      if (btn.index === PAD_BINDS.CANCEL || btn.index === PAD_BINDS.INVENTORY) this._close();
    });

    // ── Rows (one per upgrade) ───────────────────────────────────────────
    this._rowObjs = [];
    for (let i = 0; i < UPGRADE_IDS.length; i++) {
      this._buildRow(i);
    }

    // ── Hook pour réception S_UPGRADES et S_CHEST_DATA ───────────────────
    this._prevOnUpgrades  = this.net.onUpgrades;
    this._prevOnChestData = this.net.onChestData;

    this.net.onUpgrades = (ups) => {
      this._upgrades = ups;
      this._refreshAllRows();
    };
    this.net.onChestData = (items) => {
      this._chestItems = items;
      this.registry.set('chestItems', items);
      this._refreshAllRows();
    };

    // ── Hint ─────────────────────────────────────────────────────────────
    this.add.text(GAME_W / 2, BOX_Y + BOX_H - 10,
      IS_MOBILE ? 'Tap BUILD pour ameliorer  X pour fermer' : `${KB_BINDS.INTERACT} / ${KB_BINDS.CANCEL} : fermer`,
      { fontFamily: 'monospace', fontSize: '9px', color: '#555577' }
    ).setOrigin(0.5);
  }

  // ── Row builder ────────────────────────────────────────────────────────────

  _buildRow(i) {
    const id  = UPGRADE_IDS[i];
    const def = UPGRADES[id];
    const ry  = ROW_START_Y + i * ROW_H;

    // Background
    const bg = this.add.rectangle(GAME_W / 2, ry + ROW_H / 2 - 2, BOX_W - 20, ROW_H - 4, 0x1a1a33, 0.7)
      .setStrokeStyle(1, 0x333355, 0.5);

    // Name + stars (première ligne)
    const nameText = this.add.text(BOX_X + 20, ry + 8, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffdd88',
      stroke: '#000', strokeThickness: 2,
    });

    // Build button (à droite, centré verticalement)
    const btnX = BOX_X + BOX_W - 60;
    const btnBg = this.add.rectangle(btnX, ry + ROW_H / 2 - 2, 80, 26, 0x336633, 0.9)
      .setStrokeStyle(1, 0x55aa55, 0.7).setInteractive({ useHandCursor: true });
    const btnText = this.add.text(btnX, ry + ROW_H / 2 - 2, 'BUILD', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aaffaa',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    btnBg.on('pointerdown', () => this._tryBuild(id));
    btnBg.on('pointerover', () => btnBg.setFillStyle(0x447744, 0.9));
    btnBg.on('pointerout',  () => btnBg.setFillStyle(0x336633, 0.9));

    // matObjs : sprites dynamiques (détruits + recréés à chaque refresh)
    const matObjs = [];

    const rowObj = { id, def, nameText, btnBg, btnText, bg, matObjs, ry };
    this._rowObjs.push(rowObj);
    this._refreshRow(rowObj);
  }

  _refreshAllRows() {
    for (const row of this._rowObjs) this._refreshRow(row);
  }

  _refreshRow(row) {
    const { id, def, ry } = row;
    const level = this._upgrades[id] ?? 0;
    const maxed = level >= MAX_LEVEL;
    const stars = '★'.repeat(level) + '☆'.repeat(MAX_LEVEL - level);

    row.nameText.setText(`${def.name}  ${stars}  ${level}/${MAX_LEVEL}`);

    // Détruire les anciens sprites de matériaux
    for (const o of row.matObjs) o.destroy();
    row.matObjs.length = 0;

    if (maxed) {
      row.nameText.setColor('#55ff55');
      const t = this.add.text(BOX_X + 20, ry + 30, '✔ ' + def.description, {
        fontFamily: 'monospace', fontSize: '9px', color: '#55ff55',
      });
      row.matObjs.push(t);
      row.btnBg.setFillStyle(0x224422, 0.7).disableInteractive();
      row.btnText.setColor('#448844').setText('MAX');
    } else {
      row.nameText.setColor('#ffdd88');
      const cost     = def.levels[level].cost;
      const canAfford = this._canAfford(cost);

      // ── Icônes matériaux (deuxième ligne) ──────────────────────────────
      const matAreaRight = BOX_X + BOX_W - 110;   // laisser place au bouton
      const entries      = Object.entries(cost);
      const slotW        = Math.floor((matAreaRight - (BOX_X + 18)) / entries.length);
      const matY         = ry + 31;

      for (let ei = 0; ei < entries.length; ei++) {
        const [item, needed] = entries[ei];
        const have    = this._countItem(item);
        const chestHave = this._countChestItem(item);
        const enough  = chestHave >= needed;            // BUILD ← coffre seul
        const color   = enough ? '#88ff88' : (have >= needed ? '#ffcc44' : '#ff6666');
        const x       = BOX_X + 18 + ei * slotW;

        // Image de l'item (si la texture existe) ou carré de couleur
        if (this.textures.exists(item)) {
          const img = this.add.image(x + 8, matY - 2, item)
            .setDisplaySize(16, 16).setOrigin(0.5);
          row.matObjs.push(img);
        } else {
          const dot = this.add.rectangle(x + 8, matY - 2, 13, 13,
            enough ? 0x44aa44 : (have >= needed ? 0xaa8800 : 0xaa3333), 0.85);
          row.matObjs.push(dot);
        }

        // Compteur "have/needed"
        const cnt = this.add.text(x + 17, matY - 8, `${have}/${needed}`, {
          fontFamily: 'monospace', fontSize: '9px', color,
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5);
        row.matObjs.push(cnt);

        // Nom du matériau (tout petit)
        const lbl = this.add.text(x + 17, matY + 2, item, {
          fontFamily: 'monospace', fontSize: '7px', color: '#888899',
        }).setOrigin(0, 0.5);
        row.matObjs.push(lbl);
      }

      row.btnBg.setFillStyle(canAfford ? 0x336633 : 0x552222, 0.9);
      row.btnBg.setInteractive({ useHandCursor: canAfford });
      row.btnText.setColor(canAfford ? '#aaffaa' : '#cc6666').setText('BUILD');
    }
  }

  /** Compte les items dans le coffre ET dans l'inventaire du joueur. */
  _countItem(itemType) {
    let n = this._countChestItem(itemType);
    if (this.player?.inventory?.items) {
      for (const it of this.player.inventory.items)
        if ((it.type ?? it) === itemType) n++;
    }
    return n;
  }

  /** Compte uniquement dans le coffre (source des matériaux pour BUILD). */
  _countChestItem(itemType) {
    let n = 0;
    for (const it of this._chestItems) if (it === itemType) n++;
    return n;
  }

  _canAfford(cost) {
    for (const [item, qty] of Object.entries(cost)) {
      if (this._countChestItem(item) < qty) return false;
    }
    return true;
  }

  _tryBuild(upgradeId) {
    const level = this._upgrades[upgradeId] ?? 0;
    if (level >= MAX_LEVEL) return;
    const cost = UPGRADES[upgradeId].levels[level].cost;
    if (!this._canAfford(cost)) return;

    if (this.net?.sendUpgradeBuild) {
      this.net.sendUpgradeBuild(upgradeId);
    }
    // Optimistic local update (server will confirm via S_UPGRADES)
    this._upgrades[upgradeId] = level + 1;
    this._refreshAllRows();
  }

  _close() {
    // Restore previous callbacks
    if (this._prevOnUpgrades  !== undefined) this.net.onUpgrades  = this._prevOnUpgrades;
    if (this._prevOnChestData !== undefined) this.net.onChestData = this._prevOnChestData;
    this.player.searching = false;
    this.scene.stop();
  }
}
