/**
 * Shootout per-match sim runner.
 *
 * Day 1 / Task 3: tick + snapshot loop landed.
 *
 * - One runner per active match. Constructor takes {match, io}.
 * - start() spins up two intervals:
 *     • TICK_HZ    = 60Hz physics tick. Reads each player's lastInput,
 *       calls integrateMovement, writes back. Pushes the post-step state
 *       into a per-player ring buffer (60 entries) so Day 2 lag-comp can
 *       rewind without re-running the sim.
 *     • SNAPSHOT_HZ = 20Hz broadcast. Builds a snapshot
 *       {tick, tMs, players:[{slot,x,y,z,yaw,pitch,alive}]} and emits to
 *       the match room `match:<matchId>`.
 * - stop() clears both intervals. Idempotent start/stop.
 * - setInput(slot, input) is the hook the socket layer calls when a
 *   shootout:input event lands. Latest-frame-wins per slot — we don't
 *   queue inputs (CK pattern; cheap; server is authoritative).
 *
 * Bots: Task 5 adds SimBot. The runner exposes _addBotsForEmptySlots()
 * which start() calls — if SimBot is available, empty slots get filled.
 *
 * Combat / fire / damage are Day 2. The runner has no concept of HP yet
 * — `alive: true` is hard-coded in the snapshot for now.
 *
 * Room contract: every snapshot/event broadcast goes to `match:<matchId>`.
 * Sockets only enter that room from shootout:joinMatch (gotcha #1 —
 * see socket-io/shootout.js). The runner never calls socket.join itself.
 */

import { integrateMovement, spawnStateForSlot, neutralInput } from './physics.js';
import { MOVEMENT_TUNING } from './tuning.js';
import { SimBot } from './simBot.js';
import { createHitboxSet, updateHitboxPositions, testHitscan } from './combat.js';
import { DamageSystem } from './damage.js';
import { weaponConfig, WeaponType } from './weapons.js';
import {
    Phase,
    createMatchState,
    advanceMatch,
    phaseDurationFor,
} from './match.js';
import { persistMatchStats } from '../stats.js';

const TICK_HZ        = 60;
const SNAPSHOT_HZ    = 20;

// CS:S-style kit prices. Keep in sync with KIT_PRICES in
// BillionaireBonkClub/shootout:visual/main.js — both client and server
// must agree on prices or the server's no_money guard would diverge.
export const KIT_PRICES = Object.freeze({ armour: 500, helmet: 1000 });
const TICK_MS        = 1000 / TICK_HZ;
const SNAPSHOT_MS    = 1000 / SNAPSHOT_HZ;
const TICK_DT        = 1 / TICK_HZ;
const RING_CAPACITY  = 60; // 1s of history @ 60Hz — Day 2 lag-comp scratch

// Day 3: per-round CS-style economy. Starting money is enough to buy a
// PISTOL upgrade (REVOLVER 600) on round 1; the +3000 win / +1900 loss
// awards trail close enough to CS economy that pacing feels right
// without us porting the full loss-streak ladder.
export const STARTING_MONEY  = 2000;
export const WIN_AWARD       = 3000;
export const LOSS_AWARD      = 1900;
// 2026-06-10 (Fish): per-kill award so 1v1 players can upgrade guns
// faster mid-match. 1v1 pays more than 2v2 because a 1v1 round only
// ever has one kill in it — kill+win lands a rifle (2500-3300) by
// round 2; the loser (1900+0) can still afford an SMG + armour.
export const KILL_AWARD_1V1  = 1500;
export const KILL_AWARD_2V2  = 1000;
const MONEY_CAP              = 16000;

// Day 3: roundState emit cadence. Transitions emit immediately; the
// periodic emit (~6Hz, every 10 ticks) keeps late-joining clients in
// sync without flooding (1/3 the rate of snapshots).
const ROUNDSTATE_TICKS = 10;

// Day 2 lag-comp: maximum rewind in ticks. Originally 15 (250ms) per
// the design brief; bumped to 45 (~750ms) 2026-06-08 after real-world
// MP testing surfaced consistent 'rewind_expired' rejections when
// socket.io falls back from WebSocket to long-polling under flaky
// connections — polling round-trip can easily exceed 250ms, leaving
// the client's last-known snapshot tick 20+ ticks behind realtime.
// 750ms is generous but bounded — wider lag-comp than CS:GO (200ms)
// at the cost of allowing slightly older 'reach-around-corner' kills.
// We can tighten once the connection layer is reliable WS-only.
const MAX_REWIND_TICKS = 45;
// Day 2 interp delay: 100ms / 6 ticks. Both client and server agree
// to render/resolve 6 ticks behind realtime so snapshots can interpolate.
const INTERP_DELAY_TICKS = 6;

