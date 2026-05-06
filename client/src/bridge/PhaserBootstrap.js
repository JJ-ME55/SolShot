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
let visualViewportListener = null;

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

  // STEP 1 (iOS render overhaul) — pre-create the canvas and obtain its 2D
  // context with `willReadFrequently: true` BEFORE Phaser touches it. The
  // flag is only honoured on the first `getContext('2d', ...)` call, so we
  // must claim it first. Phaser will then re-acquire the context (no-arg)
  // and inherit the same flag. Without this, Phaser's many `getImageData`
  // operations (terrain hit-detection in terrain.js — tens to hundreds per
  // shot) trigger Canvas2D's slow GPU-readback path on iOS Safari, which
  // is the root of the rAF throttling we observed (`[Violation]
  // requestAnimationFrame handler took <N>ms` × 23 in JJ's earlier log).
  // Canvas dims: 1422 × 800 = 16:9 native. Phone landscape fills width
  // edge-to-edge with no letterbox; desktop 16:9 monitors fill natively.
  // Match server/services/physics.js TERRAIN_WIDTH / TERRAIN_HEIGHT —
  // server-authoritative heightmap is sized to these dims, so they MUST
  // stay in lockstep. Was 1200 × 800 (3:2) prior to 2026-05-06.
  const customCanvas = document.createElement('canvas');
  customCanvas.width = 1422;
  customCanvas.height = 800;
  try {
    customCanvas.getContext('2d', { willReadFrequently: true });
  } catch (_) { /* extremely old browsers — fall through */ }

  const config = {
    type: Phaser.CANVAS,
    canvas: customCanvas,
    parent: container,
    width: 1422,
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
      mode: Phaser.Scale.FIT,
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

  // STEP 2 (iOS render overhaul) — listen for visualViewport resize and
  // call game.scale.refresh(). iOS Safari's URL bar and tab strip change
  // the visible viewport size dynamically (URL bar collapses ~2s after
  // page load, returns on scroll-to-top, etc.). Phaser's ScaleManager
  // measures parent dimensions at mount and never re-measures unless
  // told to — Phaser issue #6072 is open and unfixed for this exact
  // reason. window.visualViewport.resize fires reliably on iOS Safari
  // when the URL bar shows/hides, on rotation, and on keyboard show/hide.
  // game.scale.refresh() makes Phaser re-measure parent and re-fit canvas.
  // Falls back gracefully on browsers without visualViewport (very old).
  if (typeof window !== 'undefined' && window.visualViewport && !visualViewportListener) {
    visualViewportListener = () => {
      try {
        if (gameInstance && gameInstance.scale) {
          gameInstance.scale.refresh();
        }
      } catch (_) { /* swallow — never let a viewport refresh kill the scene */ }
    };
    window.visualViewport.addEventListener('resize', visualViewportListener);
    // Also listen to orientationchange (older iOS, more reliable for rotation)
    window.addEventListener('orientationchange', visualViewportListener);
  }

  return gameInstance;
}

/**
 * Destroy the Phaser game instance and clean up.
 */
function destroyBattle() {
  // STEP 2 cleanup — remove the visualViewport listener so a remounted
  // game doesn't accumulate listeners over re-entries (StrictMode dev,
  // route changes, etc.).
  if (visualViewportListener) {
    try {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', visualViewportListener);
      }
      window.removeEventListener('orientationchange', visualViewportListener);
    } catch (_) { /* ignore */ }
    visualViewportListener = null;
  }
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
