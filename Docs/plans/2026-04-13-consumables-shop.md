# SHOT Consumables Shop + Per-Match Drip — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a consumables shop where players burn SHOT tokens on 5-match power-ups, plus a per-match SHOT earning drip with daily cap, creating an evergreen token economy.

**Architecture:** Server tracks consumable state per player in MongoDB User model. Effects applied at match start (HP bonus, gold bonus, power cap). Client has a new Loadout screen for purchasing and a HUD overlay showing active consumables. Tactical Scope renders first 1/3 of real physics trajectory client-side.

**Tech Stack:** Node.js/Express server, MongoDB/Mongoose, React client, Phaser 3 (trajectory rendering)

---

## Task 1: Add Per-Match SHOT Drip to shot-token.js

**Files:**
- Modify: `server/services/shot-token.js`

**What:** Add per-match SHOT earnings on top of existing milestones. Daily cap of 25 SHOT per player.

**Step 1: Add constants and drip logic to `recordMatchPlayed`**

Add these constants near the top of the file (after PRESTIGE_TIERS):

```javascript
// Per-match SHOT drip — Litepaper v2.2
const SHOT_PER_WAGERED_MATCH = 2;
const SHOT_PER_WAGERED_WIN = 3;   // bonus on top of match drip
const SHOT_PER_PRACTICE_MATCH = 0.5;
const SHOT_PER_PRACTICE_WIN = 0.5;
const DAILY_SHOT_CAP = 25;
```

Inside `recordMatchPlayed`, after `state.totalMatchesPlayed++` (around line 282), add drip earnings:

```javascript
// Per-match SHOT drip (daily capped)
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
if (state._dailyDripDate !== today) {
    state._dailyDripDate = today;
    state._dailyDripTotal = 0;
}

let dripEarned = 0;
if (state._dailyDripTotal < DAILY_SHOT_CAP) {
    const isWagered = matchInfo.isWagered;
    const isWinner = matchInfo.isWinner;

    if (isWagered) {
        dripEarned += SHOT_PER_WAGERED_MATCH;
        if (isWinner) dripEarned += SHOT_PER_WAGERED_WIN;
    } else {
        dripEarned += SHOT_PER_PRACTICE_MATCH;
        if (isWinner) dripEarned += SHOT_PER_PRACTICE_WIN;
    }

    // Cap to daily limit
    dripEarned = Math.min(dripEarned, DAILY_SHOT_CAP - state._dailyDripTotal);
    state._dailyDripTotal += dripEarned;
    state.balance += dripEarned;
    state.totalShotEarned += dripEarned;
}
```

Add `dripEarned` to the return value alongside existing `earned` (milestone):

```javascript
return { earned: milestoneEarned + dripEarned, dripEarned, milestone, newBalance: state.balance, matchesPlayed: state.totalMatchesPlayed };
```

**Step 2: Commit**
```bash
git add server/services/shot-token.js
git commit -m "feat(10C): add per-match SHOT drip with 25/day cap"
```

---

## Task 2: Add Consumable Definitions + Server Service

**Files:**
- Create: `server/services/consumables.js`

**What:** Define the 5 consumables, purchase logic (burn SHOT), and match-start effect application.

