# AI Practice Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Single-player "Practice vs AI" mode where a player battles "Shot Bot" (white tank, server-side AI) to learn the game — no second player needed, stats not recorded.

**Architecture:** Server-side AI. Shot Bot is a fake player injected into a normal room with a synthetic socket ID (`ai-bot-{roomId}`). When it's Shot Bot's turn, the server calculates aim + weapon selection, calls `processShot()` directly, and broadcasts `turnResult` like any human fire. The client doesn't know it's playing a bot — same socket events, same animations.

**Tech Stack:** Node.js server (Socket.IO + existing physics engine), React client (existing MenuScreen + BattleScreen + HUD)

---

## Task 1: Add White Tank Color for Shot Bot

**Files:**
- Modify: `client/src/data/colors.js`

**Step 1: Add WHITE color entry**

Add to the `TANK_COLORS` array:
```javascript
{ id: 8, name: 'WHITE', hex: '#FFFFFF', phaserHex: 0xFFFFFF },
```

This color won't appear in the player color picker — it's reserved for Shot Bot only.

**Step 2: Commit**
```bash
git add client/src/data/colors.js
git commit -m "feat(ai): add white tank color for Shot Bot"
```

---

## Task 2: Create AI Service — `server/services/ai.js`

**Files:**
- Create: `server/services/ai.js`

This is the brain of Shot Bot. It handles weapon selection and aiming.

**Step 1: Create the AI service**

