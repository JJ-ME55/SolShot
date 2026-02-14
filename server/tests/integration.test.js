/**
 * SolShot Integration Test: 2-Client Full Match Flow
 *
 * Tests the server-authoritative pipeline:
 *   1. Two clients connect
 *   2. Client 1 creates room
 *   3. Client 2 joins room
 *   4. Both ready up
 *   5. Request server terrain
 *   6. Client fires (server physics)
 *   7. Both receive turnResult
 *   8. Verify damage, trajectory, terrain update
 *   9. Disconnect cleanup
 *
 * Run: cd server && node tests/integration.test.js
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import mainsocket from '../socket-io/main.js';

const PORT = 5099; // test port to avoid conflicts
let httpServer, ioServer;
let client1, client2;
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        console.error(`  ✗ ${message}`);
    }
}

function waitForEvent(socket, event, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

async function setup() {
    httpServer = createServer();
    ioServer = new Server(httpServer, { cors: { origin: '*' } });
    mainsocket(ioServer);

    await new Promise((resolve) => httpServer.listen(PORT, resolve));
    console.log(`Test server started on port ${PORT}\n`);

    client1 = ioc(`http://localhost:${PORT}`, { forceNew: true });
    client2 = ioc(`http://localhost:${PORT}`, { forceNew: true });

    await Promise.all([
        new Promise((resolve) => client1.on('connect', resolve)),
        new Promise((resolve) => client2.on('connect', resolve)),
    ]);
}

async function teardown() {
    client1.disconnect();
    client2.disconnect();
    ioServer.close();
    httpServer.close();
}

async function testCreateAndJoinRoom() {
    console.log('Test: Create and Join Room');

    // Client 1 creates room — setRooms is async because of DB write
    // Set up listener BEFORE emitting
    const roomsPromise = waitForEvent(client1, 'setRooms', 10000);
    client1.emit('createRoom', { player: { name: 'Host', color: 0xff0000 } });
    const { rooms } = await roomsPromise;
    assert(rooms.length >= 1, 'Room appears in room list');
    assert(rooms[0].host.name === 'Host', 'Host name is correct');

    const roomId = rooms[0].roomId;

    // Client 2 joins room
    const startPickPromise = waitForEvent(client2, 'startPick');
    client2.emit('joinRoom', { roomId, name: 'Player', color: 0x0000ff });
    const { host, player } = await startPickPromise;
    assert(host.name === 'Host', 'Host in startPick event');
    assert(player.name === 'Player', 'Player in startPick event');

    return roomId;
}

async function testReady() {
    console.log('\nTest: Ready Up');

    const startGamePromise = waitForEvent(client1, 'startGame');
    client1.emit('ready');
    client2.emit('ready');
    await startGamePromise;
    assert(true, 'startGame emitted when both ready');
}

async function testServerTerrain() {
    console.log('\nTest: Server Terrain Generation');

    const terrainPromise1 = waitForEvent(client1, 'terrainGenerated');
    const terrainPromise2 = waitForEvent(client2, 'terrainGenerated');

    client1.emit('requestTerrain');

    const [terrain1, terrain2] = await Promise.all([terrainPromise1, terrainPromise2]);

    assert(terrain1.path.length > 10, `Terrain path has ${terrain1.path.length} points`);
    assert(terrain1.heightmap.length === 1200, 'Heightmap is 1200 wide');
    assert(terrain1.seed === terrain2.seed, 'Both clients get same seed');
    assert(terrain1.tankPositions.host.x === terrain2.tankPositions.host.x, 'Tank positions match');
    assert(terrain1.firstTurn !== null, 'First turn assigned');

    return terrain1;
}

async function testServerFire(terrain) {
    console.log('\nTest: Server-Authoritative Fire');

    // Find who goes first
    const firstTurn = terrain.firstTurn;
    const shooter = firstTurn === client1.id ? client1 : client2;
    const receiver = firstTurn === client1.id ? client2 : client1;

    // Shooter fires
    const resultPromise1 = waitForEvent(client1, 'turnResult');
    const resultPromise2 = waitForEvent(client2, 'turnResult');

    shooter.emit('fire', {
        angle: 0.5,
        power: 60,
        weaponId: 0,    // Single Shot
        startX: terrain.tankPositions.host.x,
        startY: terrain.tankPositions.host.y - 20
    });

    const [result1, result2] = await Promise.all([resultPromise1, resultPromise2]);

    assert(result1.playerId === result2.playerId, 'Both clients see same shooter');
    assert(result1.weaponId === 0, 'Weapon ID is Single Shot (0)');
    assert(Array.isArray(result1.trajectory), 'Trajectory is an array');
    assert(result1.trajectory.length > 10, `Trajectory has ${result1.trajectory.length} points`);
    assert(result1.impact !== null, 'Impact point calculated');
    assert(result1.impact.type !== undefined, `Impact type: ${result1.impact.type}`);
    assert(typeof result1.damage === 'object', 'Damage is an object');
    assert(result1.nextTurn !== null, 'Next turn assigned');
    assert(result1.nextTurn !== firstTurn, 'Turn alternated to other player');
    assert(Array.isArray(result1.terrainUpdate), 'Terrain update is an array');
    assert(result1.terrainUpdate.length === 1200, 'Terrain update is full heightmap');

    return result1;
}

async function testTurnValidation(terrain) {
    console.log('\nTest: Turn Validation');

    // Try to fire out of turn — the wrong player tries to fire
    const firstTurn = terrain.firstTurn;
    const wrongPlayer = firstTurn === client1.id ? client1 : client2;  // Same as first turn, but turn already advanced

    const rejectPromise = waitForEvent(wrongPlayer, 'fireRejected', 2000).catch(() => null);

    wrongPlayer.emit('fire', {
        angle: 0.5,
        power: 50,
        weaponId: 0,
        startX: 300,
        startY: 200
    });

    const rejection = await rejectPromise;
    assert(rejection !== null, 'Out-of-turn fire was rejected');
    if (rejection) {
        assert(rejection.reason === 'Not your turn', `Rejection reason: ${rejection.reason}`);
    }
}

async function testInvalidWeapon() {
    console.log('\nTest: Invalid Weapon Validation');

    // Find current turn holder and fire with invalid weapon
    // We need to figure out whose turn it is now
    const rejectPromise = waitForEvent(client1, 'fireRejected', 2000)
        .catch(() => waitForEvent(client2, 'fireRejected', 2000))
        .catch(() => null);

    // Try both — one will be rejected for wrong turn, other for invalid weapon
    client1.emit('fire', { angle: 0.5, power: 50, weaponId: 999, startX: 300, startY: 200 });
    client2.emit('fire', { angle: 0.5, power: 50, weaponId: 999, startX: 300, startY: 200 });

    const rejection = await rejectPromise;
    assert(rejection !== null, 'Invalid weapon fire was rejected');
}

async function testLegacyShootRelay() {
    console.log('\nTest: Legacy Shoot Relay (Backward Compatibility)');

    const opponentShootPromise = waitForEvent(client2, 'opponentShoot');

    client1.emit('shoot', {
        selectedWeapon: 0,
        power: 60,
        rotation: 0.5,
        rotation1: 0.1,
        rotation2: 0.2,
        position1: { x: 100, y: 200 },
        position2: { x: 800, y: 300 }
    });

    const data = await opponentShootPromise;
    assert(data.selectedWeapon === 0, 'Legacy shoot relay works');
    assert(data.power === 60, 'Power relayed correctly');
}

async function testShopPhase() {
    console.log('\nTest: Shop Phase & Gold Economy');

    // Reconnect fresh clients for a new room
    client1.disconnect();
    client2.disconnect();

    client1 = ioc(`http://localhost:${PORT}`, { forceNew: true });
    client2 = ioc(`http://localhost:${PORT}`, { forceNew: true });
    await Promise.all([
        new Promise((resolve) => client1.on('connect', resolve)),
        new Promise((resolve) => client2.on('connect', resolve)),
    ]);

    // Create and join room
    const roomsPromise = waitForEvent(client1, 'setRooms', 10000);
    client1.emit('createRoom', { player: { name: 'ShopHost', color: 0xff0000 } });
    const { rooms } = await roomsPromise;
    const roomId = rooms[0].roomId;

    const startPickPromise = waitForEvent(client2, 'startPick');
    client2.emit('joinRoom', { roomId, name: 'ShopPlayer', color: 0x0000ff });
    await startPickPromise;

    // Ready up — should trigger shopPhase
    const shopPromise1 = waitForEvent(client1, 'shopPhase', 5000);
    const shopPromise2 = waitForEvent(client2, 'shopPhase', 5000);
    client1.emit('ready');
    client2.emit('ready');

    const [shop1, shop2] = await Promise.all([shopPromise1, shopPromise2]);

    assert(Array.isArray(shop1.weapons), 'Shop sends weapon catalog');
    assert(shop1.weapons.length === 13, `Weapon catalog has ${shop1.weapons.length} weapons`);
    assert(shop1.timer === 30, 'Shop timer is 30 seconds');
    assert(typeof shop1.goldBalance === 'object', 'Gold balance is object');

    const myBalance1 = shop1.goldBalance[client1.id];
    assert(myBalance1 === 1000, `Host starts with ${myBalance1} Gold`);

    // Buy a weapon (Magic Wall = 200 Gold)
    const buyPromise = waitForEvent(client1, 'buyWeaponResult', 3000);
    const oppBuyPromise = waitForEvent(client2, 'opponentBoughtWeapon', 3000);
    client1.emit('buyWeapon', { weaponId: 12 });  // Magic Wall, 200 Gold

    const buyResult = await buyPromise;
    assert(buyResult.success === true, 'Buy weapon succeeded');
    assert(buyResult.balance === 800, `Balance after buy: ${buyResult.balance}`);
    assert(buyResult.weaponId === 12, 'Bought Magic Wall (ID 12)');

    const oppBuy = await oppBuyPromise;
    assert(oppBuy.weaponName === 'Magic Wall', 'Opponent notified of purchase');

    // Try to buy something too expensive (Crazy Ivan = 2500 Gold)
    const expensivePromise = waitForEvent(client1, 'buyWeaponResult', 3000);
    client1.emit('buyWeapon', { weaponId: 9 });
    const expensiveResult = await expensivePromise;
    assert(expensiveResult.success === false, 'Cannot buy unaffordable weapon');
    assert(expensiveResult.reason === 'Insufficient Gold', `Reject reason: ${expensiveResult.reason}`);

    // Try to buy already owned weapon
    const dupPromise = waitForEvent(client1, 'buyWeaponResult', 3000);
    client1.emit('buyWeapon', { weaponId: 12 });
    const dupResult = await dupPromise;
    assert(dupResult.success === false, 'Cannot buy duplicate weapon');
    assert(dupResult.reason === 'Already owned', `Dup reason: ${dupResult.reason}`);

    // Both players done shopping
    const shopEndPromise1 = waitForEvent(client1, 'shopEnd', 5000);
    const shopEndPromise2 = waitForEvent(client2, 'shopEnd', 5000);
    client1.emit('shopDone');
    client2.emit('shopDone');

    const [shopEnd1, shopEnd2] = await Promise.all([shopEndPromise1, shopEndPromise2]);
    assert(shopEnd1.hostWeapons.length >= 1, `Host has ${shopEnd1.hostWeapons.length} weapons`);
    assert(shopEnd1.playerWeapons.length >= 1, `Player has ${shopEnd1.playerWeapons.length} weapons`);
    assert(typeof shopEnd1.goldBalance === 'object', 'shopEnd includes Gold balances');
}

async function testGoldFromDamage() {
    console.log('\nTest: Gold Earned from Damage');

    // Request terrain to set up battle phase
    const terrainPromise1 = waitForEvent(client1, 'terrainGenerated', 5000);
    client1.emit('requestTerrain');
    const terrain = await terrainPromise1;

    // Fire and check Gold in turnResult
    const firstTurn = terrain.firstTurn;
    const shooter = firstTurn === client1.id ? client1 : client2;

    const resultPromise = waitForEvent(shooter, 'turnResult', 5000);
    shooter.emit('fire', {
        angle: 0.5,
        power: 60,
        weaponId: 0,
        startX: terrain.tankPositions.host.x,
        startY: terrain.tankPositions.host.y - 20
    });

    const result = await resultPromise;
    assert(typeof result.goldEarned === 'number', `goldEarned field present: ${result.goldEarned}`);
    assert(typeof result.goldBalance === 'object', 'goldBalance in turnResult');
}

async function testDisconnect() {
    console.log('\nTest: Disconnect Handling');

    const leftPromise = waitForEvent(client1, 'opponentLeft', 3000).catch(() => null);
    client2.disconnect();

    const result = await leftPromise;
    assert(result !== null, 'Client 1 notified of opponent leaving');
}

// Run all tests
async function run() {
    console.log('═══════════════════════════════════════');
    console.log('SolShot Integration Tests');
    console.log('═══════════════════════════════════════\n');

    try {
        await setup();

        await testCreateAndJoinRoom();
        await testReady();
        const terrain = await testServerTerrain();
        const shotResult = await testServerFire(terrain);
        await testTurnValidation(terrain);
        await testLegacyShootRelay();
        await testShopPhase();
        await testGoldFromDamage();
        await testDisconnect();

    } catch (err) {
        console.error('\n  FATAL ERROR:', err.message);
        failed++;
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════');

    await teardown();
    process.exit(failed > 0 ? 1 : 0);
}

run();