// Approximate Mixamo-skeleton bone heights (meters) relative to feet at
// y=0. Synthesized from the client's PlayerModel proportions — these
// only need to be close enough for chest/head hitboxes to land where
// the visible character is. Crouching scales the standing heights to
// CROUCH_BONE_SCALE.
const BONE_HEIGHTS_STANDING = Object.freeze({
    Head:       1.65,
    Chest:      1.40,
    Spine:      1.15,
    'UpperArm.L': 1.42, 'Hand.L': 0.90,
    'UpperArm.R': 1.42, 'Hand.R': 0.90,
    'Thigh.L':   0.95,  'Foot.L': 0.05,
    'Thigh.R':   0.95,  'Foot.R': 0.05,
});
const CROUCH_BONE_SCALE = 0.7;
// Sideways offset for arms/legs (in meters, applied along the
// yaw-rotated right axis).
const BONE_SIDE_OFFSET = Object.freeze({
    Head: 0, Chest: 0, Spine: 0,
    'UpperArm.L': -0.22, 'Hand.L': -0.30,
    'UpperArm.R':  0.22, 'Hand.R':  0.30,
    'Thigh.L': -0.12, 'Foot.L': -0.12,
    'Thigh.R':  0.12, 'Foot.R':  0.12,
});

export class ShootoutRunner {
    constructor({ match, io }) {
        this.match    = match;
        this.io       = io;
        this.roomName = `match:${match.matchId}`;
        this.started  = false;

        // Per-slot player records. Populated by start(). Keyed by slot
        // (integer 0..cap-1) so we don't have to pair up by telegramUserId
        // on every tick.
        //
        // Shape:
        //   {
        //     slot, telegramUserId, isBot, bot?,
        //     state:      <physics state object, mutated each tick>
        //     lastInput:  <neutral until first shootout:input arrives>
        //     lastInputSeq: number
        //     alive:      boolean (always true for Day 1)
        //     ring:       Array<state-snapshot> length=RING_CAPACITY
        //     ringHead:   number — next write index in ring
        //   }
        this.players = new Map();

        this.tick    = 0;
        this.startMs = 0;
        this._tickInterval     = null;
        this._snapshotInterval = null;

        // Day 2: per-runner DamageSystem. Slots register on start().
        // Identifier is the slot number coerced to string so the
        // shared client/server damage code can lookup 'local' or any
        // slot consistently.
        this.damageSystem = new DamageSystem();

        // Day 3: round/match FSM. Owned by the runner; advanced each
        // tick. See sim/match.js. Members stamped here for downstream
        // consumers — the FSM itself only reads players Map.
        this.matchState = createMatchState({
            mode:    match?.mode,
            members: match?.members || [],
        });

        // Day 3: whether we've already broadcast match:final + initiated
        // stop. Guarded so a slow shutdown can't double-emit.
        this._matchFinalised = false;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    start() {
        if (this.started) return;
        this.started = true;
        this.tick    = 0;
        this.startMs = Date.now();

        // Seed humans
        for (const member of this.match.members) {
            this._addPlayer({
                slot: member.slot,
                telegramUserId: member.telegramUserId,
                // displayName was dropped here until 2026-06-10 — the
                // lobby formats real names (@username / first name) but
                // every stats row persisted as the 'tg-<id>' fallback
                // (Fish: leaderboard 'only shows TG and a number').
                // persistMatchStats $sets displayName per match, so the
                // old rows self-heal as each player plays again.
                displayName: member.displayName,
                team: member.team,
                isBot: false,
            });
        }

        // Seed bots into empty slots so 1v1 with one human is still a
        // 1v1, not a free roam.
        this._addBotsForEmptySlots();

        // Tick loop — physics step at 60Hz. We use setInterval rather
        // than a self-rescheduling setTimeout because per-match jitter
        // smoothing is cheap and the host server runs ~5 matches max in
        // practice (per CK precedent). Re-evaluate if we ever push past
        // ~50 concurrent matches.
        this._tickInterval = setInterval(() => this._runTick(), TICK_MS);
        // Snapshot broadcast — 20Hz. Separate interval so a slow tick
        // never starves snapshots and vice versa.
        this._snapshotInterval = setInterval(() => this._emitSnapshot(), SNAPSHOT_MS);
    }

    stop() {
        if (this._tickInterval)     { clearInterval(this._tickInterval);     this._tickInterval = null; }
        if (this._snapshotInterval) { clearInterval(this._snapshotInterval); this._snapshotInterval = null; }
        this.started = false;
    }

    // ── Player setup helpers ─────────────────────────────────────────

    _addPlayer({ slot, telegramUserId, isBot, bot, displayName, team }) {
        const state = spawnStateForSlot(this.match.mode, slot);
        const ring = new Array(RING_CAPACITY).fill(null);
        // Day 3: derive team from the explicit override (used by bot fill
        // which doesn't ship a member row) or from match.members. Falls
        // back to slot-parity (matches lifecycle.js's assignment rule).
        const resolvedTeam = team
            || this.match.members?.find((m) => m.slot === slot)?.team
            || (slot % 2 === 0 ? 'red' : 'blue');
        this.players.set(slot, {
            slot,
            telegramUserId,
            isBot:        !!isBot,
            bot:          bot || null,
            displayName:  displayName || null,
            team:         resolvedTeam,
            state,
            lastInput:    neutralInput(),
            lastInputSeq: 0,
            alive:        true,
            ring,
            ringHead:     0,
            // Day 3: per-match economy + scoring.
            money:        STARTING_MONEY,
            loadout:      null,        // weaponType the player has bought this match; null = default pistol
            kills:        0,
            deaths:       0,
        });
        // Day 2: register each slot in the per-runner DamageSystem so
        // resolveFire can apply HP loss. ID is the slot-as-string to
        // match the shape testHitscan expects in its targets array.
        this.damageSystem.registerPlayer(String(slot));
        // CS:S behaviour — every match starts with no kit. The damage
        // system defaults armor=100/hasHelmet=true; override so the
        // round-1 BUY phase greets the player with an empty loadout.
        const h = this.damageSystem.getHealth(String(slot));
        if (h) { h.armor = 0; h.hasHelmet = false; }
    }

    _addBotsForEmptySlots() {
        const cap = this.match.cap || this.match.members.length;
        const filled = new Set(this.match.members.map((m) => m.slot));
        let botIndex = 1;
        for (let slot = 0; slot < cap; slot++) {
            if (filled.has(slot)) continue;
            const bot = new SimBot({
                slot,
                mode: this.match.mode,
                difficulty: this.match.botDifficulty || 'soldier',
            });
            this._addPlayer({
                slot,
                telegramUserId: 0,
                isBot: true,
                bot,
                displayName: `BOT ${botIndex++}`,
            });
        }
    }

    // ── Day 3: buy menu ──────────────────────────────────────────────

    /**
     * Authoritative buy validation. Returns one of:
     *   { ok:true, weaponType, money }    on success
     *   { ok:false, reason: 'no_player' | 'not_buy_phase'
     *               | 'bad_weapon' | 'no_money' }
     *
     * Money is deducted on success; the player's `loadout` is set so the
     * runner can roll it into the round-start spawn (Day 4 task — for
     * now `loadout` is informational, but the socket layer broadcasts
     * it so the client can update its HUD/model immediately).
     */
    buyWeapon(slot, weaponType) {
        const p = this.players.get(slot);
        if (!p) return { ok: false, reason: 'no_player' };
        if (this.matchState.phase !== Phase.BUY) {
            return { ok: false, reason: 'not_buy_phase' };
        }

        // ── Kit items (armour / helmet) ─────────────────────────────
        // Wire field is still `weaponType` for back-compat; client may
        // pass 'armour' or 'helmet' to buy kit. Prices stay in sync
        // with the client's KIT_PRICES const in visual/main.js.
        if (weaponType === 'armour' || weaponType === 'helmet') {
            const price = weaponType === 'armour' ? KIT_PRICES.armour : KIT_PRICES.helmet;
            // No-op if already owned this round — no refund, no double-charge.
            const h = this.damageSystem.getHealth(String(slot));
            if (h) {
                if (weaponType === 'armour' && h.armor > 0)  return { ok: false, reason: 'already_owned' };
                if (weaponType === 'helmet' && h.hasHelmet)   return { ok: false, reason: 'already_owned' };
            }
            if (p.money < price) return { ok: false, reason: 'no_money' };
            if (!h) return { ok: false, reason: 'no_player' };
            p.money -= price;
            if (weaponType === 'armour') h.armor = 100;
            else                          h.hasHelmet = true;
            // Re-use the existing wire shape so the client handler doesn't
            // need a separate branch on the broadcast side.
            return { ok: true, weaponType, money: p.money };
        }

        // ── Weapon ──────────────────────────────────────────────────
        const wc = weaponConfig(weaponType);
        if (!wc) return { ok: false, reason: 'bad_weapon' };
        const price = Number.isFinite(wc.price) ? wc.price : 0;
        if (p.money < price) return { ok: false, reason: 'no_money' };
        p.money  -= price;
        p.loadout = weaponType;
        return { ok: true, weaponType, money: p.money };
    }

    // ── Input ────────────────────────────────────────────────────────

    /**
     * Update the latest input for a slot. Called by the socket layer
     * when a shootout:input event arrives. Out-of-order packets (seq <
     * lastInputSeq) are dropped so a late retransmit can't rewind the
     * player's input state.
     */
    setInput(slot, input) {
        const p = this.players.get(slot);
        if (!p) return false;
        const seq = Number.isFinite(input?.seq) ? input.seq : 0;
        // Drop genuinely out-of-order packets (a late retransmit is at
        // most a few frames behind) — but ACCEPT a big backwards jump:
        // that's a page reload (map-switch reload or mid-match F5 +
        // rejoin) whose seq counter restarted at 1. Before 2026-06-10
        // this dropped EVERY post-reload frame (lastInputSeq kept the
        // pre-reload high-water mark), freezing the player's avatar at
        // spawn for everyone else while their fire events (no seq gate)
        // kept working.
        const gap = p.lastInputSeq - seq;
        if (seq && gap > 0 && gap < 300) return false;
        // Client-authoritative position (added 2026-06-08). The client
        // runs full octree collision against the actual arena mesh; the
        // server only has simplified AABB cover boxes. Trusting the
        // client eliminates the server/client collision drift that was
        // teleporting players through walls, blocking doorways, and
        // dropping JJ into slopes. Pre-stakes only — add server speed
        // validation (clientX delta vs maxSpeed*dt) before any real-
        // money play.
        //
        // Fields are OPTIONAL. If absent or non-finite, the server falls
        // back to integrating from moveX/moveZ/jump/crouch — preserves
        // old-client compatibility + bot behaviour.
        const hasClientPos =
            Number.isFinite(input?.clientX) &&
            Number.isFinite(input?.clientY) &&
            Number.isFinite(input?.clientZ);
        p.lastInput = {
            seq,
            moveX:     input?.moveX     || 0,
            moveZ:     input?.moveZ     || 0,
            lookYaw:   Number.isFinite(input?.lookYaw)   ? input.lookYaw   : p.lastInput.lookYaw,
            lookPitch: Number.isFinite(input?.lookPitch) ? input.lookPitch : p.lastInput.lookPitch,
            jump:      !!input?.jump,
            crouch:    !!input?.crouch,
            // Optional client-auth position fields:
            clientX:        hasClientPos ? input.clientX : null,
            clientY:        hasClientPos ? input.clientY : null,
            clientZ:        hasClientPos ? input.clientZ : null,
            clientOnGround: hasClientPos ? !!input.clientOnGround : null,
        };
        p.lastInputSeq = seq;
        return true;
    }

    // ── Bot helpers ──────────────────────────────────────────────────

    /**
     * Pick the player a given bot should hunt. Strategy: nearest LIVE
     * non-bot opponent on the OTHER team. For 1v1 there's one human;
     * for 2v2 the bot picks the closer opponent. Returns null if no
     * valid target exists (e.g. only bots in the match).
     */
    _pickBotTarget(bot) {
        let best = null;
        let bestDist = Infinity;
        for (const other of this.players.values()) {
            if (other.slot === bot.slot) continue;
            if (other.isBot) continue;
            if (!other.alive) continue;
            if (other.team === bot.team) continue;
            const dx = other.state.x - bot.state.x;
            const dz = other.state.z - bot.state.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestDist) {
                bestDist = d2;
                best = {
                    x: other.state.x,
                    y: other.state.y,
                    z: other.state.z,
                    alive: !!other.alive,
                    slot: other.slot,
                };
            }
        }
        return best;
    }