```javascript
// server/services/ai.js
// Shot Bot AI — server-side opponent for practice mode

import { WEAPON_DATA } from './physics.js';

// ── Calibration state per room ──
// Tracks how "dialed in" the bot is on the opponent's position.
// Resets partially when opponent moves.
const calibration = {}; // { roomId: { errorFactor, lastTargetX, shotCount } }

/**
 * Initialize calibration for a new AI match.
 */
export function initAI(roomId) {
    calibration[roomId] = {
        errorFactor: 1.0,   // 1.0 = max inaccuracy, 0.0 = perfect
        lastTargetX: null,
        lastTargetY: null,
        shotCount: 0,
    };
}

/**
 * Clean up AI state for a room.
 */
export function cleanupAI(roomId) {
    delete calibration[roomId];
}

/**
 * Pick a weapon from inventory based on context.
 * Weapon-aware: uses terrain weapons defensively, damage weapons offensively.
 */
export function pickWeapon(inventory, aiPos, targetPos, terrain) {
    if (!inventory || inventory.length === 0) return 0; // Single Shot fallback

    const dx = Math.abs(targetPos.x - aiPos.x);
    const isAbove = aiPos.y < targetPos.y - 30; // AI is on higher ground
    const hasLineOfSight = checkLineOfSight(aiPos, targetPos, terrain);

    // Categorize available weapons
    const damage = [];
    const defensive = [];
    const utility = [];

    for (const weaponId of inventory) {
        const w = WEAPON_DATA[weaponId];
        if (!w) continue;

        switch (w.type) {
            case 'wall':
            case 'terrain_create':
                defensive.push(weaponId);
                break;
            case 'roller':
            case 'tunnel':
                utility.push(weaponId);
                break;
            default:
                damage.push(weaponId);
                break;
        }
    }

    // Decision logic
    const roll = Math.random();

    // 15% chance to use defensive weapon if available (early/mid game)
    if (roll < 0.15 && defensive.length > 0) {
        return defensive[Math.floor(Math.random() * defensive.length)];
    }

    // Use roller/tunnel when on higher ground or far away
    if (utility.length > 0 && (isAbove || dx > 600) && roll < 0.4) {
        return utility[Math.floor(Math.random() * utility.length)];
    }

    // Default: pick a damage weapon
    if (damage.length > 0) {
        return damage[Math.floor(Math.random() * damage.length)];
    }

    // Fallback
    return inventory[Math.floor(Math.random() * inventory.length)];
}

/**
 * Calculate aim (angle + power) toward target with probabilistic accuracy.
 *
 * Not a fixed ramp — each shot has variance. Calibration shifts the bell curve
 * toward better accuracy over time, but any shot can be lucky or bad.
 */
export function calculateAim(roomId, aiPos, targetPos, wind, weaponId) {
    const cal = calibration[roomId];
    if (!cal) return { angle: 45, power: 50 }; // fallback

    const w = WEAPON_DATA[weaponId];

    // ── Recalibrate if target moved ──
    if (cal.lastTargetX !== null) {
        const targetDx = Math.abs(targetPos.x - cal.lastTargetX);
        const targetDy = Math.abs(targetPos.y - (cal.lastTargetY || targetPos.y));
        if (targetDx > 30 || targetDy > 20) {
            // Target moved significantly — partially reset accuracy
            cal.errorFactor = Math.min(1.0, cal.errorFactor + 0.3 + Math.random() * 0.2);
            cal.shotCount = Math.max(0, cal.shotCount - 2);
        }
    }
    cal.lastTargetX = targetPos.x;
    cal.lastTargetY = targetPos.y;

    // ── Calculate "perfect" angle and power ──
    const dx = targetPos.x - aiPos.x;
    const dy = targetPos.y - aiPos.y; // negative = target is above
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Simple artillery angle: aim toward target with arc
    // atan2 gives direct angle; we add loft for arc
    const directAngle = Math.atan2(-dy, Math.abs(dx)) * (180 / Math.PI);
    // Add loft — more distance = higher arc
    const loft = Math.min(25, dist / 40);
    let perfectAngle = directAngle + loft;

    // Flip angle if target is to the left
    if (dx < 0) {
        perfectAngle = 180 - perfectAngle;
    }

    // Clamp to valid range
    perfectAngle = Math.max(0, Math.min(180, perfectAngle));

    // Power: proportional to distance, with gravity factor
    const perfectPower = Math.min(100, Math.max(10, dist / 10));

    // ── Wind compensation (AI applies ~60% of correction) ──
    const windCorrection = wind * 0.6 * 0.15; // rough angle adjustment for wind
    perfectAngle -= windCorrection;
    perfectAngle = Math.max(0, Math.min(180, perfectAngle));

    // ── Apply probabilistic error ──
    // Base error influenced by calibration, but always with variance
    const baseAngleError = 20; // max degrees off at worst
    const basePowerError = 25; // max % off at worst

    // Error factor decays with shots but has randomness
    // Sometimes a shot is lucky (low error), sometimes bad (high error)
    const shotLuck = Math.random(); // 0 = very lucky, 1 = very unlucky
    const effectiveError = cal.errorFactor * (0.3 + shotLuck * 0.7);

    const angleError = (Math.random() * 2 - 1) * baseAngleError * effectiveError;
    const powerError = (Math.random() * 2 - 1) * basePowerError * effectiveError;

    const finalAngle = Math.max(0, Math.min(180, perfectAngle + angleError));
    const finalPower = Math.max(5, Math.min(100, perfectPower + powerError));

    // ── Update calibration for next shot ──
    cal.shotCount++;
    // Calibration improves: rapid at first, then diminishing
    // But never reaches 0 — always some error
    const improvement = 0.15 + Math.random() * 0.1; // 15-25% improvement per shot
    cal.errorFactor = Math.max(0.15, cal.errorFactor - improvement);

    // ── Special weapon overrides ──
    if (w && w.type === 'homing') {
        // Heatseeker: just aim vaguely toward target, it'll track
        return {
            angle: Math.max(0, Math.min(180, perfectAngle + (Math.random() * 10 - 5))),
            power: Math.max(30, Math.min(80, perfectPower + (Math.random() * 10 - 5))),
        };
    }

    if (w && w.type === 'wall') {
        // Magic Wall: place between self and opponent, closer to self
        const wallX = aiPos.x + dx * (0.2 + Math.random() * 0.15);
        const wallDx = wallX - aiPos.x;
        const wallAngle = dx > 0
            ? Math.max(20, Math.min(80, Math.atan2(50, Math.abs(wallDx)) * (180 / Math.PI)))
            : Math.max(100, Math.min(160, 180 - Math.atan2(50, Math.abs(wallDx)) * (180 / Math.PI)));
        return {
            angle: wallAngle,
            power: Math.max(15, Math.min(60, Math.abs(wallDx) / 8)),
        };
    }

    if (w && w.type === 'terrain_create') {
        // Dirt Ball: bury opponent — aim at them with medium power
        return {
            angle: Math.max(0, Math.min(180, perfectAngle + (Math.random() * 8 - 4))),
            power: Math.max(20, Math.min(80, perfectPower + (Math.random() * 8 - 4))),
        };
    }

    return { angle: Math.round(finalAngle * 10) / 10, power: Math.round(finalPower) };
}

/**
 * Auto-buy weapons for Shot Bot during shop phase.
 * Spends full gold budget on a random mix.
 */
export function autoBuyWeapons(goldBudget) {
    const weaponIds = Object.keys(WEAPON_DATA).map(Number).filter(id => id !== 0);
    const inventory = [0]; // Always start with Single Shot (free, infinite)
    let remaining = goldBudget;

    // Weapon prices (from client weapons.js, mirrored here)
    const PRICES = {
        25: 150, 12: 150, 20: 200, 2: 200, 10: 200,
        5: 350, 15: 400, 7: 400, 11: 500, 1: 600,
        17: 600, 4: 700, 16: 700, 9: 2500,
    };

    // Shuffle weapon list for variety
    const shuffled = weaponIds
        .filter(id => PRICES[id] && PRICES[id] <= remaining)
        .sort(() => Math.random() - 0.5);

    for (const id of shuffled) {
        const price = PRICES[id];
        if (!price || price > remaining) continue;
        inventory.push(id);
        remaining -= price;
        // Allow buying duplicates occasionally (30% chance)
        if (remaining >= price && Math.random() < 0.3) {
            inventory.push(id);
            remaining -= price;
        }
        if (remaining < 150) break; // can't afford anything else
    }

    return inventory;
}

/**
 * Check rough line of sight between two positions using terrain.
 */
function checkLineOfSight(from, to, terrain) {
    if (!terrain) return true;
    const steps = Math.abs(to.x - from.x) / 20;
    const dx = (to.x - from.x) / steps;
    const dy = (to.y - from.y) / steps;
    for (let i = 1; i < steps; i++) {
        const x = Math.floor(from.x + dx * i);
        const y = from.y + dy * i;
        if (x >= 0 && x < terrain.length && terrain[x] < y - 30) {
            return false; // terrain blocks line of sight
        }
    }
    return true;
}
```

