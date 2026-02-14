import mongoose from 'mongoose';
import Match from '../models/Match.js';
import { processShot, generateTerrain, generateTankPositions, WEAPON_DATA } from '../services/physics.js';
import { createMatchState, validateAction, transitionState, getNextTurn, isRoundOver, isMatchOver, getRoundWinner, MATCH_STATES } from '../services/match.js';
import { initGold, getBalance, earnGold, spendGold, awardKillBonus, awardRoundWinBonus } from '../services/gold.js';
import { WEAPON_CATALOG, getWeapon, getWeaponCost, getAllLaunchWeapons } from '../models/Weapon.js';
import { handleAuthenticate } from '../middleware/auth.js';
import { verifyBalance, isValidWager, settleMatch, refundWager, WAGER_TIERS } from '../services/solana.js';
import { recordMatchPlayed, prestigeBurn, getPrestigeInfo, getShotBalance, PRESTIGE_TIERS } from '../services/shot-token.js';

// Helper: check if MongoDB is connected before DB operations
function isDbConnected() {
    return mongoose.connection.readyState === 1; // 1 = connected
}

// In-memory cache for active rooms (fast lookups during gameplay)
// DB is source of truth, cache is synced on mutations
var rooms = []

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

const SHOP_DURATION = 30; // seconds

// Helper: find room in memory cache
function findRoom(roomId) {
    return rooms.find(ele => ele.roomId === roomId);
}

// Helper: get open rooms for lobby display
function getOpenRooms() {
    var openrooms = rooms.filter((room) => room.active === false);
    return openrooms.slice(0, Math.min(openrooms.length, 5));
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
    const room = findRoom(roomId);
    rooms = rooms.filter((r) => r.roomId !== roomId);
    delete matchStates[roomId];
    delete goldStates[roomId];
    delete weaponInventories[roomId];
    delete shopReady[roomId];
    delete wagerStates[roomId];
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

    // Reset shop readiness
    delete shopReady[roomId]
}

