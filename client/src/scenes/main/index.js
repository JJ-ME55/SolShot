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
    this._turnResultCooldown = 0;

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
    this.wind = 0;
    this._bridge = window.gameBridge || null;
    this._created = false;
  };

  preload = () => {
    this.load.image('wall', 'assets/images/wall.png');
    this.load.image('bg-default', 'assets/images/backgrounds/bg-jungle.png');
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

    // Legacy turn relay handlers (recieveTurn, opponentRequestTurn) REMOVED.
    // Turns are now managed server-side via turnResult.nextTurn.

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
    // Base fill: dark green so no black shows anywhere
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Sky: draw background image, vertically centered in the upper portion
    var bgTex = this.textures.exists('bg-default') ? this.textures.get('bg-default') : null;
    if (bgTex && bgTex.source && bgTex.source[0]) {
      var img = bgTex.source[0].image;
      // Scale image to fill canvas width, position sky in upper half
      var scale = canvas.width / img.width;
      var drawW = img.width * scale;
      var drawH = img.height * scale;
      // Offset: pull image up so the sky portion fills the visible area above terrain
      // Terrain starts at ~55% down, so show sky from top to ~55%
      var offsetY = -(drawH * 0.25);
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, offsetY, drawW, drawH);
    }
    // Gradient fade from jungle scene into dark terrain area (smooth transition)
    var fadeGrad = ctx.createLinearGradient(0, canvas.height * 0.4, 0, canvas.height * 0.55);
    fadeGrad.addColorStop(0, 'rgba(10,26,10,0)');
    fadeGrad.addColorStop(1, 'rgba(10,26,10,1)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, Math.floor(canvas.height * 0.4), canvas.width, Math.ceil(canvas.height * 0.15));
    // Solid dark fill below the gradient for terrain area
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(0, Math.floor(canvas.height * 0.55), canvas.width, Math.ceil(canvas.height * 0.45));
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

  // ── Turn switching ──
  // For type3 (multiplayer): Turns are managed by the server via turnResult.nextTurn.
  // This method now only handles:
  //   1. Detecting when the local firing animation finishes so we can apply pendingTurnResult
  //   2. Non-multiplayer (type4) local turn switching
  checkSwitchTurn = () => {
    if (this.terrain.animate === true) return;
    if (this.terrain.blastArray.length !== 0) return;
    if (this.gameOver === true) return;

    // Safety: if a tank is unsettled for too long (>3s), force settle it
    // This prevents the game from getting permanently stuck
    if (this.tank1.settled === false || this.tank2.settled === false) {
      if (!this._settleWaitStart) {
        this._settleWaitStart = Date.now();
      } else if (Date.now() - this._settleWaitStart > 3000) {
        console.warn('[SolShot] Force-settling tanks after 3s timeout. t1=' + this.tank1.settled + ' t2=' + this.tank2.settled);
        this.tank1.settled = true;
        this.tank2.settled = true;
        this.tank1.body.stop();
        this.tank2.body.stop();
        this.tank1.body.setGravity(0);
        this.tank2.body.setGravity(0);
        this._settleWaitStart = null;
      }
      return;
    }
    this._settleWaitStart = null;

    // For multiplayer: apply pending server result once ALL animations are done.
    if (this.sceneData.gameType === 3) {
      if (this.pendingTurnResult) {
        // Cooldown: after pendingTurnResult is set, wait a few frames so that
        // any in-flight blast (from playExplosionEffect or local weapon) has time
        // to push into blastArray and be detected by the top-level guards.
        if (this._turnResultCooldown > 0) {
          this._turnResultCooldown--;
          return;
        }
        const isMyShot = (this.pendingTurnResult.playerId === window.socket?.id);
        // Own shot: also wait for weapon animation to finish
        const weaponDone = isMyShot
          ? (this.tank1.turret && this.tank1.turret.activeWeapon === null)
          : true;
        if (!weaponDone && !this._weaponWaitLogged) {
          console.log('[SolShot] checkSwitchTurn: waiting for weapon animation to finish (activeWeapon=' + (this.tank1.turret ? this.tank1.turret.activeWeapon : 'no turret') + ')');
          this._weaponWaitLogged = true;
        }
        if (weaponDone) {
          console.log('[SolShot] checkSwitchTurn: applying turnResult NOW');
          this._weaponWaitLogged = false;
          this.applyTurnResult(this.pendingTurnResult);
          this.pendingTurnResult = null;
        }
      }
      return;
    }

    // Non-multiplayer (type4 practice mode) — legacy local turn switching
    if (this.tank1.weapons.length === 0 && this.tank2.weapons.length === 0) {
      if (this.tank1.turret.activeWeapon === null && this.tank2.turret.activeWeapon === null) {
        this.gameOver = true;
        this.tank1.active = false;
        this.tank2.active = false;
        this.activeTank = 0;
      }
    } else if (this.activeTank === 1 && this.tank1.active === false && this.tank1.turret.activeWeapon === null) {
      this.terrain.frameCount = -1;
      this.activeTank = 2;
      this.tank2.active = true;
      this.showTurnPointer();
    } else if (this.activeTank === 2 && this.tank2.active === false && this.tank2.turret.activeWeapon === null) {
      this.terrain.frameCount = -1;
      this.activeTank = 1;
      this.tank1.active = true;
      this.showTurnPointer();
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

  // ── Type 3: Online multiplayer — SERVER IS GOD ──
  //
  // Server generates terrain, runs physics, manages turns.
  // Client only sends {angle, power, weaponId, seq} and renders results.

  handleType3 = () => {
    const socket = window.socket;
    if (!socket) {
      console.error('[SolShot] handleType3: No socket!');
      return;
    }

    const player1 = this.sceneData.player1;
    const player2 = this.sceneData.player2;
    const hostId = this.sceneData.hostId;
    const isHost = socket.id === hostId;

    // Perspective mapping: tank1 = MY tank, tank2 = OPPONENT's tank.
    // player1 = host data, player2 = joiner data (from shopEnd).
    // Host:   tank1 gets player1 (host) data,   tank2 gets player2 (joiner) data
    // Joiner: tank1 gets player2 (joiner) data, tank2 gets player1 (host) data
    const myData = isHost ? player1 : player2;
    const theirData = isHost ? player2 : player1;

    this.tank1.weapons = myData.weapons;
    this.tank2.weapons = theirData.weapons;

    this.tank1.create(int2rgba(myData.color), myData.name);
    this.tank2.create(int2rgba(theirData.color), theirData.name);

    // Server nonce for fire validation (prevents replay attacks)
    this._turnSeq = 0;
    // Pending turn result for firing player (applied after local animation)
    this.pendingTurnResult = null;
    // Server heightmap for terrain sync
    this._serverHeightmap = null;
    // Track HP server-side
    this._serverHP = {};

    // ── STEP 1: Server-generated terrain ──
    // Both clients listen for terrainGenerated. Host triggers requestTerrain.
    this._socketHandlers.terrainGenerated = ({ path, heightmap, tankPositions, seed, wind, firstTurn, seq }) => {
      // Store server heightmap for later terrain sync
      this._serverHeightmap = heightmap;
      this._turnSeq = seq || 0;
      // Store wind for projectile physics
      this.wind = wind || 0;

      // Draw terrain from server path (same format as client path: [{x,y},...])
      this.terrain.setPath(path);

      // Position tanks from server data
      // tank1 = MY tank, tank2 = OPPONENT's tank (perspective mapping)
      const myPos = isHost ? tankPositions.host : tankPositions.player;
      const theirPos = isHost ? tankPositions.player : tankPositions.host;

      this.tank1.setPosition(myPos.x, myPos.y);
      this.tank2.setPosition(theirPos.x, theirPos.y);

      // Set slopes
      let rotation = this.terrain.getSlope(myPos.x, myPos.y);
      if (rotation !== undefined) this.tank1.setRotation(rotation);
      rotation = this.terrain.getSlope(theirPos.x, theirPos.y);
      if (rotation !== undefined) this.tank2.setRotation(rotation);

      // Enable physics bodies (were disabled in Tank.create() waiting for terrain)
      this.tank1.enablePhysics();
      this.tank2.enablePhysics();

      // Set turn from server — firstTurn is a socket.id
      const isMyTurn = (firstTurn === socket.id);
      if (isMyTurn) {
        this.tank1.active = true;
        this.tank2.active = false;
        this.activeTank = 1;
      } else {
        this.tank1.active = false;
        this.tank2.active = false; // opponent acts via server, not local tank2
        this.activeTank = 2;
      }

      this.showTurnPointer();
      this._pushStateToBridge();
      if (this._bridge) {
        this._bridge._readyFired = true;
        this._bridge.notifyReady();
      }
    };
    socket.on('terrainGenerated', this._socketHandlers.terrainGenerated);

    // Both host and non-host request terrain from server.
    // Server generates on first request, re-sends cached data on subsequent.
    // This fixes round 2 race condition where non-host misses terrainGenerated.
    socket.emit('requestTerrain');

    // ── STEP 3: Handle turnResult — full server response ──
    this._socketHandlers.turnResult = (data) => {
      // turnResult received from server
      console.log('[SolShot] turnResult received: damage=' + JSON.stringify(data.damage) + ' hp=' + JSON.stringify(data.hp) + ' nextTurn=' + (data.nextTurn ? data.nextTurn.slice(0,8) : null));

      // Store nonce for next fire
      this._turnSeq = data.seq;

      // Animate server trajectory for ALL shots (own + opponent).
      // Server trajectory is authoritative — both players see the same projectile
      // in the same place. No local fire means no dual-projectile.
      this.animateTrajectory(data.weaponId, data.trajectory, data.impact, () => {
        this.pendingTurnResult = data;
        // Give blast 3 frames to enter blastArray before checkSwitchTurn can apply
        this._turnResultCooldown = 3;
      });
    };

    this._socketHandlers.fireRejected = ({ reason }) => {
      console.warn('[SolShot] Fire rejected:', reason);
      // Re-enable controls so player can try again
      this.tank1.active = true;
      this._pushStateToBridge();
    };

    socket.on('turnResult', this._socketHandlers.turnResult);
    socket.on('fireRejected', this._socketHandlers.fireRejected);
  };

  // ── Apply authoritative turn result from server ──
  applyTurnResult = (data) => {
    const socket = window.socket;
    if (!socket) return;

    const { terrainUpdate, damage, nextTurn, goldBalance } = data;
    console.log('[SolShot] applyTurnResult: impact=' + JSON.stringify(data.impact) + ' damage=' + JSON.stringify(damage) + ' nextTurn=' + (nextTurn ? nextTurn.slice(0,8) : null));

    // 1. Sync terrain to server state (authoritative heightmap)
    // This handles ALL terrain deformation — both for firing and non-firing player.
    if (terrainUpdate && terrainUpdate.length > 0) {
      console.log('[SolShot] applyTurnResult: terrainUpdate len=' + terrainUpdate.length +
        ' sample[600]=' + terrainUpdate[600] + ' damage=' + JSON.stringify(damage));
      this._serverHeightmap = terrainUpdate;
      this.terrain.applyHeightmap(terrainUpdate);
    } else {
      console.log('[SolShot] applyTurnResult: NO terrainUpdate! data keys=' + Object.keys(data).join(','));
    }

    // 2. Update HP from server — use authoritative HP values
    if (data.hp) {
      for (const [targetId, serverHp] of Object.entries(data.hp)) {
        const isMe = (targetId === socket.id);
        const targetTank = isMe ? this.tank1 : this.tank2;
        if (targetTank && targetTank.scoreHandler) {
          const oldHp = targetTank.scoreHandler.hp;
          targetTank.scoreHandler.hp = Math.max(0, serverHp);
          if (oldHp !== targetTank.scoreHandler.hp) {
            console.log('[SolShot] HP update: ' + (isMe ? 'me' : 'opp') + ' ' + oldHp + ' → ' + targetTank.scoreHandler.hp);
          }
        }
      }
    } else if (damage) {
      // Fallback: calculate from damage if server doesn't send HP
      for (const [targetId, dmg] of Object.entries(damage)) {
        const absDmg = Math.abs(dmg);
        if (absDmg > 0) {
          const isMe = (targetId === socket.id);
          const targetTank = isMe ? this.tank1 : this.tank2;
          if (targetTank && targetTank.scoreHandler) {
            const oldHp = targetTank.scoreHandler.hp;
            targetTank.scoreHandler.hp = Math.max(0, oldHp - absDmg);
            console.log('[SolShot] HP update (fallback): ' + (isMe ? 'me' : 'opp') + ' ' + oldHp + ' → ' + targetTank.scoreHandler.hp);
          }
        }
      }
    }

    // 3. Snap tanks to terrain surface at their CURRENT X position.
    // Don't use server positions for X — server doesn't simulate blast knockback.
    // After knockback, tanks may have moved horizontally. Just ensure Y matches terrain.
    if (this._serverHeightmap) {
      if (this.tank1) {
        const t1x = Math.min(1199, Math.max(0, Math.floor(this.tank1.x)));
        if (this._serverHeightmap[t1x] !== undefined) {
          this.tank1.setPosition(this.tank1.x, this._serverHeightmap[t1x] - 15);
        }
      }
      if (this.tank2) {
        const t2x = Math.min(1199, Math.max(0, Math.floor(this.tank2.x)));
        if (this._serverHeightmap[t2x] !== undefined) {
          this.tank2.setPosition(this.tank2.x, this._serverHeightmap[t2x] - 15);
        }
      }
    }

    // Report updated tank positions back to server so next shot uses correct positions
    if (window.socket) {
      window.socket.emit('positionUpdate', {
        x: this.tank1 ? this.tank1.x : 0,
        y: this.tank1 ? this.tank1.y : 0,
      });
    }

    // 4. Update gold
    if (goldBalance && socket) {
      const myGold = goldBalance[socket.id];
      if (myGold !== undefined && this._bridge) {
        this._bridge.updateState({ gold: myGold });
      }
    }

    // 5. Set next turn from server
    const isMyTurn = (nextTurn === socket.id);
    if (isMyTurn) {
      this.tank1.active = true;
      this.activeTank = 1;
      this.tank1.movesRemaining = 4; // Reset moves for new turn
    } else {
      this.tank1.active = false;
      this.activeTank = 2;
      this.tank2.movesRemaining = 4; // Reset opponent moves for their turn
    }

    this.showTurnPointer();
    this._pushStateToBridge();
  };

  // ── Animate trajectory from server data (for non-firing player) ──
  animateTrajectory = (weaponId, trajectory, impact, onComplete) => {
    if (!trajectory || trajectory.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    // Create a small projectile circle
    const projectile = this.add.circle(trajectory[0].x, trajectory[0].y, 4, 0xFFFFFF);
    projectile.setDepth(5);

    // Animate along trajectory points
    let frameIndex = 0;
    let completed = false; // Guard against double-completion
    const speed = 2; // Points per frame (60fps, so ~30 points/sec)

    const moveProjectile = () => {
      if (completed) return; // Already finished — don't re-trigger

      frameIndex += speed;
      if (frameIndex >= trajectory.length) {
        completed = true;

        // Stop the timer immediately to prevent extra calls
        if (this._trajectoryTimer) {
          this._trajectoryTimer.remove(false);
        }

        // Impact reached — destroy projectile
        try { projectile.destroy(); } catch (_) {}

        // Play explosion visual — creates real Blast in terrain.blastArray
        if (impact && impact.x !== undefined) {
          this.playExplosionEffect(impact.x, impact.y, weaponId);
          // Blast created at impact point
        }

        if (onComplete) onComplete();
        // Trajectory complete, pending turn result queued
        return;
      }

      const point = trajectory[Math.min(Math.floor(frameIndex), trajectory.length - 1)];
      projectile.setPosition(point.x, point.y);
    };

    // Use Phaser's update loop via a timer event at 60fps
    this._trajectoryTimer = this.time.addEvent({
      delay: 1000 / 60,
      callback: moveProjectile,
      callbackScope: this,
      repeat: Math.ceil(trajectory.length / speed) + 5, // +5 safety margin
    });
  };

  // ── Play explosion visual effects (for ALL shots via server trajectory) ──
  // Both players see the same explosion at the same impact point.
  // visualOnly=true: show blast ring + knockback, but don't dig terrain canvas.
  // Terrain crater is handled authoritatively by applyHeightmap() in applyTurnResult.
  playExplosionEffect = (x, y, weaponId) => {
    // Blast data per weapon — extracted from Standard.js weapon handlers
    const BLAST_DATA = {
      0:  { radius: 46, grd: [{relativePosition: 0, color: 'rgba(255,51,153,0)'}, {relativePosition: 1, color: 'rgba(230,0,115,1)'}], thickness: 15, blowPower: 200, sound: 'expmedium2' },
      1:  { radius: 90, grd: [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 1, color: 'rgba(255,0,0,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      2:  { radius: 46, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.5, color: 'rgba(100,100,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      3:  { radius: 46, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.5, color: 'rgba(100,30,0,1)'}, {relativePosition: 1, color: 'rgba(255,100,20,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      4:  { radius: 36, grd: [{relativePosition: 0, color: 'rgba(255,51,153,0)'}, {relativePosition: 1, color: 'rgba(230,0,115,1)'}], thickness: 15, blowPower: 0, sound: 'expshort' },
      5:  { radius: 80, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.4, color: 'rgba(120,0,0,1)'}, {relativePosition: 1, color: 'rgba(230,0,0,1)'}], thickness: 15, blowPower: 200, sound: 'expmedium' },
      7:  { radius: 70, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.7, color: 'rgba(250,0,250,1)'}, {relativePosition: 0.8, color: 'rgba(250,200,250,1)'}, {relativePosition: 1, color: 'rgba(250,200,250,1)'}], thickness: 15, blowPower: 200, sound: 'exphuge' },
      9:  { radius: 36, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(120,120,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}], thickness: 18, blowPower: 50, sound: 'expshort' },
      10: { radius: 28, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(120,120,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}], thickness: 18, blowPower: 50, sound: 'expshort' },
      11: { radius: 40, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.4, color: 'rgba(120,80,0,1)'}, {relativePosition: 1, color: 'rgba(230,160,0,1)'}], thickness: 15, blowPower: 50, sound: 'expshort' },
      12: { radius: 0, grd: [], thickness: 0, blowPower: 0, sound: null },
      15: { radius: 60, grd: [{relativePosition: 0, color: 'rgba(255,100,0,0)'}, {relativePosition: 1, color: 'rgba(255,50,0,1)'}], thickness: 15, blowPower: 200, sound: 'napalm' },
      16: { radius: 36, grd: [{relativePosition: 0, color: 'rgba(200,230,255,0)'}, {relativePosition: 1, color: 'rgba(100,180,255,1)'}], thickness: 12, blowPower: 150, sound: 'hailstorm' },
      // New launch weapons
      17: { radius: 70, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(80,50,20,1)'}, {relativePosition: 1, color: 'rgba(160,100,40,1)'}], thickness: 16, blowPower: 200, sound: 'expmedium' },
      20: { radius: 52, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(0,100,200,1)'}, {relativePosition: 1, color: 'rgba(0,200,255,1)'}], thickness: 14, blowPower: 150, sound: 'expmedium' },
      25: { radius: 0, grd: [], thickness: 0, blowPower: 0, sound: null },
      // Prestige weapons
      21: { radius: 46, grd: [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(255,100,0,1)'}, {relativePosition: 1, color: 'rgba(255,200,0,1)'}], thickness: 14, blowPower: 100, sound: 'expshort' },
      22: { radius: 80, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(0,150,50,1)'}, {relativePosition: 1, color: 'rgba(0,230,80,1)'}], thickness: 16, blowPower: 200, sound: 'exphuge' },
      24: { radius: 80, grd: [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(20,0,100,0.8)'}, {relativePosition: 0.3, color: 'rgba(50,20,150,1)'}, {relativePosition: 1, color: 'rgba(200,200,255,1)'}], thickness: 16, blowPower: 80, sound: 'expmedium' },
      26: { radius: 16, grd: [{relativePosition: 0, color: 'rgba(255,200,0,0)'}, {relativePosition: 1, color: 'rgba(255,100,0,1)'}], thickness: 8, blowPower: 30, sound: 'expshort' },
      29: { radius: 80, grd: [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 0.5, color: 'rgba(200,0,50,1)'}, {relativePosition: 1, color: 'rgba(255,0,100,1)'}], thickness: 16, blowPower: 100, sound: 'expmedium' },
    };

    const info = BLAST_DATA[weaponId] || BLAST_DATA[0];
    if (info.radius <= 0) return;

    // Use the real Blast system — same expanding rings as the firing player
    // blowTank=true: apply knockback physics locally for visual feedback
    const hitRadius = this.tank1 ? this.tank1.hitRadius : 6;
    const blastRadius = Math.max(info.radius - hitRadius, 1);
    // Play visual-only explosion for opponent's shot
    const data = {
      thickness: info.thickness,
      gradient: info.grd,
      blowPower: info.blowPower,
      soundEffect: info.sound,
      soundConfig: {},
      visualOnly: true,  // Don't dig terrain — applyHeightmap handles crater authoritatively
    };

    this.terrain.blast(1, Math.floor(x), Math.floor(y), blastRadius, data, true, (weaponId || 0).toString() + '.opp');
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
    if (!tank || !tank.active) return;

    const weaponObj = tank.weapons[tank.selectedWeapon];
    if (!weaponObj) return;

    if (this.sceneData.gameType === 3) {
      const socket = window.socket;
      if (socket) {
        // SERVER IS GOD: Send only angle/power/weaponId to server.
        // Server runs physics and broadcasts turnResult to both players.
        //
        // Server calculateTrajectory expects angle in RADIANS matching
        // turret.rotation (the absolute rotation of the turret sprite).
        // Server then does: rotation = angle - PI/2  (same as client's
        // Weapon.defaultShoot: rotation = turret.rotation - PI/2).
        const angle = tank.turret ? tank.turret.rotation : 0;

        socket.emit('fire', {
          angle: angle,
          power: tank.power,
          weaponId: weaponObj.id,
          seq: this._turnSeq,
          position: { x: tank.x, y: tank.y },
        });

        // DON'T fire locally — wait for server turnResult.
        // Server trajectory is authoritative; both players see the same projectile.

        // Disable controls until turnResult arrives
        tank.active = false;
        this._pushStateToBridge();
      }
    } else {
      // Non-multiplayer (type4 practice) — fire locally only
      tank.shoot();
    }
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
  // In the server-authoritative model:
  //   tank1 = MY tank (always), tank2 = OPPONENT's tank
  //   isPlayerTurn = tank1.active (my tank is active)

  _pushStateToBridge = () => {
    if (!this._bridge) return;

    // tank1 is always "me", tank2 is always "opponent" (perspective mapped in terrainGenerated)
    const myTank = this.tank1;
    const isMyTurn = myTank && myTank.active;

    this._bridge.updateState({
      tank1: this.tank1 ? {
        x: this.tank1.x,
        y: this.tank1.y,
        hp: this.tank1.scoreHandler ? this.tank1.scoreHandler.hp : 250,
        angle: this.tank1.turret ? Phaser.Math.RadToDeg(this.tank1.turret.relativeRotation + this.tank1.rotation + Math.PI / 2) : 45,
        power: this.tank1.power || 60,
        name: this.tank1.name || '',
        color: this.tank1.color || '#FF0000',
        score: this.tank1.score || 0,
      } : this._bridge.state.tank1,
      tank2: this.tank2 ? {
        x: this.tank2.x,
        y: this.tank2.y,
        hp: this.tank2.scoreHandler ? this.tank2.scoreHandler.hp : 250,
        angle: this.tank2.turret ? Phaser.Math.RadToDeg(this.tank2.turret.relativeRotation + this.tank2.rotation + Math.PI / 2) : 45,
        power: this.tank2.power || 60,
        name: this.tank2.name || '',
        color: this.tank2.color || '#0066FF',
        score: this.tank2.score || 0,
      } : this._bridge.state.tank2,
      activeTank: this.activeTank,
      isPlayerTurn: isMyTurn,
      wind: this.wind || 0,
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