**Step 2: Commit**
```bash
git add server/services/ai.js
git commit -m "feat(ai): create Shot Bot AI service with probabilistic aiming"
```

---

## Task 3: Wire AI Match Creation in Server

**Files:**
- Modify: `server/socket-io/main.js`

**Step 1: Import AI service at top of file**

Add alongside existing imports:
```javascript
import { initAI, cleanupAI, pickWeapon, calculateAim, autoBuyWeapons } from '../services/ai.js';
```

**Step 2: Add `createAIMatch` socket handler**

Add after the existing `createRoom` handler (after line ~1601). This creates a room, injects Shot Bot, and immediately starts the match flow.

```javascript
client.on('createAIMatch', safeHandler(async function(data) {
    if (!data || typeof data !== 'object' || !data.player) return;
    const { player } = data;

    // Clean up any existing room
    if (client.roomId !== null) {
        client.leave(client.roomId);
        await removeRoom(client.roomId);
    }

    const creatorHandle = playerUids[client.id]?.handle || sanitizeName(player.name || 'Player');
    const roomId = crypto.randomBytes(4).toString('hex');
    client.join(roomId);
    client.roomId = roomId;
    client.isHost = true;

    const AI_SOCKET_ID = `ai-bot-${roomId}`;

    const humanSlot = {
        name: creatorHandle,
        color: player.color || 0xFF0000,
        socketId: client.id,
        isReady: true,
        playAgain: false,
        pos: null,
        isHost: true,
    };

    const aiSlot = {
        name: 'Shot Bot',
        color: 0xFFFFFF, // White
        socketId: AI_SOCKET_ID,
        isReady: true,
        playAgain: false,
        pos: null,
        isHost: false,
        isAI: true,
    };

    const roomData = {
        roomId,
        players: [humanSlot, aiSlot],
        maxPlayers: 2,
        active: true,
        wager: 0,
        matchMode: 'practice',
        totalRounds: 1,
        isAIMatch: true,
    };

    rooms.set(roomId, roomData);
    matchStates[roomId] = createMatchState(roomId, '1', 2);

    // Initialize AI calibration
    initAI(roomId);

    // Initialize gold + inventories for both players
    const playerIds = [client.id, AI_SOCKET_ID];
    goldStates[roomId] = initGold(playerIds);

    // AI auto-buys weapons
    const aiInventory = autoBuyWeapons(1000);
    weaponInventories[roomId] = {
        [client.id]: [0], // Human starts with Single Shot, will buy in shop
        [AI_SOCKET_ID]: aiInventory,
    };

    // Emit shopPhase to human player (AI already has its weapons)
    const ms = matchStates[roomId];
    transitionState(ms, MATCH_STATES.WEAPON_SHOP);

    const weapons = getAllLaunchWeapons();
    const shopDuration = 25; // Practice shop timer

    client.emit('shopPhase', {
        weapons,
        goldBalance: { [client.id]: getBalance(goldStates[roomId], client.id) },
        inventory: { [client.id]: [0] },
        timer: shopDuration,
        totalRounds: 1,
        round: 1,
        isAIMatch: true,
    });

    // Shop timer — when it ends, finalize shop and start battle
    shopReady[roomId] = { [client.id]: false, [AI_SOCKET_ID]: true }; // AI is always ready
    if (shopTimers[roomId]) clearTimeout(shopTimers[roomId]);
    shopTimers[roomId] = setTimeout(() => {
        endShopPhase(io, roomId);
    }, shopDuration * 1000);
}));
```

