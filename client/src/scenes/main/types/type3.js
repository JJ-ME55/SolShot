import { Display } from "phaser"

/**
* @param {Phaser.Scene} scene
*/

export const type3 = (scene) => {
    const socket = window.socket
    socket.removeAllListeners()

    const screenCenterX = scene.cameras.main.worldView.x + scene.cameras.main.width / 2;
    const screenCenterY = scene.cameras.main.worldView.y + scene.cameras.main.height / 2;

    var player1 = scene.sceneData.player1
    var player2 = scene.sceneData.player2
    var hostId = scene.sceneData.hostId
    
    scene.tank1.weapons = player1.weapons
    scene.tank2.weapons = player2.weapons
    
    scene.tank1.create(int2rgba(player1.color), player1.name)
    scene.tank2.create(int2rgba(player2.color), player2.name)


    if (socket.id === hostId) {
        scene.terrain.create()
        scene.tank1.randomPos()
        scene.tank2.randomPos()
        socket.emit('terrainPath', {path: scene.terrain.path, hostPos: {x: scene.tank1.x, y: scene.tank1.y}, playerPos: {x: scene.tank2.x, y: scene.tank2.y}})
    }
    else {
        socket.once('setTerrainPath', ({path, hostPos, playerPos}) => {
            scene.terrain.setPath(path)
            scene.tank1.setPosition(playerPos.x, playerPos.y)
            scene.tank2.setPosition(hostPos.x, hostPos.y)
            var rotation = scene.terrain.getSlope(playerPos.x, playerPos.y)
            if (rotation !== undefined) {
                scene.tank1.setRotation(rotation)
            }
            rotation = scene.terrain.getSlope(hostPos.x, hostPos.y)
            if (rotation !== undefined) {
                scene.tank2.setRotation(rotation)
            }
            scene.showTurnPointer()
        })
        
        socket.emit('getTerrainPath', {})
    }

    if (socket.id === hostId) {
        scene.tank1.active = true
        scene.activeTank = 1
    }
    else {
        scene.tank2.active = true
        scene.activeTank = 2
    }

    // === SERVER-AUTHORITATIVE EVENTS ===
    // Listen for server-computed turn results (from 'fire' event)
    // Currently logs results — will replace client physics in future phases
    socket.on('turnResult', ({playerId, weaponId, trajectory, impact, damage, terrainUpdate, scores, nextTurn, goldEarned, goldBalance}) => {
        console.log('[SolShot] Server turnResult:', {
            shooter: playerId === socket.id ? 'self' : 'opponent',
            weaponId,
            impactType: impact?.type,
            damage,
            scores,
            trajectoryPoints: trajectory?.length,
            nextTurn: nextTurn === socket.id ? 'your turn' : 'opponent turn',
            goldEarned,
            myGold: goldBalance ? goldBalance[socket.id] : undefined
        })
        // Update Gold display in HUD
        if (goldBalance && scene.hud && scene.hud.updateGold) {
            scene.hud.updateGold(goldBalance[socket.id] || 0)
        }
        // Future: animate trajectory from server data instead of local physics
        // Future: update terrain from terrainUpdate
        // Future: update score display from scores
    })

    // Listen for server-rejected fire attempts
    socket.on('fireRejected', ({reason}) => {
        console.warn('[SolShot] Fire rejected:', reason)
    })

    // Listen for server-generated terrain
    socket.on('terrainGenerated', ({path, heightmap, tankPositions, seed, firstTurn}) => {
        console.log('[SolShot] Server terrain generated:', {
            pathPoints: path?.length,
            seed,
            firstTurn: firstTurn === socket.id ? 'your turn' : 'opponent turn'
        })
        // Future: use server terrain instead of host-generated
    })

    // Listen for round/match end from server
    socket.on('roundEnd', ({winner, scores, roundWins, round, goldBalance}) => {
        console.log('[SolShot] Round ended:', { winner: winner === socket.id ? 'you' : 'opponent', scores, roundWins, round })
        if (goldBalance && scene.hud && scene.hud.updateGold) {
            scene.hud.updateGold(goldBalance[socket.id] || 0)
        }
    })

    socket.on('matchEnd', ({winner, scores, roundWins, goldBalance, settlement, wager}) => {
        console.log('[SolShot] Match ended:', { winner: winner === socket.id ? 'you' : 'opponent', scores, roundWins, settlement })
        if (goldBalance && scene.hud && scene.hud.updateGold) {
            scene.hud.updateGold(goldBalance[socket.id] || 0)
        }

        // Show SOL settlement result overlay if wagered match
        if (wager && wager > 0 && settlement) {
            const isWinner = winner === socket.id
            const solText = isWinner
                ? `+${settlement.winnerPayout?.toFixed(3) || '0.000'} SOL`
                : `-${wager.toFixed(3)} SOL`
            const solColor = isWinner ? 'rgba(100,255,100,1)' : 'rgba(255,80,80,1)'

            const solResult = scene.add.text(screenCenterX, 80, solText).setFontSize(36)
            solResult.setFontFamily('"Days One"').setOrigin(0.5).setDepth(130).setColor(solColor)
            strokeText(solResult, 4)

            const potLabel = scene.add.text(screenCenterX, 120, `Pot: ${(wager * 2).toFixed(3)} SOL`).setFontSize(18)
            potLabel.setFontFamily('"Days One"').setOrigin(0.5).setDepth(130).setColor('rgba(180,180,180,1)')

            if (settlement.txSignature) {
                const txLabel = scene.add.text(screenCenterX, 145, `TX: ${settlement.txSignature.slice(0,8)}...`).setFontSize(14)
                txLabel.setFontFamily('"Days One"').setOrigin(0.5).setDepth(130).setColor('rgba(150,150,150,1)')
            }
        }
    })

    socket.once('playAgain', () => {
        scene.sound.stopByKey('winner')

        const restartGame = () => {
            scene.scene.start('scene-5', scene.sceneData)
        }

        if (window.sdk === 'crazygames') {
            window.CrazyGames.SDK.game.gameplayStop();
            const callbacks = {
                adFinished: () => {this.game.sound.mute = false; restartGame()},
                adError: () => {this.game.sound.mute = false; restartGame(); window.CrazyGames.SDK.game.gameplayStop()},
                adStarted: () => {this.game.sound.mute = true; window.CrazyGames.SDK.game.gameplayStop()},
            };
            window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
            
        }
        if (window.sdk === 'gdsdk') {
            var gdsdk = window.gdsdk
            if (typeof gdsdk !== undefined && gdsdk.showAd !== undefined) {
                gdsdk.showAd()
                restartGame()
            }
        }
        else {
            restartGame()
        }
    })


    const m = scene.add.text(screenCenterX, screenCenterY - 35, 'OPPONENT LEFT')
    const n = scene.add.text(screenCenterX, screenCenterY + 35, 'EXIT')
    const overlay = scene.add.rectangle(screenCenterX, screenCenterY, scene.renderer.width, scene.renderer.height, 0x000000)

    m.setFontSize(50).setOrigin(0.5).setVisible(false).setDepth(120).setVisible(false)
    n.setFontSize(40).setOrigin(0.5).setVisible(false).setDepth(120).setVisible(false)
    overlay.setVisible(false).setAlpha(0.8).setDepth(110)
    m.setFontFamily('"Days One"').setColor('rgba(240,240,240,1)')
    n.setFontFamily('"Days One"').setColor('rgba(240,240,240,1)')
    strokeText(m, 4)
    strokeText(n, 4)

    n.setInteractive()
    
    n.on('pointerdown', () => {
        scene.sound.stopByKey('winner')
        if (window.sdk === 'crazygames') {
            window.CrazyGames.SDK.game.gameplayStop();
        }
        scene.scene.start('scene-4', {gameType: scene.sceneData.gameType, player1: player1})
    })
    
    // Listen for forfeit settlement (opponent disconnected during wagered match)
    socket.on('matchSettled', ({type, winner, settlement, txSignature}) => {
        console.log('[SolShot] Match settled via forfeit:', { type, winner: winner === socket.id ? 'you' : 'opponent', settlement })
        if (winner === socket.id && settlement) {
            const solText = `+${settlement.winner?.toFixed(3) || '0.000'} SOL (forfeit)`
            const solResult = scene.add.text(screenCenterX, screenCenterY - 80, solText).setFontSize(30)
            solResult.setFontFamily('"Days One"').setOrigin(0.5).setDepth(130).setColor('rgba(100,255,100,1)')
            strokeText(solResult, 3)
        }
    })

    socket.once('opponentLeft', () => {
        scene.sound.stopByKey('winner')
        if (scene.winnerBlastInterval !== null) {
            clearInterval(scene.winnerBlastInterval)
            scene.winnerBlastInterval = null
        }
        m.setVisible(true)
        n.setVisible(true)
        overlay.setVisible(true)
        overlay.setInteractive()
    })
}




const int2rgba = (colorInt) => {
    var rgba = new Display.Color.IntegerToRGB(colorInt)
    var rgbaString = 'rgba(' + rgba.r + ',' + rgba.g + ',' + rgba.b + ',' + rgba.a + ')'
    return rgbaString
}


const strokeText = (txt, thickness) => {
    var re = /rgba\((\d+),(\d+),(\d+),(\d+)\)/
    var match = new RegExp(re).exec(txt.style.color)
    var r, g, b, a, k = 0.7;
    r = parseInt(match[1])
    g = parseInt(match[2])
    b = parseInt(match[3])
    a = parseInt(match[4])

    r = Math.ceil(r * k)
    g = Math.ceil(g * k)
    b = Math.ceil(b * k)

    txt.setStroke('rgba(' + r + ',' + g + ',' + b + ',' + a + ')', thickness)
}