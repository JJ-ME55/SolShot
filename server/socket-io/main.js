import crypto from 'crypto';
import mongoose from 'mongoose';
import Match from '../models/Match.js';
import User from '../models/User.js';
import { processShot, generateTerrain, generateTankPositions, generateWind, WEAPON_DATA } from '../services/physics.js';
import { createMatchState, validateAction, transitionState, getNextTurn, isRoundOver, isMatchOver, getRoundWinner, resetForNextRound, MATCH_STATES } from '../services/match.js';
import { initGold, getBalance, earnGold, spendGold, awardKillBonus, awardRoundWinBonus } from '../services/gold.js';
import { WEAPON_CATALOG, getWeapon, getWeaponCost, getAllLaunchWeapons } from '../models/Weapon.js';
import { handleAuthenticate } from '../middleware/auth.js';
import { verifyBalance, isValidWager, settleMatch, refundWager, WAGER_TIERS, MATCH_MODES, validateMatchMode, isEscrowEnabled, createMatchEscrow, buildDepositTransaction, getEscrowState } from '../services/solana.js';
import { recordMatchPlayed, prestigeBurn, getPrestigeInfo, getShotBalance, PRESTIGE_TIERS, verifyBurnTransaction } from '../services/shot-token.js';
import { trackConnection, trackDisconnection, trackMatchCreated, trackMatchCompleted, trackMatchCancelled, trackWager, trackSettlement, trackForfeit, trackShot, trackDamage, trackGoldEarned, trackShotEmission, trackShotBurn, trackError } from '../services/monitoring.js';
import { requireAuth, validatePayload, validateFireParams, sanitizeName, withLock, safeHandler } from '../middleware/guards.js';

// Helper: check if MongoDB is connected before DB operations
function isDbConnected() {
    return mongoose.connection.readyState === 1; // 1 = connected
}

// O1: In-memory cache for active rooms — Map<roomId, room> for O(1) lookups
// DB is source of truth, cache is synced on mutations
const rooms = new Map()

// In-memory match states keyed by roomId
var matchStates = {}

// In-memory Gold balances keyed by roomId → { [playerId]: number }
var goldStates = {}

// In-memory weapon inventories keyed by roomId → { [playerId]: weaponId[] }
var weaponInventories = {}

// Shop timers keyed by roomId
var shopTimers = {}

// Shop readiness keyed by roomId → { [playerId]: boolean }
var shopReady = {}

// Wager info keyed by roomId → { amount, wallets: { [playerId]: walletAddress } }
var wagerStates = {}

// Authenticated wallets keyed by socketId → walletAddress
var authenticatedWallets = {}

// Disconnect/reconnect: pending timers keyed by walletAddress
var disconnectTimers = {}
// Pending reconnect info keyed by walletAddress → { roomId, isHost, socketId (old), name, color }
var pendingReconnects = {}

// Turn timers keyed by roomId
var turnTimers = {}

// Matchmaking queues — keyed by "matchMode:matchLength" (e.g., "quick_match:1")
// Each entry: { socketId, wallet, name, color, wager, format, matchMode, queuedAt }
const matchmakingQueues = new Map();

function getQueueKey(matchMode, matchLength) {
    return `${matchMode}:${matchLength}`;
}

function removeFromAllQueues(socketId) {
    for (const [key, queue] of matchmakingQueues.entries()) {
        const idx = queue.findIndex(e => e.socketId === socketId);
        if (idx !== -1) {
            queue.splice(idx, 1);
            if (queue.length === 0) matchmakingQueues.delete(key);
        }
    }
}

const SHOP_DURATION = 30; // seconds
const RECONNECT_WINDOW_MS = 30000; // 30 seconds to reconnect
const TURN_TIMEOUT_MS = 60000;     // 60 seconds per turn

// O2: Debounced room broadcast — batch multiple room changes within 100ms
let broadcastTimer = null;
function broadcastRooms(io) {
    if (broadcastTimer) return; // already scheduled
    broadcastTimer = setTimeout(() => {
        broadcastTimer = null;
        io.emit('setRooms', { rooms: getOpenRooms() });
    }, 100);
}

// O1: O(1) room lookup via Map
function findRoom(roomId) {
    return rooms.get(roomId) || null;
}

// Helper: get open rooms for lobby display
// O1+O8: Iterate Map, serialize only lobby-safe fields
function getOpenRooms() {
    const result = [];
    for (const room of rooms.values()) {
        if (!room.active) {
            result.push({
                roomId: room.roomId,
                host: room.host ? {
                    name: room.host.name,
                    color: room.host.color,
                } : null,
                wager: room.wager || 0,
                matchMode: room.matchMode || null,
                totalRounds: room.totalRounds || 1,
            });
            if (result.length >= 5) break;
        }
    }
    return result;
}

// Helper: persist room state to DB (fire-and-forget for non-critical updates)
async function persistRoom(room) {
    if (!room || !room._matchId || !isDbConnected()) return;
    try {
        const update = {
            active: room.active,
            randomArray: room.randomArray,
            terrainPath: room.terrainPath,
        };
        if (room.host) {
            update.host = {
                username: room.host.name,
                socketId: room.host.socketId,
                color: room.host.color,
                isReady: room.host.isReady,
                playAgain: room.host.playAgain,
            };
        }
        if (room.player) {
            update.player = {
                username: room.player.name,
                socketId: room.player.socketId,
                color: room.player.color,
                isReady: room.player.isReady,
                playAgain: room.player.playAgain,
            };
        }
        await Match.findByIdAndUpdate(room._matchId, update);
    } catch (err) {
        console.error('DB persist error:', err.message);
    }
}

// Helper: remove room from memory and mark cancelled in DB
async function removeRoom(roomId) {
    const room = rooms.get(roomId);
    rooms.delete(roomId);
    delete matchStates[roomId];
    delete goldStates[roomId];
    delete weaponInventories[roomId];
    delete shopReady[roomId];
    delete wagerStates[roomId];
    clearTurnTimer(roomId);
    if (shopTimers[roomId]) {
        clearTimeout(shopTimers[roomId]);
        delete shopTimers[roomId];
    }
    if (room && room._matchId && isDbConnected()) {
        try {
            await Match.findByIdAndUpdate(room._matchId, { status: 'cancelled' });
        } catch (err) {
            console.error('DB cancel error:', err.message);
        }
    }
}

/**
 * End the weapon shop phase — transition to battle
 * Called when both players are done or timer expires
 */
function endShopPhase(io, roomId) {
    // Clear timer
    if (shopTimers[roomId]) {
        clearTimeout(shopTimers[roomId]);
        delete shopTimers[roomId];
    }

    const room = findRoom(roomId)
    if (!room) return

    const ms = matchStates[roomId]
    if (!ms) return

    // Only transition if we're still in weapon_shop
    if (ms.status !== MATCH_STATES.WEAPON_SHOP) return

    transitionState(ms, MATCH_STATES.BATTLE)

    // Build weapon lists for each player from inventories
    const hostId = room.host ? room.host.socketId : null
    const playerId = room.player ? room.player.socketId : null
    const inventory = weaponInventories[roomId] || {}

    // Convert weapon IDs to weapon objects for client
    const hostWeapons = (inventory[hostId] || [0]).map(id => {
        const w = getWeapon(id)
        return w ? { id: w.id, name: w.name, type: 'single' } : { id: 0, name: 'Single Shot', type: 'single' }
    })
    const playerWeapons = (inventory[playerId] || [0]).map(id => {
        const w = getWeapon(id)
        return w ? { id: w.id, name: w.name, type: 'single' } : { id: 0, name: 'Single Shot', type: 'single' }
    })

    // Emit shopEnd with final inventories and Gold
    io.sockets.in(roomId).emit('shopEnd', {
        hostWeapons,
        playerWeapons,
        goldBalance: goldStates[roomId] || {}
    })

    // Reset shop readiness and terrain cache for new round
    delete shopReady[roomId]
    if (room) delete room._terrainCache
}

// Start a turn timer — auto-forfeit if no action within TURN_TIMEOUT_MS
function startTurnTimer(io, roomId) {
    clearTurnTimer(roomId)
    turnTimers[roomId] = setTimeout(async () => {
        const ms = matchStates[roomId]
        if (!ms || ms.status !== MATCH_STATES.BATTLE) return

        const room = findRoom(roomId)
        if (!room) return

        const currentTurnId = ms.currentTurn
        if (!currentTurnId) return

        const hostId = room.host ? room.host.socketId : null
        const playerId = room.player ? room.player.socketId : null

        // LP-08: Track consecutive timeouts per player
        if (!ms.consecutiveTimeouts) ms.consecutiveTimeouts = {}
        ms.consecutiveTimeouts[currentTurnId] = (ms.consecutiveTimeouts[currentTurnId] || 0) + 1

        // LP-08: 3-forfeit rule — end match if timed-out player hit 3 consecutive timeouts
        if (ms.consecutiveTimeouts[currentTurnId] >= 3) {
            clearTurnTimer(roomId)
            const opponentId = currentTurnId === hostId ? playerId : hostId

            console.log(`[Forfeit] Player ${currentTurnId} timed out 3 consecutive turns — opponent ${opponentId} wins`)

            // Emit standard matchEnd event with forfeitReason for client compatibility
            // Uses existing matchEnd event — no separate forfeitMatchEnd event needed
            io.sockets.in(roomId).emit('matchEnd', {
                winner: opponentId,
                forfeitReason: '3 consecutive turn timeouts',
                forfeitPlayerId: currentTurnId,
                scores: ms.scores || {},
                hp: ms.hp || {},
            })

            // Transition to SETTLING
            transitionState(ms, MATCH_STATES.SETTLING)

            // Settle wager if applicable
            // settleMatch signature: settleMatch(winnerAddress, loserAddress, wagerSOL, matchId)
            // Must use wallet addresses from wagerStates — NOT socketIds
            const wsState = wagerStates[roomId]
            if (wsState && wsState.amount > 0) {
                const winnerWallet = wsState.wallets ? wsState.wallets[opponentId] : null
                const loserWallet = wsState.wallets ? wsState.wallets[currentTurnId] : null
                if (winnerWallet && loserWallet) {
                    try {
                        await settleMatch(winnerWallet, loserWallet, wsState.amount, roomId)
                    } catch (err) {
                        console.error(`[Forfeit] Settlement error for room ${roomId}:`, err.message)
                    }
                } else {
                    console.warn(`[Forfeit] Missing wallet addresses for settlement in room ${roomId}`)
                }
            }

            // SHOT milestone recording for forfeit — wired in Task 3 (step 6)
            // Task 3 will add enriched recordMatchPlayed calls here using roomId (NOT this.roomId)

            transitionState(ms, MATCH_STATES.COMPLETE)

            // Room teardown — startTurnTimer is module-level so cleanupRoom (defined inside
            // connection closure) is not in scope. Perform teardown directly using module-level
            // helpers. Wager settlement already done above.
            io.sockets.in(roomId).emit('opponentLeft', {})
            await removeRoom(roomId)
            broadcastRooms(io)
            io.socketsLeave(roomId)

            return
        }

        // Normal timeout — advance turn
        ms.turnCount++
        ms.currentTurn = getNextTurn(ms, hostId, playerId)

        // LP-07: Reset move count for the new turn player
        if (ms.moveCounts) ms.moveCounts[ms.currentTurn] = 0

        io.sockets.in(roomId).emit('turnTimeout', {
            timedOutPlayer: currentTurnId,
            nextTurn: ms.currentTurn,
            turnCount: ms.turnCount,
            consecutiveTimeouts: ms.consecutiveTimeouts[currentTurnId],
        })

        // Restart timer for the next player
        startTurnTimer(io, roomId)
    }, TURN_TIMEOUT_MS)
}