**Step 3: Mark AI shop as ready when human finishes shopping**

In the existing `shopDone` handler, the AI's shop is already marked ready in `shopReady`. No changes needed — the existing logic checks `Object.values(shopReady[roomId]).every(Boolean)` which will work since AI is pre-set to `true`.

**Step 4: Add AI turn execution after turn changes**

Create a helper function and call it after every turn change (after `turnResult` is emitted, and after `terrainGenerated`):

```javascript
/**
 * If it's Shot Bot's turn, execute its move after a short delay.
 */
function scheduleAITurn(io, roomId) {
    const room = findRoom(roomId);
    if (!room || !room.isAIMatch) return;

    const ms = matchStates[roomId];
    if (!ms || ms.status !== MATCH_STATES.BATTLE) return;

    const AI_SOCKET_ID = `ai-bot-${roomId}`;
    if (ms.currentTurn !== AI_SOCKET_ID) return;

    // Short delay (500-1000ms) so it doesn't feel instant
    const delay = 500 + Math.floor(Math.random() * 500);

    setTimeout(() => {
        executeAITurn(io, roomId);
    }, delay);
}

function executeAITurn(io, roomId) {
    const room = findRoom(roomId);
    if (!room || !room.isAIMatch) return;

    const ms = matchStates[roomId];
    if (!ms || ms.status !== MATCH_STATES.BATTLE) return;

    const AI_SOCKET_ID = `ai-bot-${roomId}`;
    if (ms.currentTurn !== AI_SOCKET_ID) return;

    // Find AI and human positions
    const aiSlot = room.players.find(p => p.socketId === AI_SOCKET_ID);
    const humanSlot = room.players.find(p => p.socketId !== AI_SOCKET_ID && ms.alive[p.socketId]);
    if (!aiSlot?.pos || !humanSlot?.pos) return;

    // Pick weapon
    const inventory = weaponInventories[roomId]?.[AI_SOCKET_ID] || [0];
    const weaponId = pickWeapon(inventory, aiSlot.pos, humanSlot.pos, room.heightmap);

    // Calculate aim
    const { angle, power } = calculateAim(roomId, aiSlot.pos, humanSlot.pos, room.wind || 0, weaponId);

    // Consume weapon from inventory (unless Single Shot id=0)
    if (weaponId !== 0) {
        const inv = weaponInventories[roomId]?.[AI_SOCKET_ID];
        if (inv) {
            const idx = inv.indexOf(weaponId);
            if (idx !== -1) inv.splice(idx, 1);
        }
    }

    // Increment turn sequence nonce
    ms.turnSequence++;

    // Run server physics
    const tanks = room.players
        .filter(p => p.pos && ms.alive[p.socketId])
        .map(p => ({ id: p.socketId, x: p.pos.x, y: p.pos.y, width: 40, height: 30 }));

    const terrain = room.heightmap || new Array(1200).fill(400);

    const result = processShot({
        angle,
        power,
        weaponId,
        startX: aiSlot.pos.x,
        startY: aiSlot.pos.y,
        shooterId: AI_SOCKET_ID,
        terrain,
        tanks,
        wind: room.wind || 0,
    });

    // Update server terrain
    room.heightmap = result.newTerrain;

    // Update tank Y positions
    for (const p of room.players) {
        if (p.pos) {
            const px = Math.min(1199, Math.max(0, Math.floor(p.pos.x)));
            p.pos.y = result.newTerrain[px] - 15;
        }
    }

    // Update match state (HP, scores, kills, eliminations)
    let goldEarned = 0;
    for (const [playerId, dmg] of Object.entries(result.damage)) {
        if (playerId !== AI_SOCKET_ID && dmg > 0) {
            ms.scores[AI_SOCKET_ID] = (ms.scores[AI_SOCKET_ID] || 0) + dmg;
        }
    }
    for (const [playerId, dmg] of Object.entries(result.damage)) {
        if (ms.hp[playerId] === undefined) ms.hp[playerId] = 250;
        const hpBefore = ms.hp[playerId];
        ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg));
        if (hpBefore > 0 && ms.hp[playerId] <= 0 && playerId !== AI_SOCKET_ID) {
            ms.kills[AI_SOCKET_ID] = (ms.kills[AI_SOCKET_ID] || 0) + 1;
        }
    }

    // Gold for AI (doesn't matter but keeps state consistent)
    const gold = goldStates[roomId];
    if (gold) {
        for (const [playerId, dmg] of Object.entries(result.damage)) {
            if (playerId !== AI_SOCKET_ID && dmg > 0) {
                goldEarned += earnGold(gold, AI_SOCKET_ID, dmg);
            }
        }
    }

    // Elimination detection
    const newlyEliminated = [];
    for (const pid of ms.players) {
        if (!result.damage?.[pid]) continue;
        if (ms.hp[pid] <= 0 && ms.alive[pid]) {
            ms.alive[pid] = false;
            ms.eliminationOrder.push(pid);
            newlyEliminated.push(pid);
        }
    }
    for (const pid of newlyEliminated) {
        if (gold) awardKillBonus(gold, AI_SOCKET_ID);
        io.sockets.in(roomId).emit('playerEliminated', {
            eliminatedId: pid,
            killedById: AI_SOCKET_ID,
            survivingPlayers: ms.players.filter(id => ms.alive[id]),
        });
    }

    // Advance turn
    ms.turnCount++;
    ms.currentTurn = getNextTurn(ms);

    // Trajectory optimization
    const thinTrajectory = (pts) => {
        if (!pts || pts.length <= 2) return pts;
        const out = [];
        for (let i = 0; i < pts.length; i += 2) out.push(pts[i]);
        if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
        return out;
    };

    const hitSomething = result.impact && result.impact.type !== 'outOfBounds';
    const hasSubEffects = !!(result.scatterPoints || result.spiderLegs || result.tunnelExit);
    const isTerrainWeapon = weaponId === 25 || weaponId === 12;
    const terrainChanged = hitSomething || hasSubEffects || isTerrainWeapon;

    // Broadcast turnResult — identical format to human fire
    io.sockets.in(roomId).emit('turnResult', {
        playerId: AI_SOCKET_ID,
        weaponId,
        trajectory: thinTrajectory(result.trajectory),
        impact: result.impact,
        damage: result.damage,
        terrainUpdate: terrainChanged ? result.newTerrain : null,
        scores: ms.scores,
        hp: ms.hp,
        nextTurn: ms.currentTurn,
        seq: ms.turnSequence,
        goldEarned,
        goldBalance: goldStates[roomId] || {},
        players: ms.players.map(id => {
            const slot = room.players.find(p => p.socketId === id);
            return { socketId: id, pos: slot ? slot.pos : null, hp: ms.hp[id] ?? 0, alive: ms.alive[id] ?? false };
        }),
        alive: ms.alive,
        currentPlayerIndex: ms.currentPlayerIndex,
        positions: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })),
        tankPositions: {
            host: room.players[0]?.pos ? { x: room.players[0].pos.x, y: room.players[0].pos.y } : null,
            player: room.players[1]?.pos ? { x: room.players[1].pos.x, y: room.players[1].pos.y } : null,
            hostId: room.players[0]?.socketId || null,
        },
        scatterPoints: result.scatterPoints || null,
        subTrajectories: result.subTrajectories ? result.subTrajectories.map(thinTrajectory) : null,
        spiderLegs: result.spiderLegs || null,
        tunnelEntry: result.tunnelEntry || null,
        tunnelExit: result.tunnelExit || null,
    });

    // Restart turn timer
    if (!isRoundOver(ms)) {
        startTurnTimer(io, roomId);
        // Schedule next AI turn if it's still AI's turn
        scheduleAITurn(io, roomId);
    }

    // Check round/match end (reuse existing logic)
    if (isRoundOver(ms)) {
        clearTurnTimer(roomId);
        const ranked = getRoundPlacement(ms);
        const matchResult = isMatchOver(ms);
        const ROUND_END_DELAY = 3000;

        if (matchResult.isOver) {
            transitionState(ms, MATCH_STATES.COMPLETE); // No settlement for AI matches

            const formattedScores = {};
            for (const pid of ms.players) {
                formattedScores[pid] = {
                    damageDealt: ms.scores[pid] || 0,
                    kills: ms.kills[pid] || 0,
                };
            }

            setTimeout(() => {
                io.sockets.in(roomId).emit('matchEnd', {
                    winner: matchResult.winner,
                    survivorOrder: ranked,
                    scores: formattedScores,
                    roundWins: ms.roundWins,
                    goldBalance: goldStates[roomId] || {},
                    settlement: null,
                    wager: 0,
                    shotEarned: {},
                    isAIMatch: true, // Client uses this to show "Practice — stats not recorded"
                });
                // Cleanup
                cleanupAI(roomId);
            }, ROUND_END_DELAY);
        }
    }
}
```

