import { Display } from "phaser";
import { usernameArray } from "../../../utils/usernames";

/**
* @param {Phaser.Scene} scene
*/

export const type3 = (scene) => {
    const screenCenterX = scene.cameras.main.worldView.x + scene.cameras.main.width / 2;
    const screenCenterY = scene.cameras.main.worldView.y + scene.cameras.main.height / 2;
    const a = scene.add.text(screenCenterX, 100, 'PLAYER 1').setFontSize(50);

    const b = scene.add.text(screenCenterX, 200, 'NAME :  ').setFontSize(50);
    const c = scene.add.text(screenCenterX, 200, usernameArray[Math.floor(Math.random()*usernameArray.length)]).setFontSize(50);
    const d = scene.add.text(screenCenterX + 50, 200, '_').setFontSize(50);

    if (window.sdk === 'kongregate' && !window.kongregate.services.isGuest()) {
        var username = window.kongregate.services.getUsername()
        username = username.length < 16 ? username : username.substr(0, 15)
        c.setText(username)
    }

    const e = scene.add.text(screenCenterX, 300, 'COLOR :  ').setFontSize(50);
    const f = scene.add.text(screenCenterX, 300, '').setFontSize(50);

    [a,b,c,d,e,f].forEach((text) => { text.setFontFamily('"Days One"') })

    a.setOrigin(0.5, 0)
    b.setOrigin(1, 0)
    c.setOrigin(0, 0)
    e.setOrigin(1, 0)
    f.setOrigin(0, 0)

    a.setColor('rgba(240,240,240,1)')
    strokeText(a, 6)
    b.setColor('rgba(180,180,180,1)')
    strokeText(b, 6)
    c.setColor('rgba(240,240,240,1)')
    strokeText(c, 6)
    d.setColor('rgba(240,240,240,1)')
    strokeText(d, 6)
    e.setColor('rgba(180,180,180,1)')
    strokeText(e, 6)

    d.setX(c.x + c.width)

    scene.input.keyboard.on('keydown', (e) => {
        if (e.key === "Backspace") {
            c.setText(c.text.slice(0, c.text.length - 1))
            d.setX(c.x + c.width)

        }
        else {
            if (isAlphaNumeric(e.key) && c.text.length < 16) {
                c.setText(c.text + e.key)
                d.setX(c.x + c.width)
            }
        }
    })

    setInterval(() => {
        d.visible === true ? d.setVisible(false) : d.setVisible(true)
    }, 500);

    var colors = []
    var colorValues = [0xFF0000, 0xFF9900, 0xFFFF00, 0x66FF33, 0x00FFFF, 0x0000FF, 0x9933FF, 0xCC0099]
    var selectedColor

    
    colors.push({ name: 'RED', box: scene.add.rectangle(screenCenterX - 350, 500, 100, 100)})
    colors.push({ name: 'ORANGE', box: scene.add.rectangle(screenCenterX - 250, 500, 100, 100)})
    colors.push({ name: 'YELLOW', box: scene.add.rectangle(screenCenterX - 150, 500, 100, 100)})
    colors.push({ name: 'GREEN', box: scene.add.rectangle(screenCenterX - 50, 500, 100, 100)})
    colors.push({ name: 'CYAN', box: scene.add.rectangle(screenCenterX + 50, 500, 100, 100)})
    colors.push({ name: 'BLUE', box: scene.add.rectangle(screenCenterX + 150, 500, 100, 100)})
    colors.push({ name: 'VIOLET', box: scene.add.rectangle(screenCenterX + 250, 500, 100, 100)})
    colors.push({ name: 'MAGENTA', box: scene.add.rectangle(screenCenterX + 350, 500, 100, 100)})

    colors.forEach((color, index) => {
        color.box.setInteractive()
        color.box.setFillStyle(colorValues[index], 1)
        color.box.on('pointerdown', () => {
            scene.sound.play('click', {volume: 0.3})
            f.setText(color.name)
            f.setColor(int2rgba(colorValues[index]))
            strokeText(f, 6)
            selectedColor = index
        })
    })

    // set random color
    selectedColor = (new Date()).getSeconds() % 8
    f.setText(colors[selectedColor].name)
    f.setColor(int2rgba(colorValues[selectedColor]))
    strokeText(f, 6)

    // === WAGER SELECTION ===
    const wagerLabel = scene.add.text(screenCenterX, 580, 'WAGER :  ').setFontSize(40)
    wagerLabel.setFontFamily('"Days One"').setOrigin(1, 0).setColor('rgba(180,180,180,1)')
    strokeText(wagerLabel, 5)

    const wagerTiers = [0, 0.01, 0.05, 0.1, 0.25, 0.5]
    const wagerLabels = ['FREE', '0.01', '0.05', '0.1', '0.25', '0.5']
    var selectedWager = 0  // Default: free play

    const wagerDisplay = scene.add.text(screenCenterX, 580, 'FREE').setFontSize(40)
    wagerDisplay.setFontFamily('"Days One"').setOrigin(0, 0).setColor('rgba(100,255,100,1)')
    strokeText(wagerDisplay, 5)

    // Wallet status
    const walletStatus = scene.add.text(screenCenterX, 630, '').setFontSize(18).setOrigin(0.5, 0)
    walletStatus.setFontFamily('"Days One"').setColor('rgba(180,180,180,1)')

    const updateWalletStatus = () => {
        const wallet = window.solWallet
        if (wallet && wallet.connected) {
            walletStatus.setText(`Wallet: ${wallet.publicKey.slice(0,4)}...${wallet.publicKey.slice(-4)} | ${wallet.balance.toFixed(3)} SOL`)
            walletStatus.setColor('rgba(100,255,100,1)')
        } else {
            walletStatus.setText('No wallet connected (free play only)')
            walletStatus.setColor('rgba(255,150,100,1)')
        }
    }
    updateWalletStatus()

    // Wager tier buttons
    const wagerButtons = []
    const tierStartX = screenCenterX - 275
    wagerTiers.forEach((tier, index) => {
        const btnX = tierStartX + index * 110
        const btn = scene.add.text(btnX, 580, wagerLabels[index]).setFontSize(24).setOrigin(0.5, 0)
        btn.setFontFamily('"Days One"')
        btn.setInteractive()

        const updateBtnStyle = () => {
            if (index === selectedWager) {
                btn.setColor('rgba(255,204,0,1)')
                strokeText(btn, 3)
            } else {
                const wallet = window.solWallet
                const canAfford = tier === 0 || (wallet && wallet.connected && wallet.balance >= tier + 0.01)
                if (canAfford) {
                    btn.setColor('rgba(200,200,200,1)')
                    strokeText(btn, 2)
                } else {
                    btn.setColor('rgba(100,100,100,1)')
                    strokeText(btn, 2)
                }
            }
        }
        updateBtnStyle()
        wagerButtons.push({ btn, tier, index, updateBtnStyle })

        btn.on('pointerdown', () => {
            if (tier > 0) {
                const wallet = window.solWallet
                if (!wallet || !wallet.connected) {
                    walletStatus.setText('Connect wallet to wager SOL!')
                    walletStatus.setColor('rgba(255,80,80,1)')
                    return
                }
                if (wallet.balance < tier + 0.01) {
                    walletStatus.setText(`Need ${(tier + 0.01).toFixed(3)} SOL (have ${wallet.balance.toFixed(3)})`)
                    walletStatus.setColor('rgba(255,80,80,1)')
                    return
                }
            }
            scene.sound.play('click', {volume: 0.3})
            selectedWager = index
            wagerDisplay.setText(tier === 0 ? 'FREE' : `${tier} SOL`)
            wagerDisplay.setColor(tier === 0 ? 'rgba(100,255,100,1)' : 'rgba(255,204,0,1)')
            strokeText(wagerDisplay, 5)
            wagerButtons.forEach(b => b.updateBtnStyle())
            updateWalletStatus()
        })
    })

    // Hide the per-tier buttons — use the wager label row instead
    // Replace with left/right arrows for simpler UX
    wagerButtons.forEach(b => b.btn.setVisible(false))

    // Simplified wager selector: left/right arrows
    const wagerLeft = scene.add.text(screenCenterX - 10, 580, '<').setFontSize(40).setOrigin(1, 0)
    wagerLeft.setFontFamily('"Days One"').setColor('rgba(200,200,200,1)')
    strokeText(wagerLeft, 4)
    wagerLeft.setInteractive()

    const wagerRight = scene.add.text(screenCenterX + wagerDisplay.width + 20, 580, '>').setFontSize(40).setOrigin(0, 0)
    wagerRight.setFontFamily('"Days One"').setColor('rgba(200,200,200,1)')
    strokeText(wagerRight, 4)
    wagerRight.setInteractive()

    const updateWagerDisplay = () => {
        const tier = wagerTiers[selectedWager]
        wagerDisplay.setText(tier === 0 ? 'FREE' : `${tier} SOL`)
        wagerDisplay.setColor(tier === 0 ? 'rgba(100,255,100,1)' : 'rgba(255,204,0,1)')
        strokeText(wagerDisplay, 5)
        wagerRight.setX(screenCenterX + wagerDisplay.width + 20)
        updateWalletStatus()
    }

    wagerLeft.on('pointerdown', () => {
        scene.sound.play('click', {volume: 0.3})
        selectedWager = Math.max(0, selectedWager - 1)
        updateWagerDisplay()
    })

    wagerRight.on('pointerdown', () => {
        const wallet = window.solWallet
        const nextIdx = Math.min(wagerTiers.length - 1, selectedWager + 1)
        const nextTier = wagerTiers[nextIdx]
        if (nextTier > 0 && (!wallet || !wallet.connected)) {
            walletStatus.setText('Connect wallet to wager SOL!')
            walletStatus.setColor('rgba(255,80,80,1)')
            return
        }
        if (nextTier > 0 && wallet && wallet.balance < nextTier + 0.01) {
            walletStatus.setText(`Need ${(nextTier + 0.01).toFixed(3)} SOL`)
            walletStatus.setColor('rgba(255,80,80,1)')
            return
        }
        scene.sound.play('click', {volume: 0.3})
        selectedWager = nextIdx
        updateWagerDisplay()
    })

    //
    const g = scene.add.text(screenCenterX, 700, 'CONTINUE').setFontSize(50);
    g.setFontFamily('"Days One"')
    g.setOrigin(0.5)
    g.setColor('rgba(255,255,0,1)')
    strokeText(g, 6)

    g.setInteractive()
    g.on('pointerdown', () => {
        scene.sound.play('click', {volume: 0.3})
        const wallet = window.solWallet
        const wagerAmount = wagerTiers[selectedWager]
        scene.scene.start('scene-4', {
            gameType: 3,
            player1: {
                name: c.text,
                color: colorValues[selectedColor],
                walletAddress: wallet && wallet.connected ? wallet.publicKey : null,
                wager: wagerAmount
            }
        })
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

const isAlphaNumeric = (str) => {
    if (str.length !== 1) return
    var code, i, len;
  
    for (i = 0, len = str.length; i < len; i++) {
      code = str.charCodeAt(i);
      if (!(code > 47 && code < 58) && // numeric (0-9)
          !(code > 64 && code < 91) && // upper alpha (A-Z)
          !(code > 96 && code < 123)) { // lower alpha (a-z)
        return false;
      }
    }
    return true;
};