```javascript
// server/services/consumables.js
// SHOT Consumables — temporary power-ups lasting 5 matches

export const CONSUMABLES = {
    extra_rations:     { id: 'extra_rations',     name: 'Extra Rations',     cost: 5,  duration: 5, desc: '+200G starting gold' },
    smoke_screen:      { id: 'smoke_screen',      name: 'Smoke Screen',      cost: 8,  duration: 5, desc: 'Blocks opponent Tactical Scope' },
    tactical_scope:    { id: 'tactical_scope',     name: 'Tactical Scope',    cost: 12, duration: 5, desc: 'Trajectory preview (1/3 arc)' },
    reinforced_armor:  { id: 'reinforced_armor',   name: 'Reinforced Armor',  cost: 18, duration: 5, desc: '+25 HP per match (275 total)' },
    overcharge:        { id: 'overcharge',          name: 'Overcharge',        cost: 25, duration: 5, desc: 'Power max 115 (15% extra range)' },
};

/**
 * Purchase a consumable. Deducts SHOT from player balance.
 * Returns { success, error?, remaining? }
 */
export function purchaseConsumable(playerShotState, consumableId) {
    const consumable = CONSUMABLES[consumableId];
    if (!consumable) return { success: false, error: 'Unknown consumable' };
    if (!playerShotState) return { success: false, error: 'No player state' };

    if (playerShotState.balance < consumable.cost) {
        return { success: false, error: 'Insufficient SHOT' };
    }

    // Deduct SHOT (burned)
    playerShotState.balance -= consumable.cost;
    playerShotState.shotBurned = (playerShotState.shotBurned || 0) + consumable.cost;

    // Add to active consumables
    if (!playerShotState.consumables) playerShotState.consumables = {};
    playerShotState.consumables[consumableId] = consumable.duration;

    return { success: true, remaining: playerShotState.consumables[consumableId] };
}

/**
 * Decrement consumable match counters after a match.
 * Removes expired consumables.
 */
export function decrementConsumables(playerShotState) {
    if (!playerShotState?.consumables) return;
    for (const [id, remaining] of Object.entries(playerShotState.consumables)) {
        if (remaining <= 1) {
            delete playerShotState.consumables[id];
        } else {
            playerShotState.consumables[id] = remaining - 1;
        }
    }
}

/**
 * Get active consumable IDs for a player.
 */
export function getActiveConsumables(playerShotState) {
    if (!playerShotState?.consumables) return [];
    return Object.keys(playerShotState.consumables);
}

/**
 * Check if a specific consumable is active.
 */
export function hasConsumable(playerShotState, consumableId) {
    return playerShotState?.consumables?.[consumableId] > 0;
}
```

**Step 2: Commit**
```bash
git add server/services/consumables.js
git commit -m "feat(10C): create consumables service with 5 power-ups"
```

---

## Task 3: Wire Consumable Purchase Handler in Server

**Files:**
- Modify: `server/socket-io/main.js`

**What:** Add `buyConsumable` socket handler. Player sends consumable ID, server validates SHOT balance, deducts, activates.

**Step 1: Import consumables service**

Near top of file with other imports:
```javascript
import { CONSUMABLES, purchaseConsumable, decrementConsumables, getActiveConsumables, hasConsumable } from '../services/consumables.js';
```

**Step 2: Add `buyConsumable` handler**

Add after the existing `buyWeapon` handler block:

```javascript
client.on('buyConsumable', (data) => {
    if (!data?.consumableId) return;

    const wallet = authenticatedWallets[client.id];
    if (!wallet) {
        client.emit('buyConsumableResult', { success: false, error: 'Not authenticated' });
        return;
    }

    const state = getPlayerShotState(wallet);
    if (!state) {
        client.emit('buyConsumableResult', { success: false, error: 'No SHOT state' });
        return;
    }

    const result = purchaseConsumable(state, data.consumableId);

    if (result.success) {
        saveMilestoneState(wallet); // persist to MongoDB
        trackShotBurn(CONSUMABLES[data.consumableId].cost);
        client.emit('buyConsumableResult', {
            success: true,
            consumableId: data.consumableId,
            remaining: result.remaining,
            newBalance: state.balance,
            activeConsumables: getActiveConsumables(state),
        });
    } else {
        client.emit('buyConsumableResult', { success: false, error: result.error });
    }
});
```

**Step 3: Apply consumable effects at match start**

In the `requestTerrain` handler, after `ms.hp[id] = 250` (around line 3577), add:

```javascript
// Apply consumable effects
const playerWallet = authenticatedWallets[id] || null;
const playerState = playerWallet ? getPlayerShotState(playerWallet) : null;
const activeConsumables = getActiveConsumables(playerState);

// Reinforced Armor: +25 HP
if (activeConsumables.includes('reinforced_armor')) {
    ms.hp[id] = 275;
}

// Store active consumables in match state for client access
if (!ms.consumables) ms.consumables = {};
ms.consumables[id] = activeConsumables;
```