**Step 5: Hook `scheduleAITurn` into terrain generation**

In the `requestTerrain` handler, after the `io.sockets.in(client.roomId).emit('terrainGenerated', ...)` line (around line 3230), add:

```javascript
// If AI match and it's AI's turn first, schedule AI move
scheduleAITurn(io, client.roomId);
```

**Step 6: Hook `scheduleAITurn` into human fire handler**

In the existing `fire` handler, after the `turnResult` is emitted and the turn timer is restarted (around the `startTurnTimer` call near line 2835), add:

```javascript
// Schedule AI turn if next turn is AI's
scheduleAITurn(io, this.roomId);
```

**Step 7: Skip stats persistence for AI matches**

In the match-end settlement block (around line 2859), wrap the stats/SHOT milestone section with:

```javascript
// Skip stats and SHOT milestones for AI practice matches
if (!room.isAIMatch) {
    // ... existing recordMatchPlayed, persistStats, milestone code ...
}
```

**Step 8: Clean up AI state on room removal**

In the `removeRoom` function, add:
```javascript
cleanupAI(roomId);
```

**Step 9: Commit**
```bash
git add server/socket-io/main.js
git commit -m "feat(ai): wire Shot Bot into server match flow"
```

---

## Task 4: Add "VS SHOT BOT" Button to Menu Screen

