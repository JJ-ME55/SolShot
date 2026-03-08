import { GameObjects, Physics } from "phaser";
import { Weapon } from "./Weapon";
import Phaser from "phaser";
import { socket } from "../socket";

export class Turret extends GameObjects.Sprite {
    /**
    * @param {Phaser.Scene} scene
    */

    constructor (scene, tank, id) {
        var canvas = document.createElement('canvas');
        canvas.height = 32 // turret height
        canvas.width = 2  // turret width

        if (scene.textures.exists('turret' + id)) scene.textures.remove('turret' + id)
        scene.textures.addCanvas('turret' + id, canvas);
        super(scene, 0, 0, 'turret' + id)
        scene.add.existing(this)

        this.tank = tank
        this.canvas = canvas
        this.scene = scene
        this.setDepth(-3)
        this.rotationDelta = 0.05
        this.relativeRotation = 0
        this.activeWeapon = null
        this.id = id
        this.powerFactor = 8
        this.gameType = this.scene.sceneData.gameType
        this.aimRotation = 0
        this.needEmitAngleChange = false
        this.previousAngleTimer = null

        this.keyQ = this.scene.input.keyboard.addKey('Q');
        this.keyE = this.scene.input.keyboard.addKey('E');

        this.create()
    }



    create = () => {
        var ctx = this.canvas.getContext('2d')
        ctx.fillStyle = 'rgba(200,200,200,1)'

        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height/2)

        // opponentAngleChange listener REMOVED — N-player: opponents' turret rotation
        // is not animated on other clients. Positions sync authoritatively via turnResult.

        this.scene.time.addEvent({delay: 100, callback: this.emitRotation, callbackScope: this, loop: true})

        this.scene.physics.world.on('worldstep', this.weaponUpdate, this)
    }



    weaponUpdate = () => {
        if (this.activeWeapon !== null) {
            this.activeWeapon.update()
        }
    }



    emitRotation = () => {
        if (this.scene.myPlayerIndex < 0) return
        if (this.gameType === 3 && this.tank === this.scene.tanks[this.scene.myPlayerIndex] && this.tank.active) {
            if (this.needEmitAngleChange) {
                window.socket.emit('angleChange', {rotation: this.relativeRotation})
                this.needEmitAngleChange = false
            }
        }
    }



    lerpRelativeRotation = () => {
        var a_rad = this.relativeRotation
        var b_rad = this.aimRotation

        var difference = Phaser.Math.Angle.ShortestBetween(Phaser.Math.RadToDeg(a_rad), Phaser.Math.RadToDeg(b_rad))

        var angle = Phaser.Math.Angle.RotateTo(a_rad, b_rad, 0.05)
        this.relativeRotation = angle

        if (Math.abs(difference) < 1) {
            this.relativeRotation =  this.aimRotation
            this.previousAngleTimer.destroy()
            this.previousAngleTimer = null
        }
    }



    update = () => {
        const crossAirRadius = 80
        var x = this.tank.body.x + (this.tank.height/2) * Math.sin(this.tank.rotation)
        var y = this.tank.body.y - (this.tank.height/2) * Math.cos(this.tank.rotation)
        this.setPosition(x, y)

        if (this.keyQ?.isDown) {
            if (this.tank.active) {
                // Only rotate turret for local player's tank (N-player guard)
                if (this.scene.myPlayerIndex >= 0 && this.tank === this.scene.tanks[this.scene.myPlayerIndex]) {
                    this.relativeRotation -= this.rotationDelta
                    this.setRotation(this.relativeRotation + this.tank.rotation)
                    const alpha = this.rotation
                    if (this.scene.HUD && this.scene.HUD.crossAir) {
                        this.scene.HUD.crossAir.setPosition(this.x + crossAirRadius * Math.sin(alpha), this.y - crossAirRadius * Math.cos(alpha))
                        this.scene.HUD.crossAir.visibleTime = 40
                    }
                } else if (this.gameType !== 3) {
                    this.relativeRotation -= this.rotationDelta
                    this.setRotation(this.relativeRotation + this.tank.rotation)
                    const alpha = this.rotation
                    if (this.scene.HUD && this.scene.HUD.crossAir) {
                        this.scene.HUD.crossAir.setPosition(this.x + crossAirRadius * Math.sin(alpha), this.y - crossAirRadius * Math.cos(alpha))
                        this.scene.HUD.crossAir.visibleTime = 40
                    }
                }
            }
        }
        if (this.keyE?.isDown) {
            if (this.tank.active) {
                // Only rotate turret for local player's tank (N-player guard)
                if (this.scene.myPlayerIndex >= 0 && this.tank === this.scene.tanks[this.scene.myPlayerIndex]) {
                    this.relativeRotation += this.rotationDelta
                    this.setRotation(this.relativeRotation + this.tank.rotation)
                    const alpha = this.rotation
                    if (this.scene.HUD && this.scene.HUD.crossAir) {
                        this.scene.HUD.crossAir.setPosition(this.x + crossAirRadius * Math.sin(alpha), this.y - crossAirRadius * Math.cos(alpha))
                        this.scene.HUD.crossAir.visibleTime = 40
                    }
                } else if (this.gameType !== 3) {
                    this.relativeRotation += this.rotationDelta
                    this.setRotation(this.relativeRotation + this.tank.rotation)
                    const alpha = this.rotation
                    if (this.scene.HUD && this.scene.HUD.crossAir) {
                        this.scene.HUD.crossAir.setPosition(this.x + crossAirRadius * Math.sin(alpha), this.y - crossAirRadius * Math.cos(alpha))
                        this.scene.HUD.crossAir.visibleTime = 40
                    }
                }
            }
        }

        this.setRotation(this.relativeRotation + this.tank.rotation)
    }



    shoot = (selectedWeapon) => {
        this.activeWeapon = new Weapon(this.scene, this.tank, selectedWeapon)
    }


    setRelativeRotation = (r) => {
        this.relativeRotation = r
        this.setRotation(this.relativeRotation + this.tank.rotation)
        this.needEmitAngleChange = true
    }
}