In `initGold` call area (around line 1923 in ready handler), after gold is initialized:

```javascript
// Extra Rations: +200G starting gold
for (const pid of playerIds) {
    const pWallet = authenticatedWallets[pid] || null;
    const pState = pWallet ? getPlayerShotState(pWallet) : null;
    if (pState && hasConsumable(pState, 'extra_rations')) {
        goldStates[roomId][pid] += 200;
    }
}
```

**Step 4: Overcharge — raise server power validation cap**

In the fire handler power validation (around line 3649), change:

```javascript
// Before:
if (typeof power !== 'number' || !Number.isFinite(power) || power < 0 || power > 100) return

// After:
const maxPower = (ms?.consumables?.[this.id]?.includes('overcharge')) ? 115 : 100;
if (typeof power !== 'number' || !Number.isFinite(power) || power < 0 || power > maxPower) return
```

**Step 5: Decrement consumables after match end**

In the matchEnd path (after `recordMatchPlayed` is called for each player), add:

```javascript
decrementConsumables(playerShotState);
saveMilestoneState(wallet);
```

**Step 6: Include consumables in terrainGenerated payload**

Add `consumables: ms.consumables || {}` to the terrainGenerated payload so the client knows who has what.

**Step 7: Commit**
```bash
git add server/socket-io/main.js
git commit -m "feat(10C): wire consumable purchase, effects, and decrement in server"
```

---

## Task 4: Add LOADOUT Menu Button + Screen

**Files:**
- Modify: `client/src/screens/MenuScreen.js`
- Create: `client/src/screens/LoadoutScreen.js`
- Modify: `client/src/App.js`

**Step 1: Add nav item in MenuScreen**

In the `navItems` array, add before ARMORY:
```javascript
{ id: 'loadout', label: 'LOADOUT', variant: 'secondary', screen: 'loadout' },
```

**Step 2: Create LoadoutScreen.js**

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import Button from '../components/Button';
import useIsMobile from '../hooks/useIsMobile';

const CONSUMABLES = [
    { id: 'extra_rations',    name: 'Extra Rations',    cost: 5,  desc: '+200G starting gold', icon: 'G' },
    { id: 'smoke_screen',     name: 'Smoke Screen',     cost: 8,  desc: 'Blocks opponent Scope', icon: 'S' },
    { id: 'tactical_scope',   name: 'Tactical Scope',   cost: 12, desc: 'Trajectory preview', icon: 'T' },
    { id: 'reinforced_armor', name: 'Reinforced Armor', cost: 18, desc: '+25 HP (275 total)', icon: 'A' },
    { id: 'overcharge',       name: 'Overcharge',       cost: 25, desc: 'Power max 115', icon: 'O' },
];

