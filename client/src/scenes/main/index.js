/**
 * MainScene — Stripped for React HUD migration.
 *
 * KEPT: Terrain, tanks, physics, projectiles, turn switching, canvas rendering.
 * REMOVED: HUD class, all Phaser text overlays, exit menu, game-over text,
 *          winner particles, play-again text, back button, auto-adjust.
 * ADDED: GameBridge writes (state updates + event notifications).
 *
 * React HUD reads from GameBridge via rAF polling (useGameState hook).
 * Socket events for matchEnd/roundEnd/opponentLeft are handled in React (BattleScreen).
 */

import Phaser, { Scene, Display } from 'phaser';
import { Tank } from '../../classes/Tank';
import { Terrain } from '../../classes/Terrain';
import { BlastCache } from '../../classes/BlastCache';

export class MainScene extends Scene {
  constructor() {
    super('main-scene');
    this.tank1 = null;
    this.tank2 = null;
    this.terrain = null;
    this.HUD = null; // Kept as null — physics classes guard against this
    this.x = 0;
    this.y = 0;
    this.activeTank = 0;
    this.background = null;
    this.blastLayer = null;
    this.pointsLayer = null;
    this.cpuHandler = null;
    this.sceneData = null;
    this.turnPointer = null;
    this.gameOver = false;
    this.blastCache = new BlastCache(this);
    this._bridge = null;

    // Socket handler refs for cleanup (Fix 4)
    this._socketHandlers = {};
  }

  init = (data) => {
    // Phaser may pass an empty object {} when auto-starting.
    // Check for a meaningful property (gameType) to decide whether `data` is real.
    const hasRealData = data && data.gameType;
    this.sceneData = hasRealData ? data : (window.pendingSceneData || null);
    this.activeTank = 0;
    this.gameOver = false;
    this._bridge = window.gameBridge || null;
    this._created = false;
  };

  preload = () => {
    this.load.image('wall', 'assets/images/wall.png');
    this.load.audio('background', ['assets/sounds/background.mp3']);
    this.load.audio('click', ['assets/sounds/click.wav']);
    this.load.audio('winner', ['assets/sounds/winner.mp3']);
    this.load.audio('launch', ['assets/sounds/others/launch.mp3']);
    this.load.audio('tick', ['assets/sounds/others/tick.wav']);
    this.load.audio('expshort', ['assets/sounds/others/expshort.wav']);
    this.load.audio('expshort2', ['assets/sounds/others/expshort2.wav']);
    this.load.audio('expmedium', ['assets/sounds/others/expmedium.wav']);
    this.load.audio('expmedium2', ['assets/sounds/others/expmedium2.wav']);
    this.load.audio('explong', ['assets/sounds/others/explong.wav']);
    this.load.audio('exphuge', ['assets/sounds/others/exphuge.wav']);
    this.load.audio('bigpop', ['assets/sounds/others/bigpop.wav']);
    this.load.audio('rocks_1', ['assets/sounds/others/rocks_1.wav']);
    this.load.audio('rocks_2', ['assets/sounds/others/rocks_2.wav']);
    this.load.audio('rocks_3', ['assets/sounds/others/rocks_3.wav']);
    this.load.audio('rocks_4', ['assets/sounds/others/rocks_4.wav']);
    this.load.audio('rocks_5', ['assets/sounds/others/rocks_5.wav']);
    this.load.audio('rocks_6', ['assets/sounds/others/rocks_6.wav']);
    this.load.audio('rockslide', ['assets/sounds/others/rockslide.wav']);
    this.load.audio('napalm', ['assets/sounds/others/napalm.wav']);
    this.load.audio('hailstorm', ['assets/sounds/others/hailstorm.wav']);
    this.load.audio('aquabomb_splash', ['assets/sounds/others/aquabomb_splash.wav']);
    this.load.audio('firecracker', ['assets/sounds/others/firecracker.wav']);
    this.load.audio('clusterbombs_exp', ['assets/sounds/others/clusterbombs_exp.wav']);
    this.load.audio('homingmissile', ['assets/sounds/others/homingmissile.wav']);
    this.load.audio('rungun', ['assets/sounds/others/rungun.wav']);
    this.load.audio('rubberbullet', ['assets/sounds/others/rubberbullet.wav']);
    this.load.audio('laser1', ['assets/sounds/others/laser1.wav']);
    this.load.audio('magicbeans_grow', ['assets/sounds/others/magicbeans_grow.wav']);
    this.load.audio('rock', ['assets/sounds/others/rock.wav']);
    this.load.audio('rocket', ['assets/sounds/others/rocket.wav']);
  };