    /**
     * After the bot has computed its movement input, check whether it
     * wants to fire this tick. On fire:
     *   - broadcast shootout:match:shot so all clients play the SFX
     *   - roll hit chance; on hit apply damage + broadcast match:hit
     *   - on miss, no further broadcast (the shot SFX is enough).
     */
    _processBotFire(p) {
        if (!p.isBot || !p.bot || !p.alive) return;
        if (this.matchState.phase !== Phase.LIVE) return;
        if (typeof p.bot.maybeFire !== 'function') return;
        const fire = p.bot.maybeFire(p.state, TICK_DT);
        if (!fire) return;

        // Broadcast the shot SFX trigger to all clients (mirrors what
        // the shootout:fire socket handler does for human shooters).
        this.io.to(this.roomName).emit('shootout:match:shot', {
            shooterSlot: p.slot,
            fromX:       fire.fromX,
            fromY:       fire.fromY,
            fromZ:       fire.fromZ,
            weaponType:  'AK47',
        });

        // Roll the hit chance. Coin-flip model matches the client SP
        // bot path — simpler than running a full lag-comp hitscan from
        // a synthetic ray + spread.
        if (Math.random() >= fire.hitChance) return;

        // Resolve the bot's target the same way we picked it for
        // perception — nearest live human opponent.
        const target = this._pickBotTarget(p);
        if (!target) return;

        // Pick a body zone — bots aim center mass; occasional head shot
        // proportional to aim skill (a SEAL lands a headshot ~10% of
        // its hits; a recruit basically never).
        const headRoll = Math.random();
        const headChance = Math.min(0.1, Math.max(0, (p.bot.aimSkill - 0.1) * 0.4));
        const isHead = headRoll < headChance;
        const zone = isHead ? 'head' : 'chest';
        const multiplier = isHead ? 4.0 : 1.0;
        const armorProtected = true; // both chest + head are armorable

        const dmg = this.damageSystem.applyDamage(
            String(p.slot),
            {
                targetId: String(target.slot),
                zone,
                multiplier,
                armorProtected,
                hitPosition: { x: target.x, y: target.y + 1.4, z: target.z },
            },
            { type: 'AK47', baseDamage: 36 },
        );
        if (!dmg) return;

        // Sync alive flag (same as resolveFire does for human shots).
        if (dmg.killed) {
            const victim = this.players.get(target.slot);
            if (victim) victim.alive = false;
        }

        this.io.to(this.roomName).emit('shootout:match:hit', {
            shooterSlot:    p.slot,
            victimSlot:     target.slot,
            zone,
            damageDealt:    dmg.damageDealt,
            killed:         !!dmg.killed,
            isHeadshot:     !!dmg.isHeadshot,
            weaponType:     'AK47',
            remainingHp:    dmg.remainingHp,
        });
    }