function clearTurnTimer(roomId) {
    if (turnTimers[roomId]) {
        clearTimeout(turnTimers[roomId])
        delete turnTimers[roomId]
    }
}

const mainsocket = (io) => {
    return io.on("connection", (client) => {
        trackConnection()
        client.roomId = null
        client.name = ""
        client.color = 0
        client.isHost = false
        client.walletAddress = null
        client.isAuthenticated = false

        // H074: Per-socket rate limiter using ring buffers (O7: O(1) per check, zero GC)
        // Escalates from drop → disconnect for sustained abuse
        const RL_MAX_EVENTS = 30          // max events per second
        const RL_MAX_FIRES = 2            // max fires per second
        const RL_DISCONNECT_MULT = 3      // disconnect at 3x limit (90 events/sec)
        const RL_DISCONNECT_WINDOW = 5000 // sustained for 5 seconds
        const RL_WINDOW_MS = 1000

        // Per-event throttle for room creation (max 3 per 60 seconds)
        const RL_MAX_CREATES = 3
        const RL_CREATE_WINDOW = 60000
        const createRing = new Int32Array(RL_MAX_CREATES + 1)
        let createHead = 0

        // Ring buffers — fixed-size circular arrays, O(1) insert + count
        const eventRing = new Int32Array(RL_MAX_EVENTS + 1)  // timestamps mod windowMs
        let eventHead = 0
        const fireRing = new Int32Array(RL_MAX_FIRES + 1)
        let fireHead = 0

        // Escalation tracking
        let dropCount = 0
        let firstDropAt = 0

        function ringCount(ring, head, size, now, windowMs) {
            let count = 0
            const cutoff = now - windowMs
            for (let i = 0; i < size; i++) {
                if (ring[i] > cutoff) count++
            }
            return count
        }

        const originalOnevent = client.onevent
        client.onevent = function(packet) {
            const now = Date.now()

            // Count events in current window
            const eventCount = ringCount(eventRing, eventHead, eventRing.length, now, RL_WINDOW_MS)

            // Check global rate limit
            if (eventCount >= RL_MAX_EVENTS) {
                // Track drops for escalation
                if (dropCount === 0) firstDropAt = now
                dropCount++

                // Escalate: disconnect if sustained abuse (3x limit for 5 seconds)
                if (dropCount >= RL_DISCONNECT_MULT * RL_MAX_EVENTS &&
                    (now - firstDropAt) <= RL_DISCONNECT_WINDOW) {
                    console.error(`[RateLimit] Socket ${client.id} DISCONNECTED — sustained abuse (${dropCount} drops in ${now - firstDropAt}ms)`)
                    client.disconnect(true)
                    return
                }

                return  // Silent drop
            }

            // Reset drop counter on successful event
            if (dropCount > 0 && (now - firstDropAt) > RL_DISCONNECT_WINDOW) {
                dropCount = 0
            }

            // Check fire-specific rate limit
            const eventName = packet.data && packet.data[0]
            if (eventName === 'fire' || eventName === 'shoot') {
                const fireCount = ringCount(fireRing, fireHead, fireRing.length, now, RL_WINDOW_MS)
                if (fireCount >= RL_MAX_FIRES) {
                    return  // Drop excess fires
                }
                fireRing[fireHead % fireRing.length] = now
                fireHead++
            }

            // Check create-room rate limit (max 3 per 60s)
            if (eventName === 'createRoom') {
                const createCount = ringCount(createRing, createHead, createRing.length, now, RL_CREATE_WINDOW)
                if (createCount >= RL_MAX_CREATES) {
                    return  // Drop excess room creations
                }
                createRing[createHead % createRing.length] = now
                createHead++
            }

            // Record event in ring buffer
            eventRing[eventHead % eventRing.length] = now
            eventHead++
            originalOnevent.call(client, packet)
        }


        // === WALLET AUTHENTICATION (Phase 4) ===
        client.on('authenticate', (data) => {
            // H015: Null payload guard
            if (!data || typeof data !== 'object') {
                client.emit('authResult', { success: false, reason: 'Missing payload' })
                return
            }
            const result = handleAuthenticate(client, data)
            if (result.success) {
                authenticatedWallets[client.id] = result.walletAddress
                console.log(`[Auth] Socket ${client.id} authenticated as ${result.walletAddress}`)
            }
            client.emit('authResult', result)
        })


        // O5: Shared cleanup — handles forfeit settlement, room teardown, and client reset
        // Used by both disconnect and leaveRoom to eliminate duplicate logic
        async function cleanupRoom(client, io, reason) {
            const roomId = client.roomId
            if (!roomId) return

            const ws = wagerStates[roomId]
            const ms = matchStates[roomId]

            // H069: Don't destroy room state during active settlement
            if (ms && ms.status === MATCH_STATES.SETTLING) {
                client.leave(roomId)
                io.sockets.in(roomId).emit('opponentLeft', {})
                client.roomId = null
                client.isHost = false
                return
            }

            // Handle wager forfeit during active match
            if (ws && ws.amount > 0 && ms) {
                const room = findRoom(roomId)
                if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
                    // H020: Use lock to prevent concurrent settlement
                    await withLock(`settle:${roomId}`, async () => {
                        const currentMs = matchStates[roomId]
                        if (!currentMs || currentMs.status === MATCH_STATES.SETTLING || currentMs.status === MATCH_STATES.COMPLETE) return

                        transitionState(currentMs, MATCH_STATES.SETTLING)

                        const opponentId = client.isHost
                            ? (room.player ? room.player.socketId : null)
                            : (room.host ? room.host.socketId : null)
                        const disconnectorWallet = ws.wallets[client.id]
                        const opponentWallet = opponentId ? ws.wallets[opponentId] : null

                        if (opponentWallet && disconnectorWallet) {
                            try {
                                const settlementResult = await settleMatch(opponentWallet, disconnectorWallet, ws.amount, roomId)
                                console.log(`[Solana] Forfeit settlement (${reason}):`, settlementResult)
                                trackForfeit()
                                if (settlementResult.settlement) trackSettlement({ winnerPayout: settlementResult.settlement.winner, treasuryFee: settlementResult.settlement.treasury, opsFee: settlementResult.settlement.ops })
                                transitionState(currentMs, MATCH_STATES.COMPLETE)
                                if (opponentId) {
                                    io.to(opponentId).emit('matchSettled', {
                                        type: 'forfeit',
                                        winner: opponentId,
                                        settlement: settlementResult.settlement,
                                        txSignature: settlementResult.txSignature
                                    })
                                }
                            } catch (err) {
                                console.error(`[Solana] Forfeit settlement error (${reason}):`, err.message)
                                transitionState(currentMs, MATCH_STATES.CANCELLED)
                                trackError(err, 'forfeit_settlement')
                            }
                        } else {
                            transitionState(currentMs, MATCH_STATES.CANCELLED)
                        }
                    })
                } else if (ms.status === MATCH_STATES.LOBBY) {
                    // Not started yet — refund if applicable
                    const wallet = ws.wallets[client.id]
                    if (wallet && ws.amount > 0) {
                        await refundWager(wallet, ws.amount)
                    }
                }
            }

            client.leave(roomId)
            await removeRoom(roomId)
            io.sockets.in(roomId).emit('opponentLeft', {})
            broadcastRooms(io)
            io.socketsLeave(roomId)
            client.roomId = null
            client.isHost = false
        }

        client.on('disconnect', async () => {
            // Remove from matchmaking queue first (before room cleanup)
            removeFromAllQueues(client.id);
            trackDisconnection()
            const walletAddress = authenticatedWallets[client.id]
            const roomId = client.roomId
            const ms = roomId ? matchStates[roomId] : null
            const room = roomId ? findRoom(roomId) : null

            // Only offer reconnect window during active match (BATTLE or WEAPON_SHOP) with a wallet
            if (walletAddress && roomId && ms && room &&
                (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {

                // Store reconnect info keyed by wallet
                pendingReconnects[walletAddress] = {
                    roomId,
                    isHost: client.isHost,
                    oldSocketId: client.id,
                    name: client.name,
                    color: client.color,
                }

                // Notify opponent of disconnect with countdown
                const opponentId = client.isHost
                    ? (room.player ? room.player.socketId : null)
                    : (room.host ? room.host.socketId : null)
                if (opponentId) {
                    io.to(opponentId).emit('opponentDisconnected', {
                        reconnectWindowMs: RECONNECT_WINDOW_MS,
                    })
                }

                // Deferred cleanup — runs after 30s if no reconnect
                disconnectTimers[walletAddress] = setTimeout(async () => {
                    delete pendingReconnects[walletAddress]
                    delete disconnectTimers[walletAddress]

                    // Re-read state (may have changed during window)
                    const currentMs = matchStates[roomId]
                    const currentRoom = findRoom(roomId)
                    if (!currentRoom || !currentMs) return

                    if (opponentId) {
                        io.to(opponentId).emit('reconnectExpired', {})
                    }

                    // Perform forfeit settlement (reuse cleanupRoom logic)
                    // Create a fake client-like object for cleanupRoom
                    const fakeClient = {
                        id: client.id,
                        roomId: roomId,
                        isHost: client.isHost,
                        leave: () => {},
                    }
                    await cleanupRoom(fakeClient, io, 'reconnect_timeout')
                    delete authenticatedWallets[client.id]
                }, RECONNECT_WINDOW_MS)
            } else {
                // No reconnect window — immediate cleanup (lobby, no wallet, etc.)
                await cleanupRoom(client, io, 'disconnect')
                delete authenticatedWallets[client.id]
            }
        })



        client.on('leaveRoom', async () => {
            await cleanupRoom(client, io, 'leave')
        })


        // === RECONNECT: Rejoin a match after disconnect ===
        client.on('rejoinRoom', (data) => {
            if (!data || !data.walletAddress) {
                client.emit('rejoinError', { reason: 'Missing wallet address' })
                return
            }

            const walletAddress = data.walletAddress
            const pending = pendingReconnects[walletAddress]
            if (!pending) {
                client.emit('rejoinError', { reason: 'No active match to rejoin' })
                return
            }

            const { roomId, isHost, oldSocketId, name, color } = pending
            const room = findRoom(roomId)
            const ms = matchStates[roomId]

            if (!room || !ms) {
                delete pendingReconnects[walletAddress]
                client.emit('rejoinError', { reason: 'Match no longer exists' })
                return
            }

            // Cancel the deferred cleanup timer
            if (disconnectTimers[walletAddress]) {
                clearTimeout(disconnectTimers[walletAddress])
                delete disconnectTimers[walletAddress]
            }
            delete pendingReconnects[walletAddress]

            // Map new socket to the old player slot
            client.join(roomId)
            client.roomId = roomId
            client.isHost = isHost
            client.name = name
            client.color = color
            client.walletAddress = walletAddress
            client.isAuthenticated = true
            authenticatedWallets[client.id] = walletAddress

            // Update room references from old socketId to new
            if (isHost && room.host) {
                // Migrate wager wallet entry
                const ws = wagerStates[roomId]
                if (ws && ws.wallets[oldSocketId]) {
                    ws.wallets[client.id] = ws.wallets[oldSocketId]
                    delete ws.wallets[oldSocketId]
                }
                // Migrate gold state
                const gs = goldStates[roomId]
                if (gs && gs[oldSocketId] !== undefined) {
                    gs[client.id] = gs[oldSocketId]
                    delete gs[oldSocketId]
                }
                // Migrate weapon inventory
                const wi = weaponInventories[roomId]
                if (wi && wi[oldSocketId]) {
                    wi[client.id] = wi[oldSocketId]
                    delete wi[oldSocketId]
                }
                // Migrate match state references
                if (ms.scores[oldSocketId] !== undefined) { ms.scores[client.id] = ms.scores[oldSocketId]; delete ms.scores[oldSocketId] }
                if (ms.kills[oldSocketId] !== undefined) { ms.kills[client.id] = ms.kills[oldSocketId]; delete ms.kills[oldSocketId] }
                if (ms.roundWins[oldSocketId] !== undefined) { ms.roundWins[client.id] = ms.roundWins[oldSocketId]; delete ms.roundWins[oldSocketId] }
                if (ms.hp[oldSocketId] !== undefined) { ms.hp[client.id] = ms.hp[oldSocketId]; delete ms.hp[oldSocketId] }
                if (ms.currentTurn === oldSocketId) ms.currentTurn = client.id

                room.host.socketId = client.id
            } else if (room.player) {
                const ws = wagerStates[roomId]
                if (ws && ws.wallets[oldSocketId]) {
                    ws.wallets[client.id] = ws.wallets[oldSocketId]
                    delete ws.wallets[oldSocketId]
                }
                const gs = goldStates[roomId]
                if (gs && gs[oldSocketId] !== undefined) {
                    gs[client.id] = gs[oldSocketId]
                    delete gs[oldSocketId]
                }
                const wi = weaponInventories[roomId]
                if (wi && wi[oldSocketId]) {
                    wi[client.id] = wi[oldSocketId]
                    delete wi[oldSocketId]
                }
                if (ms.scores[oldSocketId] !== undefined) { ms.scores[client.id] = ms.scores[oldSocketId]; delete ms.scores[oldSocketId] }
                if (ms.kills[oldSocketId] !== undefined) { ms.kills[client.id] = ms.kills[oldSocketId]; delete ms.kills[oldSocketId] }
                if (ms.roundWins[oldSocketId] !== undefined) { ms.roundWins[client.id] = ms.roundWins[oldSocketId]; delete ms.roundWins[oldSocketId] }
                if (ms.hp[oldSocketId] !== undefined) { ms.hp[client.id] = ms.hp[oldSocketId]; delete ms.hp[oldSocketId] }
                if (ms.currentTurn === oldSocketId) ms.currentTurn = client.id

                room.player.socketId = client.id
            }

            // Notify opponent that player reconnected
            const opponentId = isHost
                ? (room.player ? room.player.socketId : null)
                : (room.host ? room.host.socketId : null)
            if (opponentId) {
                io.to(opponentId).emit('opponentReconnected', {})
            }

            // Send full state snapshot to the reconnected player
            client.emit('rejoinSuccess', {
                roomId,
                isHost,
                matchState: {
                    status: ms.status,
                    currentRound: ms.currentRound,
                    maxRounds: ms.maxRounds,
                    roundType: ms.roundType,
                    scores: ms.scores,
                    roundWins: ms.roundWins,
                    hp: ms.hp,
                    currentTurn: ms.currentTurn,
                    turnCount: ms.turnCount,
                },
                goldBalance: goldStates[roomId] || {},
                weapons: weaponInventories[roomId] ? weaponInventories[roomId][client.id] : [0],
                terrain: room.heightmap ? { seed: room.terrainSeed, heightmap: room.heightmap } : null,
                tankPositions: {
                    host: room.host ? room.host.pos : null,
                    player: room.player ? room.player.pos : null,
                },
                wager: wagerStates[roomId] ? wagerStates[roomId].amount : 0,
                wind: room.wind || 0,
            })
        })


        client.on('deleteRoom', async () => {
            if (client.roomId !== null) {
                // H003: Only host can delete the room
                if (!client.isHost) {
                    client.emit('deleteRoomError', { reason: 'Only host can delete room' })
                    return
                }

                // H070: Don't delete during settlement
                const ms = matchStates[client.roomId]
                if (ms && ms.status === MATCH_STATES.SETTLING) {
                    client.emit('deleteRoomError', { reason: 'Cannot delete room during settlement' })
                    return
                }

                client.leave(client.roomId)
                await removeRoom(client.roomId)
                io.sockets.in(client.roomId).emit('opponentLeft', {})
                broadcastRooms(io)
                io.socketsLeave(client.roomId);
                client.roomId = null
                client.isHost = false
            }
        })



        client.on('joinRoom', async (data) => {
            // H015: Null payload guard
            if (!data || typeof data !== 'object') return
            const { roomId, name, color } = data

            if (client.roomId === roomId) return
            var room = findRoom(roomId)
            if (!room || room.active === true) return

            // Verify wager compatibility
            const ws = wagerStates[roomId]
            const roomWager = ws ? ws.amount : 0
            // H002: ONLY use server-verified wallet — never trust client payload
            const joinerWallet = authenticatedWallets[client.id] || null

            if (roomWager > 0) {
                // H006: Require auth for wagered rooms
                if (!requireAuth(client, 'joinRoom')) return

                // Room requires a wager — joiner must have a wallet
                if (!joinerWallet) {
                    client.emit('joinRoomError', { reason: 'Wallet required for wagered matches' })
                    return
                }

                // Verify joiner has enough balance (best-effort — skip if RPC unavailable)
                try {
                    const balanceCheck = await verifyBalance(joinerWallet, roomWager)
                    // H027: Fix fail-open — reject if insufficient, regardless of balance amount
                    if (!balanceCheck.sufficient) {
                        client.emit('joinRoomError', {
                            reason: `Insufficient SOL balance. Need ${balanceCheck.required.toFixed(3)}, have ${balanceCheck.balance.toFixed(3)}`
                        })
                        return
                    }
                } catch (err) {
                    console.warn('[Solana] Balance check skipped:', err.message)
                }
            }

            if (client.roomId !== null) {
                client.leave(client.roomId)
                await removeRoom(client.roomId)
            }

            client.join(roomId)
            client.roomId = roomId
            client.isHost = false
            // H017: Sanitize player name
            client.name = sanitizeName(name)
            client.color = color

            // Store joiner's wallet in wager state
            if (ws) {
                ws.wallets[client.id] = joinerWallet
            }

            room.player = {name: sanitizeName(name), color: color, socketId: client.id, isReady: false, playAgain: false}
            room.active = true

            // Persist player join to DB
            persistRoom(room);

            broadcastRooms(io)

            // Create on-chain escrow for wagered matches
            if (roomWager > 0 && isEscrowEnabled()) {
                const hostWallet = ws?.wallets[room.host.socketId]
                if (hostWallet && joinerWallet) {
                    try {
                        const escrowResult = await createMatchEscrow(roomId, roomWager, hostWallet, joinerWallet)
                        if (escrowResult.success) {
                            room.escrowPDA = escrowResult.escrowPDA
                            console.log(`[Match] Escrow created for room ${roomId}: ${escrowResult.escrowPDA}`)

                            // Build deposit transactions for both players to sign
                            const [hostDeposit, joinerDeposit] = await Promise.all([
                                buildDepositTransaction(roomId, hostWallet),
                                buildDepositTransaction(roomId, joinerWallet),
                            ])

                            // Send deposit instructions to each player
                            const hostSocket = io.sockets.sockets.get(room.host.socketId)
                            if (hostSocket && hostDeposit.success) {
                                hostSocket.emit('escrowDeposit', {
                                    roomId,
                                    transaction: hostDeposit.transaction,
                                    escrowPDA: escrowResult.escrowPDA,
                                    wager: roomWager,
                                })
                            }
                            if (joinerDeposit.success) {
                                client.emit('escrowDeposit', {
                                    roomId,
                                    transaction: joinerDeposit.transaction,
                                    escrowPDA: escrowResult.escrowPDA,
                                    wager: roomWager,
                                })
                            }
                        } else {
                            console.error(`[Match] Escrow creation failed for ${roomId}:`, escrowResult.error)
                        }
                    } catch (err) {
                        console.error(`[Match] Escrow error for ${roomId}:`, err.message)
                    }
                }
            }

            io.sockets.in(client.roomId).emit('startPick', {host: room.host, player: room.player, wager: roomWager})
        })



        client.on('getRooms', () => {
            client.emit('setRooms', {rooms: getOpenRooms()})
        })



        client.on('createRoom', async (data) => {
            // H015: Null payload guard
            if (!data || typeof data !== 'object' || !data.player) return
            const { player } = data

            if (client.roomId !== null) {
                client.leave(client.roomId)
                await removeRoom(client.roomId)
            }

            // H011: Validate wager amount — reject negative, NaN, non-finite
            const wagerAmount = player.wager || 0
            if (!Number.isFinite(wagerAmount) || wagerAmount < 0) {
                client.emit('createRoomError', { reason: 'Invalid wager amount' })
                return
            }

            // H006/H001: Require auth for wagered rooms
            if (wagerAmount > 0 && !requireAuth(client, 'createRoom')) return

            // H002: ONLY use server-verified wallet — never trust client payload
            const walletAddress = authenticatedWallets[client.id] || null

            // Match mode validation (litepaper v2.1)
            const rounds = [1, 3, 5].includes(player.matchLength) ? player.matchLength : 1
            const matchMode = player.matchMode && MATCH_MODES[player.matchMode] ? player.matchMode : null

            if (wagerAmount > 0 && !isValidWager(wagerAmount, matchMode)) {
                client.emit('createRoomError', { reason: 'Invalid wager tier' })
                return
            }

            // H038: Verify creator has sufficient balance for wager
            if (wagerAmount > 0 && walletAddress) {
                try {
                    const balanceCheck = await verifyBalance(walletAddress, wagerAmount)
                    if (!balanceCheck.sufficient) {
                        client.emit('createRoomError', {
                            reason: `Insufficient SOL balance. Need ${balanceCheck.required.toFixed(3)}, have ${balanceCheck.balance.toFixed(3)}`
                        })
                        return
                    }
                } catch (err) {
                    console.warn('[Solana] Creator balance check skipped:', err.message)
                }
            }

            // H038: Require wallet for wagered rooms
            if (wagerAmount > 0 && !walletAddress) {
                client.emit('createRoomError', { reason: 'Wallet required for wagered matches' })
                return
            }
            if (matchMode) {
                const modeCheck = validateMatchMode(matchMode, wagerAmount, rounds)
                if (!modeCheck.valid) {
                    client.emit('createRoomError', { reason: modeCheck.reason })
                    return
                }
            }

            const roomId = crypto.randomBytes(4).toString('hex')
            client.join(roomId)
            client.roomId = roomId
            client.isHost = true
            // H017: Sanitize player name
            var host = {name: sanitizeName(player.name), color: player.color, socketId: client.id, isReady: false, playAgain: false}

            const roomData = {roomId: roomId, host: host, active: false}

            wagerStates[roomId] = {
                amount: wagerAmount,
                wallets: { [client.id]: walletAddress }
            }
            roomData.wager = wagerAmount
            roomData.matchMode = matchMode
            const roundType = rounds === 5 ? 'BO5' : rounds === 3 ? 'BO3' : '1'
            matchStates[roomId] = createMatchState(roomId, roundType);
            roomData.totalRounds = rounds

            // Persist to DB (only if connected — otherwise pure in-memory)
            if (isDbConnected()) {
                try {
                    const match = await Match.create({
                        roomCode: roomId,
                        host: {
                            username: player.name,
                            socketId: client.id,
                            color: player.color,
                            isReady: false,
                            playAgain: false
                        },
                        status: 'lobby',
                        active: false
                    });
                    roomData._matchId = match._id;
                } catch (err) {
                    // DB error — still works in-memory
                    console.warn('Match not persisted to DB:', err.message);
                }
            }

            rooms.set(roomId, roomData)
            trackMatchCreated()
            if (wagerAmount > 0) trackWager(wagerAmount * 2)  // Both players wager
            broadcastRooms(io)
        })



        // ── Queue-based matchmaking (standard modes: practice, quick_match, duel, high_roller) ──
        client.on('joinQueue', async (data) => {
            if (!data || typeof data !== 'object') return;
            const { matchMode, matchLength, wager: wagerAmount, playerName, tankColor } = data;

            // custom_challenge bypasses the queue — must use createRoom
            if (matchMode === 'custom_challenge') {
                client.emit('queueError', { reason: 'Custom Challenge uses room codes, not the queue' });
                return;
            }

            // Validate mode + wager via existing helper
            const validation = validateMatchMode(matchMode, wagerAmount, matchLength);
            if (!validation.valid) {
                client.emit('queueError', { reason: validation.reason });
                return;
            }

            // Remove from any existing queue before re-queuing
            removeFromAllQueues(client.id);

            const queueKey = getQueueKey(matchMode, matchLength);
            if (!matchmakingQueues.has(queueKey)) {
                matchmakingQueues.set(queueKey, []);
            }
            const queue = matchmakingQueues.get(queueKey);

            if (queue.length > 0) {
                // Match found — pop opponent from queue
                const opponent = queue.shift();
                if (queue.length === 0) matchmakingQueues.delete(queueKey);

                // Auto-create room — mirrors createRoom + joinRoom exactly
                const roomId = crypto.randomBytes(4).toString('hex');
                const roundType = matchLength === 5 ? 'BO5' : matchLength === 3 ? 'BO3' : '1';

                const hostEntry = { name: opponent.name, color: opponent.color, socketId: opponent.socketId, isReady: false, playAgain: false };
                const playerEntry = { name: sanitizeName(playerName), color: tankColor, socketId: client.id, isReady: false, playAgain: false };

                const roomData = {
                    roomId,
                    host: hostEntry,
                    player: playerEntry,
                    active: true,
                    wager: wagerAmount,
                    matchMode,
                    totalRounds: matchLength,
                };

                wagerStates[roomId] = {
                    amount: wagerAmount,
                    wallets: {
                        [opponent.socketId]: opponent.wallet,
                        [client.id]: authenticatedWallets[client.id] || null,
                    },
                };

                matchStates[roomId] = createMatchState(roomId, roundType);
                rooms.set(roomId, roomData);

                // Join both sockets to the Socket.IO room
                const opponentSocket = io.sockets.sockets.get(opponent.socketId);
                if (opponentSocket) {
                    opponentSocket.roomId = roomId;
                    opponentSocket.isHost = true;
                    opponentSocket.name = opponent.name;
                    opponentSocket.color = opponent.color;
                    opponentSocket.join(roomId);
                }
                client.roomId = roomId;
                client.isHost = false;
                client.name = sanitizeName(playerName);
                client.color = tankColor;
                client.join(roomId);

                trackMatchCreated();
                if (wagerAmount > 0) trackWager(wagerAmount * 2);
                broadcastRooms(io);

                // Escrow creation for wagered queue matches
                const joinerWallet = authenticatedWallets[client.id] || null;
                if (wagerAmount > 0 && isEscrowEnabled() && opponent.wallet && joinerWallet) {
                    try {
                        const escrowResult = await createMatchEscrow(roomId, wagerAmount, opponent.wallet, joinerWallet);
                        if (escrowResult.success) {
                            roomData.escrowPDA = escrowResult.escrowPDA;
                            const [hostDeposit, joinerDeposit] = await Promise.all([
                                buildDepositTransaction(roomId, opponent.wallet),
                                buildDepositTransaction(roomId, joinerWallet),
                            ]);
                            if (opponentSocket && hostDeposit.success) {
                                opponentSocket.emit('escrowDeposit', { roomId, transaction: hostDeposit.transaction, escrowPDA: escrowResult.escrowPDA, wager: wagerAmount });
                            }
                            if (joinerDeposit.success) {
                                client.emit('escrowDeposit', { roomId, transaction: joinerDeposit.transaction, escrowPDA: escrowResult.escrowPDA, wager: wagerAmount });
                            }
                        } else {
                            console.error(`[Queue] Escrow creation failed for ${roomId}:`, escrowResult.error);
                        }
                    } catch (err) {
                        console.error(`[Queue] Escrow error for ${roomId}:`, err.message);
                    }
                }

                // Emit queueMatched to both players so client can clear searching UI
                const matchData = {
                    roomId,
                    matchMode,
                    matchLength,
                    wager: wagerAmount,
                    host: { name: opponent.name, color: opponent.color },
                    player: { name: sanitizeName(playerName), color: tankColor },
                    isHost: false, // from joiner's perspective
                };
                if (opponentSocket) {
                    opponentSocket.emit('queueMatched', { ...matchData, isHost: true });
                }
                client.emit('queueMatched', matchData);

                // Emit startPick — same final event as manual joinRoom flow
                io.sockets.in(roomId).emit('startPick', { host: hostEntry, player: playerEntry, wager: wagerAmount });

                console.log(`[Queue] Matched: ${opponent.name} vs ${sanitizeName(playerName)} in ${matchMode} (${roundType}) @ ${wagerAmount} SOL — room ${roomId}`);
            } else {
                // No match available — add to queue
                const sanitizedName = sanitizeName(playerName);
                queue.push({
                    socketId: client.id,
                    wallet: authenticatedWallets[client.id] || null,
                    name: sanitizedName,
                    color: tankColor,
                    wager: wagerAmount,
                    format: matchLength,
                    matchMode,
                    queuedAt: Date.now(),
                });
                client.emit('queueWaiting', { matchMode, matchLength, position: queue.length });
                console.log(`[Queue] ${sanitizedName} queued for ${matchMode} (${matchLength}) @ ${wagerAmount} SOL — ${queue.length} waiting`);
            }
        });

        client.on('leaveQueue', () => {
            removeFromAllQueues(client.id);
            client.emit('queueLeft');
            console.log(`[Queue] Player ${client.id} left queue`);
        });



        client.on('ready', () => {
            var room = findRoom(client.roomId)
            if (!room) return

            // H019: Validate ready is allowed in current state
            const msReady = matchStates[client.roomId]
            if (msReady && !validateAction(msReady.status, 'ready')) {
                client.emit('readyError', { reason: `Cannot ready during ${msReady.status}` })
                return
            }

            // Track readiness
            if (client.isHost === true) {
                room.host.isReady = true
            } else {
                if (!room.player) return
                room.player.isReady = true
            }

            // Both players ready — start shop phase
            if (room.host.isReady && room.player && room.player.isReady) {
                const hostId = room.host.socketId
                const playerId = room.player.socketId
                const ms = matchStates[client.roomId]
                const isBetweenRounds = ms && ms.status === MATCH_STATES.ROUND_END

                if (isBetweenRounds) {
                    // ── Between-round shop: preserve gold + inventories ──
                    // Gold carries over — do NOT call initGold()
                    // Inventories carry over — do NOT reinitialize
                    console.log(`[BO3] Between-round shop: Round ${ms.currentRound} ended. Gold: host=${getBalance(goldStates[client.roomId], hostId)}, player=${getBalance(goldStates[client.roomId], playerId)}`)
                } else {
                    // ── First shop (from lobby): initialize everything ──
                    goldStates[client.roomId] = initGold(hostId, playerId)
                    const hostPrestige = getPrestigeInfo(authenticatedWallets[hostId] || '')
                    const playerPrestige = getPrestigeInfo(authenticatedWallets[playerId] || '')
                    weaponInventories[client.roomId] = {
                        [hostId]: [0, ...(hostPrestige.unlockedWeapons || [])],
                        [playerId]: [0, ...(playerPrestige.unlockedWeapons || [])]
                    }
                }

                // Reset shop readiness for both paths
                shopReady[client.roomId] = {
                    [hostId]: false,
                    [playerId]: false
                }

                // Transition match state to weapon_shop
                if (ms) {
                    transitionState(ms, MATCH_STATES.WEAPON_SHOP)
                }

                // Emit shopPhase with weapon catalog, Gold balance, and inventories
                const weapons = getAllLaunchWeapons()
                const inv = weaponInventories[client.roomId] || {}
                io.sockets.in(client.roomId).emit('shopPhase', {
                    weapons,
                    goldBalance: {
                        [hostId]: getBalance(goldStates[client.roomId], hostId),
                        [playerId]: getBalance(goldStates[client.roomId], playerId)
                    },
                    inventory: {
                        [hostId]: inv[hostId] || [0],
                        [playerId]: inv[playerId] || [0]
                    },
                    timer: SHOP_DURATION,
                    totalRounds: ms ? ms.maxRounds : 1,
                    round: ms ? ms.currentRound + 1 : 1
                })

                // Start shop timer — auto-end shop after SHOP_DURATION seconds
                if (shopTimers[client.roomId]) clearTimeout(shopTimers[client.roomId])
                shopTimers[client.roomId] = setTimeout(() => {
                    endShopPhase(io, client.roomId)
                }, SHOP_DURATION * 1000)

                // Also emit startGame for backward compatibility
                io.sockets.in(client.roomId).emit('startGame', {})
                room.player.isReady = false
                room.host.isReady = false
            }
        })



        // === GOLD ECONOMY EVENTS (Phase 3) ===

        // Client buys a weapon during shop phase
        client.on('buyWeapon', (data) => {
            // H015: Null payload guard
            if (!data || typeof data !== 'object') return
            const { weaponId } = data

            const room = findRoom(client.roomId)
            if (!room) return

            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'buyWeapon')) {
                client.emit('buyWeaponResult', { success: false, reason: `Cannot buy during ${ms.status}` })
                return
            }

            // Validate weapon exists in catalog
            const weapon = getWeapon(weaponId)
            if (!weapon) {
                client.emit('buyWeaponResult', { success: false, reason: 'Unknown weapon' })
                return
            }

            // Check if already owned
            const inventory = weaponInventories[client.roomId]
            if (inventory && inventory[client.id] && inventory[client.id].includes(weaponId)) {
                client.emit('buyWeaponResult', { success: false, reason: 'Already owned' })
                return
            }

            // Try to spend Gold
            const gold = goldStates[client.roomId]
            if (!gold) {
                client.emit('buyWeaponResult', { success: false, reason: 'No Gold state' })
                return
            }

            const result = spendGold(gold, client.id, weapon.goldCost)
            if (!result.success) {
                client.emit('buyWeaponResult', { success: false, reason: result.reason, balance: result.balance })
                return
            }

            // Add to inventory
            if (!inventory[client.id]) inventory[client.id] = [0]
            inventory[client.id].push(weaponId)

            // Send result to buyer
            client.emit('buyWeaponResult', {
                success: true,
                weaponId,
                weapon,
                balance: result.balance,
                inventory: inventory[client.id]
            })

            // Notify opponent of purchase (they see opponent bought something)
            client.to(client.roomId).emit('opponentBoughtWeapon', {
                playerId: client.id,
                weaponId,
                weaponName: weapon.name
            })
        })

        // Client done shopping
        client.on('shopDone', () => {
            const room = findRoom(client.roomId)
            if (!room) return

            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'shopDone')) return

            const ready = shopReady[client.roomId]
            if (!ready) return

            ready[client.id] = true

            // Check if both players are done
            const hostId = room.host ? room.host.socketId : null
            const playerId = room.player ? room.player.socketId : null

            if (hostId && playerId && ready[hostId] && ready[playerId]) {
                endShopPhase(io, client.roomId)
            }
        })


        // === SHOT TOKEN & PRESTIGE EVENTS (Phase 6) ===

        // Get SHOT balance and prestige info
        client.on('getShotInfo', () => {
            const wallet = authenticatedWallets[client.id] || null
            if (!wallet) {
                client.emit('shotInfo', { balance: 0, prestige: { tier: 0, tierName: 'Unranked' }, tiers: PRESTIGE_TIERS })
                return
            }
            const info = getPrestigeInfo(wallet)
            client.emit('shotInfo', {
                balance: getShotBalance(wallet),
                prestige: info,
                tiers: PRESTIGE_TIERS
            })
        })

        // Fetch persistent player stats from DB
        client.on('getStats', async () => {
            const wallet = authenticatedWallets[client.id] || null
            const defaultStats = { matchesPlayed: 0, wins: 0, losses: 0, totalSolWon: 0, totalSolLost: 0, totalShotEarned: 0, shotBurned: 0, prestigeTier: 0 }
            if (!wallet || !isDbConnected()) {
                client.emit('statsData', defaultStats)
                return
            }
            try {
                const user = await User.findOne({ walletAddress: wallet })
                client.emit('statsData', user?.stats || defaultStats)
            } catch (err) {
                console.error('[Stats] getStats error:', err.message)
                client.emit('statsData', defaultStats)
            }
        })

        // Burn SHOT to prestige up (with on-chain burn verification)
        client.on('prestigeBurn', async (data) => {
            const wallet = authenticatedWallets[client.id] || null
            if (!wallet) {
                client.emit('prestigeResult', { success: false, reason: 'Not authenticated' })
                return
            }

            const { txSignature, burnAmount } = data || {}
            if (!txSignature) {
                client.emit('prestigeResult', { success: false, reason: 'No burn transaction provided' })
                return
            }

            try {
                // Verify the burn transaction on-chain
                const verification = await verifyBurnTransaction(txSignature, wallet, burnAmount)

                if (!verification.valid) {
                    client.emit('prestigeResult', { success: false, reason: verification.reason || 'Burn verification failed' })
                    return
                }

                // Burn verified — unlock the tier
                const result = prestigeBurn(wallet)
                if (result.success) {
                    const tier = PRESTIGE_TIERS[result.tier]
                    if (tier) trackShotBurn(tier.burnCost)
                    console.log(`[Prestige] On-chain burn verified: ${wallet} → Tier ${result.tier} (${result.tierName}), tx: ${txSignature}`)
                }
                client.emit('prestigeResult', result)
            } catch (err) {
                console.error('[Prestige] Burn verification error:', err.message)
                client.emit('prestigeResult', { success: false, reason: 'Burn verification error' })
            }
        })


        // === EXISTING RELAY EVENTS (kept for backward compatibility) ===

        client.on('weaponPick', (data) => {
            if (!data || typeof data !== 'object') return
            const { arrayIndex } = data
            client.to(client.roomId).emit('opponentWeaponPick', {arrayIndex})
        })



        client.on('getWeaponArray', () => {
            var room = findRoom(client.roomId)
            if (room && room.randomArray !== undefined && room.randomArray !== null)
                client.emit('setWeaponArray', ({randomArray: room.randomArray}))
        })



        client.on('createWeaponArray', (data) => {
            // H015: Null payload guard
            if (!data || typeof data !== 'object') return
            const { count, max } = data

            var room = findRoom(client.roomId)
            if (!room) return

            // H013: Validate and cap count to prevent memory exhaustion
            if (typeof count !== 'number' || typeof max !== 'number') return
            const safeCount = Math.min(Math.max(0, Math.floor(count)), 100)
            const safeMax = Math.max(1, Math.floor(max))

            // O9: Use crypto.randomBytes for better entropy (wagered game integrity)
            const randomBytes = crypto.randomBytes(safeCount * 4)
            var randomArray = []
            for (let index = 0; index < safeCount; index++) {
                const val = randomBytes.readUInt32LE(index * 4)
                randomArray.push(val % safeMax)
            }

            room.randomArray = randomArray
            persistRoom(room);
            io.sockets.in(client.roomId).emit('setWeaponArray', {randomArray: room.randomArray})
        })



        // LEGACY: shoot relay (still works — client sends, server relays to opponent)
        // H024: Add state validation + sanitize relayed fields
        client.on('shoot', (data) => {
            if (!data || typeof data !== 'object') return

            // Only allow during battle state
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'shoot')) return

            // Sanitize numeric fields before relay
            const { selectedWeapon, power, rotation, rotation1, rotation2, position1, position2 } = data
            if (!Number.isFinite(power) || !Number.isFinite(rotation)) return

            client.to(client.roomId).emit('opponentShoot', {
                selectedWeapon: Number.isFinite(selectedWeapon) ? selectedWeapon : 0,
                power,
                rotation,
                rotation1: Number.isFinite(rotation1) ? rotation1 : 0,
                rotation2: Number.isFinite(rotation2) ? rotation2 : 0,
                position1: Number.isFinite(position1) ? position1 : 0,
                position2: Number.isFinite(position2) ? position2 : 0
            })
        })


        // === ESCROW: Deposit confirmation from client ===
        // Client signs the deposit TX and sends back the signature
        client.on('escrowDepositConfirm', async (data) => {
            if (!data || typeof data !== 'object') return
            const { roomId: rid, txSignature } = data
            if (!rid || !txSignature) return

            const room = findRoom(rid)
            if (!room) return

            const ws = wagerStates[rid]
            if (!ws) return

            // Track which players have confirmed deposits
            if (!ws.deposits) ws.deposits = {}
            ws.deposits[client.id] = txSignature

            const hostDeposited = ws.deposits[room.host?.socketId]
            const playerDeposited = ws.deposits[room.player?.socketId]

            console.log(`[Escrow] Deposit confirmed: ${client.id} for room ${rid} (TX: ${txSignature})`)

            if (hostDeposited && playerDeposited) {
                // Both players deposited — escrow is now active
                console.log(`[Escrow] Both deposits confirmed for room ${rid} — match is escrowed`)
                io.sockets.in(rid).emit('escrowActive', {
                    roomId: rid,
                    escrowPDA: room.escrowPDA,
                    totalPot: ws.amount * 2,
                })
            }
        })

        // === NEW: Server-authoritative fire event (Task 2.5) ===
        // Client sends input only → server runs physics → broadcasts results to both
        // H062: Wrap fire handler in safeHandler for unhandled rejection protection
        client.on('fire', safeHandler(async function(data) {
            // H015: Null payload guard
            if (!data || typeof data !== 'object') {
                this.emit('fireRejected', { reason: 'Missing payload' })
                return
            }

            // H009: Validate fire parameters (type + range)
            const paramCheck = validateFireParams(data)
            if (!paramCheck.valid) {
                this.emit('fireRejected', { reason: paramCheck.reason })
                return
            }
            const { angle, power, weaponId } = data

            const room = findRoom(this.roomId)
            if (!room) return

            const ms = matchStates[this.roomId]

            // Task 2.8: Turn validation
            if (ms) {
                // Validate action is allowed in current state
                if (!validateAction(ms.status, 'fire')) {
                    this.emit('fireRejected', { reason: `Cannot fire during ${ms.status}` })
                    return
                }

                // Validate it's this player's turn
                if (ms.currentTurn && ms.currentTurn !== this.id) {
                    this.emit('fireRejected', { reason: 'Not your turn' })
                    return
                }

                // Fix 4: Nonce/idempotency — prevent replay from Socket.IO retries
                const clientSeq = data.seq
                if (clientSeq !== undefined) {
                    if (clientSeq !== ms.turnSequence) {
                        this.emit('fireRejected', { reason: 'Turn sequence mismatch (possible replay)' })
                        return
                    }
                }
                // Increment server-side nonce (client must send matching seq next turn)
                ms.turnSequence++

                // Validate weapon exists
                if (!WEAPON_DATA[weaponId]) {
                    this.emit('fireRejected', { reason: 'Invalid weapon' })
                    return
                }

                // H039: Validate weapon is in player's inventory
                const inventory = weaponInventories[this.roomId]
                if (inventory && inventory[this.id]) {
                    if (!inventory[this.id].includes(weaponId)) {
                        this.emit('fireRejected', { reason: 'Weapon not owned' })
                        return
                    }
                }

                // LP-08: Reset consecutive timeout counter on successful fire
                if (ms.consecutiveTimeouts) {
                    ms.consecutiveTimeouts[this.id] = 0
                }
            }

            // H012/H036: Use SERVER-stored positions, NOT client-supplied
            const isHost = room.host && room.host.socketId === this.id
            const serverPos = isHost ? room.host.pos : (room.player ? room.player.pos : null)
            if (!serverPos) {
                this.emit('fireRejected', { reason: 'No position data' })
                return
            }

            // Accept client-reported position to handle movement sync
            // Client pixel-walks terrain surface which may differ from server heightmap snap
            // Validate within tolerance (4 steps * ~80px + margin)
            let startX = serverPos.x
            let startY = serverPos.y
            if (data.position && typeof data.position === 'object' &&
                Number.isFinite(data.position.x) && Number.isFinite(data.position.y)) {
                const dx = Math.abs(data.position.x - serverPos.x)
                const dy = Math.abs(data.position.y - serverPos.y)
                if (dx <= 400 && dy <= 200) {
                    startX = data.position.x
                    startY = data.position.y
                    serverPos.x = startX
                    serverPos.y = startY
                }
            }

            // Build tank positions for physics
            const tanks = []
            if (room.host && room.host.pos) {
                tanks.push({
                    id: room.host.socketId,
                    x: room.host.pos.x,
                    y: room.host.pos.y,
                    width: 40,
                    height: 30
                })
            }
            if (room.player && room.player.pos) {
                tanks.push({
                    id: room.player.socketId,
                    x: room.player.pos.x,
                    y: room.player.pos.y,
                    width: 40,
                    height: 30
                })
            }

            // Get terrain heightmap (from room or default)
            const terrain = room.heightmap || new Array(1200).fill(400)

            trackShot()

            // Run server physics
            console.log('[Fire] tanks:', tanks.map(t => ({ id: t.id.slice(0,8), x: Math.round(t.x), y: Math.round(t.y) })))
            const result = processShot({
                angle,
                power,
                weaponId,
                startX,
                startY,
                shooterId: this.id,
                terrain,
                tanks,
                wind: room.wind || 0
            })
            console.log('[Fire] impact:', result.impact, 'damage:', result.damage)

            // Update server terrain state
            room.heightmap = result.newTerrain

            // Update tank Y positions to match deformed terrain
            // Without this, next shot starts from old position which may be inside terrain
            if (room.host && room.host.pos) {
                const hx = Math.min(1199, Math.max(0, Math.floor(room.host.pos.x)))
                room.host.pos.y = result.newTerrain[hx] - 15  // -15 for tank height offset
            }
            if (room.player && room.player.pos) {
                const px = Math.min(1199, Math.max(0, Math.floor(room.player.pos.x)))
                room.player.pos.y = result.newTerrain[px] - 15
            }

            // Update match state + Gold
            let goldEarned = 0
            if (ms) {
                // Update scores — track damage DEALT by shooter to opponents
                for (const [playerId, dmg] of Object.entries(result.damage)) {
                    // playerId = who RECEIVED damage, this.id = who FIRED
                    if (playerId !== this.id && dmg > 0) {
                        ms.scores[this.id] = (ms.scores[this.id] || 0) + dmg
                    }
                }

                // Update HP — apply absolute damage to each affected player
                for (const [playerId, dmg] of Object.entries(result.damage)) {
                    if (ms.hp[playerId] === undefined) ms.hp[playerId] = 250
                    const hpBefore = ms.hp[playerId]
                    ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))
                    // Track kill: if opponent HP dropped to 0 from this shot
                    if (hpBefore > 0 && ms.hp[playerId] <= 0 && playerId !== this.id) {
                        ms.kills[this.id] = (ms.kills[this.id] || 0) + 1
                    }
                }

                // Calculate Gold earned from damage dealt to opponent
                const gold = goldStates[this.roomId]
                if (gold) {
                    // Find opponent's damage (positive values = damage to opponent)
                    for (const [playerId, dmg] of Object.entries(result.damage)) {
                        if (playerId !== this.id && dmg > 0) {
                            goldEarned += earnGold(gold, this.id, dmg)
                        }
                    }
                }

                // Advance turn
                ms.turnCount++
                const hostId = room.host.socketId
                const playerId = room.player ? room.player.socketId : null
                ms.currentTurn = playerId ? getNextTurn(ms, hostId, playerId) : null

                // LP-07: Reset move count for the new current turn player
                if (ms.moveCounts && ms.currentTurn) {
                    ms.moveCounts[ms.currentTurn] = 0
                }
            }

            // Track damage and gold
            for (const [, dmg] of Object.entries(result.damage)) {
                if (dmg > 0) trackDamage(dmg)
            }
            if (goldEarned > 0) trackGoldEarned(goldEarned)

            // Broadcast turn result to BOTH players (includes goldEarned + balances)
            io.sockets.in(this.roomId).emit('turnResult', {
                playerId: this.id,
                weaponId,
                trajectory: result.trajectory,
                impact: result.impact,
                damage: result.damage,
                terrainUpdate: result.newTerrain,
                scores: ms ? ms.scores : {},
                hp: ms ? ms.hp : {},
                nextTurn: ms ? ms.currentTurn : null,
                seq: ms ? ms.turnSequence : 0,  // Fix 4: client must echo this in next fire
                goldEarned,
                goldBalance: goldStates[this.roomId] || {},
                tankPositions: {
                    host: room.host ? { x: room.host.pos.x, y: room.host.pos.y } : null,
                    player: room.player ? { x: room.player.pos.x, y: room.player.pos.y } : null,
                    hostId: room.host ? room.host.socketId : null,
                },
                scatterPoints: result.scatterPoints || null,
                subTrajectories: result.subTrajectories || null,
                spiderLegs: result.spiderLegs || null,
                tunnelEntry: result.tunnelEntry || null,
                tunnelExit: result.tunnelExit || null
            })

            // Restart turn timer for the next player
            if (ms && !isRoundOver(ms)) {
                startTurnTimer(io, this.roomId)
            }

            // Check if round is over
            if (ms && isRoundOver(ms)) {
                clearTurnTimer(this.roomId)
                const hostId = room.host.socketId
                const playerId = room.player ? room.player.socketId : null
                const roundWinner = getRoundWinner(ms, hostId, playerId)

                ms.roundWins[roundWinner] = (ms.roundWins[roundWinner] || 0) + 1
                ms.currentRound++

                const matchResult = isMatchOver(ms, hostId, playerId)

                // Award round win Gold bonus
                const gold = goldStates[this.roomId]
                if (gold) {
                    awardRoundWinBonus(gold, roundWinner)
                }

                // Delay round/match end emit so client can animate the killing blow
                const ROUND_END_DELAY = 3000 // 3 seconds for final blast animation
                const roomId = this.roomId
                const socketId = this.id

                if (matchResult.isOver) {
                    // H068/H020: Transition to SETTLING — if fails, another handler already settled
                    const transitioned = transitionState(ms, MATCH_STATES.SETTLING)
                    if (!transitioned) return

                    // H020: Use lock to prevent concurrent settlement
                    await withLock(`settle:${this.roomId}`, async () => {
                        // Re-check state inside lock
                        if (ms.status !== MATCH_STATES.SETTLING) return

                        // === SOL SETTLEMENT (Phase 4) ===
                        let settlementInfo = null
                        const ws = wagerStates[this.roomId]
                        if (ws && ws.amount > 0) {
                            const winnerWallet = ws.wallets[matchResult.winner] || null
                            const loserId = matchResult.winner === hostId ? playerId : hostId
                            const loserWallet = ws.wallets[loserId] || null
                            if (winnerWallet && loserWallet) {
                                try {
                                    const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount, roomId)
                                    settlementInfo = {
                                        wager: ws.amount,
                                        totalPot: ws.amount * 2,
                                        winnerPayout: sResult.settlement.winner,
                                        treasuryFee: sResult.settlement.treasury,
                                        opsFee: sResult.settlement.ops,
                                        txSignature: sResult.txSignature
                                    }
                                    console.log('[Solana] Match settled:', settlementInfo)
                                    // H064: Only transition to COMPLETE on success
                                    transitionState(ms, MATCH_STATES.COMPLETE)
                                } catch (err) {
                                    console.error('[Solana] Settlement error:', err.message)
                                    settlementInfo = { error: err.message, wager: ws.amount }
                                    // H064: Transition to CANCELLED on error, NOT COMPLETE
                                    transitionState(ms, MATCH_STATES.CANCELLED)
                                    trackError(err, 'settlement')
                                }
                            } else {
                                // No wallets — no wager settlement needed
                                transitionState(ms, MATCH_STATES.COMPLETE)
                            }
                        } else {
                            // No wager — go straight to COMPLETE
                            transitionState(ms, MATCH_STATES.COMPLETE)
                        }

                        trackMatchCompleted()
                        if (settlementInfo && !settlementInfo.error) {
                            trackSettlement(settlementInfo)
                        }

                        // === SHOT TOKEN MILESTONES (Phase 6) ===
                        const shotResults = {}
                        const wsState = wagerStates[this.roomId]
                        // H033: Pass match info for farming protection
                        const matchInfo = { turnCount: ms.turnCount, matchId: `${this.roomId}:${ms.currentRound}:${Date.now()}` }
                        // Record match for both players (use wallet if available)
                        const hostWallet = wsState?.wallets?.[hostId] || authenticatedWallets[hostId] || null
                        const playerWallet = wsState?.wallets?.[playerId] || authenticatedWallets[playerId] || null
                        if (hostWallet) {
                            shotResults[hostId] = recordMatchPlayed(hostWallet, matchInfo)
                            if (shotResults[hostId].earned > 0) trackShotEmission(shotResults[hostId].earned)
                        }
                        if (playerWallet) {
                            shotResults[playerId] = recordMatchPlayed(playerWallet, matchInfo)
                            if (shotResults[playerId].earned > 0) trackShotEmission(shotResults[playerId].earned)
                        }

                        // Delay matchEnd emit so client can animate the killing blow
                        // Transform scores to client format: { [id]: { damageDealt, kills } }
                        const formattedScores = {}
                        for (const pid of [hostId, playerId]) {
                            if (pid) {
                                formattedScores[pid] = {
                                    damageDealt: ms.scores[pid] || 0,
                                    kills: ms.kills[pid] || 0
                                }
                            }
                        }
                        const matchEndPayload = {
                            winner: matchResult.winner,
                            scores: formattedScores,
                            roundWins: ms.roundWins,
                            goldBalance: goldStates[roomId] || {},
                            settlement: settlementInfo,
                            wager: ws ? ws.amount : 0,
                            shotEarned: shotResults
                        }
                        setTimeout(() => {
                            io.sockets.in(roomId).emit('matchEnd', matchEndPayload)
                        }, ROUND_END_DELAY)

                        // === PERSIST STATS TO DB (fire-and-forget) ===
                        if (isDbConnected()) {
                            const winnerId = matchResult.winner
                            const loserId = winnerId === hostId ? playerId : hostId
                            const winnerAddr = authenticatedWallets[winnerId] || wsState?.wallets?.[winnerId]
                            const loserAddr = authenticatedWallets[loserId] || wsState?.wallets?.[loserId]
                            const wagerAmt = ws ? ws.amount : 0
                            const solWonAmt = wagerAmt > 0 ? wagerAmt * 2 * 0.9 : 0 // 90% to winner after fees
                            const persistStats = async () => {
                                try {
                                    if (winnerAddr) {
                                        const winnerShotEarned = shotResults[winnerId]?.earned || 0
                                        await User.findOneAndUpdate(
                                            { walletAddress: winnerAddr },
                                            { $inc: { 'stats.matchesPlayed': 1, 'stats.wins': 1, 'stats.totalSolWon': solWonAmt, 'stats.totalShotEarned': winnerShotEarned }, $set: { lastActive: new Date() } },
                                            { upsert: true }
                                        )
                                    }
                                    if (loserAddr) {
                                        const loserShotEarned = shotResults[loserId]?.earned || 0
                                        await User.findOneAndUpdate(
                                            { walletAddress: loserAddr },
                                            { $inc: { 'stats.matchesPlayed': 1, 'stats.losses': 1, 'stats.totalSolLost': wagerAmt, 'stats.totalShotEarned': loserShotEarned }, $set: { lastActive: new Date() } },
                                            { upsert: true }
                                        )
                                    }
                                    console.log('[Stats] Persisted match stats for', winnerAddr?.slice(0,8), '(W) /', loserAddr?.slice(0,8), '(L)')
                                } catch (err) {
                                    console.error('[Stats] Failed to persist:', err.message)
                                }
                            }
                            persistStats() // fire-and-forget — don't await
                        }
                    })
                } else {
                    transitionState(ms, MATCH_STATES.ROUND_END)
                    // H023: Reset turnCount for next round
                    // LP-07: Reset move counts for next round
                    if (ms.moveCounts) ms.moveCounts = {}
                    resetForNextRound(ms)
                    // Delay roundEnd emit so client can animate the killing blow
                    const roundEndPayload = {
                        winner: roundWinner,
                        scores: ms.scores,
                        roundWins: ms.roundWins,
                        round: ms.currentRound,
                        totalRounds: ms.maxRounds,
                        goldBalance: goldStates[roomId] || {}
                    }
                    setTimeout(() => {
                        io.sockets.in(roomId).emit('roundEnd', roundEndPayload)
                    }, ROUND_END_DELAY)
                }
            }
        }))


        // === NEW: Server terrain generation (Task 2.9) ===
        // Both host and non-host emit requestTerrain. First request generates;
        // subsequent requests re-send cached terrain (fixes round 2 race condition).
        client.on('requestTerrain', () => {
            const room = findRoom(client.roomId)
            if (!room) return

            const ms = matchStates[client.roomId]

            // If terrain already generated for this round, re-send to requesting client only
            if (room._terrainCache) {
                console.log(`[Terrain] Re-sending cached terrain to ${client.id.slice(0,8)}`)
                client.emit('terrainGenerated', room._terrainCache)
                return
            }

            const seed = crypto.randomInt(1000000)
            const { path, heightmap } = generateTerrain(1200, 800, seed)
            const tankPositions = generateTankPositions(heightmap)
            const wind = generateWind()

            // Store server-side
            room.heightmap = heightmap
            room.terrainSeed = seed
            room.wind = wind
            if (room.host) room.host.pos = tankPositions.host
            if (room.player) room.player.pos = tankPositions.player

            // Initialize match state for battle
            if (ms) {
                ms.terrain = heightmap
                ms.tankPositions = tankPositions
                // Only transition if not already in battle (shop phase already transitions)
                if (ms.status !== MATCH_STATES.BATTLE) {
                    transitionState(ms, MATCH_STATES.BATTLE)
                }
                ms.currentTurn = getNextTurn(ms,
                    room.host ? room.host.socketId : null,
                    room.player ? room.player.socketId : null
                )
                // Initialize HP for both players
                if (room.host) ms.hp[room.host.socketId] = 250
                if (room.player) ms.hp[room.player.socketId] = 250

                // Start turn timer for the first turn
                startTurnTimer(io, client.roomId)
            }

            // Cache terrain payload for late-joining clients
            const terrainPayload = {
                path,
                heightmap,
                tankPositions,
                seed,
                wind,
                firstTurn: ms ? ms.currentTurn : null,
                seq: ms ? ms.turnSequence : 0  // Fix 4: initial nonce for first fire
            }
            room._terrainCache = terrainPayload

            // Send to both clients
            io.sockets.in(client.roomId).emit('terrainGenerated', terrainPayload)
        })



        client.on('weaponChange', (data) => {
            if (!data || typeof data !== 'object') return
            const { index } = data
            client.to(client.roomId).emit('opponentWeaponChange', {index})
        })



        client.on('angleChange', (data) => {
            if (!data || typeof data !== 'object') return
            const { rotation } = data
            client.to(client.roomId).emit('opponentAngleChange', {rotation: rotation})
        })



        client.on('powerChange', (data) => {
            if (!data || typeof data !== 'object') return
            const { power } = data
            client.to(client.roomId).emit('opponentPowerChange', {power: power})
        })

        // After blast knockback, client reports its new tank position
        client.on('positionUpdate', (data) => {
            if (!data || typeof data !== 'object') return
            const { x, y } = data
            if (!Number.isFinite(x) || !Number.isFinite(y)) return
            // Clamp to valid bounds
            const clampedX = Math.min(1199, Math.max(0, x))
            const clampedY = Math.min(800, Math.max(0, y))
            var room = findRoom(client.roomId)
            if (!room) return
            if (room.host && room.host.socketId === client.id) {
                room.host.pos.x = clampedX
                room.host.pos.y = clampedY
            } else if (room.player && room.player.socketId === client.id) {
                room.player.pos.x = clampedX
                room.player.pos.y = clampedY
            }
        })

        // LEGACY: terrain relay (still works for current client)
        // Fix 3: Validate positions to prevent cheater-injected coordinates
        // O6: Remove unnecessary spread copies — these are overwritten every call
        client.on('terrainPath', (data) => {
            if (!data || typeof data !== 'object') return
            const { path, hostPos, playerPos } = data

            var room = findRoom(client.roomId)
            if (!room || !room.host || !room.player) return

            // Validate path is an array with reasonable length
            if (!Array.isArray(path) || path.length === 0 || path.length > 2400) return

            // Validate positions are objects with finite numbers within canvas bounds
            // Canvas: 1200 x 800
            if (!hostPos || !playerPos) return
            if (!Number.isFinite(hostPos.x) || !Number.isFinite(hostPos.y)) return
            if (!Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.y)) return
            if (hostPos.x < 0 || hostPos.x > 1200 || hostPos.y < 0 || hostPos.y > 800) return
            if (playerPos.x < 0 || playerPos.x > 1200 || playerPos.y < 0 || playerPos.y > 800) return

            // O6: Assign directly — no spread needed, overwritten every call
            room.terrainPath = path
            room.host.pos = { x: hostPos.x, y: hostPos.y }
            room.player.pos = { x: playerPos.x, y: playerPos.y }

            // Also build heightmap from path for server physics
            const heightmap = new Array(1200).fill(800)
            const sorted = path.filter(p =>
                p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
                p.x >= 0 && p.x < 1200
            ).sort((a, b) => a.x - b.x)
            if (sorted.length > 1) {
                for (let i = 0; i < sorted.length - 1; i++) {
                    const p1 = sorted[i]
                    const p2 = sorted[i + 1]
                    const startX = Math.max(0, Math.floor(p1.x))
                    const endX = Math.min(1199, Math.floor(p2.x))
                    for (let x = startX; x <= endX; x++) {
                        const t = (p2.x - p1.x) !== 0 ? (x - p1.x) / (p2.x - p1.x) : 0
                        heightmap[x] = Math.floor(p1.y + t * (p2.y - p1.y))
                    }
                }
            }
            room.heightmap = heightmap

            // Snap positions to terrain surface (prevent floating/underground cheats)
            if (room.heightmap) {
                const hx = Math.min(1199, Math.max(0, Math.floor(room.host.pos.x)))
                const px = Math.min(1199, Math.max(0, Math.floor(room.player.pos.x)))
                room.host.pos.y = room.heightmap[hx]
                room.player.pos.y = room.heightmap[px]
            }

            persistRoom(room);
            client.to(client.roomId).emit('setTerrainPath', {path: room.terrainPath, hostPos: room.host.pos, playerPos: room.player.pos})
        })



        client.on('getTerrainPath', () => {
            var room = findRoom(client.roomId)
            if (room && room.terrainPath !== undefined && room.terrainPath !== null) {
                client.emit('setTerrainPath', {path: room.terrainPath})
            }
        })



        client.on('stepLeft', () => {
            if (!client.roomId) return
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'stepLeft')) return

            // LP-07: Server-side 4-step limit enforcement
            if (ms) {
                if (!ms.moveCounts) ms.moveCounts = {}
                const used = ms.moveCounts[client.id] || 0
                if (used >= 4) return  // Silent drop — client already prevents, server enforces
                ms.moveCounts[client.id] = used + 1
            }

            // Track movement server-side so fire handler uses correct position
            const room = findRoom(client.roomId)
            if (room) {
                const isHost = room.host && room.host.socketId === client.id
                const pos = isHost ? room.host.pos : (room.player ? room.player.pos : null)
                if (pos && room.heightmap) {
                    const newX = Math.max(0, Math.floor(pos.x - 80))
                    if (room.heightmap[newX] !== undefined) {
                        pos.x = newX
                        pos.y = room.heightmap[newX] - 15
                    }
                }
            }

            client.to(client.roomId).emit('opponentStepLeft', {})
        })



        client.on('stepRight', () => {
            if (!client.roomId) return
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'stepRight')) return

            // LP-07: Server-side 4-step limit enforcement
            if (ms) {
                if (!ms.moveCounts) ms.moveCounts = {}
                const used = ms.moveCounts[client.id] || 0
                if (used >= 4) return  // Silent drop — client already prevents, server enforces
                ms.moveCounts[client.id] = used + 1
            }

            // Track movement server-side so fire handler uses correct position
            const room = findRoom(client.roomId)
            if (room) {
                const isHost = room.host && room.host.socketId === client.id
                const pos = isHost ? room.host.pos : (room.player ? room.player.pos : null)
                if (pos && room.heightmap) {
                    const newX = Math.min(1199, Math.floor(pos.x + 80))
                    if (room.heightmap[newX] !== undefined) {
                        pos.x = newX
                        pos.y = room.heightmap[newX] - 15
                    }
                }
            }

            client.to(client.roomId).emit('opponentStepRight', {})
        })



        // LEGACY: turn relay (still works)
        client.on('giveTurn', (data) => {
            if (!data || typeof data !== 'object') return
            const { terrainData, pos1, pos2, rotation1, rotation2 } = data
            client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
        })




        client.on('requestTurn', () => {
            if (!client.roomId) return
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'requestTurn')) return
            client.to(client.roomId).emit('opponentRequestTurn', {})
        })



        client.on('playAgainRequest', () => {
            var room = findRoom(client.roomId)
            if (!room) return

            // H021/H073: Validate match state — only allow during COMPLETE or ROUND_END
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'playAgainRequest')) {
                client.emit('playAgainError', { reason: `Cannot play again during ${ms.status}` })
                return
            }

            // Derive roundType from room's totalRounds so playAgain preserves BO format
            const paRounds = room.totalRounds || 1
            const paRoundType = paRounds === 5 ? 'BO5' : paRounds === 3 ? 'BO3' : '1'

            if (client.isHost === true) {
                room.host.playAgain = true
                if (room.player && room.player.playAgain === true) {
                    delete room.randomArray
                    delete room.terrainPath
                    delete room.heightmap

                    // Reset match state, Gold, and inventories for new game
                    matchStates[client.roomId] = createMatchState(client.roomId, paRoundType)
                    delete goldStates[client.roomId]
                    delete weaponInventories[client.roomId]
                    delete shopReady[client.roomId]
                    // H037: Don't delete wagerStates — cleaned up by removeRoom or next createRoom
                    if (shopTimers[client.roomId]) {
                        clearTimeout(shopTimers[client.roomId])
                        delete shopTimers[client.roomId]
                    }

                    io.sockets.in(client.roomId).emit('playAgain', {})
                    room.player.playAgain = false
                    room.host.playAgain = false
                }
            }
            else {
                if (!room.player) return
                room.player.playAgain = true
                if (room.host.playAgain === true) {
                    delete room.randomArray
                    delete room.terrainPath
                    delete room.heightmap

                    // Reset match state, Gold, and inventories for new game
                    matchStates[client.roomId] = createMatchState(client.roomId, paRoundType)
                    delete goldStates[client.roomId]
                    delete weaponInventories[client.roomId]
                    delete shopReady[client.roomId]
                    // H037: Don't delete wagerStates — cleaned up by removeRoom or next createRoom
                    if (shopTimers[client.roomId]) {
                        clearTimeout(shopTimers[client.roomId])
                        delete shopTimers[client.roomId]
                    }

                    io.sockets.in(client.roomId).emit('playAgain', {})
                    room.player.playAgain = false
                    room.host.playAgain = false
                }
            }
        })
    })
}

export default mainsocket
