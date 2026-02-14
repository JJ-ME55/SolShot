import { Textures, Display } from "phaser";
import { ScrollList } from "./ScrollList";
import { socket } from "../socket";
import { createFireButton } from "../graphics/fire-btn";
import { createPowerDisplay } from "../graphics/power-display";
import { createAngleDisplay } from "../graphics/angle-display";
import { createWeaponDisplay } from "../graphics/weapon-display";
import { createMoveDisplay } from "../graphics/move-display";

export class HUD extends Textures.CanvasTexture {

    /**
    * @param {Phaser.Scene} scene 
    */

    constructor (scene) { 
        var width = scene.game.renderer.width
        var height = scene.game.renderer.height
        
        var canvas = document.createElement('canvas');
        canvas.height = height
        canvas.width = width
        if (scene.textures.exists('hud')) scene.textures.remove('hud')
        scene.textures.addCanvas('hud', canvas);
        scene.add.image(width/2, height/2, 'hud').setDepth(4);

        super(scene.textures, 'hud', canvas, canvas.width, canvas.height)

        this.canvas = canvas
        this.scene = scene
        this.width = canvas.width;
        this.height = canvas.height;
        this.fireButton = null
        this.powerDisplayText = null
        this.angleDisplayText = null
        this.crossAir = null
        this.weaponName = null
        this.weaponBox = null
        this.weaponScrollDisplay = null
        this.powerMeter = null
        this.moveDisplayText = null
        this.scoreDisplay1 = null
        this.scoreDisplay2 = null
        this.goldDisplay = null
        this.overlay = null
        this.mouseLocked = false
        
        this.create()
    }



    create = () => {
        var width = this.width
        var height = this.height
    
        var ctx = this.canvas.getContext('2d')

        //ctx.fillStyle = 'rgba(40,40,40,1)'
        ctx.fillStyle = 'rgba(0,0,0,1)'
    
        ctx.moveTo(0, height)
        ctx.lineTo(0, height * 2/3)
        ctx.lineTo(width, height * 2/3)
        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fill()

        createFireButton(this)
        createPowerDisplay(this)
        createWeaponDisplay(this)
        createMoveDisplay(this)
        createAngleDisplay(this)
        this.createOverlay()

        var name1 = this.scene.add.text(0, 0, this.scene.tank1.name).setFontSize(30).setFontFamily('"Days One"')
        this.scoreDisplay1 = this.scene.add.text(0, 35, this.scene.tank1.score)
        var name2 = this.scene.add.text(this.width, 0, this.scene.tank2.name).setFontSize(30).setFontFamily('"Days One"').setOrigin(1, 0)
        this.scoreDisplay2 = this.scene.add.text(this.width, 35, this.scene.tank2.score)
        this.scoreDisplay1.setOrigin(0, 0).setFontSize(30).setFontFamily('"Days One"')
        this.scoreDisplay2.setOrigin(1, 0).setFontSize(30).setFontFamily('"Days One"')

        name1.setColor(this.scene.tank1.color)
        name2.setColor(this.scene.tank2.color)
        this.scoreDisplay1.setColor('rgba(240,240,240,1)')
        this.scoreDisplay2.setColor('rgba(240,240,240,1)')

        strokeText(name1, 4)
        strokeText(name2, 4)
        strokeText(this.scoreDisplay1, 4)
        strokeText(this.scoreDisplay2, 4)

        // Gold display (centered, below title area)
        const goldAmount = this.scene.sceneData?.player1?.gold || 0
        this.goldDisplay = this.scene.add.text(this.width / 2, 10, `Gold: ${goldAmount}`)
        this.goldDisplay.setOrigin(0.5, 0).setFontSize(22).setFontFamily('"Days One"')
        this.goldDisplay.setColor('rgba(255,204,0,1)')
        strokeText(this.goldDisplay, 3)

        this.update()

        // this.scene.input.mouse.onMouseDown = () => {
        //     if (this.scene.input.mouse.locked && this.weaponScrollList.visible === true) {
        //         this.weaponScrollList.incY(this.scene.input.mousePointer.movementY/10)
        //     }
        // }
    }