    // ── Tick loop ────────────────────────────────────────────────────

    _runTick() {
        this.tick += 1;

        // Day 3: input is only honored in LIVE. In BUY / ROUND_END /
        // MATCH_END we still integrate (to apply friction + drop the
        // player's velocity to zero) but we feed a neutral input. Look
        // angles are preserved so the camera doesn't snap.
        const inputAllowed = this.matchState.phase === Phase.LIVE;

        // [mp-diag] every 5s during LIVE: per-human input freshness.
        // Pairs with the client's 1Hz [mp-diag]/[mp-pos] logs — if a
        // player's lastInputSeq stops advancing here while their own
        // console shows seq climbing, frames are dying in transit/
        // being dropped; if it advances, the input pipeline is fine.
        // (JJ report 2026-06-10: opponent model not facing/moving.)
        if (inputAllowed && this.tick % 300 === 0) {
            for (const p of this.players.values()) {
                if (p.isBot) continue;
                console.log(
                    `[shootout-diag] match=${this.match?.matchId} slot=${p.slot} ` +
                    `lastSeq=${p.lastInputSeq} yaw=${(p.state.yaw ?? 0).toFixed(2)} ` +
                    `pos=(${p.state.x.toFixed(1)},${p.state.z.toFixed(1)}) alive=${p.alive}`,
                );
            }
        }

        for (const p of this.players.values()) {
            // Bots synthesize their own input each tick — also gated on
            // inputAllowed so the bot freezes during BUY.
            if (p.isBot && p.bot && inputAllowed) {
                // Drive the perception + state machine BEFORE input so
                // the bot reacts within the same tick it sees the player.
                if (!p.alive) {
                    if (typeof p.bot.markDead === 'function') p.bot.markDead();
                } else {
                    const target = this._pickBotTarget(p);
                    if (typeof p.bot.tick === 'function') {
                        p.bot.tick(p.state, { targetPlayer: target }, TICK_DT);
                    }
                }
                p.lastInput = p.bot.computeInput(p.state, TICK_DT);
            }

            // ── Client-authoritative position (2026-06-08) ────────────
            // When the player is human + the phase is LIVE + the client
            // sent a position in its last input, snap the server's state
            // to the client's coords. This sidesteps the collision
            // disagreement between client octree and server AABB.
            // Look angles + crouching still come through; the server
            // still synthesizes bone positions from
            // {x,y,z,yaw,crouching} for lag-comp hitscan, so adopting
            // the client position improves hitscan accuracy too.
            const useClientPos =
                inputAllowed &&
                !p.isBot &&
                Number.isFinite(p.lastInput.clientX) &&
                Number.isFinite(p.lastInput.clientY) &&
                Number.isFinite(p.lastInput.clientZ);
            if (useClientPos) {
                p.state.x = p.lastInput.clientX;
                p.state.y = p.lastInput.clientY;
                p.state.z = p.lastInput.clientZ;
                p.state.yaw   = p.lastInput.lookYaw;
                p.state.pitch = p.lastInput.lookPitch;
                p.state.crouching = !!p.lastInput.crouch;
                p.state.onGround  = !!p.lastInput.clientOnGround;
                // Velocity isn't authoritative in this mode — set to
                // zero so any stale value from earlier integration
                // doesn't poison future fallback paths.
                p.state.vx = 0; p.state.vy = 0; p.state.vz = 0;
            } else {
                const effInput = inputAllowed
                    ? p.lastInput
                    : {
                        seq:       p.lastInput.seq,
                        moveX:     0,
                        moveZ:     0,
                        lookYaw:   p.lastInput.lookYaw,
                        lookPitch: p.lastInput.lookPitch,
                        jump:      false,
                        crouch:    p.lastInput.crouch,
                    };
                integrateMovement(p.state, effInput, TICK_DT, MOVEMENT_TUNING);
            }

            // Push a snapshot into the ring buffer so Day 2 lag-comp
            // can rewind. We store {tick, x, y, z, yaw, pitch} — the
            // bare minimum for hitscan rewind.
            p.ring[p.ringHead] = {
                tick: this.tick,
                x: p.state.x, y: p.state.y, z: p.state.z,
                yaw: p.state.yaw, pitch: p.state.pitch,
            };
            p.ringHead = (p.ringHead + 1) % RING_CAPACITY;

            // Bot fire decision — runs AFTER movement integration so the
            // bot fires from its current post-tick position. Skipped for
            // humans, non-LIVE phases, and dead bots.
            if (p.isBot) this._processBotFire(p);
        }

        // Day 3: advance the round/match FSM and broadcast on
        // transition. Transitions emit immediately so clients get a
        // tight phase-change ack; the periodic emit below catches
        // late joiners + drives countdown UI without flooding.
        const transition = advanceMatch(this.matchState, TICK_DT, this.players);
        if (transition.transitioned) {
            // Award BEFORE the transition emit so the ROUND_END
            // roundState already carries the post-award money map.
            if (transition.roundJustEnded) {
                this._awardRoundEndMoney();
            }
            this._emitRoundState();
            if (transition.prevPhase === Phase.ROUND_END
                && transition.nextPhase === Phase.BUY) {
                this._resetForNewRound();
            }
            if (transition.matchJustEnded) {
                this._emitMatchFinal();
            }
        } else if (this.tick % ROUNDSTATE_TICKS === 0) {
            this._emitRoundState();
        }
    }

