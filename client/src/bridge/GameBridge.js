/**
 * GameBridge — Plain JS object bridging Phaser and React.
 *
 * Pattern: Phaser writes state via updateState(), sets dirty=true.
 * React reads via consume() in a rAF loop, only re-renders when dirty.
 *
 * Commands flow React → Phaser via method calls + scene reference.
 *
 * N-PLAYER (Phase 18-01): Added players[] canonical state shape alongside
 * backward-compat tank1/tank2 shims for BattleHUD (updated in Phase 19).
 */

class GameBridge {
  constructor() {
    this.state = {
      // N-player canonical
      players: [],  // Array<{ x, y, hp, angle, power, name, color, score, alive }>
      myPlayerIndex: -1,
      currentPlayerIndex: 0,
      // Backward-compat shims (BattleHUD reads these until Phase 19)
      tank1: { x: 0, y: 0, hp: 250, angle: 45, power: 60, name: '', color: '#FF0000', score: 0 },
      tank2: { x: 0, y: 0, hp: 250, angle: 45, power: 60, name: '', color: '#0066FF', score: 0 },
      activeTank: 0,
      // Shared state
      wind: 0,
      gold: 0,
      round: 1,
      totalRounds: 5,
      gameOver: false,
      moveSteps: 4,
      currentWeaponIndex: 0,
      weapons: [],
      isPlayerTurn: false,
      isFiring: false,
      wager: 0,
      potDisplay: 0,
      // Elimination state (populated by Plan 18-02, but shape defined here)
      isEliminated: false,       // local player was eliminated
      eliminatedPlacement: null, // e.g. 3 for "You placed 3rd"
    };

    this.dirty = false;
    this.scene = null; // Set by BattleScene on create

    // Callbacks for Phaser → React events
    this._onReady = null;
    this._onGameOver = null;
    this._onRoundEnd = null;
    this._onMatchEnd = null;
    this._onOpponentLeft = null;
    this._onMatchSettled = null;
    this._onEliminated = null;
  }

  /**
   * Phaser calls this in update() — only when state actually changed.
   */
  updateState(partial) {
    Object.assign(this.state, partial);
    this.dirty = true;
  }

  /**
   * React calls this to check + consume dirty flag.
   * Returns new state snapshot if dirty, null otherwise.
   */
  consume() {
    if (!this.dirty) return null;
    this.dirty = false;
    return { ...this.state };
  }

  // ── Commands from React to Phaser ──

  fire() {
    if (this.scene && this.scene.handleFireFromReact) {
      this.scene.handleFireFromReact();
    }
  }

  setPower(v) {
    if (this.scene && this.scene.handlePowerFromReact) {
      this.scene.handlePowerFromReact(v);
    }
  }

  setAngle(v) {
    if (this.scene && this.scene.handleAngleFromReact) {
      this.scene.handleAngleFromReact(v);
    }
  }

  selectWeapon(idx) {
    if (this.scene && this.scene.handleWeaponSelectFromReact) {
      this.scene.handleWeaponSelectFromReact(idx);
    }
  }

  moveLeft() {
    if (this.scene && this.scene.handleMoveLeftFromReact) {
      this.scene.handleMoveLeftFromReact();
    }
  }

  moveRight() {
    if (this.scene && this.scene.handleMoveRightFromReact) {
      this.scene.handleMoveRightFromReact();
    }
  }

  exit() {
    if (this.scene && this.scene.handleExitFromReact) {
      this.scene.handleExitFromReact();
    }
  }

  // ── N-player: mark a player as eliminated ──
  setPlayerEliminated(index, placement) {
    const players = [...this.state.players];
    if (players[index]) {
      players[index] = { ...players[index], alive: false, placement };
    }
    const isMe = (index === this.state.myPlayerIndex);
    Object.assign(this.state, {
      players,
      isEliminated: isMe ? true : this.state.isEliminated,
      eliminatedPlacement: isMe ? placement : this.state.eliminatedPlacement,
    });
    this.dirty = true;
  }

  // ── Callback setters (Phaser notifies React of game events) ──

  set onReady(fn) { this._onReady = fn; }
  set onGameOver(fn) { this._onGameOver = fn; }
  set onRoundEnd(fn) { this._onRoundEnd = fn; }
  set onMatchEnd(fn) { this._onMatchEnd = fn; }
  set onOpponentLeft(fn) { this._onOpponentLeft = fn; }
  set onMatchSettled(fn) { this._onMatchSettled = fn; }
  set onEliminated(fn) { this._onEliminated = fn; }

  // ── Phaser calls these to notify React ──

  notifyReady() {
    if (this._onReady) this._onReady();
  }

  notifyGameOver(data) {
    if (this._onGameOver) this._onGameOver(data);
  }

  notifyRoundEnd(data) {
    if (this._onRoundEnd) this._onRoundEnd(data);
  }

  notifyMatchEnd(data) {
    if (this._onMatchEnd) this._onMatchEnd(data);
  }

  notifyOpponentLeft() {
    if (this._onOpponentLeft) this._onOpponentLeft();
  }

  notifyMatchSettled(data) {
    if (this._onMatchSettled) this._onMatchSettled(data);
  }

  notifyEliminated(data) {
    if (this._onEliminated) this._onEliminated(data);
  }

  /**
   * Reset bridge state for new game.
   */
  reset() {
    this.state = {
      players: [],
      myPlayerIndex: -1,
      currentPlayerIndex: 0,
      tank1: { x: 0, y: 0, hp: 250, angle: 45, power: 60, name: '', color: '#FF0000', score: 0 },
      tank2: { x: 0, y: 0, hp: 250, angle: 45, power: 60, name: '', color: '#0066FF', score: 0 },
      activeTank: 0,
      wind: 0,
      gold: 0,
      round: 1,
      totalRounds: 5,
      gameOver: false,
      moveSteps: 4,
      currentWeaponIndex: 0,
      weapons: [],
      isPlayerTurn: false,
      isFiring: false,
      wager: 0,
      potDisplay: 0,
      isEliminated: false,
      eliminatedPlacement: null,
    };
    this.dirty = true;
    this.scene = null;
  }
}

export default GameBridge;
