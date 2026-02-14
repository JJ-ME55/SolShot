import React from 'react';
import Phaser from 'phaser';
import { socket } from './socket/index'
import { MainScene, Scene1, Scene2, Scene3, Scene4, Scene5, LoadingScene, ControlsScene, AboutScene, GuideScene, ScreenshotScene } from './scenes';
import { SolShotWalletProvider } from './wallet/WalletContext';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const gameConfig = {
	title: 'SolShot',
  type: Phaser.CANVAS,
  parent: 'game',
  backgroundColor: 'rgba(255,100,100)',
  scale: {
    mode: Phaser.Scale.ScaleModes.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1200,
    height: 800,
  },
  physics: {
    default: 'arcade',
    arcade : {
      debug:false
    },
    fps: 60
  },
  render: {
    antialiasGL: false,
    pixelArt: true,
    transparent: true,
  },
  callbacks: {
    postBoot: () => {
    },
  },
  autoFocus: true,
  audio: {
    disableWebAudio: false,
  },
  fps: {
    target: 60,
  },
  dom: {
    createContainer: true,
  },
  scene: [LoadingScene, ControlsScene, AboutScene, GuideScene, ScreenshotScene, Scene1, Scene2, Scene3, Scene4, Scene5, MainScene],
};

window.sdk = ''

window.socket = socket
window.game = new Phaser.Game(gameConfig);

window.addEventListener("wheel", (event) => event.preventDefault(), {
  passive: false,
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", " "].includes(event.key)) {
    event.preventDefault();
  }
});


function App() {
  return (
    <SolShotWalletProvider>
      <div style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 1000,
      }}>
        <WalletMultiButton />
      </div>
    </SolShotWalletProvider>
  );
}

export default App;