const mainsocket = (io) => {
    return io.on("connection", (client) => {
        client.roomId = null
        client.name = ""
        client.color = 0
        client.isHost = false
        client.walletAddress = null
        client.isAuthenticated = false


        // === WALLET AUTHENTICATION (Phase 4) ===
        client.on('authenticate', (data) => {
            const result = handleAuthenticate(client, data)
            if (result.success) {
                authenticatedWallets[client.id] = result.walletAddress
                console.log(`[Auth] Socket ${client.id} authenticated as ${result.walletAddress}`)
            }
            client.emit('authResult', result)
        })


        client.on('disconnect', async () => {
            if (client.roomId !== null) {
                // Handle wager forfeit on disconnect during active match
                const ws = wagerStates[client.roomId]
                const ms = matchStates[client.roomId]
                if (ws && ws.amount > 0 && ms) {
                    const room = findRoom(client.roomId)
                    if (room && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
                        // Disconnecting player forfeits — opponent wins
                        const opponentId = client.isHost
                            ? (room.player ? room.player.socketId : null)
                            : (room.host ? room.host.socketId : null)
                        const disconnectorWallet = ws.wallets[client.id]
                        const opponentWallet = opponentId ? ws.wallets[opponentId] : null

                        if (opponentWallet && disconnectorWallet) {
                            // Settle: opponent wins by forfeit
                            const settlementResult = await settleMatch(opponentWallet, disconnectorWallet, ws.amount)
                            console.log('[Solana] Forfeit settlement:', settlementResult)
                            if (opponentId) {
                                io.to(opponentId).emit('matchSettled', {
                                    type: 'forfeit',
                                    winner: opponentId,
                                    settlement: settlementResult.settlement,
                                    txSignature: settlementResult.txSignature
                                })
                            }
                        }
                    } else if (ms.status === MATCH_STATES.LOBBY) {
                        // Not started yet — refund if applicable
                        const wallet = ws.wallets[client.id]
                        if (wallet && ws.amount > 0) {
                            await refundWager(wallet, ws.amount)
                        }
                    }
                }

                client.leave(client.roomId)
                await removeRoom(client.roomId)
                io.sockets.in(client.roomId).emit('opponentLeft', {})
                io.emit('setRooms', {rooms: getOpenRooms()})
                io.socketsLeave(client.roomId);
                client.roomId = null
                client.isHost = false
            }
            delete authenticatedWallets[client.id]
        })



        client.on('leaveRoom', async () => {
            if (client.roomId !== null) {
                // Handle wager forfeit on leave during active match
                const ws = wagerStates[client.roomId]
                const ms = matchStates[client.roomId]
                if (ws && ws.amount > 0 && ms && (ms.status === MATCH_STATES.BATTLE || ms.status === MATCH_STATES.WEAPON_SHOP)) {
                    const room = findRoom(client.roomId)
                    if (room) {
                        const opponentId = client.isHost
                            ? (room.player ? room.player.socketId : null)
                            : (room.host ? room.host.socketId : null)
                        const disconnectorWallet = ws.wallets[client.id]
                        const opponentWallet = opponentId ? ws.wallets[opponentId] : null
                        if (opponentWallet && disconnectorWallet) {
                            const settlementResult = await settleMatch(opponentWallet, disconnectorWallet, ws.amount)
                            if (opponentId) {
                                io.to(opponentId).emit('matchSettled', {
                                    type: 'forfeit',
                                    winner: opponentId,
                                    settlement: settlementResult.settlement,
                                    txSignature: settlementResult.txSignature
                                })
                            }
                        }
                    }
                }

                client.leave(client.roomId)
                await removeRoom(client.roomId)
                io.sockets.in(client.roomId).emit('opponentLeft', {})
                io.emit('setRooms', {rooms: getOpenRooms()})
                io.socketsLeave(client.roomId);
                client.roomId = null
                client.isHost = false
            }
        })



        client.on('deleteRoom', async () => {
            if (client.roomId !== null) {
                client.leave(client.roomId)
                await removeRoom(client.roomId)
                io.sockets.in(client.roomId).emit('opponentLeft', {})
                io.emit('setRooms', {rooms: getOpenRooms()})
                io.socketsLeave(client.roomId);
                client.roomId = null
                client.isHost = false
            }
        })



        client.on('joinRoom', async ({roomId, name, color, walletAddress, wager}) => {
            if (client.roomId === roomId) return
            var room = findRoom(roomId)
            if (!room || room.active === true) return

            // Verify wager compatibility
            const ws = wagerStates[roomId]
            const roomWager = ws ? ws.amount : 0
            const joinerWallet = walletAddress || authenticatedWallets[client.id] || null

            if (roomWager > 0) {
                // Room requires a wager — joiner must have a wallet
                if (!joinerWallet) {
                    client.emit('joinRoomError', { reason: 'Wallet required for wagered matches' })
                    return
                }

                // Verify joiner has enough balance (best-effort — skip if RPC unavailable)
                try {
                    const balanceCheck = await verifyBalance(joinerWallet, roomWager)
                    if (balanceCheck.balance > 0 && !balanceCheck.sufficient) {
                        // Only reject if we got a real balance back and it's insufficient
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
            client.name = name
            client.color = color

            // Store joiner's wallet in wager state
            if (ws) {
                ws.wallets[client.id] = joinerWallet
            }

            room.player = {name: name, color: color, socketId: client.id, isReady: false, playAgain: false}
            room.active = true

            // Persist player join to DB
            persistRoom(room);

            io.emit('setRooms', {rooms: getOpenRooms()})
            io.sockets.in(client.roomId).emit('startPick', {host: room.host, player: room.player, wager: roomWager})
        })



        client.on('getRooms', () => {
            client.emit('setRooms', {rooms: getOpenRooms()})
        })



        client.on('createRoom', async ({player}) => {
            if (client.roomId !== null) {
                client.leave(client.roomId)
                await removeRoom(client.roomId)
            }

            const roomId = Math.random().toString(32).slice(2,8)
            client.join(roomId)
            client.roomId = roomId
            client.isHost = true
            var host = {name: player.name, color: player.color, socketId: client.id, isReady: false, playAgain: false}

            const roomData = {roomId: roomId, host: host, active: false}

            // Store wager info for this room
            const wagerAmount = player.wager || 0
            const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
            if (wagerAmount > 0 && !isValidWager(wagerAmount)) {
                client.emit('createRoomError', { reason: 'Invalid wager tier' })
                return
            }
            wagerStates[roomId] = {
                amount: wagerAmount,
                wallets: { [client.id]: walletAddress }
            }
            roomData.wager = wagerAmount

            // Initialize match state
            matchStates[roomId] = createMatchState(roomId);

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

            rooms.unshift(roomData)
            io.emit('setRooms', {rooms: getOpenRooms()})
        })



        client.on('ready', () => {
            var room = findRoom(client.roomId)
            if (!room) return
            if (client.isHost === true) {
                room.host.isReady = true
                if (room.player && room.player.isReady === true) {
                    // Initialize Gold for this match
                    const hostId = room.host.socketId
                    const playerId = room.player.socketId
                    goldStates[client.roomId] = initGold(hostId, playerId)
                    weaponInventories[client.roomId] = {
                        [hostId]: [0],      // Everyone starts with Single Shot (free)
                        [playerId]: [0]
                    }
                    shopReady[client.roomId] = {
                        [hostId]: false,
                        [playerId]: false
                    }

                    // Transition match state to weapon_shop
                    const ms = matchStates[client.roomId]
                    if (ms) {
                        transitionState(ms, MATCH_STATES.WEAPON_SHOP)
                    }

                    // Emit shopPhase with weapon catalog and Gold balance
                    const weapons = getAllLaunchWeapons()
                    io.sockets.in(client.roomId).emit('shopPhase', {
                        weapons,
                        goldBalance: {
                            [hostId]: getBalance(goldStates[client.roomId], hostId),
                            [playerId]: getBalance(goldStates[client.roomId], playerId)
                        },
                        timer: SHOP_DURATION
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
            }
            else {
                if (!room.player) return
                room.player.isReady = true
                if (room.host.isReady === true) {
                    // Initialize Gold for this match
                    const hostId = room.host.socketId
                    const playerId = room.player.socketId
                    goldStates[client.roomId] = initGold(hostId, playerId)
                    weaponInventories[client.roomId] = {
                        [hostId]: [0],      // Everyone starts with Single Shot (free)
                        [playerId]: [0]
                    }
                    shopReady[client.roomId] = {
                        [hostId]: false,
                        [playerId]: false
                    }

                    // Transition match state to weapon_shop
                    const ms = matchStates[client.roomId]
                    if (ms) {
                        transitionState(ms, MATCH_STATES.WEAPON_SHOP)
                    }

                    // Emit shopPhase with weapon catalog and Gold balance
                    const weapons = getAllLaunchWeapons()
                    io.sockets.in(client.roomId).emit('shopPhase', {
                        weapons,
                        goldBalance: {
                            [hostId]: getBalance(goldStates[client.roomId], hostId),
                            [playerId]: getBalance(goldStates[client.roomId], playerId)
                        },
                        timer: SHOP_DURATION
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
            }
        })



        // === GOLD ECONOMY EVENTS (Phase 3) ===

        // Client buys a weapon during shop phase
        client.on('buyWeapon', ({weaponId}) => {
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

        // Burn SHOT to prestige up
        client.on('prestigeBurn', () => {
            const wallet = authenticatedWallets[client.id] || null
            if (!wallet) {
                client.emit('prestigeResult', { success: false, reason: 'Not authenticated' })
                return
            }
            const result = prestigeBurn(wallet)
            client.emit('prestigeResult', result)
        })


        // === EXISTING RELAY EVENTS (kept for backward compatibility) ===

        client.on('weaponPick', ({arrayIndex}) => {
            client.to(client.roomId).emit('opponentWeaponPick', {arrayIndex})
        })



        client.on('getWeaponArray', () => {
            var room = findRoom(client.roomId)
            if (room && room.randomArray !== undefined && room.randomArray !== null)
                client.emit('setWeaponArray', ({randomArray: room.randomArray}))
        })



        client.on('createWeaponArray', ({count, max}) => {
            var room = findRoom(client.roomId)
            if (!room) return

            // weapon array
            var x, randomArray = []
            for (let index = 0; index < count; index++) {
                x = Math.floor(Math.random() * max)
                randomArray.push(x)
            }

            room.randomArray = randomArray
            persistRoom(room);
            io.sockets.in(client.roomId).emit('setWeaponArray', {randomArray: room.randomArray})
        })



        // LEGACY: shoot relay (still works — client sends, server relays to opponent)
        client.on('shoot', ({selectedWeapon, power, rotation, rotation1, rotation2, position1, position2}) => {
            client.to(client.roomId).emit('opponentShoot', {selectedWeapon, power, rotation, rotation1, rotation2, position1, position2})
        })


        // === NEW: Server-authoritative fire event (Task 2.5) ===
        // Client sends input only → server runs physics → broadcasts results to both
        client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
            const room = findRoom(client.roomId)
            if (!room) return

            const ms = matchStates[client.roomId]

            // Task 2.8: Turn validation
            if (ms) {
                // Validate action is allowed in current state
                if (!validateAction(ms.status, 'fire')) {
                    client.emit('fireRejected', { reason: `Cannot fire during ${ms.status}` })
                    return
                }

                // Validate it's this player's turn
                if (ms.currentTurn && ms.currentTurn !== client.id) {
                    client.emit('fireRejected', { reason: 'Not your turn' })
                    return
                }

                // Validate weapon exists
                if (!WEAPON_DATA[weaponId]) {
                    client.emit('fireRejected', { reason: 'Invalid weapon' })
                    return
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

            // Run server physics
            const result = processShot({
                angle,
                power,
                weaponId,
                startX,
                startY,
                shooterId: client.id,
                terrain,
                tanks
            })

            // Update server terrain state
            room.heightmap = result.newTerrain

            // Update match state + Gold
            let goldEarned = 0
            if (ms) {
                // Update scores
                for (const [playerId, dmg] of Object.entries(result.damage)) {
                    ms.scores[playerId] = (ms.scores[playerId] || 0) + dmg
                }

                // Calculate Gold earned from damage dealt to opponent
                const gold = goldStates[client.roomId]
                if (gold) {
                    // Find opponent's damage (positive values = damage to opponent)
                    for (const [playerId, dmg] of Object.entries(result.damage)) {
                        if (playerId !== client.id && dmg > 0) {
                            goldEarned += earnGold(gold, client.id, dmg)
                        }
                    }
                }

                // Advance turn
                ms.turnCount++
                const hostId = room.host.socketId
                const playerId = room.player ? room.player.socketId : null
                ms.currentTurn = playerId ? getNextTurn(ms, hostId, playerId) : null
            }

            // Broadcast turn result to BOTH players (includes goldEarned + balances)
            io.sockets.in(client.roomId).emit('turnResult', {
                playerId: client.id,
                weaponId,
                trajectory: result.trajectory,
                impact: result.impact,
                damage: result.damage,
                terrainUpdate: result.newTerrain,
                scores: ms ? ms.scores : {},
                nextTurn: ms ? ms.currentTurn : null,
                goldEarned,
                goldBalance: goldStates[client.roomId] || {}
            })

            // Check if round is over
            if (ms && isRoundOver(ms)) {
                const hostId = room.host.socketId
                const playerId = room.player ? room.player.socketId : null
                const roundWinner = getRoundWinner(ms, hostId, playerId)

                ms.roundWins[roundWinner] = (ms.roundWins[roundWinner] || 0) + 1
                ms.currentRound++

                const matchResult = isMatchOver(ms, hostId, playerId)

                // Award round win Gold bonus
                const gold = goldStates[client.roomId]
                if (gold) {
                    awardRoundWinBonus(gold, roundWinner)
                }

                if (matchResult.isOver) {
                    transitionState(ms, MATCH_STATES.SETTLING)

                    // === SOL SETTLEMENT (Phase 4) ===
                    let settlementInfo = null
                    const ws = wagerStates[client.roomId]
                    if (ws && ws.amount > 0) {
                        const winnerWallet = ws.wallets[matchResult.winner] || null
                        const loserId = matchResult.winner === hostId ? playerId : hostId
                        const loserWallet = ws.wallets[loserId] || null
                        if (winnerWallet && loserWallet) {
                            try {
                                const sResult = await settleMatch(winnerWallet, loserWallet, ws.amount)
                                settlementInfo = {
                                    wager: ws.amount,
                                    totalPot: ws.amount * 2,
                                    winnerPayout: sResult.settlement.winner,
                                    treasuryFee: sResult.settlement.treasury,
                                    opsFee: sResult.settlement.ops,
                                    txSignature: sResult.txSignature
                                }
                                console.log('[Solana] Match settled:', settlementInfo)
                            } catch (err) {
                                console.error('[Solana] Settlement error:', err.message)
                                settlementInfo = { error: err.message, wager: ws.amount }
                            }
                        }
                    }

                    transitionState(ms, MATCH_STATES.COMPLETE)

                    // === SHOT TOKEN MILESTONES (Phase 6) ===
                    const shotResults = {}
                    const wsState = wagerStates[client.roomId]
                    // Record match for both players (use wallet if available)
                    const hostWallet = wsState?.wallets?.[hostId] || authenticatedWallets[hostId] || null
                    const playerWallet = wsState?.wallets?.[playerId] || authenticatedWallets[playerId] || null
                    if (hostWallet) {
                        shotResults[hostId] = recordMatchPlayed(hostWallet)
                    }
                    if (playerWallet) {
                        shotResults[playerId] = recordMatchPlayed(playerWallet)
                    }

                    io.sockets.in(client.roomId).emit('matchEnd', {
                        winner: matchResult.winner,
                        scores: ms.scores,
                        roundWins: ms.roundWins,
                        goldBalance: goldStates[client.roomId] || {},
                        settlement: settlementInfo,
                        wager: ws ? ws.amount : 0,
                        shotEarned: shotResults
                    })
                } else {
                    transitionState(ms, MATCH_STATES.ROUND_END)
                    io.sockets.in(client.roomId).emit('roundEnd', {
                        winner: roundWinner,
                        scores: ms.scores,
                        roundWins: ms.roundWins,
                        round: ms.currentRound,
                        goldBalance: goldStates[client.roomId] || {}
                    })
                }
            }
        })


        // === NEW: Server terrain generation (Task 2.9) ===
        // Server generates terrain, sends to both clients
        client.on('requestTerrain', () => {
            const room = findRoom(client.roomId)
            if (!room) return

            const seed = Math.floor(Math.random() * 1000000)
            const { path, heightmap } = generateTerrain(1200, 534, seed)
            const tankPositions = generateTankPositions(heightmap)

            // Store server-side
            room.heightmap = heightmap
            room.terrainSeed = seed
            if (room.host) room.host.pos = tankPositions.host
            if (room.player) room.player.pos = tankPositions.player

            // Initialize match state for battle
            const ms = matchStates[client.roomId]
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
            }

            // Send to both clients
            io.sockets.in(client.roomId).emit('terrainGenerated', {
                path,
                heightmap,
                tankPositions,
                seed,
                firstTurn: ms ? ms.currentTurn : null
            })
        })



        client.on('weaponChange', ({index}) => {
            client.to(client.roomId).emit('opponentWeaponChange', {index})
        })



        client.on('angleChange', ({rotation}) => {
            client.to(client.roomId).emit('opponentAngleChange', {rotation: rotation})
        })



        client.on('powerChange', ({power}) => {
            client.to(client.roomId).emit('opponentPowerChange', {power: power})
        })



        // LEGACY: terrain relay (still works for current client)
        client.on('terrainPath', ({path, hostPos, playerPos}) => {
            var room = findRoom(client.roomId)
            if (!room) return
            room.terrainPath = [...path]
            room.host.pos = {...hostPos}
            room.player.pos = {...playerPos}

            // Also build heightmap from path for server physics
            if (path && path.length > 0) {
                const heightmap = new Array(1200).fill(534)
                const sorted = path.filter(p => p.x >= 0 && p.x < 1200).sort((a, b) => a.x - b.x)
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
            client.to(client.roomId).emit('opponentStepLeft', {})
        })



        client.on('stepRight', () => {
            client.to(client.roomId).emit('opponentStepRight', {})
        })



        // LEGACY: turn relay (still works)
        client.on('giveTurn', ({terrainData, pos1, pos2, rotation1, rotation2}) => {
            client.to(client.roomId).emit('recieveTurn', {terrainData, pos1, pos2, rotation1, rotation2})
        })




        client.on('requestTurn', () => {
            client.to(client.roomId).emit('opponentRequestTurn', {})
        })



        client.on('playAgainRequest', () => {
            var room = findRoom(client.roomId)
            if (!room) return
            if (client.isHost === true) {
                room.host.playAgain = true
                if (room.player && room.player.playAgain === true) {
                    delete room.randomArray
                    delete room.terrainPath
                    delete room.heightmap

                    // Reset match state, Gold, inventories, and wager for new game
                    matchStates[client.roomId] = createMatchState(client.roomId)
                    delete goldStates[client.roomId]
                    delete weaponInventories[client.roomId]
                    delete shopReady[client.roomId]
                    delete wagerStates[client.roomId]
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

                    // Reset match state, Gold, inventories, and wager for new game
                    matchStates[client.roomId] = createMatchState(client.roomId)
                    delete goldStates[client.roomId]
                    delete weaponInventories[client.roomId]
                    delete shopReady[client.roomId]
                    delete wagerStates[client.roomId]
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