  create = () => {
    if (!this.sceneData || !this.sceneData.gameType) {
      console.warn('[SolShot] MainScene.create() — no sceneData, skipping');
      return;
    }

    // Safe sound wrapper — some weapon code plays sounds that don't exist
    const originalPlay = this.sound.play.bind(this.sound);
    this.sound.play = (key, config) => {
      try {
        if (this.sound.get(key) || this.cache.audio.exists(key)) {
          return originalPlay(key, config);
        }
      } catch (_) {}
      return false;
    };

    // Cleanup on scene shutdown/destroy
    this.events.once('shutdown', () => this.shutdown());
    this.events.once('destroy', () => this.shutdown());

    this.createBackground();
    this.createBlastLayer();
    this.createPointsLayer();
    this.createTerrain();
    this.createBoundWalls();
    this.createTank1();
    this.createTank2();

    // ── Type handler ──
    if (this.sceneData.gameType === 3) {
      this.handleType3();
    } else if (this.sceneData.gameType === 4) {
      this.handleType4();
    }

    this.showTurnPointer();

    try {
      this.sound.stopAll();
      this.sound.play('background', { loop: true });
    } catch (_) {}

    this.terrain.multiplayerPoints = [];

    // ── Turn management socket listeners ──
    // These are the SAME as the original create() body — verbatim logic.
    const socket = window.socket;
    if (socket) {
      this._socketHandlers.recieveTurn = ({ terrainData, pos1, pos2, rotation1, rotation2 }) => {
        console.log('[SolShot] recieveTurn received — activeTank=' + this.activeTank +
          ' t2active=' + this.tank2.active + ' t2weapon=' + (this.tank2.turret.activeWeapon !== null) +
          ' animate=' + this.terrain.animate + ' blasts=' + this.terrain.blastArray.length +
          ' t1settled=' + this.tank1.settled + ' t2settled=' + this.tank2.settled);
        if (this.terrain.animate === true) return;
        if (this.terrain.blastArray.length !== 0) return;
        if (this.tank1.settled === false) return;
        if (this.tank2.settled === false) return;

        if (this.activeTank === 2 && this.tank2.active === false && this.tank2.turret.activeWeapon === null) {
          this.activeTank = 1;
          this.tank1.active = true;
          this.terrain.frameCount = -1;
          this.terrain.multiplayerCorrection(terrainData);

          this.tank1.setPosition(pos2.x, pos2.y);
          this.tank2.setPosition(pos1.x, pos1.y);
          this.tank1.setRotation(rotation2);
          this.tank2.setRotation(rotation1);

          this.terrain.multiplayerPoints = [];
          this.terrain.addPixels = [];
          this.showTurnPointer();
          this._pushStateToBridge();
        }
      };

      this._socketHandlers.opponentRequestTurn = () => {
        if (this.terrain.animate === true) return;
        if (this.terrain.blastArray.length !== 0) return;
        if (this.tank1.settled === false) return;
        if (this.tank2.settled === false) return;

        if (this.activeTank === 2 && this.tank2.active === true && this.tank2.turret.activeWeapon === null) {
          socket.emit('giveTurn', {
            terrainData: this.terrain.multiplayerPoints,
            pos1: { x: this.tank1.x, y: this.tank1.y },
            pos2: { x: this.tank2.x, y: this.tank2.y },
            rotation1: this.tank1.rotation,
            rotation2: this.tank2.rotation,
          });
          this.terrain.save();
        }
      };

      socket.on('recieveTurn', this._socketHandlers.recieveTurn);
      socket.on('opponentRequestTurn', this._socketHandlers.opponentRequestTurn);
    }

    // ── Notify React that Phaser is ready ──
    this.events.once('terrain-finished', () => {
      if (this.activeTank === 2) {
        this.terrain.save();
      }
      this._pushStateToBridge();
      if (this._bridge) {
        this._bridge._readyFired = true;
        this._bridge.notifyReady();
      }
    });

    // Fallback: if terrain-finished never fires (e.g. non-host path race), force ready
    this.time.delayedCall(3000, () => {
      if (this._bridge && !this._bridge._readyFired) {
        this._bridge._readyFired = true;
        this._pushStateToBridge();
        this._bridge.notifyReady();
      }
    });

    this._created = true;
  };