    // ── Day 3: round-state broadcast ─────────────────────────────────

    _emitRoundState() {
        const s = this.matchState;
        // Per-slot money map (2026-06-10). Before this, money was only
        // ever sent to clients inside the buy-ACK loadout broadcast, so
        // round-end + kill awards happened server-side but the client
        // HUD never saw them — and the client's local can-afford gate
        // then blocked buys the server would have allowed.
        const money = {};
        for (const p of this.players.values()) money[p.slot] = p.money;
        const payload = {
            phase:         s.phase,
            round:         s.round,
            maxRounds:     s.maxRounds,
            winsNeeded:    s.winsNeeded,
            winsRed:       s.winsRed,
            winsBlue:      s.winsBlue,
            phaseTimer:    s.phaseTimer,
            phaseDuration: phaseDurationFor(s.phase),
            roundWinner:   s.roundWinner,
            matchWinner:   s.matchWinner,
            over:          s.over,
            money,
        };
        this.io.to(this.roomName).emit('shootout:match:roundState', payload);
    }

    _awardRoundEndMoney() {
        // CS-style: winners get WIN_AWARD, losers get LOSS_AWARD. Both
        // capped at MONEY_CAP. Called once on the ROUND_END transition.
        const winner = this.matchState.roundWinner;
        for (const p of this.players.values()) {
            const award = winner == null
                ? LOSS_AWARD
                : (p.team === winner ? WIN_AWARD : LOSS_AWARD);
            p.money = Math.min(MONEY_CAP, p.money + award);
        }
    }