export default function LoadoutScreen({ navigate }) {
    const isMobile = useIsMobile();
    const [shotBalance, setShotBalance] = useState(0);
    const [activeConsumables, setActiveConsumables] = useState({});
    const [buying, setBuying] = useState(null);

    // Request SHOT balance on mount
    useEffect(() => {
        const sock = window.socket;
        if (!sock) return;
        sock.emit('getShotInfo');
        const handler = (data) => {
            setShotBalance(data.balance || 0);
            if (data.consumables) setActiveConsumables(data.consumables);
        };
        sock.on('shotInfo', handler);
        return () => sock.off('shotInfo', handler);
    }, []);

    const buyConsumable = useCallback((consumableId) => {
        if (buying) return;
        setBuying(consumableId);
        const sock = window.socket;
        if (!sock) return;

        sock.emit('buyConsumable', { consumableId });

        const handler = (data) => {
            setBuying(null);
            if (data.success) {
                setShotBalance(data.newBalance);
                setActiveConsumables(prev => ({
                    ...prev,
                    [data.consumableId]: data.remaining,
                }));
            }
            sock.off('buyConsumableResult', handler);
        };
        sock.on('buyConsumableResult', handler);
    }, [buying]);

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', height: '100vh',
            background: 'var(--bg, #0a0a1a)', color: '#fff',
            padding: isMobile ? '12px 8px' : '20px', overflowY: 'auto',
        }}>
            <div style={{ position: 'absolute', top: isMobile ? 8 : 16, left: isMobile ? 8 : 16, zIndex: 2 }}>
                <Button variant="secondary" onClick={() => navigate('menu')}
                    style={{ padding: '6px 14px', fontSize: isMobile ? 11 : 13 }}>
                    {'< BACK'}
                </Button>
            </div>

            <div style={{
                fontFamily: "'Black Ops One', cursive", fontSize: isMobile ? 20 : 28,
                letterSpacing: 3, marginTop: isMobile ? 30 : 16, marginBottom: 4,
            }}>LOADOUT</div>

            <div style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 14,
                color: 'var(--am)', letterSpacing: 2, marginBottom: 16,
            }}>
                {shotBalance} SHOT
            </div>

            <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                width: '100%', maxWidth: 420,
            }}>
                {CONSUMABLES.map(c => {
                    const isActive = activeConsumables[c.id] > 0;
                    const remaining = activeConsumables[c.id] || 0;
                    const canAfford = shotBalance >= c.cost;

                    return (
                        <div key={c.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px',
                            background: isActive ? 'rgba(34, 139, 34, 0.15)' : 'rgba(42, 51, 31, 0.3)',
                            border: isActive ? '1px solid rgba(34, 139, 34, 0.4)' : '1px solid var(--ol)',
                            borderRadius: 6,
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 4,
                                background: isActive ? 'rgba(34, 139, 34, 0.3)' : 'rgba(255,255,255,0.05)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: "'Black Ops One', cursive", fontSize: 18,
                                color: isActive ? 'var(--sg)' : 'var(--kh)',
                            }}>
                                {c.icon}
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontFamily: "'Black Ops One', cursive", fontSize: 13,
                                    color: 'var(--bn)', letterSpacing: 1,
                                }}>{c.name}</div>
                                <div style={{
                                    fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                                    color: 'var(--kh)', letterSpacing: 1,
                                }}>{c.desc}</div>
                            </div>

                            {isActive ? (
                                <div style={{
                                    fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                                    color: 'var(--sg)', letterSpacing: 1, textAlign: 'right',
                                }}>
                                    ACTIVE<br />{remaining} LEFT
                                </div>
                            ) : (
                                <Button
                                    variant={canAfford ? 'primary' : 'disabled'}
                                    onClick={canAfford ? () => buyConsumable(c.id) : undefined}
                                    disabled={!canAfford || buying === c.id}
                                    style={{ padding: '6px 12px', fontSize: 11, whiteSpace: 'nowrap' }}
                                >
                                    {buying === c.id ? '...' : c.cost + ' SHOT'}
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
                color: 'rgba(255,255,255,0.3)', marginTop: 16, textAlign: 'center',
                letterSpacing: 1,
            }}>
                CONSUMABLES LAST 5 MATCHES — SHOT IS BURNED ON PURCHASE
            </div>
        </div>
    );
}
```

**Step 3: Add route in App.js**

Import and add case:
```javascript
import LoadoutScreen from './screens/LoadoutScreen';