  update = (_time, _delta) => {
    if (!this._created || !this.terrain || !this.tank1 || !this.tank2) return;

    this.checkSwitchTurn();
    this._pushStateToBridge();

    this.input.mousePointer.prev = { x: this.input.mousePointer.x, y: this.input.mousePointer.y };
    this.input.activePointer.prev = { x: this.input.activePointer.x, y: this.input.activePointer.y };
  };

  // ── Physics / Rendering (unchanged from original) ──

  createBoundWalls = () => {
    this.rightWall = this.physics.add.image(this.renderer.width + 50, this.renderer.height, 'wall');
    this.leftWall = this.physics.add.image(-50, this.renderer.height, 'wall');
    this.rightWall.setSize(100, this.renderer.height * 4);
    this.leftWall.setSize(100, this.renderer.height * 4);
    this.leftWall.setImmovable(true).setAlpha(0);
    this.rightWall.setImmovable(true).setAlpha(0);
    this.leftWall.setOrigin(1, 0);
    this.rightWall.setOrigin(0, 0);
  };

  createBackground = () => {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    canvas.height = this.renderer.height;
    canvas.width = this.renderer.width;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (this.textures.exists('background')) this.textures.remove('background');
    this.background = this.textures.addCanvas('background', canvas);
    this.add.image(canvas.width / 2, canvas.height / 2, 'background').setDepth(-3);
  };

  createBlastLayer = () => {
    var canvas = document.createElement('canvas');
    canvas.height = this.renderer.height;
    canvas.width = this.renderer.width;
    if (this.textures.exists('blast-layer')) this.textures.remove('blast-layer');
    this.textures.addCanvas('blast-layer', canvas);
    this.blastLayer = this.add.image(canvas.width / 2, canvas.height / 2, 'blast-layer').setDepth(3);
  };

  createPointsLayer = () => {
    var canvas = document.createElement('canvas');
    canvas.height = this.renderer.height;
    canvas.width = this.renderer.width;
    if (this.textures.exists('points-layer')) this.textures.remove('points-layer');
    this.blastLayer = this.textures.addCanvas('points-layer', canvas);
    this.add.image(canvas.width / 2, canvas.height / 2, 'points-layer').setDepth(4);
  };

  createTerrain = () => {
    this.terrain = new Terrain(this);
  };

  createTank1 = () => {
    this.tank1 = new Tank(this, 1);
    this.tank1.setDepth(-2);
  };

  createTank2 = () => {
    this.tank2 = new Tank(this, 2);
    this.tank2.setDepth(-2);
  };

  // ── Turn switching — identical to original ──