    _resetForNewRound() {
        // Re-spawn every player at their slot's start position, reset
        // velocity, flip alive=true, and reset HP/armor via the
        // DamageSystem so the next LIVE phase starts clean.
        for (const p of this.players.values()) {
            const spawn = spawnStateForSlot(this.match.mode, p.slot);
            p.state.x  = spawn.x;
            p.state.y  = spawn.y;
            p.state.z  = spawn.z;
            p.state.vx = 0; p.state.vy = 0; p.state.vz = 0;
            p.state.yaw   = spawn.yaw;
            p.state.pitch = 0;
            p.state.onGround  = true;
            p.state.crouching = false;
            p.alive = true;
        }
        this.damageSystem.resetAll();
        // CS:S behaviour — kit (armour + helmet) doesn't carry between
        // rounds. damageSystem.resetAll() defaults armor=100/hasHelmet
        // =true; override to empty so every player must rebuy from the
        // buy menu each round.
        for (const p of this.players.values()) {
            const h = this.damageSystem.getHealth(String(p.slot));
            if (h) { h.armor = 0; h.hasHelmet = false; }
        }
    }

    _emitMatchFinal() {
        if (this._matchFinalised) return;
        this._matchFinalised = true;
        const winner = this.matchState.matchWinner;
        const players = [];
        for (const p of this.players.values()) {
            players.push({
                slot:           p.slot,
                telegramUserId: p.telegramUserId,
                displayName:    p.displayName,
                team:           p.team,
                isBot:          p.isBot,
                kills:          p.kills,
                deaths:         p.deaths,
                won:            winner != null && p.team === winner,
            });
        }
        this.io.to(this.roomName).emit('shootout:match:final', {
            matchId:     this.match.matchId,
            matchWinner: winner,
            winsRed:     this.matchState.winsRed,
            winsBlue:    this.matchState.winsBlue,
            players,
        });

        // Day 3 / Task 4: persist career stats. Fire-and-forget — the
        // service handles its own error logging so a Mongo blip
        // doesn't take down the runner shutdown. Promise is exposed
        // via this._statsPromise so tests can await it.
        this._statsPromise = persistMatchStats({
            matchWinner: winner,
            players,
        });

        // Stop the runner after final emit — no more snapshots/ticks
        // once the match is over. Socket layer cleans up _activeMatches.
        this.stop();
    }

