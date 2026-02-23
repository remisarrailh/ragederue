import { registerAnimations } from '../config/animations.js';
import { FRAME_W, FRAME_H } from '../config/constants.js';
import { BACKGROUNDS } from '../config/backgrounds.js';

const BG = 'assets/Spritesheets/Brawler Girl/';
const EP = 'assets/Spritesheets/Enemy Punk/';
const ST = 'assets/Stage Layers/';
const PR = 'assets/Stage Layers/props/';
const SP = 'assets/Sprites/';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // ── Loading bar ──────────────────────────────────────────────────────
    const barW = 400, barH = 20;
    const barX = (this.scale.width - barW) / 2;
    const barY = this.scale.height / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x222222);
    bg.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

    const bar = this.add.graphics();
    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0xff6600);
      bar.fillRect(barX, barY, barW * v, barH);
    });

    this.add.text(this.scale.width / 2, barY - 30, 'Loading...', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ff6600'
    }).setOrigin(0.5);

    // ── Stage ────────────────────────────────────────────────────────────
    this.load.image('back',    ST + 'back.png');
    this.load.image('fore',    ST + 'fore.png');
    this.load.image('tileset', ST + 'tileset.png');

    // ── Backgrounds (auto-découverte via Vite glob) ───────────────────
    for (const { key, url } of BACKGROUNDS) {
      this.load.image(key, url);
    }

    // ── Props ────────────────────────────────────────────────────────────
    this.load.image('barrel',      PR + 'barrel.png');
    this.load.image('car',         PR + 'car.png');
    this.load.image('hydrant',     PR + 'hydrant.png');
    this.load.image('banner-hor1', PR + 'banner-hor/banner-hor1.png');
    this.load.image('banner-hor2', PR + 'banner-hor/banner-hor2.png');
    this.load.image('eth-prop-1',  PR + 'Ethereum/ethereum-1.png');
    this.load.image('eth-prop-2',  PR + 'Ethereum/ethereum-2.png');
    this.load.image('sushi-prop-1',PR + 'Sushi/sushi-1.png');
    this.load.image('sushi-prop-2',PR + 'Sushi/sushi-2.png');

    // ── Brawler Girl ─────────────────────────────────────────────────────
    const fw = FRAME_W, fh = FRAME_H;
    this.load.spritesheet('player_idle',      BG + 'idle.png',      { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_walk',      BG + 'walk.png',      { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_punch',     BG + 'punch.png',     { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_kick',      BG + 'kick.png',      { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_jab',       BG + 'jab.png',       { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_jump',      BG + 'jump.png',      { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_jump_kick', BG + 'jump_kick.png', { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_dive_kick', BG + 'dive_kick.png', { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('player_hurt',      BG + 'hurt.png',      { frameWidth: fw, frameHeight: fh });

    // ── Loot sprites ─────────────────────────────────────────────────────
    this.load.image('eth',       SP + 'eth.png');
    this.load.image('sushi',     SP + 'sushi.png');
    this.load.image('pizza',     SP + 'Cutted_Pizza.png');
    this.load.image('ice_cream', SP + 'Ice_Cream.png');

    // ── Enemy Punk ────────────────────────────────────────────────────────
    this.load.spritesheet('enemy_idle',  EP + 'idle.png',  { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('enemy_walk',  EP + 'walk.png',  { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('enemy_punch', EP + 'punch.png', { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('enemy_hurt',  EP + 'hurt.png',  { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet('enemy_dead',  EP + 'dead.png',  { frameWidth: fw, frameHeight: fh });
    // ── Music ──────────────────────────────────────────────────────────
    this.load.audio('music_street', 'assets/music/street.mp3');
    this.load.audio('music_naval',  'assets/music/naval.mp3');

    // ── SFX ────────────────────────────────────────────────────────────
    this.load.audio('sfx_hit',          'assets/sounds/hit.wav');
    this.load.audio('sfx_death_player', 'assets/sounds/death_player.wav');
    this.load.audio('sfx_death_enemy',  'assets/sounds/death_ennemy.wav');
    this.load.audio('sfx_menu',         'assets/sounds/menu_sound.wav');
  }

  create() {
    registerAnimations(this.anims);
    this.scene.start('TitleScene');
  }
}
