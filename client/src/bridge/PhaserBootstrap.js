/**
 * PhaserBootstrap -- Create/destroy Phaser game instance on demand.
 *
 * Creates a Phaser game with the MainScene (terrain + tanks + physics).
 * React HUD overlays on top. Phaser HUD is disabled (scene.HUD = null).
 *
 * Bridge pattern: MainScene writes state to GameBridge, React reads it.
 */
import Phaser from 'phaser';
import { MainScene } from '../scenes/main/index';

let gameInstance = null;

/**
 * Start a battle -- creates Phaser game in the given container.
 *
 * @param {HTMLElement} container - DOM element for the Phaser canvas
 * @param {Object} sceneData - Game data (player1, player2, hostId, weapons, wager, etc.)
 * @param {GameBridge} bridge - Bridge object for React communication
 * @returns {Phaser.Game} The game instance
 */
function startBattle(container, sceneData, bridge) {
  // Destroy any existing instance
  if (gameInstance) {
    destroyBattle();
  }

  // Store bridge and sceneData on window so MainScene can access them
  window.gameBridge = bridge;
  window.pendingSceneData = sceneData;
  bridge.scene = null;

  const config = {
    type: Phaser.CANVAS,
    parent: container,
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 300 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      antialias: false,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
    scene: [MainScene],
    audio: {
      disableWebAudio: false,
    },
  };

  gameInstance = new Phaser.Game(config);

  // After game boots, connect bridge to scene.
  // MainScene reads sceneData from window.pendingSceneData in init(),
  // so it has data on first boot — no restart needed.
  gameInstance.events.once('ready', () => {
    const scene = gameInstance.scene.getScene('main-scene');
    if (scene) {
      bridge.scene = scene;
      // scene._bridge is already set via window.gameBridge in init()
    }
  });

  return gameInstance;
}

/**
 * Destroy the Phaser game instance and clean up.
 */
function destroyBattle() {
  if (gameInstance) {
    try {
      // Explicitly close Web Audio context before destroy to prevent
      // "Cannot resume a context that has been closed" on next game boot
      const ctx = gameInstance.sound?.context;
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
      gameInstance.destroy(true);
    } catch (_) { /* ignore cleanup errors */ }
    gameInstance = null;
  }
  window.gameBridge = null;
  // NOTE: Don't clear pendingSceneData here.
  // React StrictMode in dev causes mount->unmount->mount.
  // If we clear it during unmount, the next mount's Phaser game
  // won't find it when its scene init() runs.
  // startBattle() always sets it fresh before creating a new game.
}

/**
 * Get the current Phaser game instance.
 */
function getGameInstance() {
  return gameInstance;
}

export { startBattle, destroyBattle, getGameInstance };
