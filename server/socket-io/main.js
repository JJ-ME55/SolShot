import mongoose from 'mongoose';
import Match from '../models/Match.js';
import { processShot, generateTerrain, generateTankPositions, WEAPON_DATA } from '../services/physics.js';
import { createMatchState, validateAction, transitionState, getNextTurn, isRoundOver, isMatchOver, getRoundWinner, MATCH_STATES } from '../services/match.js';

// Helper: check if MongoDB is connected before DB operations
function isDbConnected() {
    return mongoose.connection.readyState === 1; // 1 = connected
}

// In-memory cache for active rooms (fast lookups during gameplay)
// DB is source of truth, cache is synced on mutations
var rooms = []

// In-memory match states keyed by roomId
var matchStates = {}

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
    if (room && room._matchId && isDbConnected()) {
        try {
            await Match.findByIdAndUpdate(room._matchId, { status: 'cancelled' });
        } catch (err) {
            console.error('DB cancel error:', err.message);
        }
    }
}

const mainsocket = (io) => {
    return io.on("connection", (client) => {
        client.roomId = null
        client.name = ""
        client.color = 0
        client.isHost = false


        client.on('disconnect', async () => {
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



        client.on('leaveRoom', async () => {
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



        client.on('joinRoom', async ({roomId, name, color}) => {
            if (client.roomId === roomId) return
            var room = findRoom(roomId)
            if (!room || room.active === true) return

            if (client.roomId !== null) {
                client.leave(client.roomId)
                await removeRoom(client.roomId)
            }

            client.join(roomId)
            client.roomId = roomId
            client.isHost = false
            client.name = name
            client.color = color

            room.player = {name: name, color: color, socketId: client.id, isReady: false, playAgain: false}
            room.active = true

            // Persist player join to DB
            persistRoom(room);

            io.emit('setRooms', {rooms: getOpenRooms()})
            io.sockets.in(client.roomId).emit('startPick', {host: room.host, player: room.player})
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
                    io.sockets.in(client.roomId).emit('startGame', {})
                    room.player.isReady = false
                    room.host.isReady = false
                }
            }
            else {
                if (!room.player) return
                room.player.isReady = true
                if (room.host.isReady === true) {
                    io.sockets.in(client.roomId).emit('startGame', {})
                    room.player.isReady = false
                    room.host.isReady = false
                }
            }
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
        client.on('fire', ({angle, power, weaponId, startX, startY}) => {
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

            // Update match state
            if (ms) {
                // Update scores
                for (const [playerId, dmg] of Object.entries(result.damage)) {
                    ms.scores[playerId] = (ms.scores[playerId] || 0) + dmg
                }

                // Advance turn
                ms.turnCount++
                const hostId = room.host.socketId
                const playerId = room.player ? room.player.socketId : null
                ms.currentTurn = playerId ? getNextTurn(ms, hostId, playerId) : null
            }

            // Broadcast turn result to BOTH players
            io.sockets.in(client.roomId).emit('turnResult', {
                playerId: client.id,
                weaponId,
                trajectory: result.trajectory,
                impact: result.impact,
                damage: result.damage,
                terrainUpdate: result.newTerrain,
                scores: ms ? ms.scores : {},
                nextTurn: ms ? ms.currentTurn : null
            })

            // Check if round is over
            if (ms && isRoundOver(ms)) {
                const hostId = room.host.socketId
                const playerId = room.player ? room.player.socketId : null
                const roundWinner = getRoundWinner(ms, hostId, playerId)

                ms.roundWins[roundWinner] = (ms.roundWins[roundWinner] || 0) + 1
                ms.currentRound++

                const matchResult = isMatchOver(ms, hostId, playerId)

                if (matchResult.isOver) {
                    transitionState(ms, MATCH_STATES.SETTLING)
                    io.sockets.in(client.roomId).emit('matchEnd', {
                        winner: matchResult.winner,
                        scores: ms.scores,
                        roundWins: ms.roundWins
                    })
                } else {
                    transitionState(ms, MATCH_STATES.ROUND_END)
                    io.sockets.in(client.roomId).emit('roundEnd', {
                        winner: roundWinner,
                        scores: ms.scores,
                        roundWins: ms.roundWins,
                        round: ms.currentRound
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
                transitionState(ms, MATCH_STATES.BATTLE)
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

                    // Reset match state for new game
                    matchStates[client.roomId] = createMatchState(client.roomId)

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

                    // Reset match state for new game
                    matchStates[client.roomId] = createMatchState(client.roomId)

                    io.sockets.in(client.roomId).emit('playAgain', {})
                    room.player.playAgain = false
                    room.host.playAgain = false
                }
            }
        })
    })
}

export default mainsocket
