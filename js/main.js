import PreloadScene      from './scenes/PreloadScene.js';
import TitleScene        from './scenes/TitleScene.js';
import LevelEditorScene  from './scenes/LevelEditorScene.js';
import GameScene         from './scenes/GameScene.js';
import HUDScene          from './scenes/HUDScene.js';
import PauseScene        from './scenes/PauseScene.js';
import InventoryScene    from './scenes/InventoryScene.js';
import SearchScene       from './scenes/SearchScene.js';
import GameOverScene     from './scenes/GameOverScene.js';
import WinScene          from './scenes/WinScene.js';
import { GAME_W, GAME_H } from './config/constants.js';

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
  scene: [PreloadScene, TitleScene, LevelEditorScene, GameScene, HUDScene, PauseScene, InventoryScene, SearchScene, GameOverScene, WinScene]
};

new Phaser.Game(config);