    createOverlay = () => {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d')
        canvas.height = this.height * 1/3
        canvas.width = this.width

        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    
        if (this.scene.textures.exists('hud-overlay')) this.scene.textures.remove('hud-overlay')
        this.scene.textures.addCanvas('hud-overlay', canvas);
        
        this.overlay = this.scene.add.image(this.width/2, this.height * 5/6, 'hud-overlay')
        this.overlay.setDepth(100)
        this.overlay.visible = false
        this.overlay.setInteractive()
    }

    
    reset = () => {
        if (this.scene.activeTank === 1) {
            this.powerDisplayText.setText(this.scene.tank1.power)
            this.weaponName.setText(this.scene.tank1.weapons[this.scene.tank1.selectedWeapon]?.name)
            this.weaponScrollDisplay.reset(this.scene.tank1)
            this.weaponScrollDisplay.setActive(this.scene.tank1.selectedWeapon)
        }
        else if (this.scene.activeTank === 2) {
            this.powerDisplayText.setText(this.scene.tank2.power)
            this.weaponName.setText(this.scene.tank2.weapons[this.scene.tank2.selectedWeapon]?.name)
            this.weaponScrollDisplay.reset(this.scene.tank2)
            this.weaponScrollDisplay.setActive(this.scene.tank2.selectedWeapon)
        }
    }



    disable = () => {
        this.overlay.visible = true
    }



    enable = () => {
        this.overlay.visible = false
    }


    updateGold = (amount) => {
        if (this.goldDisplay) {
            this.goldDisplay.setText(`Gold: ${amount}`)
        }
    }

    refresh = () => {
        var angle = 0
        if (this.scene.activeTank === 1) {
            angle = (180 - this.scene.tank1.turret.angle) - 90
            if (angle < 0) angle += 360
            this.powerDisplayText.setText(this.scene.tank1.power)
            this.angleDisplayText.setText(Math.ceil(angle) + String.fromCharCode(176))
            this.moveDisplayText.setText(this.scene.tank1.movesRemaining)
        }
        else if (this.scene.activeTank === 2) {
            angle = (180 - this.scene.tank2.turret.angle) - 90
            if (angle < 0) angle += 360
            this.powerDisplayText.setText(this.scene.tank2.power)
            this.angleDisplayText.setText(Math.ceil(angle) + String.fromCharCode(176))
            this.moveDisplayText.setText(this.scene.tank2.movesRemaining)
        }

    
        if ((this.scene.tank1.turret.activeWeapon !== null) || (this.scene.tank2.turret.activeWeapon !== null)) {
            this.disable()
        }
        else {
            if (this.scene.tank1.active === true) {
                this.enable()
            }
            else {
                if (this.scene.sceneData.gameType === 1 || this.scene.sceneData.gameType === 3) {
                    this.disable()
                }
                if (this.scene.sceneData.gameType === 2 || this.scene.sceneData.gameType === 4) {
                    this.enable()
                }
            }
        }

        if ((this.scene.tank1.settled !== true) || (this.scene.tank2.settled !== true)) {
            this.disable()
        }

        if (this.scene.gameOver == true) {
            this.disable()
        }

        if ((this.scene.tank1.moving) || (this.scene.tank2.moving)) {
            this.disable()
        }

        if (this.scene.terrain.blastArray.length !== 0 || this.scene.terrain.animate === true) {
            this.disable()
        }

        this.scoreDisplay1.setText(this.scene.tank1.score)
        this.scoreDisplay2.setText(this.scene.tank2.score)

        this.weaponScrollDisplay.update()
        this.powerMeter.refresh()
        this.crossAir.refresh()
    }
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

const int2rgba = (colorInt) => {
    var rgba = new Display.Color.IntegerToRGB(colorInt)
    var rgbaString = 'rgba(' + rgba.r + ',' + rgba.g + ',' + rgba.b + ',' + rgba.a + ')'
    return rgbaString
}