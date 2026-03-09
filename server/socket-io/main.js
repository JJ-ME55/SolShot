import crypto from 'crypto';
import mongoose from 'mongoose';
import { getShotPrice, startPricePolling } from '../services/jupiter-price.js';
import logger from '../services/logger.js';
import Match from '../models/Match.js';
import User from '../models/User.js';
import { processShot, generateTerrain, generateTankPositions, generateWind, WEAPON_DATA } from '../services/physics.js';
import { createMatchState, validateAction, transitionState, getNextTurn, isRoundOver, isMatchOver, getRoundPlacement, PLACEMENT_POINTS, resetForNextRound, MATCH_STATES } from '../services/match.js';
import { initGold, getBalance, earnGold, spendGold, awardKillBonus, awardRoundWinBonus, awardPlacementGold } from '../services/gold.js';
import { WEAPON_CATALOG, PRESTIGE_WEAPONS, getWeapon, getWeaponCost, getAllLaunchWeapons } from '../models/Weapon.js';
import { handleAuthenticate, verifyAuthMessage, verifyWalletSignature } from '../middleware/auth.js';
import { verifyBalance, isValidWager, settleMatch, refundWager, WAGER_TIERS, MATCH_MODES, validateMatchMode, isEscrowEnabled, createMatchEscrow, buildDepositTransaction, getEscrowState, startWithDepositorsEscrow } from '../services/solana.js';
import { cancelMatchEscrow } from '../services/escrow.js';
import { recordMatchPlayed, prestigeBurn, getPrestigeInfo, getShotBalance, PRESTIGE_TIERS, PRESTIGE_WEAPON_IDS, loadMilestoneState, saveMilestoneState, verifyBurnTransaction, getPlayerShotState, SHOT_MILESTONES } from '../services/shot-token.js';
import { trackConnection, trackDisconnection, trackMatchCreated, trackMatchCompleted, trackMatchCancelled, trackWager, trackSettlement, trackForfeit, trackShot, trackDamage, trackGoldEarned, trackShotEmission, trackShotBurn, trackError } from '../services/monitoring.js';
import { requireAuth, validatePayload, validateFireParams, sanitizeName, withLock, safeHandler } from '../middleware/guards.js';

// Profanity filter (server-side guard — mirrors client profanity.js)
const PROFANITY_WORDS = [
    'nigger','nigga','niggers','niggas','negro','nig','coon','darkie','darky','sambo',
    'jigaboo','porchmonkey','spade','pickaninny','golliwog','buckwheat','uncletom',
    'kike','kyke','jewbag','jewboy','heeb','hymie','yid','zhid','jewfag',
    'spic','spick','beaner','wetback','greaser','borderhopper',
    'chink','gook','slanteye','zipperhead','chinaman','chingchong','paki','raghead',
    'towelhead','cameljockey','sandnigger','muzzie','muzrat','jihadist',
    'redskin','injun','squaw','wagonburner',
    'mick','paddy','wop','dago','guinea','greaseball','kraut','polack',
    'gypo','pikey','tinker','halfbreed','mulatto','mongrel',
    'faggot','fag','faggy','dyke','lesbo','tranny','shemale','ladyboy','homo','sodomite',
    'battyboy','bugger','pansy','sissy',
    'retard','retarded','tard','spaz','spastic','mongoloid','mong','cripple','gimp',
    'fuck','fucker','fucked','fucking','fuckface','fuckhead','motherfucker','assfuck',
    'shit','shite','shithead','shitface','shitbag','shithole','bullshit',
    'bitch','biatch','bytch','biotch','bitchass',
    'cunt','kunt','dick','dickhead','dickface','dicksucker',
    'cock','cocksucker','cockhead','cockface',
    'pussy','penis','prick','asshole','arsehole','asswipe','assclown','asshat',
    'vagina','twat','snatch','clunge',
    'slut','slag','sket','whore','hooker','skank','hoe','thot',
    'cumslut','cumwhore','blowjob','handjob','gangbang','cumshot','dildo','buttfuck',
    'tits','titty','boob','boobs','nipple','nutsack','ballsack','schlong',
    'boner','cum','jizz','spunk','semen','wanker','wank','tosser','fap',
    'rape','rapist','molest','molester','pedo','pedophile','paedo','groomer',
    'kys','killself','killurself','killyourself','suicide','suicidal','selfharm',
    'lynch','genocide','massacre','decapitate','behead',
    'nazi','nazism','hitler','heil','siegheil','kkk','klan','kuklux',
    'aryan','whitepride','whitepower','1488','jihad','atomwaffen','boogaloo',
    'incel','femoid','foid','roastie',
    'admin','administrator','moderator','solshot','official','support','staff','developer','devteam',
    'cocaine','heroin','methamphetamine','crackhead','fentanyl',
    'dumbass','dipshit','dumbfuck','numbnuts','douchebag','scumbag','bellend','knobhead','gobshite',
];
const PROFANITY_RE = new RegExp(PROFANITY_WORDS.join('|'), 'i');

// Normalise leet speak for server-side profanity check
function normaliseName(text) {
    let s = text.toLowerCase()
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '')
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
        .replace(/8/g, 'b').replace(/@/g, 'a').replace(/\$/g, 's')
        .replace(/!/g, 'i').replace(/\+/g, 't');
    return s.replace(/(.)\1{2,}/g, '$1');
}
function isProfane(text) { return PROFANITY_RE.test(text) || PROFANITY_RE.test(normaliseName(text)); }

// Helper: check if MongoDB is connected before DB operations
function isDbConnected() {
    return mongoose.connection.readyState === 1; // 1 = connected
}

