import { weaponArray } from "../../../weapons/array";
import Phaser from "phaser";
import { Display } from "phaser";


/**
* @param {Phaser.Scene} scene
*/

export const type3 = (scene) => {
    const socket = window.socket
    socket.removeAllListeners()

    scene.player1 = scene.sceneData.player1
    scene.player2 = scene.sceneData.player2
    scene.hostId = scene.sceneData.hostId

    const screenCenterX = scene.cameras.main.worldView.x + scene.cameras.main.width / 2;
    const screenCenterY = scene.cameras.main.worldView.y + scene.cameras.main.height / 2;
    const a = scene.add.text(screenCenterX / 2 - 150, 170, scene.player1.name);
    const b = scene.add.text(screenCenterX * 3/2 + 150, 170, scene.player2.name);

    a.setFontFamily('"Days One"')
    b.setFontFamily('"Days One"')
    a.setColor(int2rgba(scene.player1.color))
    b.setColor(int2rgba(scene.player2.color))

    const c = scene.add.text(screenCenterX, 100, 'WEAPON SHOP').setFontSize(50);
    c.setColor('rgba(240,240,240,1)')
    c.setOrigin(0.5, 0.5)
    c.setFontFamily('"Days One"')
    strokeText(c, 6)

    a.setOrigin(0.5).setFontSize(30)
    b.setOrigin(0.5).setFontSize(30)

    var rect1 = scene.add.rectangle(screenCenterX / 2 - 150, screenCenterY, scene.renderer.width/4 - 80, scene.renderer.height/2 + 20)
    rect1.setStrokeStyle(4, scene.player1.color)

    var rect2 = scene.add.rectangle(screenCenterX, screenCenterY, scene.renderer.width/3 - 100, scene.renderer.height/2)

    var rect3 = scene.add.rectangle(screenCenterX * 3/2 + 150, screenCenterY, scene.renderer.width/4 - 80, scene.renderer.height/2 + 20)
    rect3.setStrokeStyle(4, scene.player2.color)

    scene.player1.weapons = []
    scene.player2.weapons = []

    // === GOLD DISPLAY ===
    var myGold = 1000
    const goldLabel = scene.add.text(screenCenterX / 2 - 150, 200, '').setFontSize(24).setOrigin(0.5)
    goldLabel.setFontFamily('"Days One"').setColor('rgba(255,204,0,1)')
    strokeText(goldLabel, 3)
    const updateGoldDisplay = () => {
        goldLabel.setText(`Gold: ${myGold}`)
    }
    updateGoldDisplay()

    // === TIMER DISPLAY ===
    var shopTimeLeft = 30
    const timerText = scene.add.text(screenCenterX, 150, `${shopTimeLeft}s`).setFontSize(30).setOrigin(0.5)
    timerText.setFontFamily('"Days One"').setColor('rgba(255,100,100,1)')
    strokeText(timerText, 3)
    var timerInterval = null

    const startTimer = (seconds) => {
        shopTimeLeft = seconds
        timerText.setText(`${shopTimeLeft}s`)
        if (timerInterval) clearInterval(timerInterval)
        timerInterval = setInterval(() => {
            shopTimeLeft--
            if (shopTimeLeft <= 0) {
                shopTimeLeft = 0
                clearInterval(timerInterval)
                timerInterval = null
            }
            timerText.setText(`${shopTimeLeft}s`)
            if (shopTimeLeft <= 5) {
                timerText.setColor('rgba(255,50,50,1)')
            }
        }, 1000)
    }

    // === WEAPON CATALOG (populated by shopPhase event) ===
    var weaponCatalog = []     // server weapon data with costs
    var pickableItems = []     // UI containers for each weapon
    var ownedWeapons = [0]     // weapon IDs owned (starts with Single Shot)

    // === LEGACY PICK SYSTEM (fallback if no shopPhase) ===
    var pickableArray = []
    var remainingArray = []
    var turn = socket.id === scene.hostId ? 1 : 2
    const totalWeapons = 20
    var useLegacy = true       // switch to false when shopPhase received

    // Arrow indicators for legacy mode
    var canvas = document.createElement('canvas')
    canvas.width = 50
    canvas.height = 50
    var w = 50
    var h = 50
    var ctx = canvas.getContext('2d')

    ctx.fillStyle = "rgba(240,240,240,1)"
    ctx.moveTo(0, h/2)
    ctx.lineTo(w * (3/5), 0)
    ctx.lineTo(w/2, h * (1/3))
    ctx.lineTo(w, h * (1/3))
    ctx.lineTo(w, h * (2/3))
    ctx.lineTo(w/2, h * (2/3))
    ctx.lineTo(w * (3/5), h)
    ctx.lineTo(0, h/2)
    ctx.closePath()
    ctx.fill()

    scene.textures.addCanvas('arrow-left', canvas)
    var arrowleft = scene.add.image((screenCenterX / 2 - 300 + screenCenterX)/2, screenCenterY, 'arrow-left')
    arrowleft.setDepth(10)

    canvas = document.createElement('canvas')
    canvas.width = 50
    canvas.height = 50
    ctx = canvas.getContext('2d')

    ctx.fillStyle = "rgba(240,240,240,1)"
    ctx.moveTo(w, h/2)
    ctx.lineTo(w * (2/5), 0)
    ctx.lineTo(w/2, h * (1/3))
    ctx.lineTo(0, h * (1/3))
    ctx.lineTo(0, h * (2/3))
    ctx.lineTo(w/2, h * (2/3))
    ctx.lineTo(w * (2/5), h)
    ctx.lineTo(w, h/2)
    ctx.closePath()
    ctx.fill()

    scene.textures.addCanvas('arrow-right', canvas)
    var arrowright = scene.add.image((screenCenterX * 3/2 + 300 + screenCenterX)/2, screenCenterY, 'arrow-right')
    arrowright.setDepth(10)

    if (turn === 1) {
        arrowright.setVisible(false)
    }
    else {
        arrowleft.setVisible(false)
    }

    scene.tweens.add({
        targets: arrowleft,
        x: arrowleft.x - 5,
        repeat: -1,
        yoyo: true,
        duration: 300,
    })

    scene.tweens.add({
        targets: arrowright,
        x: arrowright.x + 5,
        repeat: -1,
        yoyo: true,
        duration: 300
    })

    // === SHOP PHASE EVENT (new Gold-based system) ===
    socket.on('shopPhase', ({weapons, goldBalance, timer}) => {
        useLegacy = false
        weaponCatalog = weapons

        // Hide legacy arrows
        arrowleft.setVisible(false)
        arrowright.setVisible(false)

        // Set Gold balance
        myGold = goldBalance[socket.id] || 1000
        updateGoldDisplay()

        // Start countdown
        startTimer(timer || 30)

        // Display weapon catalog in center rect
        const startX = rect2.x - rect2.width/2 + 10
        const startY = rect2.y - rect2.height/2 + 5
        const itemHeight = 36
        const maxVisible = Math.floor(rect2.height / itemHeight)

        // Sort weapons by cost (free first, then ascending)
        const sortedWeapons = [...weapons].sort((a, b) => a.goldCost - b.goldCost)

        sortedWeapons.forEach((weapon, index) => {
            if (index >= maxVisible) return

            const yPos = startY + index * itemHeight
            const container = scene.add.container(startX, yPos)

            // Weapon name
            const nameTxt = scene.add.text(5, 5, weapon.name).setFontSize(16).setDepth(10)
            nameTxt.setFontFamily('"Andale Mono"')

            // Cost text (right side)
            const costStr = weapon.goldCost === 0 ? 'FREE' : `${weapon.goldCost}G`
            const costTxt = scene.add.text(rect2.width - 30, 5, costStr).setFontSize(14).setDepth(10).setOrigin(1, 0)
            costTxt.setFontFamily('"Days One"')

            // Color by tier
            const tierColors = {
                free: 'rgba(200,200,200,1)',
                standard: 'rgba(255,255,255,1)',
                tactical: 'rgba(0,204,255,1)',
                rare: 'rgba(153,102,255,1)',
                epic: 'rgba(255,153,0,1)',
                legendary: 'rgba(255,204,0,1)'
            }
            const tierColor = tierColors[weapon.tier] || 'rgba(255,255,255,1)'
            costTxt.setColor(tierColor)

            // Clickable rect
            const clickRect = scene.add.rectangle(rect2.width/2 - 10, 15, rect2.width - 30, 30).setDepth(2)

            container.add(nameTxt)
            container.add(costTxt)
            container.add(clickRect)

            // Store refs
            container.weaponId = weapon.id
            container.weaponData = weapon
            container.nameTxt = nameTxt
            container.costTxt = costTxt
            container.clickRect = clickRect
            container.purchased = weapon.goldCost === 0 // Free weapons auto-owned
            pickableItems.push(container)

            // Style based on affordability
            const updateItemStyle = () => {
                if (container.purchased) {
                    nameTxt.setColor('rgba(100,200,100,1)')
                    costTxt.setText('OWNED')
                    costTxt.setColor('rgba(100,200,100,1)')
                    clickRect.removeInteractive()
                } else if (myGold < weapon.goldCost) {
                    nameTxt.setColor('rgba(120,120,120,1)')
                    costTxt.setColor('rgba(120,120,120,1)')
                } else {
                    nameTxt.setColor('rgba(240,240,240,1)')
                }
            }
            updateItemStyle()
            container.updateStyle = updateItemStyle

            // Click to buy
            clickRect.setInteractive()
            clickRect.on('pointerdown', () => {
                if (container.purchased) return
                if (myGold < weapon.goldCost) return
                scene.sound.play('click', {volume: 0.3})
                socket.emit('buyWeapon', { weaponId: weapon.id })
            })
            clickRect.on('pointerover', () => {
                if (!container.purchased && myGold >= weapon.goldCost) {
                    clickRect.setStrokeStyle(2, 0x00ccff, 1)
                }
            })
            clickRect.on('pointerout', () => {
                clickRect.setStrokeStyle(2, 0x00ccff, 0)
            })
        })
    })

    // Handle buy result
    socket.on('buyWeaponResult', ({success, weaponId, weapon, balance, inventory, reason}) => {
        if (success) {
            myGold = balance
            ownedWeapons = inventory || ownedWeapons
            updateGoldDisplay()

            // Add weapon to player1's weapon list
            if (weapon) {
                scene.player1.weapons.push({id: weapon.id, name: weapon.name, type: 'single'})
            }

            // Update purchased item and display in player's rect
            const item = pickableItems.find(i => i.weaponId === weaponId)
            if (item) {
                item.purchased = true
                item.updateStyle()
            }

            // Show in player's inventory box
            const x = rect1.x - rect1.width/2 + 10
            const y = rect1.y - rect1.height/2 + 10 + (scene.player1.weapons.length - 1) * 32
            if (weapon) {
                const invTxt = scene.add.text(x, y, weapon.name).setFontSize(16)
                invTxt.setFontFamily('"Andale Mono"').setColor('rgba(200,200,200,1)')
            }

            // Update affordability for all items
            pickableItems.forEach(i => i.updateStyle())
        } else {
            console.warn('[SolShot] Buy rejected:', reason)
        }
    })

    // Handle opponent's purchases
    socket.on('opponentBoughtWeapon', ({playerId, weaponId, weaponName}) => {
        scene.player2.weapons.push({id: weaponId, name: weaponName, type: 'single'})

        // Show in opponent's inventory box
        const x = rect3.x - rect3.width/2 + 10
        const y = rect3.y - rect3.height/2 + 10 + (scene.player2.weapons.length - 1) * 32
        const invTxt = scene.add.text(x, y, weaponName).setFontSize(16)
        invTxt.setFontFamily('"Andale Mono"').setColor('rgba(200,200,200,1)')
    })

    // Shop ended (timer expired or both done)
    socket.on('shopEnd', ({hostWeapons, playerWeapons, goldBalance}) => {
        if (timerInterval) {
            clearInterval(timerInterval)
            timerInterval = null
        }
        // Set weapons from server
        if (socket.id === scene.hostId) {
            scene.player1.weapons = hostWeapons
            scene.player2.weapons = playerWeapons
        } else {
            scene.player1.weapons = playerWeapons
            scene.player2.weapons = hostWeapons
        }
        // Store Gold balance for HUD use
        scene.player1.gold = goldBalance[socket.id] || 0
    })


    // === LEGACY: weaponPick relay (still works for backward compatibility) ===
    socket.on('opponentWeaponPick', ({arrayIndex}) => {
        if (!useLegacy) return
        scene.sound.play('click', {volume: 0.3})
        var oppPick = pickableArray[arrayIndex]
        var x = rect3.x - rect3.width/2 + 10
        var y = rect3.y - rect3.height/2 + 10 + scene.player2.weapons.length * 40
        oppPick.setPosition(x, y)
        oppPick.rect.removeInteractive()
        scene.player2.weapons.push({id: oppPick.weaponIndex, name: oppPick.text, type: oppPick.type})
        turn = 1
        arrowright.setVisible(false)
        if (scene.player1.weapons.length < totalWeapons/2)
            arrowleft.setVisible(true)
        if (scene.player1.weapons.length + scene.player2.weapons.length === totalWeapons) {
            g.setColor('rgba(255,255,0,1)')
        }
    })

    const pickWeapon = (pickable) => {
        if (!useLegacy) return
        if (turn === 1) {
            var x = rect1.x - rect1.width/2 + 10
            var y = rect1.y - rect1.height/2 + 10 + scene.player1.weapons.length * 40
            pickable.setPosition(x, y)
            pickable.rect.removeInteractive()
            remainingArray = remainingArray.filter((ele) => { return ele !== pickable.arrayIndex })
            scene.player1.weapons.push({id: pickable.weaponIndex, name: pickable.text, type: pickable.type})
            socket.emit('weaponPick', {arrayIndex: pickable.arrayIndex})
            turn = 2
            arrowleft.setVisible(false)
            if (scene.player2.weapons.length < totalWeapons/2)
                arrowright.setVisible(true)
            if (scene.player1.weapons.length + scene.player2.weapons.length === totalWeapons) {
                g.setColor('rgba(255,255,0,1)')
            }
        }
    }

    socket.once('setWeaponArray', ({randomArray}) => {
        if (!useLegacy) return
        for (let index = 0; index < randomArray.length/2; index++) {
            var randomWeaponIndex = randomArray[index]
            var pickable = scene.add.container(rect2.x - rect2.width/2 - 80, rect2.y - rect2.height/2 + 10 + index * 40)
            var txt = scene.add.text(30,5,weaponArray[randomWeaponIndex].name).setDepth(10)
            var img = scene.add.image(10,15, scene.textures.addCanvas(Math.random().toString(32).slice(3,7), weaponArray[randomWeaponIndex].logoCanvas)).setDepth(10)
            var rect = scene.add.rectangle(110,15,250,36).setDepth(2)
            pickable.add(txt)
            pickable.text = weaponArray[randomWeaponIndex].name
            pickable.add(rect)
            pickable.rect = rect
            pickable.add(img)
            pickableArray.push(pickable)
            txt.setFontSize(20)
            txt.setFontFamily('"Andale Mono"')
            pickable.weaponIndex =  weaponArray[randomWeaponIndex].id
            pickable.arrayIndex = index
            pickable.type = weaponArray[randomWeaponIndex].type

            rect.setInteractive()
            rect.on('pointerdown', () => {
                scene.sound.play('click', {volume: 0.3})
                pickWeapon(pickableArray[index])
            })
        }

        for (let index = 0; index < randomArray.length/2; index++) {
            var randomWeaponIndex = randomArray[index + randomArray.length/2]
            var pickable = scene.add.container(rect2.x - rect2.width/2 + 180, rect2.y - rect2.height/2 + 10 + index * 40)
            var txt = scene.add.text(30,5,weaponArray[randomWeaponIndex].name).setDepth(10)
            var img = scene.add.image(10,15, scene.textures.addCanvas(Math.random().toString(32).slice(3,7), weaponArray[randomWeaponIndex].logoCanvas)).setDepth(10)
            var rect = scene.add.rectangle(110,15,250,36).setDepth(2)
            pickable.add(txt)
            pickable.text = weaponArray[randomWeaponIndex].name
            pickable.add(rect)
            pickable.rect = rect
            pickable.add(img)
            pickableArray.push(pickable)
            txt.setFontSize(20)
            txt.setFontFamily('"Andale Mono"')
            pickable.weaponIndex =  weaponArray[randomWeaponIndex].id
            pickable.arrayIndex = index + totalWeapons/2
            pickable.type = weaponArray[randomWeaponIndex].type

            rect.setInteractive()
            rect.on('pointerdown', () => {
                scene.sound.play('click', {volume: 0.3})
                pickWeapon(pickableArray[index + totalWeapons/2])
            })
        }

        pickableArray.forEach(pickable => {
            pickable.rect.on('pointerdown', () => {
                pickable.rect.setStrokeStyle(0,0,0)
            })
            pickable.rect.on('pointerover', () => {
                pickable.rect.setStrokeStyle(2, 0x00ccff, 1)
            })
            pickable.rect.on('pointerout', () => {
                pickable.rect.setStrokeStyle(2, 0x00ccff, 0)
            })
        })
    })

    if (socket.id === scene.hostId) {
        socket.emit('createWeaponArray', {count: totalWeapons, max: weaponArray.length})
    }

    socket.emit('getWeaponArray', {})

    socket.once('startGame', () => {
        if (timerInterval) {
            clearInterval(timerInterval)
            timerInterval = null
        }
        scene.scene.start('main-scene', {gameType: 3, player1: scene.player1, player2: scene.player2, hostId: scene.hostId})
    })


    const g = scene.add.text(screenCenterX, 700, 'CONTINUE').setFontSize(50).setOrigin(0.5);
    g.setFontFamily('"Days One"')
    g.setOrigin(0.5)
    g.setColor('rgba(200,200,200,1)')
    strokeText(g, 6)

    const m = scene.add.text(screenCenterX, screenCenterY - 35, 'OPPONENT LEFT')
    const n = scene.add.text(screenCenterX, screenCenterY + 35, 'EXIT')
    const overlay = scene.add.rectangle(screenCenterX, screenCenterY, scene.renderer.width, scene.renderer.height, 0x000000)
    m.setFontFamily('"Days One"').setColor('rgba(240,240,240,1)')
    n.setFontFamily('"Days One"').setColor('rgba(240,240,240,1)')
    strokeText(m, 4)
    strokeText(n, 4)

    m.setFontSize(50).setOrigin(0.5).setVisible(false).setDepth(20).setVisible(false)
    n.setFontSize(40).setOrigin(0.5).setVisible(false).setDepth(20).setVisible(false)
    overlay.setVisible(false).setAlpha(0.8).setDepth(19)

    n.setInteractive()

    n.on('pointerdown', () => {
        scene.sound.play('click', {volume: 0.3})
        scene.scene.start('scene-4', {gameType: scene.sceneData.gameType, player1: scene.player1})
    })

    socket.once('opponentLeft', () => {
        m.setVisible(true)
        n.setVisible(true)
        overlay.setVisible(true)
        overlay.setInteractive()
    })

    g.setInteractive()
    g.on('pointerdown', () => {
        if (!useLegacy) {
            // New Gold system: clicking CONTINUE means done shopping
            scene.sound.play('click', {volume: 0.3})
            socket.emit('shopDone', {})
            g.setText('WAITING...')
            g.disableInteractive()
            return
        }
        // Legacy: need all weapons picked
        if (scene.player1.weapons.length + scene.player2.weapons.length === totalWeapons) {
            scene.sound.play('click', {volume: 0.3})
            socket.emit('ready', {})
            g.setText('WAITING...')
            g.disableInteractive()
        }
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