    // ── Snapshot broadcast ───────────────────────────────────────────

    _emitSnapshot() {
        const players = [];
        for (const p of this.players.values()) {
            // Day 2: include HP from the DamageSystem so clients can
            // render victim HP bars + death state.
            const health = this.damageSystem.getHealth(String(p.slot));
            players.push({
                slot:  p.slot,
                x:     p.state.x,
                y:     p.state.y,
                z:     p.state.z,
                yaw:   p.state.yaw,
                pitch: p.state.pitch,
                alive: p.alive && (health ? health.alive : true),
                hp:    health ? health.hp : 100,
                armor: health ? health.armor : 100,
            });
        }
        const snap = {
            tick: this.tick,
            tMs:  Date.now() - this.startMs,
            players,
        };
        this.io.to(this.roomName).emit('shootout:match:snapshot', snap);
    }

    // ── Day 2: lag-comp hitscan ──────────────────────────────────────
    //
    // Look up a player's historical state at a given tick from the
    // ring buffer. Returns null if the tick is outside the available
    // window. The ring is a fixed-size circular buffer keyed by tick
    // count, so the lookup is O(RING_CAPACITY) — fine.
    _historicalStateAtTick(player, tick) {
        if (!player || !Array.isArray(player.ring)) return null;
        for (let i = 0; i < player.ring.length; i++) {
            const entry = player.ring[i];
            if (entry && entry.tick === tick) return entry;
        }
        return null;
    }

    // Synthesize Mixamo-style bone world positions from {x,y,z,yaw,crouching}
    // for the purpose of ray-vs-hitbox testing. Y is feet level (matches
    // physics.js spawn states where y=0 at floor).
    _buildBonePositions(state) {
        const yaw   = state.yaw || 0;
        const sinY  = Math.sin(yaw);
        const cosY  = Math.cos(yaw);
        // Right-vector (perpendicular to yaw forward, in XZ plane)
        // matching physics.js's wishDir math: rX=cosY, rZ=-sinY
        const rX = cosY, rZ = -sinY;
        const heightScale = state.crouching ? CROUCH_BONE_SCALE : 1;

        const out = {};
        for (const bone of Object.keys(BONE_HEIGHTS_STANDING)) {
            const yOffset = BONE_HEIGHTS_STANDING[bone] * heightScale;
            const sOffset = BONE_SIDE_OFFSET[bone] || 0;
            out[bone] = {
                x: state.x + rX * sOffset,
                y: state.y + yOffset,
                z: state.z + rZ * sOffset,
            };
        }
        return out;
    }