// Helper: find a player slot in room.players[] by socketId
function getPlayerSlot(room, socketId) {
    return (room.players || []).find(p => p.socketId === socketId) || null;
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

// Practice identity keyed by socketId → { uid, handle }
var playerUids = {}

// Disconnect/reconnect: pending timers keyed by walletAddress
var disconnectTimers = {}
// Pending reconnect info keyed by walletAddress → { roomId, isHost, socketId (old), name, color }
var pendingReconnects = {}

// Turn timers keyed by roomId
var turnTimers = {}

// DCA-01: Deposit countdown timers keyed by roomId — 5-minute window after escrow emit
const DEPOSIT_TIMEOUT_MS = 300_000  // 5 minutes — N-player deposit window (SRV-12)
var depositTimers = {}

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

// A7: Shared reset logic for playAgain — clears old wager state for rematch
function resetForPlayAgain(roomId, room, paRoundType, io) {
    delete room.randomArray
    delete room.terrainPath
    delete room.heightmap

    // Reset match state, Gold, and inventories for new game
    matchStates[roomId] = createMatchState(roomId, paRoundType, room.players.length)
    delete goldStates[roomId]
    delete weaponInventories[roomId]
    delete shopReady[roomId]
    // A7: Clear deposit state for rematch — preserve wager amount and wallets for new escrow round
    if (wagerStates[roomId]) {
        wagerStates[roomId].deposits = {}
        delete wagerStates[roomId].firstDepositorSocketId
        delete wagerStates[roomId].partialDecisionMaker
        delete wagerStates[roomId].nonDepositorSocketIds
        delete wagerStates[roomId].depositorSocketIds
    }
    if (shopTimers[roomId]) {
        clearTimeout(shopTimers[roomId])
        delete shopTimers[roomId]
    }

    io.sockets.in(roomId).emit('playAgain', {})
    room.players.forEach(p => { p.playAgain = false; })

    // Trigger fresh escrow round for wagered rematches
    const ws = wagerStates[roomId]
    if (ws && ws.amount > 0 && isEscrowEnabled()) {
        const allWallets = room.players.map(p => ws.wallets?.[p.socketId]).filter(Boolean)
        if (allWallets.length === room.players.length) {
            ;(async () => {
                try {
                    const escrowResult = await createMatchEscrow(roomId, ws.amount, allWallets)
                    if (escrowResult.success) {
                        room.escrowPDA = escrowResult.escrowPDA
                        console.log(`[Match] PlayAgain escrow created for room ${roomId}: ${escrowResult.escrowPDA}`)

                        const depositTxs = await Promise.all(
                            room.players.map(p => buildDepositTransaction(roomId, ws.wallets?.[p.socketId]))
                        )
                        const depositDeadline = Date.now() + DEPOSIT_TIMEOUT_MS
                        room.players.forEach((p, i) => {
                            const sock = io.sockets.sockets.get(p.socketId)
                            if (sock && depositTxs[i]?.success) {
                                sock.emit('escrowDeposit', {
                                    roomId,
                                    transaction: depositTxs[i].transaction,
                                    escrowPDA: escrowResult.escrowPDA,
                                    wager: ws.amount,
                                    depositDeadlineMs: depositDeadline,
                                })
                            }
                        })
                        // Start deposit timer with partial deposit flow (same as joinRoom)
                        depositTimers[roomId] = setTimeout(async () => {
                            delete depositTimers[roomId]
                            const wsCheck = wagerStates[roomId]
                            const roomCheck = findRoom(roomId)
                            if (!roomCheck || !wsCheck) return
                            const numDep = Object.keys(wsCheck.deposits || {}).length
                            if (numDep === roomCheck.players.length) return
                            if (numDep === 0) {
                                const cancelWals = roomCheck.players.map(p => wsCheck.wallets[p.socketId]).filter(Boolean)
                                if (cancelWals.length > 0 && isEscrowEnabled()) {
                                    await cancelMatchEscrow(roomId, cancelWals).catch(e => console.error(`[Escrow] PlayAgain timeout cancel: ${e.message}`))
                                }
                                io.sockets.in(roomId).emit('escrowDepositTimeout', { roomId })
                                await removeRoom(roomId)
                                broadcastRooms(io)
                                io.socketsLeave(roomId)
                                return
                            }
                            // Partial deposit branch
                            const depSids = roomCheck.players.filter(p => wsCheck.deposits?.[p.socketId]).map(p => p.socketId)
                            const nonDepSids = roomCheck.players.filter(p => !wsCheck.deposits?.[p.socketId]).map(p => p.socketId)
                            const decMaker = wsCheck.firstDepositorSocketId || roomCheck.players[0].socketId
                            wsCheck.partialDecisionMaker = decMaker
                            wsCheck.depositorSocketIds = depSids
                            wsCheck.nonDepositorSocketIds = nonDepSids
                            const depWals = roomCheck.players.filter(p => wsCheck.deposits?.[p.socketId]).map(p => wsCheck.wallets[p.socketId]).filter(Boolean)
                            io.to(decMaker).emit('escrowPartialDeposit', { roomId, numDeposited: depSids.length, totalPlayers: roomCheck.players.length, depositorWallets: depWals, canStart: depSids.length >= 2, decisionWindowMs: 30_000 })
                            depositTimers[roomId] = setTimeout(async () => {
                                delete depositTimers[roomId]
                                const ws3 = wagerStates[roomId]; const r3 = findRoom(roomId)
                                if (!ws3 || !r3 || !ws3.partialDecisionMaker) return
                                const refWals = r3.players.filter(p => ws3.deposits?.[p.socketId]).map(p => ws3.wallets[p.socketId]).filter(Boolean)
                                if (isEscrowEnabled() && refWals.length > 0) await cancelMatchEscrow(roomId, refWals).catch(e => console.error(`[Escrow] PlayAgain decision timeout: ${e.message}`))
                                io.sockets.in(roomId).emit('escrowCancelledAll', { roomId, reason: 'decision_timeout' })
                                await removeRoom(roomId); broadcastRooms(io); io.socketsLeave(roomId)
                            }, 30_000)
                        }, DEPOSIT_TIMEOUT_MS)
                    } else {
                        console.error(`[Match] PlayAgain escrow creation failed for ${roomId}:`, escrowResult.error)
                    }
                } catch (err) {
                    console.error(`[Match] PlayAgain escrow error for ${roomId}:`, err.message)
                }
            })()
        }
    }
}

// SF-03: In-memory store for failed settlements — retry via cancelMatchEscrow (DB: H020/H050)
const failedSettlements = new Map();
// Shape: { [roomId]: { matchId, escrowPDA, allWallets, wagerSOL, failedAt, attempts, error } }

// SF-03: Retry failed settlements every 60 seconds
setInterval(async () => {
    for (const [matchId, data] of failedSettlements.entries()) {
        if (data.attempts >= 5) {
            console.error(`[Recovery] Giving up on settlement recovery for ${matchId} after ${data.attempts} attempts`);
            failedSettlements.delete(matchId);
            continue;
        }
        try {
            console.log(`[Recovery] Retrying cancel for ${matchId} (attempt ${data.attempts + 1})`);
            const result = await cancelMatchEscrow(matchId, data.allWallets || [data.p1wallet, data.p2wallet].filter(Boolean));
            if (result.success) {
                console.log(`[Recovery] Successfully cancelled escrow for ${matchId}: ${result.txSignature}`);
                failedSettlements.delete(matchId);
            } else {
                data.attempts++;
                console.warn(`[Recovery] Cancel retry failed for ${matchId}: ${result.error}`);
            }
        } catch (err) {
            data.attempts++;
            console.error(`[Recovery] Cancel retry threw for ${matchId}:`, err.message);
        }
    }
}, 60_000);

// SF-03: Attempt cancel recovery and store for retry if needed
async function handleSettlementFailure(roomId, room, ws, error) {
    const allWallets = (room?.players || []).map(p => ws?.wallets?.[p.socketId]).filter(Boolean);
    const escrowPDA = room?.escrowPDA || null;

    if (allWallets.length > 0) {
        try {
            const cancelResult = await cancelMatchEscrow(roomId, allWallets);
            if (cancelResult.success) {
                console.log(`[Recovery] Immediate cancel succeeded for ${roomId}: ${cancelResult.txSignature}`);
                return; // Recovery succeeded, no need to store
            }
            console.warn(`[Recovery] Immediate cancel failed for ${roomId}: ${cancelResult.error}`);
        } catch (err) {
            console.error(`[Recovery] Immediate cancel threw for ${roomId}:`, err.message);
        }
    }

    // Store for retry
    failedSettlements.set(roomId, {
        matchId: roomId,
        escrowPDA,
        allWallets,
        wagerSOL: ws?.amount || 0,
        failedAt: Date.now(),
        attempts: 1,
        error: error || 'unknown',
    });
    console.warn(`[Recovery] Stored failed settlement for retry: ${roomId}`);
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

// Auth helper: require wallet auth only for wagered matches.
// Practice mode (wager=0) allows unauthenticated players.
function requireAuthIfWagered(client, eventName) {
    const room = findRoom(client.roomId);
    if (room && room.wager > 0) {
        return requireAuth(client, eventName);
    }
    return true; // no room or no wager — allow
}

// Helper: get open rooms for lobby display
// O1+O8: Iterate Map, serialize only lobby-safe fields
function getOpenRooms() {
    const result = [];
    for (const room of rooms.values()) {
        if (room.players && room.players.length < room.maxPlayers) {
            result.push({
                roomId: room.roomId,
                host: room.players[0] ? {
                    name: room.players[0].name,
                    color: room.players[0].color,
                } : null,
                maxPlayers: room.maxPlayers,
                currentPlayers: room.players.length,
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
        };
        // DB backward compat — write players[0] as host, players[1] as player
        const hostSlot = room.players ? room.players[0] : null;
        const playerSlot = room.players ? room.players[1] : null;
        if (hostSlot) {
            update.host = {
                username: hostSlot.name,
                socketId: hostSlot.socketId,
                color: hostSlot.color,
                isReady: hostSlot.isReady,
                playAgain: hostSlot.playAgain,
            };
        }
        if (playerSlot) {
            update.player = {
                username: playerSlot.name,
                socketId: playerSlot.socketId,
                color: playerSlot.color,
                isReady: playerSlot.isReady,
                playAgain: playerSlot.playAgain,
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
    if (depositTimers[roomId]) {
        clearTimeout(depositTimers[roomId]);
        delete depositTimers[roomId];
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
    const inventory = weaponInventories[roomId] || {}
    const playerIds = room.players.map(p => p.socketId)

    // Convert weapon IDs to weapon objects for each player
    const weaponsByPlayer = {}
    for (const pid of playerIds) {
        weaponsByPlayer[pid] = (inventory[pid] || [0]).map(id => {
            const w = getWeapon(id)
            return w ? { id: w.id, name: w.name, type: 'single' } : { id: 0, name: 'Single Shot', type: 'single' }
        })
    }

    // Backward-compat aliases for 2-player client
    const hostWeapons = weaponsByPlayer[playerIds[0]] || []
    const playerWeapons = weaponsByPlayer[playerIds[1]] || []

    // Emit shopEnd with final inventories and Gold
    io.sockets.in(roomId).emit('shopEnd', {
        hostWeapons,
        playerWeapons,
        weaponsByPlayer,
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

        const hostId = room.players ? room.players[0]?.socketId : null
        const playerId = room.players ? room.players[1]?.socketId : null

        // LP-08: Track consecutive timeouts per player
        if (!ms.consecutiveTimeouts) ms.consecutiveTimeouts = {}
        ms.consecutiveTimeouts[currentTurnId] = (ms.consecutiveTimeouts[currentTurnId] || 0) + 1

        // LP-08: 3-forfeit rule — end match if timed-out player hit 3 consecutive timeouts
        if (ms.consecutiveTimeouts[currentTurnId] >= 3) {
            clearTurnTimer(roomId)

            // N-player: count alive players BEFORE elimination
            const aliveCount = ms.alive ? Object.values(ms.alive).filter(Boolean).length : 2

            if (aliveCount > 2) {
                // N-player: eliminate timed-out player, keep match going
                ms.alive[currentTurnId] = false
                if (!ms.eliminationOrder) ms.eliminationOrder = []
                ms.eliminationOrder.push(currentTurnId)
                ms.consecutiveTimeouts[currentTurnId] = 0  // reset after elimination
                io.sockets.in(roomId).emit('playerEliminated', {
                    eliminatedId: currentTurnId,
                    killedById: null,
                    reason: 'timeout',
                    survivingPlayers: ms.players.filter(id => ms.alive[id]),
                })

                // Check if round is now over after this elimination
                if (isRoundOver(ms)) {
                    const ranked = getRoundPlacement(ms)
                    ms.currentRound++
                    const matchResult = isMatchOver(ms)
                    const gold = goldStates[roomId]
                    if (gold) awardPlacementGold(gold, ranked)

                    if (matchResult.isOver) {
                        transitionState(ms, MATCH_STATES.SETTLING)
                        transitionState(ms, MATCH_STATES.COMPLETE)
                        io.sockets.in(roomId).emit('matchEnd', {
                            winner: matchResult.winner,
                            survivorOrder: ranked,
                            forfeitReason: 'timeout elimination',
                            scores: ms.scores || {},
                            hp: ms.hp || {},
                            goldBalance: goldStates[roomId] || {},
                        })
                        await removeRoom(roomId)
                        broadcastRooms(io)
                        io.socketsLeave(roomId)
                    } else {
                        transitionState(ms, MATCH_STATES.ROUND_END)
                        resetForNextRound(ms)
                        io.sockets.in(roomId).emit('roundEnd', {
                            winner: ranked[0],
                            scores: ms.scores,
                            roundWins: ms.roundWins,
                            placementPoints: ms.placementPoints,
                            round: ms.currentRound,
                            totalRounds: ms.maxRounds,
                            goldBalance: goldStates[roomId] || {},
                        })
                    }
                } else {
                    // Round continues — advance to next player's turn
                    ms.currentTurn = getNextTurn(ms)
                    if (ms.moveCounts) ms.moveCounts[ms.currentTurn] = 0
                    io.sockets.in(roomId).emit('turnTimeout', {
                        timedOutPlayer: currentTurnId,
                        nextTurn: ms.currentTurn,
                        turnCount: ms.turnCount,
                        consecutiveTimeouts: ms.consecutiveTimeouts[currentTurnId] || 0,
                        eliminated: true,
                    })
                    startTurnTimer(io, roomId)
                }
                return
            }

            // <=2 alive: original forfeit-ends-match path
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
            // settleMatch signature: settleMatch(winnerAddress, loserAddress, wagerSOL, matchId, playerCount)
            // Must use wallet addresses from wagerStates — NOT socketIds
            let settlementSucceeded = true
            const wsState = wagerStates[roomId]
            if (wsState && wsState.amount > 0) {
                const winnerWallet = wsState.wallets ? wsState.wallets[opponentId] : null
                const loserWallet = wsState.wallets ? wsState.wallets[currentTurnId] : null
                if (winnerWallet && loserWallet) {
                    // SF-03: Capture room/ws before settlement — removeRoom() destroys them
                    const roomSnapshot = room ? { players: room.players, escrowPDA: room.escrowPDA } : null
                    const wsSnapshot = wsState ? { amount: wsState.amount, wallets: { ...wsState.wallets } } : null
                    try {
                        const result = await settleMatch(winnerWallet, loserWallet, wsState.amount, roomId, room?.players?.length || 2)
                        // SF-02: Check for propagated failure
                        if (!result.success) {
                            settlementSucceeded = false
                            console.error(`[Forfeit] Settlement returned failure for room ${roomId}:`, result.error)
                            await handleSettlementFailure(roomId, roomSnapshot, wsSnapshot, result.error)
                        }
                    } catch (err) {
                        settlementSucceeded = false
                        console.error(`[Forfeit] Settlement error for room ${roomId}:`, err.message)
                        await handleSettlementFailure(roomId, roomSnapshot, wsSnapshot, err.message)
                    }
                } else {
                    console.warn(`[Forfeit] Missing wallet addresses for settlement in room ${roomId}`)
                }
            }

            // LP-04: Enriched SHOT milestone recording for forfeit path
            // Uses roomId (closure variable) — NOT this.roomId (no socket context here)
            {
                const forfeitMatchId = `${roomId}:forfeit:${Date.now()}`
                const isForfeitWagered = wsState && wsState.amount > 0

                for (const p of room.players) {
                    const wallet = wsState?.wallets?.[p.socketId] || authenticatedWallets[p.socketId] || null
                    if (!wallet) continue
                    const forfeitResult = recordMatchPlayed(wallet, {
                        turnCount: ms.turnCount || 0,
                        matchId: forfeitMatchId,
                        isWagered: isForfeitWagered,
                        isWinner: opponentId === p.socketId,
                        maxRoundDamage: (ms.maxRoundDamage && ms.maxRoundDamage[p.socketId]) || 0,
                        weaponsUsed: ms.weaponsUsed && ms.weaponsUsed[p.socketId]
                            ? Array.from(ms.weaponsUsed[p.socketId]) : [],
                    })
                    if (forfeitResult.earned > 0) trackShotEmission(forfeitResult.earned)
                }
            }

            // SF-03: Transition to CANCELLED if settlement failed — not unconditional COMPLETE
            transitionState(ms, settlementSucceeded ? MATCH_STATES.COMPLETE : MATCH_STATES.CANCELLED)

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
        ms.currentTurn = getNextTurn(ms)

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
    // JUP-02: Start Jupiter price polling on server init (30s interval, cached server-side)
    startPricePolling(30000);

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
        const createRing = new Float64Array(RL_MAX_CREATES + 1)
        let createHead = 0

        // Ring buffers — fixed-size circular arrays, O(1) insert + count
        const eventRing = new Float64Array(RL_MAX_EVENTS + 1)  // timestamps mod windowMs
        let eventHead = 0
        const fireRing = new Float64Array(RL_MAX_FIRES + 1)
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
        client.on('authenticate', async (data) => {
            // H015: Null payload guard
            if (!data || typeof data !== 'object') {
                client.emit('authResult', { success: false, reason: 'Missing payload' })
                return
            }
            const result = handleAuthenticate(client, data)
            if (result.success) {
                authenticatedWallets[client.id] = result.walletAddress
                logger.info({ socketId: client.id }, '[Auth] Socket authenticated')
                // LP-04: Load persisted milestone state from MongoDB so server restarts
                // don't reset milestone progress
                try {
                    await loadMilestoneState(result.walletAddress)
                } catch (err) {
                    console.warn(`[Auth] Failed to load milestone state:`, err.message)
                    // Continue — in-memory defaults are fine, milestones just won't be restored
                }
            }
            client.emit('authResult', result)
        })

        // === PRACTICE IDENTITY (Phase 28) ===
        client.on('registerIdentity', ({ uid, handle }) => {
            if (!uid || typeof uid !== 'string' || uid.length < 10) return
            let clean = (handle || '').slice(0, 16)
            // Server-side profanity guard (normalises leet speak)
            if (isProfane(clean)) clean = 'Player' + uid.slice(0, 4)
            playerUids[client.id] = { uid, handle: clean }

            // Upsert user record in DB (fire-and-forget)
            if (isDbConnected()) {
                User.findOneAndUpdate(
                    { uid },
                    { $set: { handle: clean, lastActive: new Date() } },
                    { upsert: true }
                ).catch(err => console.error('[Identity] upsert error:', err.message))
            }
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

                        const opponentId = room.players
                            ? (room.players.find(p => p.socketId !== client.id)?.socketId || null)
                            : null
                        const disconnectorWallet = ws.wallets[client.id]
                        const opponentWallet = opponentId ? ws.wallets[opponentId] : null

                        if (opponentWallet && disconnectorWallet) {
                            // SF-03: Capture room/ws snapshots before settlement
                            const roomSnap = room ? { players: room.players, escrowPDA: room.escrowPDA } : null
                            const wsSnap = ws ? { amount: ws.amount, wallets: { ...ws.wallets } } : null

                            // DCA-03: HP-based disconnect settlement
                            // For reconnect_timeout (connection drops), check who was winning
                            // For leave/disconnect (intentional quit), always forfeit to opponent
                            let winnerWallet = opponentWallet
                            let loserWallet = disconnectorWallet
                            let shouldRefund = false

                            if (reason === 'reconnect_timeout' && currentMs) {
                                const disconnectorId = client.id
                                const opponentSid = opponentId

                                // Decision chain: roundWins -> HP -> scores -> refund if all even
                                const dRounds = (currentMs.roundWins && currentMs.roundWins[disconnectorId]) || 0
                                const oRounds = (currentMs.roundWins && currentMs.roundWins[opponentSid]) || 0
                                const dHp = (currentMs.hp && currentMs.hp[disconnectorId] !== undefined) ? currentMs.hp[disconnectorId] : 250
                                const oHp = (currentMs.hp && currentMs.hp[opponentSid] !== undefined) ? currentMs.hp[opponentSid] : 250
                                const dScore = (currentMs.scores && currentMs.scores[disconnectorId]) || 0
                                const oScore = (currentMs.scores && currentMs.scores[opponentSid]) || 0

                                if (dRounds > oRounds) {
                                    winnerWallet = disconnectorWallet
                                    loserWallet = opponentWallet
                                } else if (dRounds === oRounds) {
                                    if (dHp > oHp) {
                                        winnerWallet = disconnectorWallet
                                        loserWallet = opponentWallet
                                    } else if (dHp === oHp) {
                                        if (dScore > oScore) {
                                            winnerWallet = disconnectorWallet
                                            loserWallet = opponentWallet
                                        } else if (dScore === oScore) {
                                            shouldRefund = true
                                        }
                                    }
                                }
                            }

                            if (shouldRefund) {
                                const allRefundWallets = room.players.map(p => ws.wallets[p.socketId]).filter(Boolean)
                                if (allRefundWallets.length >= 2 && isEscrowEnabled()) {
                                    try {
                                        await cancelMatchEscrow(roomId, allRefundWallets)
                                        console.log(`[Solana] Even disconnect refund (${reason}): room ${roomId}`)
                                    } catch (err) {
                                        console.error(`[Solana] Even disconnect refund failed:`, err.message)
                                        await handleSettlementFailure(roomId, roomSnap, wsSnap, err.message)
                                    }
                                }
                                transitionState(currentMs, MATCH_STATES.CANCELLED)
                                if (opponentId) {
                                    io.to(opponentId).emit('matchSettled', {
                                        type: 'refund',
                                        reason: 'even_disconnect',
                                    })
                                }
                            } else {
                                try {
                                    const settlementResult = await settleMatch(winnerWallet, loserWallet, ws.amount, roomId, room?.players?.length || 2)
                                    // SF-02: Check for propagated failure
                                    if (!settlementResult.success) {
                                        console.error(`[Solana] Forfeit settlement failed (${reason}):`, settlementResult.error)
                                        transitionState(currentMs, MATCH_STATES.CANCELLED)
                                        trackError(new Error(settlementResult.error || 'settlement_failed'), 'forfeit_settlement')
                                        await handleSettlementFailure(roomId, roomSnap, wsSnap, settlementResult.error)
                                    } else {
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
                                    }
                                } catch (err) {
                                    console.error(`[Solana] Forfeit settlement error (${reason}):`, err.message)
                                    transitionState(currentMs, MATCH_STATES.CANCELLED)
                                    trackError(err, 'forfeit_settlement')
                                    await handleSettlementFailure(roomId, roomSnap, wsSnap, err.message)
                                }
                            }
                        } else {
                            transitionState(currentMs, MATCH_STATES.CANCELLED)
                        }
                    })
                } else if (ms.status === MATCH_STATES.LOBBY) {
                    // Not started yet — refund if applicable
                    // A5: Pass all required params (matchId + both player wallets) for on-chain cancel
                    const wallet = ws.wallets[client.id]
                    if (wallet && ws.amount > 0) {
                        const allWallets = Object.values(ws.wallets).filter(Boolean)
                        await refundWager(wallet, ws.amount, roomId, allWallets)
                    }
                }
            }

            const cleanupRoom2 = findRoom(roomId)
            if (cleanupRoom2 && !cleanupRoom2.active && cleanupRoom2.players && cleanupRoom2.players.length > 1) {
                // Room is in waiting state with other players -- just remove this player
                cleanupRoom2.players = cleanupRoom2.players.filter(p => p.socketId !== client.id)
                client.leave(roomId)
                client.roomId = null
                client.isHost = false
                // Promote next player to host if needed
                if (cleanupRoom2.players.length > 0 && !cleanupRoom2.players.some(p => p.isHost)) {
                    cleanupRoom2.players[0].isHost = true
                }
                io.sockets.in(roomId).emit('roomUpdate', {
                    players: cleanupRoom2.players.map(p => ({
                        socketId: p.socketId,
                        name: p.name,
                        color: p.color,
                        isReady: p.isReady || false,
                        isHost: p.isHost || false,
                    })),
                    maxPlayers: cleanupRoom2.maxPlayers,
                    currentPlayers: cleanupRoom2.players.length,
                })
                broadcastRooms(io)
                return
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
            const uidInfo = playerUids[client.id]
            const reconnectKey = walletAddress || (uidInfo?.uid ? `uid:${uidInfo.uid}` : null)
            const roomId = client.roomId
            const ms = roomId ? matchStates[roomId] : null
            const room = roomId ? findRoom(roomId) : null

            // Offer reconnect window during active match with wallet OR uid identity
            if (reconnectKey && roomId && ms && room &&
                (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {

                // Store reconnect info keyed by wallet or uid
                pendingReconnects[reconnectKey] = {
                    roomId,
                    isHost: client.isHost,
                    playerIndex: room.players ? room.players.findIndex(p => p.socketId === client.id) : -1,
                    oldSocketId: client.id,
                    name: client.name,
                    color: client.color,
                }

                // Notify all other players of disconnect with countdown
                const opponentId = room.players
                    ? (room.players.find(p => p.socketId !== client.id)?.socketId || null)
                    : null
                room.players
                    ? room.players.filter(p => p.socketId !== client.id).forEach(p => {
                        io.to(p.socketId).emit('opponentDisconnected', {
                            reconnectWindowMs: RECONNECT_WINDOW_MS,
                        })
                    })
                    : (opponentId && io.to(opponentId).emit('opponentDisconnected', { reconnectWindowMs: RECONNECT_WINDOW_MS }))

                // Deferred cleanup — runs after 30s if no reconnect
                disconnectTimers[reconnectKey] = setTimeout(async () => {
                    delete pendingReconnects[reconnectKey]
                    delete disconnectTimers[reconnectKey]

                    // Re-read state (may have changed during window)
                    const currentMs = matchStates[roomId]
                    const currentRoom = findRoom(roomId)
                    if (!currentRoom || !currentMs) return

                    if (currentRoom && currentRoom.players) {
                        currentRoom.players
                            .filter(p => p.socketId !== client.id)
                            .forEach(p => io.to(p.socketId).emit('reconnectExpired', {}))
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
                    delete playerUids[client.id]
                }, RECONNECT_WINDOW_MS)
            } else {
                // No reconnect window — immediate cleanup (lobby, no wallet, etc.)
                await cleanupRoom(client, io, 'disconnect')
                delete authenticatedWallets[client.id]
                delete playerUids[client.id]
            }
        })



        client.on('leaveRoom', async () => {
            await cleanupRoom(client, io, 'leave')
        })


        // === RECONNECT: Rejoin a match after disconnect ===
        client.on('rejoinRoom', async (data) => {
            if (!data) {
                client.emit('rejoinError', { reason: 'Missing rejoin data' })
                return
            }

            let reconnectKey = null

            if (data.walletAddress) {
                // Wallet-based rejoin: verify Ed25519 signature
                const walletAddress = data.walletAddress
                const { message, signature, timestamp } = data
                if (!message || !signature || !timestamp) {
                    client.emit('rejoinError', { reason: 'Signature required for rejoin' })
                    return
                }

                const msgCheck = verifyAuthMessage(message, walletAddress, timestamp)
                if (!msgCheck.valid) {
                    client.emit('rejoinError', { reason: msgCheck.reason || 'Invalid auth message' })
                    return
                }

                const sigCheck = verifyWalletSignature(walletAddress, message, signature)
                if (!sigCheck.valid) {
                    client.emit('rejoinError', { reason: sigCheck.reason || 'Signature verification failed' })
                    return
                }

                reconnectKey = walletAddress
            } else if (data.uid) {
                // UID-based rejoin (practice mode): match by uid key
                reconnectKey = `uid:${data.uid}`
            } else {
                client.emit('rejoinError', { reason: 'Missing wallet address or uid' })
                return
            }

            const pending = pendingReconnects[reconnectKey]
            if (!pending) {
                client.emit('rejoinError', { reason: 'No active match to rejoin' })
                return
            }

            const { roomId, isHost, oldSocketId, name, color } = pending
            const room = findRoom(roomId)
            const ms = matchStates[roomId]

            if (!room || !ms) {
                delete pendingReconnects[reconnectKey]
                client.emit('rejoinError', { reason: 'Match no longer exists' })
                return
            }

            // Cancel the deferred cleanup timer
            if (disconnectTimers[reconnectKey]) {
                clearTimeout(disconnectTimers[reconnectKey])
                delete disconnectTimers[reconnectKey]
            }
            delete pendingReconnects[reconnectKey]

            // Map new socket to the old player slot
            client.join(roomId)
            client.roomId = roomId
            client.isHost = isHost
            client.name = name
            client.color = color
            if (data.walletAddress) {
                client.walletAddress = data.walletAddress
                client.isAuthenticated = true
                authenticatedWallets[client.id] = data.walletAddress
            }
            if (data.uid) {
                playerUids[client.id] = { uid: data.uid, handle: name || '' }
            }

            // Update room references from old socketId to new
            // N-player: find and remap the reconnecting player's slot in room.players[]
            const rejoinSlot = room.players ? room.players.find(p => p.socketId === oldSocketId) : null
            if (rejoinSlot) {
                rejoinSlot.socketId = client.id

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
                // Migrate match state references (per-player maps)
                if (ms.scores[oldSocketId] !== undefined) { ms.scores[client.id] = ms.scores[oldSocketId]; delete ms.scores[oldSocketId] }
                if (ms.kills[oldSocketId] !== undefined) { ms.kills[client.id] = ms.kills[oldSocketId]; delete ms.kills[oldSocketId] }
                if (ms.roundWins[oldSocketId] !== undefined) { ms.roundWins[client.id] = ms.roundWins[oldSocketId]; delete ms.roundWins[oldSocketId] }
                if (ms.hp[oldSocketId] !== undefined) { ms.hp[client.id] = ms.hp[oldSocketId]; delete ms.hp[oldSocketId] }
                if (ms.currentTurn === oldSocketId) ms.currentTurn = client.id
                // Migrate N-player maps
                if (ms.alive && ms.alive[oldSocketId] !== undefined) { ms.alive[client.id] = ms.alive[oldSocketId]; delete ms.alive[oldSocketId] }
                if (ms.placementPoints && ms.placementPoints[oldSocketId] !== undefined) { ms.placementPoints[client.id] = ms.placementPoints[oldSocketId]; delete ms.placementPoints[oldSocketId] }
                if (ms.damageDealtTotal && ms.damageDealtTotal[oldSocketId] !== undefined) { ms.damageDealtTotal[client.id] = ms.damageDealtTotal[oldSocketId]; delete ms.damageDealtTotal[oldSocketId] }
                if (ms.consecutiveTimeouts && ms.consecutiveTimeouts[oldSocketId] !== undefined) { ms.consecutiveTimeouts[client.id] = ms.consecutiveTimeouts[oldSocketId]; delete ms.consecutiveTimeouts[oldSocketId] }
                // Remap shopReady state on reconnect
                const sr = shopReady[roomId]
                if (sr && sr[oldSocketId] !== undefined) {
                    sr[client.id] = sr[oldSocketId]
                    delete sr[oldSocketId]
                }
                // Remap ms.players[] array entry
                const msIdx = ms.players ? ms.players.indexOf(oldSocketId) : -1
                if (msIdx !== -1) ms.players[msIdx] = client.id
                // Remap practice identity
                if (playerUids[oldSocketId]) {
                    playerUids[client.id] = playerUids[oldSocketId]
                    delete playerUids[oldSocketId]
                }
            }

            // Notify all other players that this player reconnected
            if (room.players) {
                room.players.filter(p => p.socketId !== client.id).forEach(p => {
                    io.to(p.socketId).emit('opponentReconnected', {})
                })
            }
            // For backward compat: keep opponentId for any downstream code
            const opponentId = room.players
                ? (room.players.find(p => p.socketId !== client.id)?.socketId || null)
                : null

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
                // N-player positions array (canonical)
                positions: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })),
                // Backward-compat shim for 2-player client
                tankPositions: {
                    host: room.players[0]?.pos || null,
                    player: room.players[1]?.pos || null,
                    hostId: room.players[0]?.socketId || null,
                },
                wager: wagerStates[roomId] ? wagerStates[roomId].amount : 0,
                wind: room.wind || 0,
            })
        })


        client.on('deleteRoom', async () => {
            if (!requireAuthIfWagered(client, 'deleteRoom')) return
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
            if (!room || room.players.length >= room.maxPlayers) return
            // E12: Push placeholder immediately to prevent race during async balance check (Node.js atomic)
            const joinerHandle = playerUids[client.id]?.handle
            const joinerSlot = { name: joinerHandle || sanitizeName(name), color, socketId: client.id, isReady: false, playAgain: false, pos: null, isHost: false }
            room.players.push(joinerSlot)

            // Verify wager compatibility
            const ws = wagerStates[roomId]
            const roomWager = ws ? ws.amount : 0
            // H002: ONLY use server-verified wallet — never trust client payload
            const joinerWallet = authenticatedWallets[client.id] || null

            if (roomWager > 0) {
                // H006: Require auth for wagered rooms
                if (!requireAuth(client, 'joinRoom')) { room.players.pop(); return }

                // Room requires a wager — joiner must have a wallet
                if (!joinerWallet) {
                    client.emit('joinRoomError', { reason: 'Wallet required for wagered matches' })
                    room.players.pop()
                    return
                }

                // Verify joiner has enough balance — A3: fail-closed on RPC error
                try {
                    const balanceCheck = await verifyBalance(joinerWallet, roomWager)
                    if (!balanceCheck.sufficient) {
                        client.emit('joinRoomError', {
                            reason: `Insufficient SOL balance. Need ${balanceCheck.required.toFixed(3)}, have ${balanceCheck.balance.toFixed(3)}`
                        })
                        room.players.pop()
                        return
                    }
                } catch (err) {
                    console.warn('[Solana] Balance check failed — rejecting join:', err.message)
                    client.emit('joinRoomError', { reason: 'Unable to verify SOL balance. Please try again.' })
                    room.players.pop()
                    return
                }
            }

            if (client.roomId !== null) {
                client.leave(client.roomId)
                await removeRoom(client.roomId)
            }

            client.join(roomId)
            client.roomId = roomId
            client.isHost = false
            // H017: Sanitize player name — update joinerSlot with sanitized name
            client.name = sanitizeName(name)
            client.color = color
            joinerSlot.name = client.name

            // Set room active when all slots filled
            if (room.players.length === room.maxPlayers) room.active = true

            // Store joiner's wallet in wager state
            if (ws) {
                ws.wallets[client.id] = joinerWallet
            }

            // joinerSlot already pushed to room.players[] above

            // Persist player join to DB
            persistRoom(room);

            broadcastRooms(io)

            // Create on-chain escrow for wagered matches
            if (roomWager > 0 && isEscrowEnabled()) {
                // SRV-09: Collect all N player wallets for N-player escrow creation
                const allWallets = room.players.map(p => ws?.wallets[p.socketId]).filter(Boolean)
                if (allWallets.length === room.players.length) {
                    try {
                        const escrowResult = await createMatchEscrow(roomId, roomWager, allWallets)
                        if (escrowResult.success) {
                            room.escrowPDA = escrowResult.escrowPDA
                            console.log(`[Match] Escrow created for room ${roomId}: ${escrowResult.escrowPDA}`)

                            // SRV-10: Build deposit transactions for all N players in parallel
                            const depositTxs = await Promise.all(
                                room.players.map(p => buildDepositTransaction(roomId, ws?.wallets[p.socketId]))
                            )

                            // DCA-01: Compute deposit deadline before emitting so all players get same value
                            const depositDeadline = Date.now() + DEPOSIT_TIMEOUT_MS

                            // Emit escrowDeposit to each player
                            room.players.forEach((p, i) => {
                                const sock = io.sockets.sockets.get(p.socketId)
                                if (sock && depositTxs[i]?.success) {
                                    sock.emit('escrowDeposit', {
                                        roomId,
                                        transaction: depositTxs[i].transaction,
                                        escrowPDA: escrowResult.escrowPDA,
                                        wager: roomWager,
                                        depositDeadlineMs: depositDeadline,
                                    })
                                }
                            })

                            // DCA-01: Deposit countdown — 3-branch partial deposit flow (SRV-13)
                            depositTimers[roomId] = setTimeout(async () => {
                                delete depositTimers[roomId]
                                const wsCheck = wagerStates[roomId]
                                const roomCheck = findRoom(roomId)
                                if (!roomCheck || !wsCheck) return

                                const numDeposited = Object.keys(wsCheck.deposits || {}).length
                                const totalPlayers = roomCheck.players.length

                                // Branch 1: All deposited — nothing to do (timer should have been cleared)
                                if (numDeposited === totalPlayers) return

                                // Branch 2: Zero deposits — cancel outright and destroy room
                                if (numDeposited === 0) {
                                    const allCancelWallets = roomCheck.players.map(p => wsCheck.wallets[p.socketId]).filter(Boolean)
                                    if (allCancelWallets.length > 0 && isEscrowEnabled()) {
                                        try {
                                            await cancelMatchEscrow(roomId, allCancelWallets)
                                        } catch (err) {
                                            console.error(`[Escrow] Deposit timeout cancel failed for ${roomId}:`, err.message)
                                        }
                                    }
                                    io.sockets.in(roomId).emit('escrowDepositTimeout', { roomId })
                                    await removeRoom(roomId)
                                    broadcastRooms(io)
                                    io.socketsLeave(roomId)
                                    return
                                }

                                // Branch 3: Partial deposits — emit to decision-maker, start 30s decision window
                                const depositorSocketIds = roomCheck.players
                                    .filter(p => wsCheck.deposits?.[p.socketId])
                                    .map(p => p.socketId)
                                const nonDepositorSocketIds = roomCheck.players
                                    .filter(p => !wsCheck.deposits?.[p.socketId])
                                    .map(p => p.socketId)

                                // Decision-maker: first depositor (tracked in escrowDepositConfirm), fallback to host
                                const decisionMakerSocketId = wsCheck.firstDepositorSocketId || roomCheck.players[0].socketId
                                const canStart = numDeposited >= 2

                                // Store partial state for escrowPartialStart / escrowCancelAll handlers
                                wsCheck.partialDecisionMaker = decisionMakerSocketId
                                wsCheck.depositorSocketIds = depositorSocketIds
                                wsCheck.nonDepositorSocketIds = nonDepositorSocketIds

                                // Build depositor wallet list in room.players order (Pitfall 2: order matters for on-chain cancel)
                                const depositorWallets = roomCheck.players
                                    .filter(p => wsCheck.deposits?.[p.socketId])
                                    .map(p => wsCheck.wallets[p.socketId])
                                    .filter(Boolean)

                                io.to(decisionMakerSocketId).emit('escrowPartialDeposit', {
                                    roomId,
                                    numDeposited,
                                    totalPlayers,
                                    depositorWallets,
                                    canStart,
                                    decisionWindowMs: 30_000,
                                })

                                // Notify non-decision-makers that deposit timed out with partial deposits
                                roomCheck.players
                                    .filter(p => p.socketId !== decisionMakerSocketId)
                                    .forEach(p => {
                                        const sock = io.sockets.sockets.get(p.socketId)
                                        if (sock) {
                                            sock.emit('escrowPartialWaiting', {
                                                roomId,
                                                numDeposited,
                                                totalPlayers,
                                                decisionMaker: decisionMakerSocketId,
                                            })
                                        }
                                    })

                                // 30-second decision window — auto-cancel if no decision (Pitfall 1: reuse depositTimers slot)
                                depositTimers[roomId] = setTimeout(async () => {
                                    delete depositTimers[roomId]
                                    const ws2 = wagerStates[roomId]
                                    const room2 = findRoom(roomId)
                                    if (!ws2 || !room2 || !ws2.partialDecisionMaker) return

                                    console.log(`[Escrow] Decision timeout for ${roomId} — auto-cancelling`)

                                    // Auto-cancel: refund all depositors
                                    const refundWallets = room2.players
                                        .filter(p => ws2.deposits?.[p.socketId])
                                        .map(p => ws2.wallets[p.socketId])
                                        .filter(Boolean)
                                    if (isEscrowEnabled() && refundWallets.length > 0) {
                                        await cancelMatchEscrow(roomId, refundWallets).catch(err =>
                                            console.error(`[Escrow] Decision timeout cancel failed for ${roomId}:`, err.message)
                                        )
                                    }

                                    io.sockets.in(roomId).emit('escrowCancelledAll', { roomId, reason: 'decision_timeout' })
                                    await removeRoom(roomId)
                                    broadcastRooms(io)
                                    io.socketsLeave(roomId)
                                }, 30_000)
                            }, DEPOSIT_TIMEOUT_MS)
                        } else {
                            console.error(`[Match] Escrow creation failed for ${roomId}:`, escrowResult.error)
                        }
                    } catch (err) {
                        console.error(`[Match] Escrow error for ${roomId}:`, err.message)
                    }
                }
            }

            // Always broadcast roomUpdate so both players see the lobby
            io.sockets.in(client.roomId).emit('roomUpdate', {
                players: room.players.map(p => ({
                    socketId: p.socketId,
                    name: p.name,
                    color: p.color,
                    isReady: p.isReady || false,
                    isHost: p.isHost || false,
                })),
                maxPlayers: room.maxPlayers,
                currentPlayers: room.players.length,
            })

            if (room.players.length === room.maxPlayers) {
                // Room is full -- brief lobby display then start match
                setTimeout(() => {
                    if (!room || !room.active) return // room may have been destroyed
                    io.sockets.in(client.roomId).emit('startPick', {
                        host: room.players[0],      // backward compat
                        player: room.players[1],    // backward compat (undefined for 3-4 player)
                        players: room.players,      // canonical N-player
                        wager: roomWager
                    })
                }, 2000)
            }
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

            // H038: Verify creator has sufficient balance — A3: fail-closed on RPC error
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
                    console.warn('[Solana] Creator balance check failed — rejecting create:', err.message)
                    client.emit('createRoomError', { reason: 'Unable to verify SOL balance. Please try again.' })
                    return
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

            // Validate maxPlayers: default 2, support 2/3/4
            const maxPlayers = Number.isInteger(player.maxPlayers) && [2, 3, 4].includes(player.maxPlayers)
                ? player.maxPlayers : 2;

            const roomId = crypto.randomBytes(4).toString('hex')
            client.join(roomId)
            client.roomId = roomId
            client.isHost = true
            // H017: Sanitize player name — prefer server-side handle from playerUids
            const creatorHandle = playerUids[client.id]?.handle
            const creatorSlot = { name: creatorHandle || sanitizeName(player.name), color: player.color, socketId: client.id, isReady: false, playAgain: false, pos: null, isHost: true }

            const roomData = {
                roomId: roomId,
                players: [creatorSlot],
                maxPlayers: maxPlayers,
                active: false
            }

            wagerStates[roomId] = {
                amount: wagerAmount,
                wallets: { [client.id]: walletAddress }
            }
            roomData.wager = wagerAmount
            roomData.matchMode = matchMode
            const roundType = rounds === 5 ? 'BO5' : rounds === 3 ? 'BO3' : '1'
            matchStates[roomId] = createMatchState(roomId, roundType, maxPlayers);
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
            if (wagerAmount > 0) trackWager(wagerAmount * maxPlayers)  // All N players wager
            broadcastRooms(io)

            // Notify creator of their waiting room state
            client.emit('roomUpdate', {
                players: roomData.players.map(p => ({
                    socketId: p.socketId,
                    name: p.name,
                    color: p.color,
                    isReady: p.isReady || false,
                    isHost: p.isHost || false,
                })),
                maxPlayers: roomData.maxPlayers,
                currentPlayers: roomData.players.length,
            })
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

            // SA-01: Auth required for wagered queue matches
            if (wagerAmount > 0 && !requireAuth(client, 'joinQueue')) return;

            // Remove from any existing queue before re-queuing
            removeFromAllQueues(client.id);

            // E8: Balance check for wagered queue joins
            const joinerWallet = authenticatedWallets[client.id] || null;
            if (wagerAmount > 0 && joinerWallet) {
                try {
                    const balanceCheck = await verifyBalance(joinerWallet, wagerAmount)
                    if (!balanceCheck.sufficient) {
                        client.emit('queueError', { reason: `Insufficient SOL. Need ${balanceCheck.required.toFixed(3)}, have ${balanceCheck.balance.toFixed(3)}` })
                        return
                    }
                } catch (err) {
                    console.warn('[Queue] Balance check failed — rejecting queue join:', err.message)
                    client.emit('queueError', { reason: 'Unable to verify SOL balance. Please try again.' })
                    return
                }
            }

            const queueKey = getQueueKey(matchMode, matchLength);
            if (!matchmakingQueues.has(queueKey)) {
                matchmakingQueues.set(queueKey, []);
            }
            const queue = matchmakingQueues.get(queueKey);

            // E9: Cap queue size to prevent memory abuse
            if (queue.length >= 100) {
                client.emit('queueError', { reason: 'Queue is full. Please try again later.' })
                return
            }

            if (queue.length > 0) {
                // A6: Wallet dedup — prevent same wallet matching against itself
                const opponent = queue[0]; // peek first, don't consume
                if (joinerWallet && opponent.wallet && joinerWallet === opponent.wallet) {
                    client.emit('queueError', { reason: 'Cannot match against yourself.' })
                    return
                }
                // SF-05: Validate wager matches before pairing (DB: H017)
                if (opponent.wager !== wagerAmount) {
                    // Wager mismatch — do not pair, push joiner to queue instead
                    queue.push({ name: sanitizeName(playerName), color: tankColor, socketId: client.id, wallet: authenticatedWallets[client.id] || null, wager: wagerAmount });
                    client.emit('queueWaiting', { matchMode, matchLength, position: queue.length });
                    console.log(`[Queue] Wager mismatch: opponent=${opponent.wager} SOL, joiner=${wagerAmount} SOL — queued separately`);
                    return;
                }
                queue.shift(); // now safe to consume
                if (queue.length === 0) matchmakingQueues.delete(queueKey);

                // Auto-create room — mirrors createRoom + joinRoom exactly
                const roomId = crypto.randomBytes(4).toString('hex');
                const roundType = matchLength === 5 ? 'BO5' : matchLength === 3 ? 'BO3' : '1';
                // Queue-matched rooms are always 2-player
                const queueMaxPlayers = 2;

                const hostEntry = { name: opponent.name, color: opponent.color, socketId: opponent.socketId, isReady: false, playAgain: false, pos: null, isHost: true };
                const playerEntry = { name: sanitizeName(playerName), color: tankColor, socketId: client.id, isReady: false, playAgain: false, pos: null, isHost: false };

                const roomData = {
                    roomId,
                    players: [hostEntry, playerEntry],
                    maxPlayers: queueMaxPlayers,
                    active: true,  // both slots filled immediately
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

                matchStates[roomId] = createMatchState(roomId, roundType, queueMaxPlayers);
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
                if (wagerAmount > 0) trackWager(wagerAmount * roomData.maxPlayers);  // All N players wager
                broadcastRooms(io);

                // Escrow creation for wagered queue matches
                if (wagerAmount > 0 && isEscrowEnabled()) {
                    // SRV-09: Collect all N player wallets (queue is always 2-player, but use N-player pattern for consistency)
                    const allQueueWallets = roomData.players.map(p => wagerStates[roomId]?.wallets[p.socketId]).filter(Boolean)
                    if (allQueueWallets.length === roomData.players.length) {
                        try {
                            const escrowResult = await createMatchEscrow(roomId, wagerAmount, allQueueWallets);
                            if (escrowResult.success) {
                                roomData.escrowPDA = escrowResult.escrowPDA;
                                // SRV-10: Build deposit transactions for all N players in parallel
                                const depositTxs = await Promise.all(
                                    roomData.players.map(p => buildDepositTransaction(roomId, wagerStates[roomId]?.wallets[p.socketId]))
                                );
                                // DCA-01: Compute deposit deadline before emitting so all players get same value
                                const depositDeadline = Date.now() + DEPOSIT_TIMEOUT_MS
                                // Emit escrowDeposit to each player
                                roomData.players.forEach((p, i) => {
                                    const sock = io.sockets.sockets.get(p.socketId)
                                    if (sock && depositTxs[i]?.success) {
                                        sock.emit('escrowDeposit', { roomId, transaction: depositTxs[i].transaction, escrowPDA: escrowResult.escrowPDA, wager: wagerAmount, depositDeadlineMs: depositDeadline });
                                    }
                                })
                                // DCA-01: Deposit countdown — cancel escrow if not all players deposited within 5 min
                                depositTimers[roomId] = setTimeout(async () => {
                                    delete depositTimers[roomId]
                                    const wsCheck = wagerStates[roomId]
                                    const roomCheck = findRoom(roomId)
                                    if (!roomCheck || !wsCheck) return
                                    // If all players already deposited, nothing to do
                                    const allDeposited = roomCheck.players.every(p => wsCheck.deposits && wsCheck.deposits[p.socketId])
                                    if (allDeposited) return
                                    // N-player: collect all wallets for cancel
                                    const allCancelWallets = roomCheck.players.map(p => wsCheck.wallets[p.socketId]).filter(Boolean)
                                    if (allCancelWallets.length > 0 && isEscrowEnabled()) {
                                        try {
                                            await cancelMatchEscrow(roomId, allCancelWallets)
                                        } catch (err) {
                                            console.error(`[Escrow] Deposit timeout cancel failed for ${roomId}:`, err.message)
                                        }
                                    }
                                    io.sockets.in(roomId).emit('escrowDepositTimeout', { roomId })
                                    await removeRoom(roomId)
                                    broadcastRooms(io)
                                    io.socketsLeave(roomId)
                                }, DEPOSIT_TIMEOUT_MS)
                            } else {
                                console.error(`[Queue] Escrow creation failed for ${roomId}:`, escrowResult.error);
                            }
                        } catch (err) {
                            console.error(`[Queue] Escrow error for ${roomId}:`, err.message);
                        }
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
                io.sockets.in(roomId).emit('startPick', {
                    host: hostEntry,           // backward compat
                    player: playerEntry,       // backward compat
                    players: roomData.players, // canonical N-player
                    wager: wagerAmount
                });

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
            if (!requireAuthIfWagered(client, 'ready')) return
            var room = findRoom(client.roomId)
            if (!room) return

            // H019: Validate ready is allowed in current state
            const msReady = matchStates[client.roomId]
            if (msReady && !validateAction(msReady.status, 'ready')) {
                client.emit('readyError', { reason: `Cannot ready during ${msReady.status}` })
                return
            }

            // Track readiness — find slot by socket ID
            const playerSlot = getPlayerSlot(room, client.id)
            if (playerSlot) playerSlot.isReady = true

            // All players ready — start shop phase
            if (room.players.length === room.maxPlayers && room.players.every(p => p.isReady)) {
                const playerIds = room.players.map(p => p.socketId)
                const ms = matchStates[client.roomId]
                const isBetweenRounds = ms && ms.status === MATCH_STATES.ROUND_END

                if (isBetweenRounds) {
                    // ── Between-round shop: preserve gold + inventories ──
                    // Gold carries over — do NOT call initGold()
                    // Inventories carry over — do NOT reinitialize
                    const goldSummary = playerIds.map((pid, i) => `p${i + 1}=${getBalance(goldStates[client.roomId], pid)}`).join(', ')
                    console.log(`[BO3] Between-round shop: Round ${ms.currentRound} ended. Gold: ${goldSummary}`)
                } else {
                    // ── First shop (from lobby): initialize everything ──
                    goldStates[client.roomId] = initGold(playerIds)
                    weaponInventories[client.roomId] = {}
                    for (const pid of playerIds) {
                        const prestige = getPrestigeInfo(authenticatedWallets[pid] || '')
                        weaponInventories[client.roomId][pid] = [0, ...(prestige.unlockedWeapons || [])]
                    }
                }

                // Reset shop readiness for all players
                shopReady[client.roomId] = Object.fromEntries(playerIds.map(id => [id, false]))

                // Transition match state to weapon_shop
                if (ms) {
                    transitionState(ms, MATCH_STATES.WEAPON_SHOP)
                }

                // Emit shopPhase with weapon catalog, Gold balance, and inventories
                const weapons = getAllLaunchWeapons()
                const inv = weaponInventories[client.roomId] || {}
                const goldBalancePayload = {}
                const inventoryPayload = {}
                for (const pid of playerIds) {
                    goldBalancePayload[pid] = getBalance(goldStates[client.roomId], pid)
                    inventoryPayload[pid] = inv[pid] || [0]
                }
                const shopDuration = room.matchMode === 'practice' ? 20 : SHOP_DURATION
                io.sockets.in(client.roomId).emit('shopPhase', {
                    weapons,
                    goldBalance: goldBalancePayload,
                    inventory: inventoryPayload,
                    timer: shopDuration,
                    totalRounds: ms ? ms.maxRounds : 1,
                    round: ms ? ms.currentRound + 1 : 1
                })

                // Start shop timer — auto-end shop after shopDuration seconds
                if (shopTimers[client.roomId]) clearTimeout(shopTimers[client.roomId])
                shopTimers[client.roomId] = setTimeout(() => {
                    endShopPhase(io, client.roomId)
                }, shopDuration * 1000)

                // Also emit startGame for backward compatibility
                io.sockets.in(client.roomId).emit('startGame', {})
                room.players.forEach(p => { p.isReady = false; })
            }
        })



        // === GOLD ECONOMY EVENTS (Phase 3) ===

        // Client buys a weapon during shop phase
        client.on('buyWeapon', (data) => {
            if (!requireAuthIfWagered(client, 'buyWeapon')) return
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
            if (!requireAuthIfWagered(client, 'shopDone')) return
            const room = findRoom(client.roomId)
            if (!room) return

            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'shopDone')) return

            const ready = shopReady[client.roomId]
            if (!ready) return

            // Guard: only players in this room can mark themselves as done
            if (!getPlayerSlot(room, client.id)) return

            ready[client.id] = true

            // Check if all players are done shopping
            const allShopReady = room.players.length === room.maxPlayers &&
                room.players.every(p => ready[p.socketId])

            if (allShopReady) {
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
            // Phase 11: Rate limit — 1 request per second per client
            const now = Date.now()
            if (client._lastStatsFetch && (now - client._lastStatsFetch) < 1000) {
                return // Rate limited
            }
            client._lastStatsFetch = now

            const wallet = authenticatedWallets[client.id] || null
            const uidInfo = playerUids[client.id]
            const defaultStats = {
                matchesPlayed: 0, wins: 0, losses: 0,
                totalDamage: 0, bestWinStreak: 0,
                handle: '', signatureWeapon: null,
                kills: 0, deaths: 0
            }
            if ((!wallet && !uidInfo) || !isDbConnected()) {
                client.emit('statsData', defaultStats)
                return
            }
            try {
                const query = wallet ? { walletAddress: wallet } : { uid: uidInfo.uid }
                const user = await User.findOne(query)
                if (!user) {
                    client.emit('statsData', defaultStats)
                    return
                }
                // Compute signature weapon from weaponStats (most shots fired, exclude Single Shot id=0)
                let sigWeapon = null
                const weaponStats = user.stats?.weaponStats
                if (weaponStats && weaponStats instanceof Map) {
                    let maxShots = 0
                    for (const [wId, wData] of weaponStats.entries()) {
                        if (wId === '0') continue // Exclude Single Shot
                        const shots = wData?.shotsFired || 0
                        if (shots > maxShots) {
                            maxShots = shots
                            const weapon = WEAPON_CATALOG[parseInt(wId)] || PRESTIGE_WEAPONS[parseInt(wId)]
                            sigWeapon = weapon ? weapon.name : null
                        }
                    }
                }
                const stats = user.stats || {}
                client.emit('statsData', {
                    ...stats.toObject ? stats.toObject() : stats,
                    handle: user.handle || '',
                    callsign: user.handle || '',
                    totalDamage: stats.totalDamage || 0,
                    bestWinStreak: stats.bestWinStreak || 0,
                    signatureWeapon: sigWeapon,
                })
            } catch (err) {
                console.error('[Stats] getStats error:', err.message)
                client.emit('statsData', defaultStats)
            }
        })

        // ── Leaderboard ──
        client.on('getLeaderboard', async () => {
            const now = Date.now()
            if (client._lastLeaderboardFetch && (now - client._lastLeaderboardFetch) < 3000) return
            client._lastLeaderboardFetch = now

            if (!isDbConnected()) {
                client.emit('leaderboardData', { players: [] })
                return
            }
            try {
                const top = await User.find(
                    { 'stats.matchesPlayed': { $gte: 1 } },
                    { handle: 1, 'stats.wins': 1, 'stats.losses': 1, 'stats.matchesPlayed': 1, 'stats.totalDamage': 1, 'stats.bestWinStreak': 1 }
                ).sort({ 'stats.wins': -1, 'stats.matchesPlayed': 1 }).limit(20).lean()

                const players = top.map(u => ({
                    callsign: u.handle || 'UNKNOWN',
                    wins: u.stats?.wins || 0,
                    losses: u.stats?.losses || 0,
                    matches: u.stats?.matchesPlayed || 0,
                    totalDamage: u.stats?.totalDamage || 0,
                    bestStreak: u.stats?.bestWinStreak || 0,
                }))
                client.emit('leaderboardData', { players })
            } catch (err) {
                console.error('[Leaderboard] error:', err.message)
                client.emit('leaderboardData', { players: [] })
            }
        })

        // ── Callsign Challenge Flow ──
        client.on('challengeCallsign', (data) => {
            const targetHandle = (data?.callsign || '').trim().toUpperCase()
            if (!targetHandle || targetHandle.length < 1 || targetHandle.length > 16) {
                client.emit('challengeError', { reason: 'Invalid callsign' })
                return
            }
            // Don't challenge yourself
            const myHandle = (playerUids[client.id]?.handle || '').toUpperCase()
            if (myHandle && myHandle === targetHandle) {
                client.emit('challengeError', { reason: 'You cannot challenge yourself' })
                return
            }
            // Find connected player with matching handle
            let targetSocketId = null
            for (const [sid, info] of Object.entries(playerUids)) {
                if ((info.handle || '').toUpperCase() === targetHandle) {
                    // Verify they're still connected
                    const targetSocket = io.sockets.sockets.get(sid)
                    if (targetSocket) {
                        targetSocketId = sid
                        break
                    }
                }
            }
            if (!targetSocketId) {
                client.emit('challengeError', { reason: targetHandle + ' is not online' })
                return
            }
            // Check if target is already in a room
            const targetSocket = io.sockets.sockets.get(targetSocketId)
            if (targetSocket.roomId) {
                client.emit('challengeError', { reason: targetHandle + ' is already in a match' })
                return
            }
            const challengerName = playerUids[client.id]?.handle || 'UNKNOWN'
            targetSocket.emit('challengeReceived', {
                fromSocketId: client.id,
                fromCallsign: challengerName,
            })
            client.emit('challengeSent', { callsign: targetHandle })
        })

        client.on('acceptChallenge', (data) => {
            const challengerSocketId = data?.fromSocketId
            if (!challengerSocketId) return
            const challengerSocket = io.sockets.sockets.get(challengerSocketId)
            if (!challengerSocket) {
                client.emit('challengeError', { reason: 'Challenger disconnected' })
                return
            }
            // Notify challenger — they should create the room
            challengerSocket.emit('challengeAccepted', {
                bySocketId: client.id,
                byCallsign: playerUids[client.id]?.handle || 'UNKNOWN',
            })
        })

        client.on('declineChallenge', (data) => {
            const challengerSocketId = data?.fromSocketId
            if (!challengerSocketId) return
            const challengerSocket = io.sockets.sockets.get(challengerSocketId)
            if (challengerSocket) {
                challengerSocket.emit('challengeDeclined', {
                    byCallsign: playerUids[client.id]?.handle || 'UNKNOWN',
                })
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
                    logger.info({ tier: result.tier, tierName: result.tierName, tx: txSignature }, '[Prestige] On-chain burn verified')
                }
                client.emit('prestigeResult', result)
            } catch (err) {
                console.error('[Prestige] Burn verification error:', err.message)
                client.emit('prestigeResult', { success: false, reason: 'Burn verification error' })
            }
        })


        // === EXISTING RELAY EVENTS (kept for backward compatibility) ===
        // D1: All relay events now require auth to prevent spoofed game state

        client.on('weaponPick', (data) => {
            if (!requireAuthIfWagered(client, 'weaponPick')) return
            if (!data || typeof data !== 'object') return
            const { arrayIndex } = data
            if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > 30) return
            client.to(client.roomId).emit('opponentWeaponPick', {arrayIndex})
        })



        client.on('getWeaponArray', () => {
            var room = findRoom(client.roomId)
            if (room && room.randomArray !== undefined && room.randomArray !== null)
                client.emit('setWeaponArray', ({randomArray: room.randomArray}))
        })



        client.on('createWeaponArray', (data) => {
            if (!requireAuthIfWagered(client, 'createWeaponArray')) return
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
            if (!requireAuth(client, 'escrowDepositConfirm')) return
            if (!data || typeof data !== 'object') return
            const { roomId: rid, txSignature } = data
            if (!rid || !txSignature || typeof txSignature !== 'string') return
            // SA-06: Cross-room isolation — reject events for rooms socket isn't in (DB: H009)
            if (client.roomId !== rid) {
                client.emit('escrowError', { reason: 'Room ID mismatch' })
                return
            }

            const room = findRoom(rid)
            if (!room) return

            const ws = wagerStates[rid]
            if (!ws) return

            // SF-01: Verify deposit on-chain before accepting (DB: H013, H049, H051)
            if (isEscrowEnabled()) {
                try {
                    // Single retry with 2s delay for devnet confirmation lag
                    let escrowState = await getEscrowState(rid)
                    if (!escrowState) {
                        // Retry once after delay — TX may not be confirmed yet
                        await new Promise(r => setTimeout(r, 2000))
                        escrowState = await getEscrowState(rid)
                    }

                    if (!escrowState) {
                        client.emit('escrowError', { reason: 'Escrow PDA not found on-chain' })
                        return
                    }

                    // N-player: determine player index and check deposit via bitmask
                    const playerIndex = room.players.findIndex(p => p.socketId === client.id)
                    if (playerIndex < 0) {
                        client.emit('escrowError', { reason: 'Player not found in room' })
                        return
                    }
                    const depositConfirmed = (escrowState.depositsMask & (1 << playerIndex)) !== 0

                    if (!depositConfirmed) {
                        client.emit('escrowError', { reason: 'Deposit not confirmed on-chain' })
                        return
                    }

                    // Verify wager amount matches (guard against amount spoofing)
                    const LAMPORTS_PER_SOL = 1_000_000_000
                    const expectedLamports = Math.round(ws.amount * LAMPORTS_PER_SOL)
                    if (escrowState.wagerLamports !== expectedLamports) {
                        client.emit('escrowError', { reason: 'On-chain wager amount mismatch' })
                        return
                    }
                } catch (err) {
                    console.error(`[Escrow] On-chain deposit verification failed for room ${rid}:`, err.message)
                    client.emit('escrowError', { reason: 'Deposit verification failed' })
                    return
                }
            }
            // If escrow not enabled (dev mode), skip verification — same pattern as prestige burns

            // Track which players have confirmed deposits
            if (!ws.deposits) ws.deposits = {}
            ws.deposits[client.id] = txSignature

            // Track first depositor for partial-deposit decision-maker (Phase 22-02)
            if (!ws.firstDepositorSocketId) {
                ws.firstDepositorSocketId = client.id
            }

            // SRV-18: Emit real-time deposit status to all room members
            io.sockets.in(rid).emit('escrowDepositStatus', {
                roomId: rid,
                deposits: room.players.map(p => ({
                    socketId: p.socketId,
                    wallet: ws.wallets?.[p.socketId] || null,
                    confirmed: !!(ws.deposits?.[p.socketId]),
                })),
                numDeposited: Object.keys(ws.deposits || {}).length,
                totalPlayers: room.players.length,
            })

            const allDeposited = room.players.every(p => ws.deposits && ws.deposits[p.socketId])

            console.log(`[Escrow] Deposit confirmed: ${client.id} for room ${rid} (TX: ${txSignature})`)

            if (allDeposited) {
                // Both players deposited — escrow is now active
                // DCA-01: Clear deposit countdown — both players deposited in time
                if (depositTimers[rid]) {
                    clearTimeout(depositTimers[rid])
                    delete depositTimers[rid]
                }
                console.log(`[Escrow] All ${room.players.length} deposits confirmed for room ${rid} — match is escrowed`)
                io.sockets.in(rid).emit('escrowActive', {
                    roomId: rid,
                    escrowPDA: room.escrowPDA,
                    totalPot: ws.amount * (room?.players?.length || 2),
                })
            }
        })

        // SRV-14: Host/first-depositor chooses to start match with depositors only
        client.on('escrowPartialStart', async () => {
            if (!requireAuth(client, 'escrowPartialStart')) return
            const room = findRoom(client.roomId)
            const ws = wagerStates[client.roomId]
            if (!room || !ws) return

            // Only the decision-maker can choose
            if (ws.partialDecisionMaker !== client.id) {
                client.emit('escrowError', { reason: 'Only the decision-maker can choose' })
                return
            }
            if (!ws.depositorSocketIds || ws.depositorSocketIds.length < 2) {
                client.emit('escrowError', { reason: 'Need at least 2 depositors to start' })
                return
            }

            // Clear decision timer
            if (depositTimers[client.roomId]) {
                clearTimeout(depositTimers[client.roomId])
                delete depositTimers[client.roomId]
            }

            // Call on-chain startWithDepositors
            if (isEscrowEnabled()) {
                try {
                    const result = await startWithDepositorsEscrow(client.roomId)
                    if (!result.success) {
                        client.emit('escrowError', { reason: result.error || 'Start with depositors failed on-chain' })
                        return
                    }
                } catch (err) {
                    console.error(`[Escrow] startWithDepositors failed for ${client.roomId}:`, err.message)
                    client.emit('escrowError', { reason: 'On-chain start failed' })
                    return
                }
            }

            // Kick non-depositors — notify and remove from Socket.IO room (Pitfall 3: leave BEFORE compact)
            for (const sid of ws.nonDepositorSocketIds || []) {
                const kickedSocket = io.sockets.sockets.get(sid)
                if (kickedSocket) {
                    kickedSocket.emit('kickedFromRoom', {
                        reason: 'You did not deposit in time. The match is starting without you.',
                        destination: 'lobby',
                    })
                    kickedSocket.leave(client.roomId)
                    kickedSocket.roomId = null
                    kickedSocket.isHost = false
                }
            }

            // Compact room.players to depositors only
            room.players = room.players.filter(p => ws.depositorSocketIds.includes(p.socketId))
            room.maxPlayers = room.players.length

            // Promote first player to host if current host was kicked
            if (room.players.length > 0 && !room.players.some(p => p.isHost)) {
                room.players[0].isHost = true
                const newHostSocket = io.sockets.sockets.get(room.players[0].socketId)
                if (newHostSocket) newHostSocket.isHost = true
            }

            console.log(`[Escrow] Partial start for ${client.roomId}: ${room.players.length} depositors, ${(ws.nonDepositorSocketIds || []).length} kicked`)

            // Emit escrowActive to remaining players
            io.sockets.in(client.roomId).emit('escrowActive', {
                roomId: client.roomId,
                escrowPDA: room.escrowPDA,
                totalPot: ws.amount * room.players.length,
            })

            // Cleanup partial state
            delete ws.partialDecisionMaker
            delete ws.nonDepositorSocketIds
            delete ws.depositorSocketIds

            broadcastRooms(io)
        })

        // SRV-15: Host/first-depositor chooses to cancel match and refund all depositors
        client.on('escrowCancelAll', async () => {
            if (!requireAuth(client, 'escrowCancelAll')) return
            const room = findRoom(client.roomId)
            const ws = wagerStates[client.roomId]
            if (!room || !ws) return

            // Only the decision-maker can choose
            if (ws.partialDecisionMaker !== client.id) {
                client.emit('escrowError', { reason: 'Only the decision-maker can choose' })
                return
            }

            // Clear decision timer
            if (depositTimers[client.roomId]) {
                clearTimeout(depositTimers[client.roomId])
                delete depositTimers[client.roomId]
            }

            // Refund depositors on-chain (Pitfall 2: use room.players order)
            const depositorWallets = room.players
                .filter(p => ws.deposits?.[p.socketId])
                .map(p => ws.wallets[p.socketId])
                .filter(Boolean)
            if (isEscrowEnabled() && depositorWallets.length > 0) {
                await cancelMatchEscrow(client.roomId, depositorWallets).catch(err =>
                    console.error(`[Escrow] Cancel-all failed for ${client.roomId}:`, err.message)
                )
            }

            console.log(`[Escrow] Cancel-all for ${client.roomId}: refunding ${depositorWallets.length} depositors, room preserved`)

            // Preserve room — reset deposit and escrow state only
            room.active = false
            room.escrowPDA = null
            room.players.forEach(p => { p.isReady = false })
            ws.deposits = {}
            delete ws.firstDepositorSocketId
            delete ws.partialDecisionMaker
            delete ws.nonDepositorSocketIds
            delete ws.depositorSocketIds

            io.sockets.in(client.roomId).emit('escrowCancelledAll', {
                roomId: client.roomId,
                reason: 'host_cancelled',
            })

            broadcastRooms(io)
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

            // SA-01: Auth guard — only for wagered matches (practice allows unauthenticated)
            const fireRoom = findRoom(this.roomId);
            if (fireRoom && fireRoom.wager > 0 && !this.isAuthenticated) {
                this.emit('fireRejected', { reason: 'Authentication required' })
                return
            }

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
            const shooterSlot = getPlayerSlot(room, this.id)
            const serverPos = shooterSlot ? shooterSlot.pos : null
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
                // D3: Tighten position tolerance — 100px horizontal, 50px vertical
                if (dx <= 100 && dy <= 50) {
                    startX = data.position.x
                    startY = data.position.y
                    // SA-04: Do NOT write startX/startY back to serverPos — server position is authoritative (DB: H034, H035)
                }
            }

            // Build tank positions for physics — N-player, living players only
            const tanks = room.players
                .filter(p => p.pos && ms && ms.alive[p.socketId])
                .map(p => ({ id: p.socketId, x: p.pos.x, y: p.pos.y, width: 40, height: 30 }))

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

            // Update tank Y positions to match deformed terrain (N-player)
            // Without this, next shot starts from old position which may be inside terrain
            for (const p of room.players) {
                if (p.pos) {
                    const px = Math.min(1199, Math.max(0, Math.floor(p.pos.x)))
                    p.pos.y = result.newTerrain[px] - 15  // -15 for tank height offset
                }
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
                        // Phase 11: Track death for the player who died
                        ms.totalDeaths[playerId] = (ms.totalDeaths[playerId] || 0) + 1
                    }
                    // Phase 11: Track weapon hits and damage dealt to opponent
                    if (dmg > 0 && playerId !== this.id) {
                        const whId = String(weaponId || '')
                        if (whId) {
                            if (!ms.weaponHits[this.id]) ms.weaponHits[this.id] = {}
                            ms.weaponHits[this.id][whId] = (ms.weaponHits[this.id][whId] || 0) + 1
                            if (!ms.weaponDamage[this.id]) ms.weaponDamage[this.id] = {}
                            ms.weaponDamage[this.id][whId] = (ms.weaponDamage[this.id][whId] || 0) + dmg
                        }
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

                // LP-04: Track per-round damage dealt for milestone 500_damage_round
                // result.damage is { recipientId: damageAmount } — iterate to sum damage dealt by shooter
                for (const [recipientId, dmg] of Object.entries(result.damage || {})) {
                    if (recipientId !== this.id && dmg > 0) {
                        if (!ms.roundDamage) ms.roundDamage = {}
                        ms.roundDamage[this.id] = (ms.roundDamage[this.id] || 0) + dmg
                    }
                }

                // LP-04: Track weapons used per player for milestone no_prestige_win
                if (!ms.weaponsUsed) ms.weaponsUsed = {}
                if (!ms.weaponsUsed[this.id]) ms.weaponsUsed[this.id] = new Set()
                ms.weaponsUsed[this.id].add(weaponId)

                // Phase 11: Track shots fired per weapon
                if (!ms.weaponShotsFired[this.id]) ms.weaponShotsFired[this.id] = {}
                const wfId = String(weaponId || '')
                if (wfId) ms.weaponShotsFired[this.id][wfId] = (ms.weaponShotsFired[this.id][wfId] || 0) + 1

                // N-player elimination detection — after HP update
                const newlyEliminated = []
                for (const pid of ms.players) {
                    if (!result.damage || !result.damage[pid]) continue
                    if (ms.hp[pid] <= 0 && ms.alive[pid]) {
                        ms.alive[pid] = false
                        ms.eliminationOrder.push(pid)
                        newlyEliminated.push(pid)
                    }
                }

                // Emit playerEliminated for each new kill + award kill bonus
                for (const pid of newlyEliminated) {
                    const goldState = goldStates[this.roomId]
                    if (goldState) awardKillBonus(goldState, this.id)
                    io.sockets.in(this.roomId).emit('playerEliminated', {
                        eliminatedId: pid,
                        killedById: this.id,
                        survivingPlayers: ms.players.filter(id => ms.alive[id]),
                    })
                }

                // Advance turn
                ms.turnCount++
                ms.currentTurn = ms.players.length > 1 ? getNextTurn(ms) : null

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

            // Broadcast turn result to ALL players (includes goldEarned + balances)
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
                // N-player state
                players: ms ? ms.players.map(id => {
                    const slot = room.players.find(p => p.socketId === id)
                    return { socketId: id, pos: slot ? slot.pos : null, hp: ms.hp[id] ?? 0, alive: ms.alive[id] ?? false }
                }) : [],
                alive: ms ? ms.alive : {},
                currentPlayerIndex: ms ? ms.currentPlayerIndex : 0,
                // N-player positions array (canonical)
                positions: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })),
                // Backward-compat shim for 2-player client
                tankPositions: {
                    host: room.players[0]?.pos ? { x: room.players[0].pos.x, y: room.players[0].pos.y } : null,
                    player: room.players[1]?.pos ? { x: room.players[1].pos.x, y: room.players[1].pos.y } : null,
                    hostId: room.players[0]?.socketId || null,
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
                const ranked = getRoundPlacement(ms)
                const roundWinner = ranked[0]

                // roundWins and placementPoints already updated inside getRoundPlacement
                ms.currentRound++

                const matchResult = isMatchOver(ms)

                // Award placement Gold (300/150/75/0 by rank)
                const gold = goldStates[this.roomId]
                if (gold) {
                    awardPlacementGold(gold, ranked)
                }

                // Delay round/match end emit so client can animate the killing blow
                const ROUND_END_DELAY = 3000 // 3 seconds for final blast animation
                const roomId = this.roomId
                const socketId = this.id

                if (matchResult.isOver) {
                    // H068/H020: Transition to SETTLING — if fails, another handler already settled
                    const transitioned = transitionState(ms, MATCH_STATES.SETTLING)
                    if (!transitioned) return

                    // N-player: derive hostId/playerId from players[] for backward compat
                    const hostId = room.players[0]?.socketId || null
                    const playerId = room.players[1]?.socketId || null

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
                                // SF-03: Capture room/ws snapshots before settlement
                                const roomSnap = findRoom(roomId)
                                const roomSnapData = roomSnap ? { players: roomSnap.players, escrowPDA: roomSnap.escrowPDA } : null
                                const wsSnapData = ws ? { amount: ws.amount, wallets: { ...ws.wallets } } : null
                                try {
                                    const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount, roomId, roomSnap?.players?.length || 2)
                                    // SF-02: Check for propagated failure
                                    if (!sResult.success) {
                                        console.error('[Solana] Settlement returned failure:', sResult.error)
                                        settlementInfo = { error: sResult.error, wager: ws.amount }
                                        transitionState(ms, MATCH_STATES.CANCELLED)
                                        trackError(new Error(sResult.error || 'settlement_failed'), 'settlement')
                                        await handleSettlementFailure(roomId, roomSnapData, wsSnapData, sResult.error)
                                    } else {
                                        settlementInfo = {
                                            wager: ws.amount,
                                            totalPot: ws.amount * (room?.players?.length || 2),
                                            winnerPayout: sResult.settlement.winner,
                                            treasuryFee: sResult.settlement.treasury,
                                            opsFee: sResult.settlement.ops,
                                            txSignature: sResult.txSignature
                                        }
                                        console.log('[Solana] Match settled:', settlementInfo)
                                        // H064: Only transition to COMPLETE on success
                                        transitionState(ms, MATCH_STATES.COMPLETE)
                                    }
                                } catch (err) {
                                    console.error('[Solana] Settlement error:', err.message)
                                    settlementInfo = { error: err.message, wager: ws.amount }
                                    // H064: Transition to CANCELLED on error, NOT COMPLETE
                                    transitionState(ms, MATCH_STATES.CANCELLED)
                                    trackError(err, 'settlement')
                                    await handleSettlementFailure(roomId, roomSnapData, wsSnapData, err.message)
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

                        // LP-04: Finalize maxRoundDamage from last round (round-end path handles
                        // this for BO3/BO5, but match-over fires directly without roundEnd path)
                        if (!ms.maxRoundDamage) ms.maxRoundDamage = {}
                        for (const pid of Object.keys(ms.roundDamage || {})) {
                            ms.maxRoundDamage[pid] = Math.max(ms.maxRoundDamage[pid] || 0, ms.roundDamage[pid] || 0)
                        }

                        // === SHOT TOKEN MILESTONES (Phase 6) ===
                        // LP-04: Enriched context with v2.1 milestone data
                        const shotResults = {}
                        const wsState = wagerStates[this.roomId]
                        const matchId = `${this.roomId}:${ms.currentRound}:${Date.now()}`
                        const isWagered = wsState && wsState.amount > 0

                        // DEBT-01: Record match for all N players
                        const playerWalletMap = {}
                        for (const p of room.players) {
                            playerWalletMap[p.socketId] = wsState?.wallets?.[p.socketId] || authenticatedWallets[p.socketId] || null
                        }

                        // Phase 11: Snapshot milestones BEFORE recordMatchPlayed so we can diff after
                        const milestonesBefore = {}
                        for (const p of room.players) {
                            const wallet = playerWalletMap[p.socketId]
                            milestonesBefore[p.socketId] = wallet
                                ? new Set((getPlayerShotState(wallet)?.milestonesEarned || []))
                                : new Set()
                        }

                        for (const p of room.players) {
                            const wallet = playerWalletMap[p.socketId]
                            if (!wallet) continue
                            shotResults[p.socketId] = recordMatchPlayed(wallet, {
                                turnCount: ms.turnCount,
                                matchId,
                                isWagered,
                                isWinner: matchResult.winner === p.socketId,
                                maxRoundDamage: (ms.maxRoundDamage && ms.maxRoundDamage[p.socketId]) || 0,
                                weaponsUsed: ms.weaponsUsed && ms.weaponsUsed[p.socketId]
                                    ? Array.from(ms.weaponsUsed[p.socketId]) : [],
                            })
                            if (shotResults[p.socketId].earned > 0) trackShotEmission(shotResults[p.socketId].earned)
                        }

                        // Phase 11: Compute newly earned milestones (diff against snapshot)
                        const getNewMilestones = (wallet, beforeSet) => {
                            if (!wallet) return []
                            const state = getPlayerShotState(wallet)
                            if (!state) return []
                            return (state.milestonesEarned || [])
                                .filter(id => !beforeSet.has(id))
                                .map(id => {
                                    const milestone = SHOT_MILESTONES.find(m => m.id === id)
                                    return milestone ? { id: milestone.id, label: milestone.label, reward: milestone.reward } : null
                                })
                                .filter(Boolean)
                        }

                        // Delay matchEnd emit so client can animate the killing blow
                        // Transform scores to client format: { [id]: { damageDealt, kills } }
                        const formattedScores = {}
                        for (const pid of ms.players) {
                            formattedScores[pid] = {
                                damageDealt: ms.scores[pid] || 0,
                                kills: ms.kills[pid] || 0
                            }
                        }
                        const matchEndPayload = {
                            winner: matchResult.winner,
                            survivorOrder: ranked,  // N-player ranked placement array [1st, 2nd, ...]
                            scores: formattedScores,
                            roundWins: ms.roundWins,
                            goldBalance: goldStates[roomId] || {},
                            settlement: settlementInfo,
                            wager: ws ? ws.amount : 0,
                            shotEarned: shotResults,
                            // Phase 11: Prestige info per player (client reads by own socket ID)
                            prestigeInfo: Object.fromEntries(
                                room.players.map(p => [p.socketId, getPrestigeInfo(playerWalletMap[p.socketId])])
                            ),
                            // Phase 11: Milestones earned this match per player
                            earnedMilestones: Object.fromEntries(
                                room.players.map(p => [
                                    p.socketId,
                                    getNewMilestones(playerWalletMap[p.socketId], milestonesBefore[p.socketId] || new Set())
                                ])
                            )
                        }
                        setTimeout(() => {
                            io.sockets.in(roomId).emit('matchEnd', matchEndPayload)
                        }, ROUND_END_DELAY)

                        // === PERSIST STATS TO DB (fire-and-forget) ===
                        if (isDbConnected()) {
                            const wagerAmt = ws ? ws.amount : 0
                            const solWonAmt = wagerAmt > 0 ? wagerAmt * room.players.length * 0.9 : 0 // 90% to winner after fees

                            // Phase 11: Build per-weapon $inc update for a player
                            const buildWeaponIncs = (pid) => {
                                const incs = {}
                                const fired = ms.weaponShotsFired?.[pid] || {}
                                const hits = ms.weaponHits?.[pid] || {}
                                const dmg = ms.weaponDamage?.[pid] || {}
                                for (const wId of Object.keys(fired)) {
                                    incs['stats.weaponStats.' + wId + '.shotsFired'] = fired[wId] || 0
                                    incs['stats.weaponStats.' + wId + '.hits'] = hits[wId] || 0
                                    incs['stats.weaponStats.' + wId + '.damageDealt'] = dmg[wId] || 0
                                }
                                return incs
                            }

                            const persistStats = async () => {
                                try {
                                    const winnerId = matchResult.winner
                                    for (const p of room.players) {
                                        const pid = p.socketId
                                        const addr = authenticatedWallets[pid] || wsState?.wallets?.[pid]
                                        const uidInfo = playerUids[pid]
                                        if (!addr && !uidInfo) continue
                                        const query = addr ? { walletAddress: addr } : { uid: uidInfo.uid }
                                        const isWinner = pid === winnerId
                                        const playerShotEarned = shotResults[pid]?.earned || 0
                                        const playerWeaponIncs = buildWeaponIncs(pid)
                                        // Build match history entry
                                        const opponents = room.players.filter(op => op.socketId !== pid).map(op => op.name).join(', ')
                                        const historyEntry = {
                                            opponent: opponents || 'UNKNOWN',
                                            result: isWinner ? 'win' : 'loss',
                                            mode: room.matchMode || 'practice',
                                            damageDealt: ms.scores[pid] || 0,
                                            kills: ms.kills[pid] || 0,
                                            deaths: ms.totalDeaths[pid] || 0,
                                            goldEarned: (goldStates[roomId] && goldStates[roomId][pid]) || 0,
                                            playedAt: new Date()
                                        }
                                        const matchDamage = ms.scores[pid] || 0
                                        // Step 1: Increment counters + streak tracking
                                        await User.findOneAndUpdate(
                                            query,
                                            {
                                                $inc: {
                                                    'stats.matchesPlayed': 1,
                                                    'stats.totalDamage': matchDamage,
                                                    ...(isWinner
                                                        ? { 'stats.wins': 1, 'stats.totalSolWon': solWonAmt, 'stats.consecutiveWins': 1 }
                                                        : { 'stats.losses': 1, 'stats.totalSolLost': wagerAmt }),
                                                    'stats.totalShotEarned': playerShotEarned,
                                                    'stats.kills': ms.kills[pid] || 0,
                                                    'stats.deaths': ms.totalDeaths[pid] || 0,
                                                    ...playerWeaponIncs
                                                },
                                                ...(!isWinner ? { $set: { 'stats.consecutiveWins': 0, lastActive: new Date() } } : { $set: { lastActive: new Date() } }),
                                                $push: { matchHistory: { $each: [historyEntry], $slice: -50 } }
                                            },
                                            { upsert: true }
                                        )
                                        // Step 2: Update bestWinStreak if current exceeds it (pipeline update)
                                        if (isWinner) {
                                            await User.findOneAndUpdate(query, [
                                                { $set: { 'stats.bestWinStreak': { $max: ['$stats.bestWinStreak', '$stats.consecutiveWins'] } } }
                                            ])
                                        }
                                    }
                                    logger.info('[Stats] Persisted match stats')
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
                    // LP-04: Update maxRoundDamage before resetting roundDamage for next round
                    if (!ms.maxRoundDamage) ms.maxRoundDamage = {}
                    for (const pid of Object.keys(ms.roundDamage || {})) {
                        ms.maxRoundDamage[pid] = Math.max(ms.maxRoundDamage[pid] || 0, ms.roundDamage[pid] || 0)
                    }
                    ms.roundDamage = {} // reset for next round
                    resetForNextRound(ms)
                    // Delay roundEnd emit so client can animate the killing blow
                    const roundEndPayload = {
                        winner: roundWinner,
                        scores: ms.scores,
                        roundWins: ms.roundWins,
                        placementPoints: ms.placementPoints,
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
            if (!requireAuthIfWagered(client, 'requestTerrain')) return
            const room = findRoom(client.roomId)
            if (!room) return

            const ms = matchStates[client.roomId]

            // If terrain already generated for this round, re-send to requesting client only
            if (room._terrainCache) {
                console.log(`[Terrain] Re-sending cached terrain to ${client.id.slice(0,8)}`)
                client.emit('terrainGenerated', room._terrainCache)
                return
            }

            // IM-05: 128-bit CSPRNG entropy for terrain seed (DB: H038)
            const fullSeed = crypto.randomBytes(16).toString('hex');
            // Derive 32-bit unsigned int for mulberry32 PRNG (first 4 bytes = 32 bits)
            // mulberry32's seededRandom() uses s |= 0 which truncates to 32-bit signed;
            // >>> 0 ensures unsigned interpretation
            const seed32 = parseInt(fullSeed.slice(0, 8), 16) >>> 0;

            const { path, heightmap } = generateTerrain(1200, 800, seed32)
            const wind = generateWind()

            // Store server-side
            room.heightmap = heightmap
            room.terrainSeed = fullSeed
            room.wind = wind
            // N-player: generate positions for all players and assign to room.players[i].pos
            const positions = generateTankPositions(heightmap, room.players.length, 1200)
            room.players.forEach((p, i) => {
                p.pos = positions[i]
            })

            // Initialize match state for battle
            if (ms) {
                ms.terrain = heightmap
                ms.tankPositions = positions
                // Only transition if not already in battle (shop phase already transitions)
                if (ms.status !== MATCH_STATES.BATTLE) {
                    transitionState(ms, MATCH_STATES.BATTLE)
                }
                // Populate players[] and alive{} if not already set (pre-Phase 16 compat)
                if (ms.players.length === 0) {
                    // Phase 16: populate ms.players[] from room.players[] (replaces pre-16 compat block)
                    const pIds = room.players.map(p => p.socketId);
                    ms.players = pIds;
                    ms.alive = {};
                    ms.turnsPerRound = pIds.length * 10;
                    // Initialize ALL per-player maps for every socket ID (CORE-06)
                    for (const id of pIds) {
                        ms.alive[id] = true;
                        ms.hp[id] = 250;
                        ms.scores[id] = ms.scores[id] || 0;
                        ms.kills[id] = ms.kills[id] || 0;
                        ms.roundWins[id] = ms.roundWins[id] || 0;
                        ms.placementPoints[id] = ms.placementPoints[id] || 0;
                        ms.damageDealtTotal[id] = ms.damageDealtTotal[id] || 0;
                    }
                } else {
                    // Initialize HP for all players (players[] already populated)
                    for (const id of ms.players) {
                        ms.hp[id] = 250;
                    }
                }
                ms.currentTurn = getNextTurn(ms)

                // Start turn timer for the first turn
                startTurnTimer(io, client.roomId)
            }

            // Cache terrain payload for late-joining clients
            const terrainPayload = {
                path,
                heightmap,
                // N-player positions array (canonical)
                positions: room.players.map(p => ({ socketId: p.socketId, pos: p.pos })),
                // Backward-compat shim for 2-player client
                tankPositions: {
                    host: room.players[0]?.pos || null,
                    player: room.players[1]?.pos || null,
                    hostId: room.players[0]?.socketId || null,
                },
                seed: fullSeed,
                wind,
                firstTurn: ms ? ms.currentTurn : null,
                seq: ms ? ms.turnSequence : 0  // Fix 4: initial nonce for first fire
            }
            room._terrainCache = terrainPayload

            // Send to both clients
            io.sockets.in(client.roomId).emit('terrainGenerated', terrainPayload)
        })



        client.on('weaponChange', (data) => {
            if (!requireAuthIfWagered(client, 'weaponChange')) return
            if (!data || typeof data !== 'object') return
            const { index } = data
            if (!Number.isInteger(index) || index < 0 || index > 30) return
            client.to(client.roomId).emit('opponentWeaponChange', {index})
        })



        client.on('angleChange', (data) => {
            if (!requireAuthIfWagered(client, 'angleChange')) return
            if (!data || typeof data !== 'object') return
            const { rotation } = data
            if (typeof rotation !== 'number' || !Number.isFinite(rotation)) return
            client.to(client.roomId).emit('opponentAngleChange', {rotation: rotation})
        })



        client.on('powerChange', (data) => {
            if (!requireAuthIfWagered(client, 'powerChange')) return
            if (!data || typeof data !== 'object') return
            const { power } = data
            if (typeof power !== 'number' || !Number.isFinite(power) || power < 0 || power > 100) return
            client.to(client.roomId).emit('opponentPowerChange', {power: power})
        })

        // After blast knockback, client reports its new tank position
        client.on('positionUpdate', (data) => {
            if (!requireAuthIfWagered(client, 'positionUpdate')) return
            if (!data || typeof data !== 'object') return
            const { x, y } = data
            if (!Number.isFinite(x) || !Number.isFinite(y)) return
            // Clamp to valid bounds
            const clampedX = Math.min(1199, Math.max(0, x))
            const clampedY = Math.min(800, Math.max(0, y))
            var room = findRoom(client.roomId)
            if (!room) return
            // SA-04: Distance validation during battle — reject teleportation (DB: H034, H035)
            const ms = matchStates[client.roomId]
            const playerSlot = getPlayerSlot(room, client.id)
            if (!playerSlot) return
            if (ms && ms.status === MATCH_STATES.BATTLE) {
                const currentPos = playerSlot.pos
                if (currentPos) {
                    const dx = Math.abs(clampedX - currentPos.x)
                    const dy = Math.abs(clampedY - currentPos.y)
                    if (dx > 400 || dy > 200) {
                        // Reject — position jump too large (likely cheating or desync)
                        return
                    }
                }
            }
            if (playerSlot.pos) {
                playerSlot.pos.x = clampedX
                playerSlot.pos.y = clampedY
            }
        })

        // SA-03: terrainPath + getTerrainPath handlers deleted — terrain is server-generated via requestTerrain (DB: H033)



        client.on('stepLeft', () => {
            if (!requireAuthIfWagered(client, 'stepLeft')) return
            if (!client.roomId) return
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'stepLeft')) return
            // SA-05: Turn ownership — only current-turn player can move (DB: H036)
            if (ms && ms.currentTurn && ms.currentTurn !== client.id) return

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
                const stepLeftSlot = getPlayerSlot(room, client.id)
                if (stepLeftSlot && stepLeftSlot.pos && room.heightmap) {
                    const newX = Math.max(0, Math.floor(stepLeftSlot.pos.x - 80))
                    if (room.heightmap[newX] !== undefined) {
                        stepLeftSlot.pos.x = newX
                        stepLeftSlot.pos.y = room.heightmap[newX] - 15
                    }
                }
            }

            client.to(client.roomId).emit('opponentStepLeft', {})
        })



        client.on('stepRight', () => {
            if (!requireAuthIfWagered(client, 'stepRight')) return
            if (!client.roomId) return
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'stepRight')) return
            // SA-05: Turn ownership — only current-turn player can move (DB: H036)
            if (ms && ms.currentTurn && ms.currentTurn !== client.id) return

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
                const stepRightSlot = getPlayerSlot(room, client.id)
                if (stepRightSlot && stepRightSlot.pos && room.heightmap) {
                    const newX = Math.min(1199, Math.floor(stepRightSlot.pos.x + 80))
                    if (room.heightmap[newX] !== undefined) {
                        stepRightSlot.pos.x = newX
                        stepRightSlot.pos.y = room.heightmap[newX] - 15
                    }
                }
            }

            client.to(client.roomId).emit('opponentStepRight', {})
        })



        // LEGACY: turn relay — D1: auth + D5: schema validation
        client.on('giveTurn', (data) => {
            if (!requireAuthIfWagered(client, 'giveTurn')) return
            if (!data || typeof data !== 'object') return
            const { pos1, pos2, rotation1, rotation2 } = data
            // D5: Validate schema — only forward known numeric fields, drop terrainData (server-authoritative terrain)
            if (pos1 && typeof pos1 === 'object' && Number.isFinite(pos1.x) && Number.isFinite(pos1.y) &&
                pos2 && typeof pos2 === 'object' && Number.isFinite(pos2.x) && Number.isFinite(pos2.y) &&
                (rotation1 === undefined || typeof rotation1 === 'number') &&
                (rotation2 === undefined || typeof rotation2 === 'number')) {
                client.to(client.roomId).emit('recieveTurn', {pos1, pos2, rotation1, rotation2})
            }
        })




        client.on('requestTurn', () => {
            if (!requireAuthIfWagered(client, 'requestTurn')) return
            if (!client.roomId) return
            const ms = matchStates[client.roomId]
            if (ms && !validateAction(ms.status, 'requestTurn')) return
            client.to(client.roomId).emit('opponentRequestTurn', {})
        })



        client.on('playAgainRequest', () => {
            if (!requireAuthIfWagered(client, 'playAgainRequest')) return
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

            const paSlot = getPlayerSlot(room, client.id)
            if (paSlot) paSlot.playAgain = true

            if (room.players.every(p => p.playAgain)) {
                resetForPlayAgain(client.roomId, room, paRoundType, io)
            }
        })

        // JUP-02: Return cached SHOT price to the requesting client
        // Price is fetched server-side every 30s to protect the API key
        client.on('getShotPrice', () => {
            const price = getShotPrice();
            client.emit('shotPrice', price);
        })
    })
}

export default mainsocket
