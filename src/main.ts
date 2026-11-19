import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { sfx } from './audio';
import { settings } from './settings';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d1117',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  input: { activePointers: 2 },
  scene: [BootScene, GameScene, UIScene],
});

if (import.meta.env.DEV) Object.assign(window, { __game: game, __sfx: sfx, __settings: settings });