**Files:**
- Modify: `client/src/screens/MenuScreen.js`

**Step 1: Add nav item**

In the `navItems` array, add after 'PLAY FREE':

```javascript
{ id: 'ai-practice', label: 'VS SHOT BOT', variant: 'secondary', screen: 'ai-practice' },
```

**Step 2: Commit**
```bash
git add client/src/screens/MenuScreen.js
git commit -m "feat(ai): add VS SHOT BOT button to menu"
```

---

## Task 5: Create AI Practice Launcher Screen

**Files:**
- Create: `client/src/screens/AIPracticeScreen.js`
- Modify: `client/src/App.js`

**Step 1: Create AIPracticeScreen**

A minimal screen: pick your tank color, click "START". Emits `createAIMatch` and navigates to shop.

```javascript
// client/src/screens/AIPracticeScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import Button from '../components/Button';
import { TANK_COLORS } from '../data/colors';
import useIsMobile from '../hooks/useIsMobile';

// Player-selectable colors (exclude WHITE which is id: 8, reserved for Shot Bot)
const PLAYER_COLORS = TANK_COLORS.filter(c => c.id !== 8);

export default function AIPracticeScreen({ navigate }) {
    const isMobile = useIsMobile();
    const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0]);
    const [launching, setLaunching] = useState(false);

    const handleStart = useCallback(() => {
        if (launching) return;
        setLaunching(true);

        const socket = window.socket;
        if (!socket?.connected) {
            setLaunching(false);
            return;
        }

        socket.emit('createAIMatch', {
            player: {
                name: window.callsign || 'Player',
                color: selectedColor.phaserHex,
            },
        });
    }, [launching, selectedColor]);

    // Listen for shopPhase to navigate
    useEffect(() => {
        const socket = window.socket;
        if (!socket) return;

        const onShopPhase = (data) => {
            navigate('shop', { ...data, isAIMatch: true });
        };

        socket.on('shopPhase', onShopPhase);
        return () => socket.off('shopPhase', onShopPhase);
    }, [navigate]);

    const styles = {
        container: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg, #0a0a1a)',
            color: '#fff',
            gap: 20,
            padding: 20,
        },
        title: {
            fontSize: isMobile ? 20 : 28,
            fontWeight: 'bold',
            fontFamily: 'var(--font-display, monospace)',
            letterSpacing: 2,
        },
        subtitle: {
            fontSize: isMobile ? 11 : 14,
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
            maxWidth: 400,
        },
        colorGrid: {
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 300,
        },
        colorSwatch: (color, isSelected) => ({
            width: 36,
            height: 36,
            borderRadius: 6,
            background: color.hex,
            border: isSelected ? '3px solid #fff' : '2px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            transition: 'transform 0.15s',
            transform: isSelected ? 'scale(1.15)' : 'scale(1)',
        }),
        backBtn: {
            position: 'absolute',
            top: isMobile ? 8 : 16,
            left: isMobile ? 8 : 16,
        },
    };

    return (
        <div style={styles.container}>
            <div style={styles.backBtn}>
                <Button variant="ghost" onClick={() => navigate('menu')}>
                    {'< BACK'}
                </Button>
            </div>

            <div style={styles.title}>VS SHOT BOT</div>
            <div style={styles.subtitle}>
                Practice against the AI. Results don't count toward your stats.
            </div>

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                CHOOSE YOUR COLOR
            </div>
            <div style={styles.colorGrid}>
                {PLAYER_COLORS.map(c => (
                    <div
                        key={c.id}
                        style={styles.colorSwatch(c, selectedColor.id === c.id)}
                        onClick={() => setSelectedColor(c)}
                    />
                ))}
            </div>

            <Button
                variant="primary"
                onClick={handleStart}
                disabled={launching}
                style={{ marginTop: 12, padding: '12px 40px', fontSize: 16 }}
            >
                {launching ? 'LAUNCHING...' : 'START'}
            </Button>
        </div>
    );
}
```