case 'loadout': return <LoadoutScreen navigate={navigate} />;
```

**Step 4: Commit**
```bash
git add client/src/screens/MenuScreen.js client/src/screens/LoadoutScreen.js client/src/App.js
git commit -m "feat(10C): add Loadout screen with consumable cards and purchase flow"
```

---

## Task 5: Add Consumable Icons to HUD

**Files:**
- Modify: `client/src/screens/battle/PlayerHPBar.js`

**What:** Show small icons next to each player's HP bar for their active consumables. Visible to all players.

**Step 1: Add consumable icon row**

The `player` prop already receives data from GameBridge. We need to pass `consumables` array through. In `PlayerHPBar.js`, after the HP bar div, add:

```javascript
{/* Active consumable icons */}
{player?.consumables && player.consumables.length > 0 && (
    <div style={{
        display: 'flex', gap: 2, marginTop: 1,
    }}>
        {player.consumables.includes('reinforced_armor') && (
            <span title="Reinforced Armor" style={consumableIconStyle}>A</span>
        )}
        {player.consumables.includes('overcharge') && (
            <span title="Overcharge" style={consumableIconStyle}>O</span>
        )}
        {player.consumables.includes('tactical_scope') && (
            <span title="Tactical Scope" style={consumableIconStyle}>T</span>
        )}
        {player.consumables.includes('extra_rations') && (
            <span title="Extra Rations" style={consumableIconStyle}>G</span>
        )}
        {player.consumables.includes('smoke_screen') && (
            <span title="Smoke Screen" style={consumableIconStyle}>S</span>
        )}
    </div>
)}
```

Add style constant:
```javascript
const consumableIconStyle = {
    width: 14, height: 14, borderRadius: 2,
    background: 'rgba(34, 139, 34, 0.3)',
    border: '1px solid rgba(34, 139, 34, 0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8, color: 'var(--sg)', lineHeight: 1,
};
```

**Step 2: Pass consumables through GameBridge**

In `server/socket-io/main.js`, the `terrainGenerated` payload should include `consumables: ms.consumables || {}`. The client's MainScene receives this and passes it into the bridge's player state.

In `client/src/scenes/main/index.js`, in the `_pushStateToBridge` method, add consumables to each player entry:

```javascript
// In the players array mapping:
consumables: ms?.consumables?.[socketId] || [],
```

**Step 3: Commit**
```bash
git add client/src/screens/battle/PlayerHPBar.js client/src/scenes/main/index.js
git commit -m "feat(10C): show consumable icons on HP bars during battle"
```

---

## Task 6: Tactical Scope — Client Trajectory Preview

**Files:**
- Modify: `client/src/scenes/main/index.js`

**What:** When player has Tactical Scope active (and opponent doesn't have Smoke Screen), render first 1/3 of the physics trajectory as 2-3 dots from the barrel tip.

**Step 1: Add trajectory preview rendering**

In MainScene, add a method that calculates and draws preview dots:

```javascript
_renderScopePreview = () => {
    // Clean up previous preview
    if (this._scopeDots) {
        this._scopeDots.forEach(d => d.destroy());
        this._scopeDots = [];
    }

    // Check if local player has tactical_scope
    const myConsumables = this._myConsumables || [];
    if (!myConsumables.includes('tactical_scope')) return;

    // Check if any opponent has smoke_screen
    const opponents = (this._allConsumables || {});
    const opponentHasSmoke = Object.entries(opponents).some(
        ([id, cons]) => id !== window.socket?.id && cons.includes('smoke_screen')
    );
    if (opponentHasSmoke) return;

    const myTank = this.myPlayerIndex >= 0 ? this.tanks[this.myPlayerIndex] : null;
    if (!myTank?.turret || !myTank.active) return;

    const angle = myTank.turret.rotation;
    const power = myTank.power || 60;
    const wind = this.wind || 0;

    // Calculate trajectory using same physics as server
    const velocity = power * 8;
    const rotation = angle - Math.PI / 2;
    let vx = velocity * Math.cos(rotation);
    let vy = velocity * Math.sin(rotation);
    let x = myTank.turret.x;
    let y = myTank.turret.y;
    const gravity = 300;
    const dt = 1 / 60;

    // Simulate trajectory
    const points = [];
    for (let step = 0; step < 600; step++) {
        vy += gravity * dt;
        vx += wind * dt;
        x += vx * dt;
        y += vy * dt;
        points.push({ x, y });
        if (y > 800 || x < 0 || x > 1200) break;
    }

    // First 1/3 of trajectory
    const thirdLength = Math.floor(points.length / 3);
    if (thirdLength < 3) return;

    // Place 3 dots evenly in the first third
    this._scopeDots = [];
    for (let i = 1; i <= 3; i++) {
        const idx = Math.floor((thirdLength / 4) * i);
        if (idx >= points.length) break;
        const dot = this.add.circle(points[idx].x, points[idx].y, 3, 0x22ff22, 0.6);
        dot.setDepth(10);
        this._scopeDots.push(dot);
    }
};
```

**Step 2: Call it on every aim change**

In the pointermove handler (mouse-aim) and in handleAngleFromReact/handlePowerFromReact, call `this._renderScopePreview()` after updating angle/power.

Also call it in the `update()` loop if the player has scope active (to keep dots synced with keyboard aim changes).

**Step 3: Store consumable data from server**

In the `terrainGenerated` handler, save consumables:
```javascript
this._myConsumables = data.consumables?.[socket.id] || [];
this._allConsumables = data.consumables || {};
```

**Step 4: Clean up dots on turn change and fire**
```javascript
// In handleFireFromReact and turn switch:
if (this._scopeDots) {
    this._scopeDots.forEach(d => d.destroy());
    this._scopeDots = [];
}
```

**Step 5: Commit**
```bash
git add client/src/scenes/main/index.js
git commit -m "feat(10C): Tactical Scope renders first 1/3 trajectory as preview dots"
```

---

## Task 7: Overcharge — Client Power Cap Override

**Files:**
- Modify: `client/src/classes/Tank.js`
- Modify: `client/src/scenes/main/index.js`
- Modify: `client/src/screens/battle/PowerControl.js`

**What:** When Overcharge is active, power clamps to [1, 115] instead of [1, 100].

**Step 1: Tank.js — accept maxPower**

```javascript
// Modify setPower:
setPower = (power) => {
    power = Math.floor(power);
    const max = this.maxPower || 100;
    if (power > max) power = max;
    if (power < 1) power = 1;
    this.power = power;
    this.needEmitPowerChange = true;
};
```

**Step 2: MainScene — set maxPower from consumables**

In terrainGenerated handler, after setting consumables:
```javascript
if (this._myConsumables.includes('overcharge')) {
    const myTank = this.tanks[this.myPlayerIndex];
    if (myTank) myTank.maxPower = 115;
}
```

**Step 3: PowerControl.js — accept max prop**

Update the clamp to use `max` prop (default 100):
```javascript
const maxPower = max || 100;
// Replace all instances of 100 with maxPower in clamp logic
```

**Step 4: Mouse-aim power clamp — use 115 if overcharged**

In the pointermove handler:
```javascript
const maxPower = this._myConsumables?.includes('overcharge') ? 115 : 100;
const power = Math.round(Phaser.Math.Clamp((dist / MAX_DIST) * maxPower, 5, maxPower));
```

**Step 5: Commit**
```bash
git add client/src/classes/Tank.js client/src/scenes/main/index.js client/src/screens/battle/PowerControl.js
git commit -m "feat(10C): Overcharge raises power cap to 115"
```

---

## Task 8: Include consumables in getShotInfo handler

**Files:**
- Modify: `server/socket-io/main.js`

**What:** The `getShotInfo` handler sends SHOT balance to client. Add active consumables to the response.

Find the `getShotInfo` handler and add consumables:

```javascript
client.on('getShotInfo', () => {
    const wallet = authenticatedWallets[client.id];
    if (!wallet) { client.emit('shotInfo', { balance: 0 }); return; }
    const state = getPlayerShotState(wallet);
    client.emit('shotInfo', {
        balance: state?.balance || 0,
        prestige: getPrestigeInfo(wallet),
        consumables: state?.consumables || {},
    });
});
```

**Commit:**
```bash
git add server/socket-io/main.js
git commit -m "feat(10C): include consumables in getShotInfo response"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Per-match SHOT drip + daily cap | `shot-token.js` |
| 2 | Consumable definitions + service | `consumables.js` (new) |
| 3 | Server purchase handler + match effects | `main.js` |
| 4 | Loadout screen + menu button + routing | `LoadoutScreen.js` (new), `MenuScreen.js`, `App.js` |
| 5 | HUD consumable icons | `PlayerHPBar.js`, `main/index.js` |
| 6 | Tactical Scope trajectory preview | `main/index.js` |
| 7 | Overcharge power cap override | `Tank.js`, `main/index.js`, `PowerControl.js` |
| 8 | getShotInfo includes consumables | `main.js` |