  checkSwitchTurn = () => {
    // Debug: throttled state log (once per second)
    if (!this._lastSwitchLog || Date.now() - this._lastSwitchLog > 1000) {
      const t1active = this.tank1?.active;
      const t2active = this.tank2?.active;
      const t1weapon = this.tank1?.turret?.activeWeapon !== null;
      const t2weapon = this.tank2?.turret?.activeWeapon !== null;
      const blocked = this.terrain.animate || this.terrain.blastArray.length !== 0 ||
        !this.tank1.settled || !this.tank2.settled;
      if (t1active === false && t2active === false && !this.gameOver) {
        console.log('[SolShot] checkSwitchTurn: BOTH INACTIVE — activeTank=' + this.activeTank +
          ' t1weapon=' + t1weapon + ' t2weapon=' + t2weapon + ' blocked=' + blocked +
          ' animate=' + this.terrain.animate + ' blasts=' + this.terrain.blastArray.length +
          ' t1settled=' + this.tank1.settled + ' t2settled=' + this.tank2.settled);
      }
      this._lastSwitchLog = Date.now();
    }

    if (this.terrain.animate === true) return;
    if (this.terrain.blastArray.length !== 0) return;
    if (this.tank1.settled === false) return;
    if (this.tank2.settled === false) return;
    if (this.gameOver === true) return;

    var socket;

    if (this.tank1.weapons.length === 0 && this.tank2.weapons.length === 0) {
      if (this.tank1.turret.activeWeapon === null && this.tank2.turret.activeWeapon === null) {
        this.gameOver = true;
        this.tank1.active = false;
        this.tank2.active = false;
        this.activeTank = 0;
      }
    } else if (this.activeTank === 1 && this.tank1.active === false && this.tank1.turret.activeWeapon === null) {
      console.log('[SolShot] checkSwitchTurn: activeTank 1→2, emitting giveTurn');
      this.terrain.frameCount = -1;
      this.activeTank = 2;
      this.tank2.active = true;
      if (this.sceneData.gameType === 3) {
        socket = window.socket;
        if (socket) {
          socket.emit('giveTurn', {
            terrainData: this.terrain.multiplayerPoints,
            pos1: { x: this.tank1.x, y: this.tank1.y },
            pos2: { x: this.tank2.x, y: this.tank2.y },
            rotation1: this.tank1.rotation,
            rotation2: this.tank2.rotation,
          });
        }
        this.terrain.save();
      }
      this.showTurnPointer();
    } else if (this.activeTank === 2 && this.tank2.active === false && this.tank2.turret.activeWeapon === null) {
      console.log('[SolShot] checkSwitchTurn: activeTank=2, tank2 done, emitting requestTurn');
      this.terrain.frameCount = -1;
      if (this.sceneData.gameType !== 3) {
        this.activeTank = 1;
        this.tank1.active = true;
        this.showTurnPointer();
      } else {
        socket = window.socket;
        if (socket) {
          socket.emit('requestTurn', {});
        }
      }
    }
  };

  // ── Turn pointer ──