**Step 2: Add route in App.js**

Import and add the screen case:

```javascript
import AIPracticeScreen from './screens/AIPracticeScreen';

// In renderScreen switch:
case 'ai-practice': return <AIPracticeScreen navigate={navigate} />;
```

**Step 3: Commit**
```bash
git add client/src/screens/AIPracticeScreen.js client/src/App.js
git commit -m "feat(ai): add AI practice launcher screen with color picker"
```

---

## Task 6: Pass `isAIMatch` Through Battle Flow

**Files:**
- Modify: `client/src/screens/battle/BattleScreen.js`
- Modify: `client/src/screens/WinScreen.js` (or equivalent)
- Modify: `client/src/screens/LoseScreen.js` (or equivalent)

**Step 1: Thread `isAIMatch` through screenData**

The `screenData` prop already flows through navigation. The `shopPhase` event includes `isAIMatch: true`, which gets passed to shop → battle → win/lose via `navigate()`.

In `BattleScreen.js`, no changes needed — it already receives and passes screenData through.

**Step 2: Show "Practice — stats not recorded" banner on win/lose screens**

In `WinScreen.js` and `LoseScreen.js`, check `screenData.isAIMatch` and display a banner:

```javascript
{screenData?.isAIMatch && (
    <div style={{
        background: 'rgba(255,255,255,0.1)',
        padding: '6px 16px',
        borderRadius: 8,
        fontSize: 12,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 12,
    }}>
        PRACTICE VS AI — STATS NOT RECORDED
    </div>
)}
```

