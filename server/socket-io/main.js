import Match from '../models/Match.js';

// In-memory cache for active rooms (fast lookups during gameplay)
// DB is source of truth, cache is synced on mutations
var rooms = []

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
    if (!room || !room._matchId) return;
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
            if (room.host.pos) update['host.score'] = 0; // placeholder
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
    if (room && room._matchId) {
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

            // Persist to DB
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
                // DB not available — still works in-memory
                console.warn('Match not persisted to DB:', err.message);
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



        client.on('shoot', ({selectedWeapon, power, rotation, rotation1, rotation2, position1, position2}) => {
            client.to(client.roomId).emit('opponentShoot', {selectedWeapon, power, rotation, rotation1, rotation2, position1, position2})
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



        client.on('terrainPath', ({path, hostPos, playerPos}) => {
            var room = findRoom(client.roomId)
            if (!room) return
            room.terrainPath = [...path]
            room.host.pos = {...hostPos}
            room.player.pos = {...playerPos}
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
                    io.sockets.in(client.roomId).emit('playAgain', {})
                    room.player.playAgain = false
                    room.host.playAgain = false
                }
            }
        })
    })
}

export default mainsocket