  showTurnPointer = () => {
    var tank = null;
    if (this.activeTank === 1) tank = this.tank1;
    if (this.activeTank === 2) tank = this.tank2;

    if (tank !== null) {
      this.hideTurnPointer();
      var canvas = document.createElement('canvas');
      canvas.width = 18;
      canvas.height = 20;
      var w = 18;
      var h = 20;
      var ctx = canvas.getContext('2d');

      ctx.fillStyle = tank.color;
      ctx.moveTo(w / 3, 0);
      ctx.lineTo(w * (2 / 3), 0);
      ctx.lineTo(w * (2 / 3), h * (1 / 2));
      ctx.lineTo(w, h * (1 / 2));
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h * (1 / 2));
      ctx.lineTo(w * (1 / 3), h * (1 / 2));
      ctx.lineTo(w / 3, 0);
      ctx.closePath();
      ctx.fill();

      if (this.textures.exists('turn-pointer')) this.textures.remove('turn-pointer');
      this.textures.addCanvas('turn-pointer', canvas);
      this.turnPointer = this.add.image(tank.x, tank.y - 45, 'turn-pointer');
      this.turnPointer.setDepth(10);

      this.tweens.add({
        targets: this.turnPointer,
        y: this.turnPointer.y - 10,
        repeat: -1,
        yoyo: true,
        duration: 300,
      });

      this.turnPointer.setVisible(true);
    }
  };

  hideTurnPointer = () => {
    if (this.turnPointer !== null) {
      this.turnPointer.setVisible(false);
      this.turnPointer = null;
    }
  };

  // ── Type 3: Online multiplayer ──

  handleType3 = () => {
    const socket = window.socket;
    if (!socket) {
      console.error('[SolShot] handleType3: No socket!');
      return;
    }

    // NOTE: We do NOT call socket.removeAllListeners() — Fix 4 from migration spec.
    // React's BattleScreen manages its own listeners via useSocket.

    const player1 = this.sceneData.player1;
    const player2 = this.sceneData.player2;
    const hostId = this.sceneData.hostId;

    this.tank1.weapons = player1.weapons;
    this.tank2.weapons = player2.weapons;

    this.tank1.create(int2rgba(player1.color), player1.name);
    this.tank2.create(int2rgba(player2.color), player2.name);

    if (socket.id === hostId) {
      this.terrain.create();
      // Debug: verify terrain has pixels
      let foundPixel = false;
      for (let y = 0; y < this.terrain.height; y++) {
        if (this.terrain.getPixel(this.terrain.width / 2, y).alpha > 0) { foundPixel = true; break; }
      }
      console.log('[SolShot] Host terrain created: hasPixels=' + foundPixel + ' size=' + this.terrain.width + 'x' + this.terrain.height);
      this.tank1.randomPos();
      this.tank2.randomPos();
      socket.emit('terrainPath', {
        path: this.terrain.path,
        hostPos: { x: this.tank1.x, y: this.tank1.y },
        playerPos: { x: this.tank2.x, y: this.tank2.y },
      });
    } else {
      socket.once('setTerrainPath', ({ path, hostPos, playerPos }) => {
        this.terrain.setPath(path);
        this.tank1.setPosition(playerPos.x, playerPos.y);
        this.tank2.setPosition(hostPos.x, hostPos.y);
        var rotation = this.terrain.getSlope(playerPos.x, playerPos.y);
        if (rotation !== undefined) this.tank1.setRotation(rotation);
        rotation = this.terrain.getSlope(hostPos.x, hostPos.y);
        if (rotation !== undefined) this.tank2.setRotation(rotation);
        // Re-enable physics bodies (were disabled during create() waiting for terrain)
        this.tank1.enablePhysics();
        this.tank2.enablePhysics();
        this.showTurnPointer();
        this._pushStateToBridge();
        if (this._bridge) {
          this._bridge._readyFired = true;
          this._bridge.notifyReady();
        }
      });
      socket.emit('getTerrainPath', {});
    }

    // Both players start active — this is the original design (simultaneous first turn).
    if (socket.id === hostId) {
      this.tank1.active = true;
      this.activeTank = 1;
    } else {
      this.tank2.active = true;
      this.activeTank = 2;
    }

    // Server-authoritative events
    this._socketHandlers.turnResult = ({ playerId, goldBalance }) => {
      if (goldBalance && socket) {
        const myGold = goldBalance[socket.id];
        if (myGold !== undefined && this._bridge) {
          this._bridge.updateState({ gold: myGold });
        }
      }
    };
    this._socketHandlers.fireRejected = ({ reason }) => {
      console.warn('[SolShot] Fire rejected:', reason);
    };
    socket.on('turnResult', this._socketHandlers.turnResult);
    socket.on('fireRejected', this._socketHandlers.fireRejected);
  };

  handleType4 = () => {
    this.terrain.create();
    const player1 = this.sceneData.player1;
    const player2 = this.sceneData.player2;

    this.tank1.weapons = player1.weapons;
    this.tank2.weapons = player2.weapons;

    this.tank1.create(int2rgba(player1.color), player1.name);
    this.tank2.create(int2rgba(player2.color), player2.name);

    if (Math.random() > 0.5) {
      this.tank1.active = true;
      this.activeTank = 1;
    } else {
      this.tank2.active = true;
      this.activeTank = 2;
    }
  };

  // ── React bridge command handlers ──
  //
  // These replace the original fire-btn.js, HUD power/angle controls, and
  // keyboard handlers. They must emit the same socket events the originals did.

  handleFireFromReact = () => {
    const tank = this.activeTank === 1 ? this.tank1 : this.tank2;
    console.log('[SolShot] handleFireFromReact — activeTank=' + this.activeTank +
      ' tankActive=' + tank?.active + ' weapon=' + tank?.weapons[tank?.selectedWeapon]?.id);
    if (!tank || !tank.active) return;

    // Emit 'shoot' to server — server relays as 'opponentShoot' to the other player
    // so they see our shot render on their screen. This is what fire-btn.js did.
    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) {
        socket.emit('shoot', {
          selectedWeapon: tank.selectedWeapon,
          power: tank.power,
          rotation: tank.turret.relativeRotation,
          rotation1: this.tank1.rotation,
          rotation2: this.tank2.rotation,
          position1: { x: this.tank1.x, y: this.tank1.y },
          position2: { x: this.tank2.x, y: this.tank2.y },
        });
      }
    }
    tank.shoot();
  };

  handlePowerFromReact = (v) => {
    const tank = this.activeTank === 1 ? this.tank1 : this.tank2;
    if (!tank || !tank.active) return;
    tank.setPower(v);
    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) socket.emit('powerChange', { power: v });
    }
  };

  handleAngleFromReact = (v) => {
    const tank = this.activeTank === 1 ? this.tank1 : this.tank2;
    if (!tank || !tank.turret || !tank.active) return;
    const radians = Phaser.Math.DegToRad(v) - Math.PI / 2;
    tank.turret.setRelativeRotation(radians - tank.rotation);
    // Angle emit is handled by Turret.emitRotation() on a 500ms timer
  };

  handleWeaponSelectFromReact = (idx) => {
    const tank = this.activeTank === 1 ? this.tank1 : this.tank2;
    if (!tank || !tank.active) return;
    tank.selectedWeapon = idx;
  };

  handleMoveLeftFromReact = () => {
    const tank = this.activeTank === 1 ? this.tank1 : this.tank2;
    if (!tank || !tank.active || tank.movesRemaining <= 0) return;
    tank.stepLeft();
    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) socket.emit('stepLeft', {});
    }
  };

  handleMoveRightFromReact = () => {
    const tank = this.activeTank === 1 ? this.tank1 : this.tank2;
    if (!tank || !tank.active || tank.movesRemaining <= 0) return;
    tank.stepRight();
    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) socket.emit('stepRight', {});
    }
  };

  handleExitFromReact = () => {
    if (window.socket) {
      window.socket.emit('leaveRoom', {});
    }
  };

  // ── Bridge state push ──

  _pushStateToBridge = () => {
    if (!this._bridge) return;

    const myId = window.socket?.id;
    const hostId = this.sceneData?.hostId;
    const isHost = myId === hostId;

    const myTank = isHost ? this.tank1 : this.tank2;
    const isMyTurn = myTank && myTank.active;

    this._bridge.updateState({
      tank1: this.tank1 ? {
        x: this.tank1.x,
        y: this.tank1.y,
        hp: this.tank1.scoreHandler ? this.tank1.scoreHandler.hp : 100,
        angle: this.tank1.turret ? Phaser.Math.RadToDeg(this.tank1.turret.relativeRotation + this.tank1.rotation + Math.PI / 2) : 45,
        power: this.tank1.power || 60,
        name: this.tank1.name || '',
        color: this.tank1.color || '#FF0000',
        score: this.tank1.score || 0,
      } : this._bridge.state.tank1,
      tank2: this.tank2 ? {
        x: this.tank2.x,
        y: this.tank2.y,
        hp: this.tank2.scoreHandler ? this.tank2.scoreHandler.hp : 100,
        angle: this.tank2.turret ? Phaser.Math.RadToDeg(this.tank2.turret.relativeRotation + this.tank2.rotation + Math.PI / 2) : 45,
        power: this.tank2.power || 60,
        name: this.tank2.name || '',
        color: this.tank2.color || '#0066FF',
        score: this.tank2.score || 0,
      } : this._bridge.state.tank2,
      activeTank: this.activeTank,
      isPlayerTurn: isMyTurn,
      moveSteps: myTank ? myTank.movesRemaining : 0,
      currentWeaponIndex: myTank ? myTank.selectedWeapon : 0,
      weapons: myTank ? myTank.weapons : [],
      isFiring: myTank && myTank.turret ? myTank.turret.activeWeapon !== null : false,
      gameOver: this.gameOver,
    });
  };

  // ── Cleanup (Fix 4: specific socket.off, never removeAllListeners) ──

  shutdown = () => {
    const socket = window.socket;
    if (socket && this._socketHandlers) {
      Object.entries(this._socketHandlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    }
    this._socketHandlers = {};

    try {
      this.sound.stopAll();
    } catch (_) {}

    this._bridge = null;
  };
}

const int2rgba = (colorInt) => {
  var rgba = new Display.Color.IntegerToRGB(colorInt);
  return 'rgba(' + rgba.r + ',' + rgba.g + ',' + rgba.b + ',' + rgba.a + ')';
};