**Step 3: Ensure "Play Again" returns to menu (not lobby) for AI matches**

On the win/lose screens, if `isAIMatch`, the "Play Again" button should navigate to `'ai-practice'` instead of `'lobby'`.

**Step 4: Commit**
```bash
git add client/src/screens/battle/BattleScreen.js client/src/screens/WinScreen.js client/src/screens/LoseScreen.js
git commit -m "feat(ai): show practice banner on AI match results, route back to AI lobby"
```

---

## Task 7: Handle AI Disconnect & Edge Cases

**Files:**
- Modify: `server/socket-io/main.js`

**Step 1: Skip disconnect/forfeit logic for AI player**

In the `disconnect` handler, the AI socket ID will never actually disconnect (it's not a real socket). But if the human disconnects from an AI match, we should clean up:

```javascript
// In disconnect handler, after finding the room:
if (room.isAIMatch) {
    cleanupAI(room.roomId);
    await removeRoom(room.roomId);
    return; // No forfeit/reconnect logic needed
}
```

**Step 2: Skip turn timer forfeit for AI**

In the turn timeout handler, if the timed-out player is the AI, skip forfeit and just advance (this shouldn't happen since AI fires within 1s, but defensive):

```javascript
// In turnTimeout handler:
if (room.isAIMatch && ms.currentTurn?.startsWith('ai-bot-')) {
    // AI timed out somehow — just skip its turn
    ms.turnCount++;
    ms.currentTurn = getNextTurn(ms);
    scheduleAITurn(io, roomId);
    return;
}
```

**Step 3: Don't broadcast AI rooms to lobby**

In `broadcastRooms`, filter out AI matches:

```javascript
const publicRooms = [...rooms.values()].filter(r => !r.isAIMatch);
```

**Step 4: Commit**
```bash
git add server/socket-io/main.js
git commit -m "feat(ai): handle AI disconnect cleanup and edge cases"
```

---

## Task 8: Integration Test — Manual Verification

**Steps:**
1. Start server: `node server/index.js`
2. Open browser to localhost
3. Click "VS SHOT BOT" on menu
4. Pick a color, click START
5. Buy weapons in shop, wait for timer
6. Verify: terrain loads, both tanks visible (yours + white Shot Bot)
7. Fire a shot — verify it animates and damage applies
8. Verify: Shot Bot fires back within ~1 second with trajectory animation
9. Play until match ends
10. Verify: win/lose screen shows "PRACTICE VS AI — STATS NOT RECORDED"
11. Verify: stats page (Barracks) was NOT updated
12. Click play again — returns to AI practice screen

**Step 2: Commit**
```bash
git commit --allow-empty -m "test(ai): manual verification of Shot Bot practice mode"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | White tank color | `colors.js` |
| 2 | AI brain service | `server/services/ai.js` (new) |
| 3 | Server wiring | `server/socket-io/main.js` |
| 4 | Menu button | `MenuScreen.js` |
| 5 | AI practice screen + routing | `AIPracticeScreen.js` (new), `App.js` |
| 6 | isAIMatch flow-through | `BattleScreen.js`, `WinScreen.js`, `LoseScreen.js` |
| 7 | Edge cases | `server/socket-io/main.js` |
| 8 | Manual verification | — |
