import { GAME_W, GAME_H, IS_MOBILE } from '../config/constants.js';
import { UPGRADES, UPGRADE_IDS } from '../config/upgrades.js';
import { encodeUpgradeBuild } from '../network/NetProtocol.js';

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
    this.input.keyboard.on('keydown-ESC', () => this._close());
    this.input.keyboard.on('keydown-E',   () => this._close());
    this.input.keyboard.on('keydown-TAB', () => this._close());
    this.input.gamepad.on('down', (pad, btn) => {
      if (btn.index === 1 || btn.index === 8) this._close();
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
      IS_MOBILE ? 'Tap BUILD pour ameliorer  X pour fermer' : 'E / ESC : fermer',
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

    // Name + stars
    const nameText = this.add.text(BOX_X + 20, ry + 8, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffdd88',
      stroke: '#000', strokeThickness: 2,
    });

    // Cost / status line
    const costText = this.add.text(BOX_X + 20, ry + 26, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#aaaacc',
    });

    // Build button
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

    const rowObj = { id, def, nameText, costText, btnBg, btnText, bg };
    this._rowObjs.push(rowObj);
    this._refreshRow(rowObj);
  }

  _refreshAllRows() {
    for (const row of this._rowObjs) this._refreshRow(row);
  }

  _refreshRow(row) {
    const { id, def } = row;
    const level    = this._upgrades[id] ?? 0;
    const maxed    = level >= MAX_LEVEL;
    const stars    = '*'.repeat(level) + '-'.repeat(MAX_LEVEL - level);

    row.nameText.setText(`${def.name}  [${stars}]  niv.${level}/${MAX_LEVEL}`);

    if (maxed) {
      row.costText.setText('MAX — ' + def.description).setColor('#55ff55');
      row.btnBg.setFillStyle(0x224422, 0.7).disableInteractive();
      row.btnText.setColor('#448844');
    } else {
      const nextCost   = def.levels[level].cost;
      const canAfford  = this._canAfford(nextCost);
      const costStr    = this._formatCost(nextCost, canAfford);
      row.costText.setText(costStr).setColor(canAfford ? '#99ccff' : '#ff6666');

      row.btnBg.setFillStyle(canAfford ? 0x336633 : 0x552222, 0.9);
      row.btnBg.setInteractive({ useHandCursor: canAfford });
      row.btnText.setColor(canAfford ? '#aaffaa' : '#cc6666');
    }
  }

  _canAfford(cost) {
    const counts = {};
    for (const it of this._chestItems) counts[it] = (counts[it] ?? 0) + 1;
    for (const [item, qty] of Object.entries(cost)) {
      if ((counts[item] ?? 0) < qty) return false;
    }
    return true;
  }

  _formatCost(cost, canAfford) {
    return 'Requis (coffre): ' + Object.entries(cost)
      .map(([k, v]) => `${v}x ${k}`)
      .join(', ');
  }

  _tryBuild(upgradeId) {
    const level = this._upgrades[upgradeId] ?? 0;
    if (level >= MAX_LEVEL) return;
    const cost = UPGRADES[upgradeId].levels[level].cost;
    if (!this._canAfford(cost)) return;

    if (this.net?.ws?.send) {
      this.net.ws.send(encodeUpgradeBuild(upgradeId));
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
