import PreloadScene      from './scenes/PreloadScene.js';
import TitleScene        from './scenes/TitleScene.js';
import CharacterScene    from './scenes/CharacterScene.js';
import LevelEditorScene  from './scenes/LevelEditorScene.js';
import GameScene         from './scenes/GameScene.js';
import HUDScene          from './scenes/HUDScene.js';
import PauseScene        from './scenes/PauseScene.js';
import InventoryScene    from './scenes/InventoryScene.js';
import SearchScene       from './scenes/SearchScene.js';
import HideoutChestScene    from './scenes/HideoutChestScene.js';
import MobileControlsScene from './scenes/MobileControlsScene.js';
import GameOverScene        from './scenes/GameOverScene.js';
import WinScene             from './scenes/WinScene.js';
import { GAME_W, GAME_H, IS_MOBILE } from './config/constants.js';

const config = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0a0a14',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  input: {
    gamepad: true
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [PreloadScene, TitleScene, CharacterScene, LevelEditorScene, GameScene, HUDScene, PauseScene, InventoryScene, SearchScene, HideoutChestScene, MobileControlsScene, GameOverScene, WinScene]
};

const game = new Phaser.Game(config);

// ── Expose game instance for fullscreen toggle ──────────────────────────
window.__RAGEDERUE_GAME = game;

// ── Out-of-focus overlay (DOM, visible over all Phaser scenes) ────────────
const focusOverlay = document.getElementById('focus-overlay');
window.addEventListener('blur',  () => focusOverlay?.classList.add('visible'));
window.addEventListener('focus', () => focusOverlay?.classList.remove('visible'));