    /**
     * Day 2: server-authoritative lag-comp hitscan.
     *
     * Resolves a fire event by rewinding to the shooter's perceived
     * tick (INTERP_DELAY_TICKS behind their fire frame), then
     * intersecting their ray against every OTHER player's historical
     * hitboxes at that tick. On a hit, apply damage via the runner's
     * DamageSystem and return the verdict.
     *
     * @param {number} shooterSlot
     * @param {object} fire
     *   { seq, fromX, fromY, fromZ, dirX, dirY, dirZ, clientTickFired, weaponType }
     * @returns {{ ok: boolean, victim?: number, zone?: string,
     *             damageDealt?: number, killed?: boolean,
     *             isHeadshot?: boolean, reason?: string }}
     */
    resolveFire(shooterSlot, fire) {
        // Day 3: only LIVE allows fire. Clients still send fire intents
        // during BUY (they have local autonomy until ACK lands); the
        // server cleanly rejects with 'not_live' rather than silently
        // miss-resolving them.
        if (this.matchState.phase !== Phase.LIVE) {
            return { ok: false, reason: 'not_live' };
        }
        const shooter = this.players.get(shooterSlot);
        if (!shooter) return { ok: false, reason: 'no_shooter' };
        if (!shooter.alive) return { ok: false, reason: 'shooter_dead' };

        const wc = weaponConfig(fire?.weaponType) || weaponConfig(WeaponType.AK47);
        if (!wc) return { ok: false, reason: 'bad_weapon' };

        // ── Determine target tick (lag-comp rewind) ──────────────
        // Clamp the client's reported tick to current — clients can't
        // claim hits in the future. Then step back by INTERP_DELAY_TICKS
        // so the historical state we look at is what the shooter
        // actually saw when they pulled the trigger.
        const clientTick = Number.isFinite(fire?.clientTickFired)
            ? Math.min(fire.clientTickFired, this.tick)
            : this.tick;
        const targetTick = clientTick - INTERP_DELAY_TICKS;
        const rewindAge  = this.tick - targetTick;
        if (rewindAge > MAX_REWIND_TICKS) {
            return { ok: false, reason: 'rewind_expired' };
        }
        if (targetTick < 0) {
            return { ok: false, reason: 'pre_match' };
        }

        // ── Build ray ────────────────────────────────────────────
        // dir must be normalized; defensive normalize even though the
        // client should send a unit vector.
        // Coerce numeric defensively — `Number(undefined) || 0` lets 0
        // pass through cleanly (which `|| 0` would also do; using
        // Number.isFinite guards against NaN from non-numeric junk).
        const dx = Number.isFinite(fire?.dirX) ? fire.dirX : 0;
        const dy = Number.isFinite(fire?.dirY) ? fire.dirY : 0;
        const dz = Number.isFinite(fire?.dirZ) ? fire.dirZ : 0;
        const dirLen = Math.hypot(dx, dy, dz);
        if (dirLen < 1e-6) return { ok: false, reason: 'bad_dir' };
        const ray = {
            origin: {
                x: Number.isFinite(fire?.fromX) ? fire.fromX : 0,
                y: Number.isFinite(fire?.fromY) ? fire.fromY : 0,
                z: Number.isFinite(fire?.fromZ) ? fire.fromZ : 0,
            },
            dir: {
                x: dx / dirLen,
                y: dy / dirLen,
                z: dz / dirLen,
            },
        };

        // ── Build temporary target hitbox sets at historical tick ─
        const targets = [];
        for (const p of this.players.values()) {
            if (p.slot === shooterSlot) continue;
            if (!p.alive) continue;
            const histState = this._historicalStateAtTick(p, targetTick)
                // Fallback to current state if no entry for this tick
                // exists yet (e.g. first 6 ticks of the match).
                || { x: p.state.x, y: p.state.y, z: p.state.z, yaw: p.state.yaw };
            const stateForBones = { ...histState, crouching: p.state.crouching };
            const bones = this._buildBonePositions(stateForBones);
            const hitboxes = createHitboxSet(String(p.slot));
            updateHitboxPositions(hitboxes, bones);
            targets.push({ id: String(p.slot), hitboxes });
        }

        if (targets.length === 0) return { ok: false, reason: 'no_targets' };

        // ── Run hitscan ──────────────────────────────────────────
        const hit = testHitscan(ray.origin, ray.dir, targets, String(shooterSlot));
        if (!hit) return { ok: false, reason: 'miss' };

        // ── Apply damage ─────────────────────────────────────────
        const dmg = this.damageSystem.applyDamage(String(shooterSlot), hit, wc);
        if (!dmg) return { ok: false, reason: 'apply_failed' };

        // Mark player dead in the runner record so snapshots + future
        // hits see the correct alive flag without waiting for the
        // damage system to re-tick.
        const victimSlot = Number(hit.targetId);
        if (dmg.killed) {
            const victim = this.players.get(victimSlot);
            if (victim) victim.alive = false;
            // Day 3: per-match kill/death counters; rolled into the
            // match:final payload and ShootoutStats upsert (Task 4).
            shooter.kills += 1;
            if (victim) victim.deaths += 1;
            // 2026-06-10: instant kill award (on top of the round-end
            // win/loss award). Reaches the client within ~166ms via the
            // periodic roundState money map.
            const kAward = this.match?.mode === '1v1' ? KILL_AWARD_1V1 : KILL_AWARD_2V2;
            shooter.money = Math.min(MONEY_CAP, shooter.money + kAward);
        }

        return {
            ok:           true,
            victim:       victimSlot,
            zone:         hit.zone,
            damageDealt:  dmg.damageDealt,
            killed:       !!dmg.killed,
            isHeadshot:   !!dmg.isHeadshot,
            remainingHp:  dmg.remainingHp,
            remainingArmor: dmg.remainingArmor,
        };
    }
}

export default { ShootoutRunner };
