import Phaser, { Physics, Scene } from "phaser"
import { Weapon } from "../../../classes/Weapon"
import * as Logos from "./logos"
import { Tween } from "../../../classes/Tween"
import { Collider } from "../../../classes/Collider"


export class singleshot {
    constructor() {
        this.id = 0
        this.type = 0
        this.name = 'Single Shot'
        this.projectile = null
        this.logoCanvas = Logos.singleshot
    }

    reset = () => {
        this.projectile = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 40
        canvas.width = 80

        // Bright cyan sphere — 3px radius, glowing
        ctx.fillStyle = 'rgba(0,220,255,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        weapon.updateTail(this.projectile, 15, 5, 5, {r: 0, g: 220, b: 255})
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.setPosition(x, y)
            obj.body.updateFromGameObject()
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }
 
    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true, tank)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(255,51,153,0)'}, {relativePosition: 1, color: 'rgba(230,0,115,1)'}]
        var data = {thickness: 15, gradient: grd, blowPower: 200, soundEffect: 'expmedium2', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 46 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 46, 60/46)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}












export class bigshot {
    constructor() {
        this.id = 1
        this.type = 0
        this.name = 'Big Shot'
        this.projectile = null
        this.logoCanvas = Logos.bigshot
    }

    reset = () => {
        this.projectile = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 40

        ctx.fillStyle = 'rgba(180,0,150,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        weapon.updateTail(this.projectile, 10, 8, 8, {r: 180, g: 0, b: 150}, true)
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon) => {
        var grd = [{relativePosition: 0, color: 'rgba(255,0,0,0)'}, {relativePosition: 1, color: 'rgba(255,0,0,1)'}]
        var data = {thickness: 16, gradient: grd, blowPower: 200, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 90 - weapon.scene.tank1.hitRadius, data, true, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 90, 30/90)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}











export class threeshot {
    constructor() {
        this.id = 2
        this.type = 0
        this.name = '3 Shot'
        this.projectile1 = null
        this.projectile2 = null
        this.projectile3 = null
        this.projectiles = []
        this.logoCanvas = Logos.threeshot
    }

    reset = () => {
        this.projectile1 = null
        this.projectile2 = null
        this.projectile3 = null
        this.projectiles = []
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        const makeProjectile = (index) => {
            var canvas = document.createElement('canvas')
            var ctx = canvas.getContext('2d')

            canvas.height = 20
            canvas.width = 60

            // Each projectile gets a slightly different color — trident spread visual identity
            var color = index === 2 ? 'rgba(150,220,255,1)' : 'rgba(100,200,255,1)'
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()

            if (weapon.scene.textures.exists('projectile-' + index)) weapon.scene.textures.remove('projectile-' + index)
            weapon.scene.textures.addCanvas('projectile-' + index, canvas);

            var projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile-' + index)
            projectile.setDepth(3)
            projectile.bounceCount = 3
            projectile.canvas = canvas
            projectile.index = index
            return projectile
        }

        this.projectile1 = makeProjectile(1)
        this.projectile2 = makeProjectile(2)
        this.projectile3 = makeProjectile(3)
        this.projectiles.push(this.projectile1, this.projectile2, this.projectile3)

    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile1, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 + Math.PI/36)
        weapon.defaultShoot(this.projectile2)
        weapon.defaultShoot(this.projectile3, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 - Math.PI/36)
        weapon.scene.sound.play('launch', {volume: 0.5})
        // Split flash at turret muzzle — bright cyan-white burst telegraphing the trident separation
        weapon.spawnBurstEffect(
            weapon.turret.x + (weapon.turret.height/2) * Math.sin(weapon.turret.rotation),
            weapon.turret.y - (weapon.turret.height/2) * Math.cos(weapon.turret.rotation),
            10, 0xAADDFF, 15, 1, 200
        )
    }

    update = (weapon) => {
        this.projectiles.forEach(obj => {
            // Center projectile gets brighter trail, outer two get cooler blue
            var c = obj.index === 2 ? {r: 150, g: 220, b: 255} : {r: 100, g: 200, b: 255}
            weapon.updateTail(obj, 15, 5, 4, c)
        })
        this.projectiles.forEach(obj => {
            weapon.defaultUpdate(obj)
        })
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, obj)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.projectiles = this.projectiles.filter((ele) => { return ele.index !== obj.index })
        if (this.projectiles.length === 0) {
            weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.5, color: 'rgba(100,100,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}]
        var data = {thickness: 16, gradient: grd, blowPower: 200, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 46 - weapon.tank.hitRadius, data, true, this.id.toString())
        weapon.defaultUpdateScore(obj.body.x, obj.body.y, 46, 20/46)
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.projectiles = this.projectiles.filter((ele) => { return ele.index !== obj.index })
        if (this.projectiles.length === 0) {
            weapon.turret.activeWeapon = null
        }
    }
}










export class fiveshot {
    constructor() {
        this.id = 3
        this.type = 0
        this.name = '5 Shot'
        this.projectile1 = null
        this.projectile2 = null
        this.projectile3 = null
        this.projectile4 = null
        this.projectile5 = null
        this.projectiles = []
        this.logoCanvas = Logos.fiveshot
    }

    reset = () => {
        this.projectile1 = null
        this.projectile2 = null
        this.projectile3 = null
        this.projectile4 = null
        this.projectile5 = null
        this.projectiles = []
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        const makeProjectile = (index) => {
            var canvas = document.createElement('canvas')
            var ctx = canvas.getContext('2d')
            
            canvas.height = 20
            canvas.width = 60
    
            ctx.fillStyle = 'rgba(150,220,255,1)'
            ctx.beginPath()
            ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
    
            if (weapon.scene.textures.exists('projectile-' + index)) weapon.scene.textures.remove('projectile-' + index)
            weapon.scene.textures.addCanvas('projectile-' + index, canvas);
    
            var projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile-' + index)
            projectile.setDepth(3)
            projectile.bounceCount = 3
            projectile.canvas = canvas
            projectile.index = index
            return projectile
        }
        
        this.projectile1 = makeProjectile(1)
        this.projectile2 = makeProjectile(2)
        this.projectile3 = makeProjectile(3)
        this.projectile4 = makeProjectile(4)
        this.projectile5 = makeProjectile(5)
        this.projectiles.push(this.projectile1, this.projectile2, this.projectile3, this.projectile4, this.projectile5)

    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile1, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 + 2 * Math.PI/36)
        weapon.defaultShoot(this.projectile2, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 + Math.PI/36)
        weapon.defaultShoot(this.projectile3)
        weapon.defaultShoot(this.projectile4, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 - Math.PI/36)
        weapon.defaultShoot(this.projectile5, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 - 2 * Math.PI/36)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        this.projectiles.forEach(obj => {
            weapon.updateTail(obj, 15, 5, 4, {r: 100, g: 200, b: 250})
        })
        this.projectiles.forEach(obj => {
            weapon.defaultUpdate(obj)
        })
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, obj)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.projectiles = this.projectiles.filter((ele) => { return ele.index !== obj.index })
        if (this.projectiles.length === 0) {
            weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.5, color: 'rgba(100,30,0,1)'}, {relativePosition: 1, color: 'rgba(255,100,20,1)'}]
        var data = {thickness: 16, gradient: grd, blowPower: 200, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 46 - weapon.tank.hitRadius, data, true, this.id.toString())
        weapon.defaultUpdateScore(obj.body.x, obj.body.y, 46, 20/46)
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.projectiles = this.projectiles.filter((ele) => { return ele.index !== obj.index })
        if (this.projectiles.length === 0) {
            weapon.turret.activeWeapon = null
        }
    }
}










export class jackhammer {
    constructor() {
        this.id = 4
        this.type = 0
        this.name = 'Jackhammer'
        this.projectile = null
        this.logoCanvas = Logos.jackhammer
        this.jumpCount = 4
        this.projectileDiameter = 7
        this.frameCount = 0
        this.canvas = null
    }

    reset = () => {
        this.projectile = null
        this.jumpCount = 4
        this.frameCount = 0
        this.projectileDiameter = 7
        this.canvas = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        
        canvas.height = 20
        canvas.width = 80

        this.canvas = canvas
        this.drawProjectile(this.projectileDiameter)

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    drawProjectile = (diameter) => {
        var canvas = this.canvas
        var ctx = this.canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = 'rgba(150,220,255,1)'
        ctx.beginPath()
        ctx.fillRect(canvas.width/2, canvas.height/2 - diameter/2, diameter, diameter)
        ctx.closePath()
        ctx.fill()
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        this.frameCount--
        weapon.updateTail(this.projectile, 24, 6, this.projectileDiameter, {r: 100, g: 200, b: 250}, false)
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {

    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        if (this.frameCount <= 0) {
            this.frameCount = 10
            var grd = [{relativePosition: 0, color: 'rgba(255,51,153,0)'}, {relativePosition: 1, color: 'rgba(230,0,115,1)'}]
            var data = {thickness: 15, gradient: grd, soundEffect: 'expshort', soundConfig: {}}
            weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 36 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
            weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 36, 10/36)
            if (this.jumpCount <= 0) {
                this.projectile.destroy(true)
                weapon.scene.textures.remove('projectile')
                weapon.turret.activeWeapon = null
            }
            else {
                this.jumpCount--
                this.projectileDiameter--
                // Cyan spark/dust puff on each bounce contact
                weapon.spawnBurstEffect(this.projectile.body.x, this.projectile.body.y, 5, 0xAADDFF, 10, 0.7, 250)
                this.projectile.setVelocity(0, -200)
                this.drawProjectile(this.projectileDiameter)
            }
        }
    }
}








export class heatseeker {
    constructor() {
        this.id = 5
        this.type = 0
        this.name = 'Heatseeker'
        this.projectile = null
        this.logoCanvas = Logos.heatseeker
        this.particles = []
    }

    reset = () => {
        this.projectile = null
        this.particles = []
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 30
        canvas.width = 30

        ctx.fillStyle = 'rgba(240,240,240,1)'
        ctx.beginPath()
        ctx.moveTo(5, 14)
        ctx.lineTo(15, 13)
        ctx.arc(canvas.width/2, canvas.height/2, 2, -Math.PI/2, Math.PI/2)
        ctx.lineTo(5, 16)
        ctx.closePath()
        ctx.fill()

        ctx.beginPath()
        ctx.fillStyle = 'rgba(220,0,0,1)'
        ctx.moveTo(5, 14)
        ctx.lineTo(12, 14)
        ctx.lineTo(5, 9)
        ctx.closePath()
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(5, 16)
        ctx.lineTo(12, 16)
        ctx.lineTo(5, 21)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        this.checkCloseToTank(weapon)
        weapon.defaultUpdate(this.projectile)
    }

    checkCloseToTank = (weapon) => {
        var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
        if (Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) < 250) {
            if (!this._homing) {
                this._homing = true
                weapon.fixCloseToTank(this.projectile, {oppTankDist: 250})
            }
            // Angle from projectile toward opponent tank
            var targetAngle = Phaser.Math.Angle.Between(
                this.projectile.body.x, this.projectile.body.y,
                oppTank.centre.x, oppTank.centre.y
            );
            var currentAngle = this.projectile.body.velocity.angle()
            var diff = Phaser.Math.Angle.Wrap(targetAngle - currentAngle)
            // Stronger turn rate for snappier homing visual
            this.projectile.body.velocity.rotate(diff * 0.15)
            // Rotate sprite to match velocity direction
            this.projectile.setRotation(this.projectile.body.velocity.angle())
            this.releaseParticles(weapon)
        }
    }

    releaseParticles = (weapon) => {
        const spread = 10
        var particle, theta;

        for (let i = 0; i < this.projectile.body.speed/100; i++) {
            particle = weapon.scene.add.circle(this.projectile.body.x + spread * (Math.random() - 0.5), this.projectile.body.y + spread * (Math.random() - 0.5), 0.6, 0xeeeeee)
            theta = this.projectile.angle + (Math.random() > 0.5 ? 90 : -90)
            weapon.scene.tweens.add({
                targets: particle,
                x: particle.x + 20 * Math.cos(theta),
                y: particle.y + 20 * Math.sin(theta),
                alpha: 0.0,
                t: 1,
                ease: 'Linear',
                onComplete: () => {particle.destroy(true)}
            });
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.4, color: 'rgba(120,0,0,1)'}, {relativePosition: 1, color: 'rgba(230,0,0,1)'}]
        var data = {thickness: 15, gradient: grd, blowPower: 200, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 80 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 80, 40/80)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}









export class tracer {
    constructor() {
        this.id = 6
        this.type = 0
        this.name = 'Tracer'
        this.projectile1 = null
        this.projectile2 = null
        this.projectile3 = null
        this.projectile4 = null
        this.projectile5 = null
        this.projectiles = []
        this.logoCanvas = Logos.tracer
    }

    reset = () => {
        this.projectile1 = null
        this.projectile2 = null
        this.projectile3 = null
        this.projectile4 = null
        this.projectile5 = null
        this.projectiles = []
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        const makeProjectile = (index) => {
            var canvas = document.createElement('canvas')
            var ctx = canvas.getContext('2d')
            
            canvas.height = 100
            canvas.width = 100
    
            ctx.fillStyle = 'rgba(180,180,180,1)'
            ctx.beginPath()
            ctx.arc(canvas.width/2, canvas.height/2, 1, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
    
            if (weapon.scene.textures.exists('projectile-' + index)) weapon.scene.textures.remove('projectile-' + index)
            weapon.scene.textures.addCanvas('projectile-' + index, canvas);
    
            var projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile-' + index)
            projectile.setDepth(3)
            projectile.bounceCount = 3
            projectile.canvas = canvas
            projectile.index = index
            projectile.settled = false
            projectile.relativeAngle = -10 + (index - 1) * 5
            return projectile
        }
        
        this.projectile1 = makeProjectile(1)
        this.projectile2 = makeProjectile(2)
        this.projectile3 = makeProjectile(3)
        this.projectile4 = makeProjectile(4)
        this.projectile5 = makeProjectile(5)
        this.projectiles.push(this.projectile1, this.projectile2, this.projectile3, this.projectile4, this.projectile5)

    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile1, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 - 2 * Phaser.Math.DegToRad(5))
        weapon.defaultShoot(this.projectile2, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2  - Phaser.Math.DegToRad(5))
        weapon.defaultShoot(this.projectile3)
        weapon.defaultShoot(this.projectile4, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 + Phaser.Math.DegToRad(5))
        weapon.defaultShoot(this.projectile5, undefined, undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 + 2 * Phaser.Math.DegToRad(5))
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        this.projectiles.forEach(obj => {
            weapon.updateTail(obj, 40, 1, 1, {r: 180, g: 180, b: 180})
        })
        this.projectiles.forEach(obj => {
            weapon.defaultUpdate(obj)
        })
    }

    onTerrainHit = (weapon, obj) => {
        if (obj.settled) return
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
   
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.projectiles = this.projectiles.filter((ele) => { return ele.index !== obj.index })
        if (this.projectiles.length === 0) {
            weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj) => {
        if (obj.settled) return
        obj.settled = true
        obj.body.stop()
        obj.setGravity(0)
        
        weapon.scene.sound.play('tracer')
    
        var sign = obj.relativeAngle > 0 ? '+' : ''
        var angleText = weapon.scene.add.text(obj.body.x, obj.body.y + 10, sign + obj.relativeAngle + String.fromCharCode(176))
        angleText.setOrigin(0.5, 0.5).setFont('14px Geneva')
        if (!weapon.scene.game.device.os.desktop) {
            angleText.setFont('20px Geneva')
        }

        setTimeout(() => {
            angleText.destroy(true)
            obj.destroy(true)
            weapon.scene.textures.remove(obj.texture.key)
            this.projectiles = this.projectiles.filter((ele) => { return ele.index !== obj.index })
            if (this.projectiles.length === 0) {
                weapon.turret.activeWeapon = null
            }
        }, 4000);
    }
}









export class piledriver {
    constructor() {
        this.id = 7
        this.type = 0
        this.name = 'Pile Driver'
        this.projectile = null
        this.logoCanvas = Logos.piledriver
        this.blastCount = 0
        this.maxBlastCount = 6
        this.blastRadius = [46, 38, 30, 22, 14, 6]
        this.blastDepth = [-14, 10, 30, 46, 58, 66]
        this.frameCount = 0
        this.impactX = 0
        this.impactY = 0
    }

    reset = () => {
        this.blastCount = 0
        this.projectile = null
        this.frameCount = 0
        this.impactX = 0
        this.impactY = 0
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        // Deeper magenta, heavier 3.5px radius projectile for Pile Driver identity
        ctx.fillStyle = 'rgba(200,0,180,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.projectile.body === undefined) {
            // Drilling phase — sequential shockwave rings descending with each blast
            if (this.blastCount < this.maxBlastCount) {
                this.frameCount++
                if (this.frameCount % 5 === 0) {
                    this.blastCount++
                    this.blast(weapon, true)
                    // Growing magenta burst ring — expands with each deeper blast
                    weapon.spawnBurstEffect(this.impactX, this.impactY + this.blastDepth[this.blastCount - 1], 10, 0xFA00FA, 20 + this.blastCount * 5, 1.2, 350)
                }
            }
            else {
                weapon.turret.activeWeapon = null
            }
        }
        else {
            // Flight phase — thick blunt magenta trail
            weapon.updateTail(this.projectile, 15, 12, 6, {r: 200, g: 0, b: 180})
            weapon.defaultUpdate(this.projectile)
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'},
                    {relativePosition: 0.01, color: 'rgba(0,0,0,1)'},
                    {relativePosition: 0.7, color: 'rgba(250,0,250,1)'},
                    {relativePosition: 0.8, color: 'rgba(250,200,250,1)'},
                    {relativePosition: 1, color: 'rgba(250,200,250,1)'}]
        
        var blastRadius, x, y;
        blastRadius = this.blastRadius[this.blastCount]
        var data = {thickness: 20, gradient: grd, blowPower: 30}

        if (this.blastCount === 0) {
            x = this.impactX = this.projectile.body.x
            y = this.impactY = this.projectile.body.y
            y = y + this.blastDepth[this.blastCount]

            data.soundEffect = 'expshort'
            data.soundConfig = {}

            this.projectile.destroy(true)
            weapon.scene.textures.remove('projectile')
        }
        else {
            x = this.impactX
            y = this.impactY + this.blastDepth[this.blastCount]
        }

        if (y <= weapon.terrain.height - 1) {
            weapon.terrain.blast(1, Math.floor(x), Math.floor(y), blastRadius - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString() + '.' + this.blastCount.toString())
            weapon.defaultUpdateScore(x, y, blastRadius, 20/blastRadius)

        }
    }
}










export class dirtmover {
    constructor() {
        this.id = 8
        this.type = 2
        this.name = 'Dirt Mover'
        this.projectile = null
        this.logoCanvas = Logos.dirtmover
        this.endPoints = []
        this.ix = 0
        this.iy = 0
    }

    reset = () => {
        this.projectile = null
        this.endPoints = []
        this.ix = 0
        this.iy = 0
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 26
        canvas.width = 200

        var grd = ctx.createLinearGradient(0, 0, 0, canvas.height)
        grd.addColorStop(0, 'rgba(240,240,240,1)')
        grd.addColorStop(1, 'rgba(80,80,255,1)')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
        this.projectile.setRotation(weapon.turret.rotation)
        const pw = this.projectile.canvas.height/2
        var angle = Phaser.Math.Angle.Wrap(Phaser.Math.DegToRad(this.projectile.angle - 90))
        this.projectile.setPosition(weapon.tank.x - pw * Math.cos(angle), weapon.tank.y - pw * Math.sin(angle))

        const shape = weapon.scene.add.graphics();
        const smallW = 40;
        const bigW = 80;
        const h = 120
        shape.fillStyle(0xffffff, 0);
    
        shape.beginPath();
        shape.moveTo(-smallW/2, 0)
        shape.lineTo(-bigW/2, -h)
        shape.lineTo(bigW/2, -h)
        shape.lineTo(smallW/2, 0)
        shape.closePath()
        shape.fill()
        shape.setRotation(weapon.turret.rotation)
        
        shape.setPosition(weapon.tank.x - pw * Math.cos(angle), weapon.tank.y - pw * Math.sin(angle))
    
        const mask = shape.createGeometryMask();
        this.projectile.setMask(mask);
        this.projectile.setVisible(false)
    }
    
    shoot = (weapon) => {
        this.projectile.setVisible(true)
        const h = 120
        const smallW = 40;
        const bigW = 80;
        const pw = this.projectile.canvas.height/2
        var p1, p2, p3, p4;
        var angle = Phaser.Math.Angle.Wrap(Phaser.Math.DegToRad(this.projectile.angle))
        weapon.scene.sound.play('expshort')
        
        p1 = {x: weapon.tank.x - pw * Math.cos(angle - Math.PI/2) + (smallW/2) * Math.cos(angle), y: weapon.tank.y - pw * Math.sin(angle - Math.PI/2) + (smallW/2) * Math.sin(angle)}
        p2 = {x: weapon.tank.x - pw * Math.cos(angle - Math.PI/2) - (smallW/2) * Math.cos(angle), y: weapon.tank.y - pw * Math.sin(angle - Math.PI/2) - (smallW/2) * Math.sin(angle)}
        p3 = {x: weapon.tank.x + (h - pw) * Math.cos(angle - Math.PI/2) - (bigW/2) * Math.cos(angle), y: weapon.tank.y + (h - pw) * Math.sin(angle - Math.PI/2) - (bigW/2) * Math.sin(angle)}
        p4 = {x: weapon.tank.x + (h - pw) * Math.cos(angle - Math.PI/2) + (bigW/2) * Math.cos(angle), y: weapon.tank.y + (h - pw) * Math.sin(angle - Math.PI/2) + (bigW/2) * Math.sin(angle)}
        
        this.endPoints.push(p1, p2, p3, p4)
        this.ix = weapon.tank.x - pw * Math.cos(angle - Math.PI/2)
        this.iy = weapon.tank.y - pw * Math.sin(angle - Math.PI/2)
        
        var theta = Phaser.Math.DegToRad(weapon.turret.angle - 90)
        weapon.scene.tweens.add({
            targets: this.projectile,
            x: this.projectile.x + h * Math.cos(theta),
            y: this.projectile.y + h * Math.sin(theta),
            duration: 800,
            ease: 'Linear',
        });
        
        setTimeout(() => {
            this.projectile.destroy(true);
            weapon.scene.textures.remove('projectile')
            weapon.turret.activeWeapon = null;
            weapon.terrain.allowSave = true
            weapon.terrain.fixTerrainShape(this.endPoints)
        }, 800);
    }

    update = (weapon) => {
        const smallW = 40;
        const bigW = 80;
        const h = 120;
        const pw = this.projectile.canvas.height
        var angle = Phaser.Math.Angle.Wrap(Phaser.Math.DegToRad(this.projectile.angle))
        
        var p1 = {x: this.projectile.x, y: this.projectile.y}
        var p2 = {x: this.projectile.x + pw/2 * Math.cos(angle - Math.PI/2), y: this.projectile.y + pw/2 * Math.sin(angle - Math.PI/2)}

        if (Phaser.Math.Distance.Between(this.ix, this.iy, p2.x, p2.y) > h) return
        //weapon.terrain.setPixel(p1.x - pw/2 * Math.cos(angle + Math.PI/2), p1.y - pw/2 * Math.sin(angle + Math.PI/2), 255,0,0,255)
        var k1 = Math.min(Phaser.Math.Distance.Between(this.ix, this.iy, p1.x, p1.y) / h, 1)
        var k2 = Math.min(Phaser.Math.Distance.Between(this.ix, this.iy, p2.x, p2.y) / h, 1)

        var w1 = smallW * (1 - k1) + bigW * k1
        var w2 = smallW * (1 - k2) + bigW * k2

        var ctx = weapon.terrain.canvas.getContext('2d')
        ctx.globalCompositeOperation = 'destination-out'
    
        ctx.fillStyle = 'rgba(0,0,0,1)'
        
        ctx.beginPath();
        ctx.moveTo(p1.x + (w1/2) * Math.cos(angle), p1.y + (w1/2) * Math.sin(angle))
        ctx.lineTo(p2.x + (w2/2) * Math.cos(angle), p2.y + (w2/2) * Math.sin(angle))
        ctx.lineTo(p2.x - (w2/2) * Math.cos(angle), p2.y - (w2/2) * Math.sin(angle))
        ctx.lineTo(p1.x - (w1/2) * Math.cos(angle), p1.y - (w1/2) * Math.sin(angle))

        ctx.closePath()
        ctx.fill()

        weapon.terrain.update()
    }
}








export class crazyivan {
    constructor() {
        this.id = 9
        this.type = 0
        this.name = 'Crazy Ivan'
        this.projectile = null
        this.logoCanvas = Logos.crazyivan
        this.particles = []
        this.dissipated = false
        this.frameCount = 0
        this._colorFrame = 0
    }

    reset = () => {
        this.projectile = null
        this.particles = []
        this.dissipated = false
        this.frameCount = 0
        this._colorFrame = 0
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 40

        ctx.fillStyle = 'rgba(180,50,200,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        this.frameCount++
        if (this.dissipated === false) {
            this._colorFrame++
            this.projectile.body.x += (Math.random() - 0.5) * 2
            this.projectile.body.y += (Math.random() - 0.5) * 2
            var r = 180 + Math.sin(this._colorFrame * 0.15) * 60
            var b = 200 - Math.sin(this._colorFrame * 0.15) * 80
            weapon.updateTail(this.projectile, 18, 4, 4, {r: Math.floor(r), g: 50, b: Math.floor(b)}, false)
            //if (this.dissipated === false)
            weapon.defaultUpdate(this.projectile)
            this.checkCloseToTank(weapon)
        }
        if (this.dissipated === true) {
            //console.log(this.particles.length)
            for (let i = 0; i < this.particles.length; i++) {
                const e = this.particles[i];
                weapon.updateTail(e, 14, 4, 2, {r: 220, g: 200, b: 255}, true)
                this.updateParticleMotion(weapon, e, e.movement, e.index)
                //console.log(e.body.x, e.body.y)
                weapon.defaultUpdate(e)
            }
        }
    }

    checkCloseToTank = (weapon) => {
        if (this.projectile.body === undefined) return
        var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
        if (Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) < 160) {
            weapon.fixCloseToTank(this.projectile, {oppTankDist: 160})
            weapon.scene.sound.play('split', {volume: 0.3})

            var targetAngle = Phaser.Math.Angle.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) + Math.PI;
            var diff = Phaser.Math.Angle.Wrap(targetAngle - this.projectile.body.velocity.angle())
            var theta = this.projectile.body.velocity.angle()
            var i = 0;

            for (let delta = theta - Math.PI/2; delta <= theta + Math.PI/2; delta += Math.PI/12) {
                this.createParticle(weapon, delta, i)
                i++
            }

            this.projectile.destroy(true)
            weapon.scene.textures.remove(this.projectile.texture.key)
            this.dissipated = true
        }
    }

    createParticle = (weapon, delta, index) => {
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        //console.log(index)
        
        canvas.height = 20
        canvas.width = 60

        ctx.fillStyle = 'rgba(220,200,255,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 1, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
    
        if (weapon.scene.textures.exists('projectile-' + this.particles.length)) weapon.scene.textures.remove('projectile-' + this.particles.length)
        weapon.scene.textures.addCanvas('projectile-' + this.particles.length, canvas);

        var particle = weapon.scene.physics.add.sprite(0, 0, 'projectile-' + this.particles.length)
        particle.bounceCount = 3
        particle.canvas = canvas

        weapon.defaultShoot(particle, 200, 300, {x: this.projectile.body.x, y: this.projectile.body.y}, delta)
        //particle.body.preUpdate(true, 0)
        //console.log(particle.body.x, particle.body.y)

        particle.index = index
        particle.movement = index

        this.particles.push(particle)
        //console.log(particle.body.x, particle.body.y)
    }
    
    updateParticleMotion = (weapon, particle, move, index) => {
        particle.movement = (2 * particle.movement + 4) % 50
        if (this.frameCount % (3 * move + 2 * index) !== 0) return
        var x = move * Math.PI/(index + 3) + index * Math.PI / 3
        particle.body.velocity.setAngle(Math.abs(Phaser.Math.Angle.Wrap(8 * x)))
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, obj, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        if (this.dissipated === false) {
            weapon.turret.activeWeapon = null
        }
        else {
            this.particles = this.particles.filter(ele => { return ele !== obj })

            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(120,120,0,1)'}, {relativePosition: 1, color: 'rgba(255,255,0,1)'}]
        var data = {thickness: 18, gradient: grd, blowPower: 50, optimize: true, soundEffect: 'expshort', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 36 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(obj.body.x, obj.body.y, 36, 20/36)
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)

        if (this.dissipated === false) {
            weapon.turret.activeWeapon = null
        }
        else {
            this.particles = this.particles.filter(ele => {
                return ele !== obj
            })

            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }
}











export class spider {
    constructor() {
        this.id = 10
        this.type = 0
        this.name = 'Spider'
        this.projectile = null
        this.logoCanvas = Logos.spider
        this.particles = []
        this.dissipated = false
        this.particleCount = 0
        this.frameCount = 0
        this.minAngle = 0
        this.maxAngle = 0
        this.initX = 0
        this.initY = 0
        this._pulseFrame = 0
    }

    reset = () => {
        this.projectile = null
        this.particles = []
        this.dissipated = false
        this.particleCount = 0
        this.frameCount = 0
        this.minAngle = 0
        this.maxAngle = 0
        this.initX = 0
        this.initY = 0
        this._pulseFrame = 0
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 20
        canvas.width = 40

        // Outer glow ring — semi-transparent halo
        ctx.fillStyle = 'rgba(200,200,200,0.3)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 5, 0, Math.PI * 2)
        ctx.fill()
        // Core orb — larger solid center for Spider (4px radius)
        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3, 0, Math.PI * 2)
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.dissipated === false) {
            // Pulsing throb — scale oscillates via sine wave for visible throbbing effect
            this._pulseFrame++
            var s = 1 + Math.sin(this._pulseFrame * 0.2) * 0.15
            this.projectile.setScale(s)
            weapon.updateTail(this.projectile, 18, 4, 6, {r: 200, g: 200, b: 200}, false)
            weapon.defaultUpdate(this.projectile)
            this.checkCloseToTank(weapon)
        }
        if (this.dissipated === true) {
            var step = Math.PI/40
            var delta1 = this.minAngle
            var delta2 = this.minAngle + step
            var delta3 = this.minAngle + 2 * step

            if (this.frameCount === 5) {
                while (delta1 <= this.maxAngle) {
                    this.createParticle(weapon, delta1, this.initX, this.initY)
                    delta1 = delta1 + 3 * step
                }
            }
            else if (this.frameCount === 15) {
                while (delta2 <= this.maxAngle) {
                    this.createParticle(weapon, delta2, this.initX, this.initY)
                    delta2 = delta2 + 3 * step
                }
            }
            else if (this.frameCount === 25) {
                while (delta3 <= this.maxAngle) {
                    this.createParticle(weapon, delta3, this.initX, this.initY)
                    delta3 = delta3 + 3 * step
                }
            }
            this.frameCount++

            this.particles.forEach(e => {
                e.tween1.update()
                e.tween2.update()
                weapon.defaultUpdate(e)
            })
        }
    }

    checkCloseToTank = (weapon) => {
        if (this.projectile.body === undefined) return
        var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1

        if (Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) < 160) {
            var vx = this.projectile.body.velocity.x
            var angle = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) + Math.PI);

            if ((vx > 0 && angle <= Math.PI/2 && angle >= 0) || (vx <= 0 && angle >= Math.PI/2 && angle <= Math.PI)) {
                weapon.scene.sound.play('split', {volume: 0.3})
                // Burst ring flash — bright white ring flash on proximity trigger before legs scatter
                weapon.spawnBurstEffect(this.projectile.body.x, this.projectile.body.y, 16, 0xFFFFFF, 30, 1.5, 300)
                weapon.fixCloseToTank(this.projectile, {oppTankDist: 160})

                this.minAngle = (vx > 0 ? 0 : Math.PI/2)
                this.maxAngle = (vx > 0 ? Math.PI/2 : Math.PI)
                this.initX = this.projectile.body.x
                this.initY = this.projectile.body.y
                this.dissipated = true
                this.projectile.destroy(true)
                weapon.scene.textures.remove(this.projectile.texture.key)
            }
        }
    }

    createParticle = (weapon, delta, x, y) => {
        this.particleCount++
        var index = this.particleCount
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 1
        canvas.width = 200

        var colorType = 0

        if (Math.random() > 0.5) {
            var grd = ctx.createLinearGradient(0,0,canvas.width/2,0)
            grd.addColorStop(0, 'rgba(100,100,100,0)')
            grd.addColorStop(1, 'rgba(100,100,100,1)')
            ctx.fillStyle = grd
            colorType = 1
        }
        else {
            var grd = ctx.createLinearGradient(0,0,canvas.width/2,0)
            grd.addColorStop(0, 'rgba(220,220,220,0)')
            grd.addColorStop(1, 'rgba(220,220,220,1)')
            ctx.fillStyle = grd
            colorType = 2
        }

        ctx.fillRect(0, 0, canvas.width/2, canvas.height)

        if (weapon.scene.textures.exists('projectile-' + index)) weapon.scene.textures.remove('projectile-' + index)
        weapon.scene.textures.addCanvas('projectile-' + index, canvas);

        var particle = weapon.scene.physics.add.sprite(x, y, 'projectile-' + index)
        particle.setDepth(3)
        particle.bounceCount = 3
        particle.canvas = canvas
        particle.setScale(1/100, 1)
        particle.body.preUpdate(false, 0)

        weapon.defaultShoot(particle, 50, 0, {x: x, y: y}, delta)
        
        particle.tween1 = new Tween({
            targets: [particle.body.velocity],
            props: [
                {key: 'x', value: particle.body.velocity.x * 3},
                {key: 'y', value: particle.body.velocity.y * 3},
            ],
            frames: 120
        })

        particle.tween2 = new Tween({
            targets: [particle],
            props: [
                {key: 'scaleX', value: 1},
            ],
            frames: 120
        })

        this.particles.push(particle)

        if (colorType === 1) {
            particle.red = 200
            particle.green = 200
            particle.blue = 200
        }
        else {
            particle.red = 220
            particle.green = 220
            particle.blue = 220
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            //obj.body.x = x
            //obj.body.y = y
            obj.setPosition(x,y)
            obj.body.updateFromGameObject()
            this.blast(weapon, obj, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, obj, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        if (this.dissipated === false) {
            weapon.turret.activeWeapon = null
        }
        else {
            this.particles = this.particles.filter(ele => { return ele !== obj })
            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,0.4)'}, {relativePosition: 0.4, color: 'rgba(140,50,30,0.9)'}, {relativePosition: 1, color: 'rgba(255,110,80,1)'}]
        
        if (this.dissipated === false) {
            var data = {thickness: 16, gradient: grd, blowPower: 200, soundEffect: 'expmedium', soundConfig: {}}
            weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 80 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString() + '.1')
            weapon.defaultUpdateScore(obj.body.x, obj.body.y, 80, 20/80)
            obj.destroy(true)
            weapon.scene.textures.remove(obj.texture.key)
            weapon.turret.activeWeapon = null
        }
        else {
            var data = {thickness: 16, gradient: grd, blowPower: 30, optimize: true,  soundEffect: 'expshort', soundConfig: {}}
            weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 28 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString() + '.2')
            weapon.defaultUpdateScore(obj.body.x, obj.body.y, 28, 20/28)
            obj.destroy(true)
            weapon.scene.textures.remove(obj.texture.key)

            this.particles = this.particles.filter(ele => {return ele !== obj})
            obj.tween1.destroy()
            obj.tween2.destroy()

            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }
}










export class sniperrifle {
    constructor() {
        this.id = 11
        this.type = 0
        this.name = 'Sniper Rifle'
        this.projectile = null
        this.logoCanvas = Logos.sniperrifle
    }

    reset = () => {
        this.projectile = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        // Thin white streak — 8px wide, 1px tall
        ctx.fillStyle = 'rgba(255,255,255,1)'
        ctx.fillRect(canvas.width/2 - 4, canvas.height/2 - 0.5, 8, 1)

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
        // Muzzle flash burst at turret tip
        var tipX = weapon.turret.x + (weapon.turret.height / 2) * Math.sin(weapon.turret.rotation)
        var tipY = weapon.turret.y - (weapon.turret.height / 2) * Math.cos(weapon.turret.rotation)
        weapon.spawnBurstEffect(tipX, tipY, 6, 0xFFFFFF, 8, 0.8, 150)
    }

    update = (weapon) => {
        weapon.updateTail(this.projectile, 10, 3, 1, {r: 255, g: 255, b: 255})
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj, false)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        var score = (tank === weapon.tank) ? -100 : 100
        weapon.constantUpdateScore(score)
        this.blast(weapon, obj, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 1, color: 'rgba(220,220,220,1)'}]
        var data = {thickness: 8, gradient: grd, blowPower: 300, soundEffect: 'sniper', soundConfig: {volume: 2}}
        weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 8, data, blowTank, this.id.toString())
        var vec = new Phaser.Math.Vector2(1,1)

        for (let index = 0; index < 200; index++) {
            var particle = weapon.scene.add.circle(this.projectile.body.x, this.projectile.body.y, 1, 0xffffff, 255) 
            vec.setAngle(Math.PI * 2 * Math.random())
            vec.setLength(Math.pow(Math.random(),2) * 60)
            var t = Math.random() * 1000 + 800
            weapon.scene.tweens.add({
                targets: particle,
                duration: t,
                ease: 'Quad.easeOut',
                x: particle.x + vec.x,
                y: particle.y + vec.y
            })    
            weapon.scene.tweens.add({
                targets: particle,
                duration: t,
                ease: 'Quad.easeOut',
                alpha: 0,
                onComplete: () => { particle.destroy(true) }
            })            
        }

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}












export class magicwall {
    constructor() {
        this.id = 12
        this.type = 0
        this.name = 'Magic Wall'
        this.projectile = null
        this.logoCanvas = Logos.magicwall
        this.groundHit = false
        this._sparkFrame = 0
    }

    reset = () => {
        this.projectile = null
        this.groundHit = false
        this._sparkFrame = 0
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 20
        canvas.width = 80

        // Blue-white rectangular slab with gradient
        var g = ctx.createLinearGradient(canvas.width/2 - 3, 0, canvas.width/2 + 3, 0)
        g.addColorStop(0, 'rgba(100,150,255,1)')
        g.addColorStop(0.5, 'rgba(200,220,255,1)')
        g.addColorStop(1, 'rgba(100,150,255,1)')
        ctx.fillStyle = g
        ctx.fillRect(canvas.width/2 - 3, canvas.height/2 - 1.5, 6, 3)

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.groundHit === false) {
            weapon.updateTail(this.projectile, 15, 5, 4, {r: 150, g: 200, b: 255})
            this.projectile.setRotation(this.projectile.rotation + 0.08)
            weapon.defaultUpdate(this.projectile)
            this._sparkFrame++
            if (this._sparkFrame % 4 === 0) {
                weapon.spawnParticle(
                    this.projectile.body.x + (Math.random() - 0.5) * 4,
                    this.projectile.body.y + (Math.random() - 0.5) * 4,
                    0xFFFFFF, 0.5, 300,
                    { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 }
                )
            }
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj, true)
            this.groundHit = true
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
       //
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        const h = 140
        const w = 8

        obj.x = obj.body.x
        obj.y = obj.body.y

        var emitter = weapon.scene.add.container()
        var shape = {h: 0, w: 8}
        var vec = new Phaser.Math.Vector2(1,1)

        weapon.scene.sound.play('magicwall', {rate: 0.6})

        emitter.emit = () => {
            for (let index = 0; index < 2; index++) {
                var particle = weapon.scene.add.circle(shape.w * (Math.random() - 0.5), 0, 0.8, 0x0099ff, 255) 
                emitter.add(particle)
                vec.setAngle(Math.PI * 2 * Math.random())
                vec.setLength(Math.random() * 30)
                var t = Math.random() * 500 + 800
                weapon.scene.tweens.add({
                    targets: particle,
                    duration: t,
                    x: particle.x + vec.x,
                    y: particle.y + vec.y,
                    ease: 'Quad.easeOut',
                    alpha: 0,
                    onComplete: () => {
                        emitter.remove(particle)
                        particle.destroy(true)
                    }
                })  
                weapon.scene.tweens.add({
                    targets: particle,
                    duration: t,
                    ease: 'Quad.easeIn',
                    alpha: 0,
                })           
            }
        }

        var ctx = weapon.terrain.getContext('2d')
        var g = ctx.createLinearGradient(obj.x, obj.y - h, obj.x, obj.y)
        g.addColorStop(0, 'rgba(120,190,0,1)')
        g.addColorStop(1, 'rgba(120,50,20,1)')
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = g
        
        weapon.scene.tweens.add({
            targets: shape,
            h: h,
            duration: 3000,
            onUpdate: () => {
                ctx.fillRect(obj.x - w/2, obj.y - shape.h, w, shape.h) 
                emitter.setPosition(obj.x, obj.y - shape.h)
                emitter.emit()
            },
            onComplete: () => {
                weapon.terrain.update()
                var p1 = {x: obj.x - w/2 - 1, y: obj.y - 1}
                var p2 = {x: obj.x - w/2 - 1, y: obj.y + 1}
                var p3 = {x: obj.x + w/2 + 1, y: obj.y + 1}
                var p4 = {x: obj.x + w/2 + 1, y: obj.y - 1}

                weapon.terrain.fixTerrainShape([p1, p2, p3, p4, p1])
                weapon.turret.activeWeapon = null
            }
        })

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
    }
}










export class dirtslinger {
    constructor() {
        this.id = 13
        this.type = 0
        this.name = 'Dirt Slinger'
        this.projectile = null
        this.logoCanvas = Logos.dirtslinger
        this.groundHit = false
        this.tween = null
    }

    reset = () => {
        this.tween = null
        this.projectile = null
        this.groundHit = false
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        ctx.fillStyle = 'rgba(250,200,0,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.groundHit === false) {
            weapon.updateTail(this.projectile, 15, 5, 4, {r: 250, g: 200, b: 0})
            weapon.defaultUpdate(this.projectile)
        }
        else {
            this.tween.update()
        }
    }

    onTerrainHit = (weapon, obj) => {
        this.groundHit = true

        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
       //
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        weapon.terrain.save()
        const h = 90
        const w = 120
        const x = obj.x = obj.body.x
        const y = obj.y = obj.body.y

        weapon.scene.sound.play('rockslide')

        var prevH = 0

        var shape = {h: 0, w: 0}
        var vec1 = new Phaser.Math.Vector2(1,1)
        var vec2 = new Phaser.Math.Vector2(1,1)
   
        var ctx = weapon.terrain.getContext('2d')
        var g = ctx.createLinearGradient(obj.x, obj.y - h, obj.x, obj.y)
        g.addColorStop(0, 'rgba(230,190,130,0.9)')
        g.addColorStop(1, 'rgba(120,50,20,0.5)')
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = g
        ctx.globalAlpha = 1
        
        this.tween = new Tween({
            targets: [shape],
            props: [{key: 'h', value: h}, {key: 'w', value: w}],
            frames: 120,
            onUpdate: () => {
                vec1.set(shape.w/2, shape.h)
                vec2.set(-shape.w/2, shape.h)
                //ctx.beginPath()
                var x1 = x + vec1.length() * Math.cos(vec1.angle())
                var y1 = y - vec1.length() * Math.sin(vec1.angle())
                var x2 = x + vec2.length() * Math.cos(vec2.angle())
                var y2 = y - vec2.length() * Math.sin(vec2.angle())

                if (y1 > 0 && y2 > 0) {
                    ctx.fillRect(x2, y2, x1 - x2, shape.h - prevH)
                    prevH = shape.h
                }
            },
            onComplete: () => {
                weapon.terrain.restore()

                vec1.set(w/2, h)
                vec2.set(-w/2, h)
                var x1 = x + vec1.length() * Math.cos(vec1.angle())
                var y1 = y - vec1.length() * Math.sin(vec1.angle())
                var x2 = x + vec2.length() * Math.cos(vec2.angle())
                var y2 = y - vec2.length() * Math.sin(vec2.angle())

                ctx.beginPath()
                ctx.moveTo(x, y)
                ctx.lineTo(x1, y1)
                ctx.lineTo(x2, y2)
                ctx.closePath()
                ctx.fill()

                weapon.terrain.update()

                var p1 = {x: x, y: y + 2}
                var p2 = {x: x - vec1.length() * Math.cos(vec1.angle()) - 2, y: y - vec1.length() * Math.sin(vec1.angle()) + 2}
                var p3 = {x: x - vec2.length() * Math.cos(vec2.angle()) + 2, y: y - vec2.length() * Math.sin(vec2.angle()) + 2}
                var p4 = {x: x, y: y + 2}

                weapon.terrain.fixTerrainShape([p1, p2, p3, p4, p1])
                weapon.turret.activeWeapon = null
            }
        })

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
    }
}











export class zapper {
    constructor() {
        this.id = 14
        this.type = 0
        this.name = 'Zapper'
        this.projectile = null
        this.logoCanvas = Logos.zapper
        this.zapped = false
    }

    reset = () => {
        this.projectile = null
        this.zapped = false
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 60

        ctx.fillStyle = 'rgba(0,230,80,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
        
        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.zapped === false) {
            weapon.updateTail(this.projectile, 15, 5, 4, {r: 0, g: 230, b: 80})
            weapon.defaultUpdate(this.projectile)
            this.checkCloseToTank(weapon)
        }
    }

    checkCloseToTank = (weapon) => {
        if (this.projectile.body === undefined) return
        var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
        var dist = Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y)
        if (dist < 80) {
            weapon.scene.sound.play('zapper')
            weapon.fixCloseToTank(this.projectile, {oppTankDist: 80})

            var targetAngle = Phaser.Math.Angle.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) + Math.PI;
            
            var g = weapon.scene.add.rectangle(this.projectile.body.x, this.projectile.body.y, 2, dist, 0xffe066, 255)
            g.setOrigin(0, 0)
            g.setAngle(Phaser.Math.RadToDeg(Phaser.Math.Angle.Wrap(targetAngle)) - 90)
            weapon.scene.tweens.add({
                targets: g,
                duration: 200,
                loop: 4,
                alpha: 0,
                onComplete: () => {
                    g.destroy(true)
                    weapon.turret.activeWeapon = null
                }
            })

            var vec = new Phaser.Math.Vector2(1,1)
            for (let index = 0; index < 100; index++) {
                var particle = weapon.scene.add.circle(oppTank.centre.x, oppTank.centre.y, 1, 0xffe066, 255) 
                vec.setAngle(Math.PI * 2 * Math.random())
                vec.setLength(Math.random() * 40)
                var t = Math.random() * 400 + 1500
                weapon.scene.tweens.add({
                    targets: particle,
                    duration: t,
                    ease: 'Quad.easeOut',
                    x: particle.x + vec.x,
                    y: particle.y + vec.y
                })    
                weapon.scene.tweens.add({
                    targets: particle,
                    duration: t,
                    ease: 'Quad.easeOut',
                    alpha: 0,
                    onComplete: () => { particle.destroy(true) }
                })            
            }
            //var score = (tank === weapon.tank) ? -40 : 40
            weapon.constantUpdateScore(40)

            this.projectile.destroy(true)
            weapon.scene.textures.remove(this.projectile.texture.key)
            this.zapped = true
        }   
    }
   
    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(0,0,0,1)'}, {relativePosition: 0.4, color: 'rgba(120,80,0,1)'}, {relativePosition: 1, color: 'rgba(230,160,0,1)'}]
        var data =  {thickness: 15, gradient: grd, blowPower: 50, soundEffect: 'expshort', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 40 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 40, 40/40)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}












export class napalm {
    constructor() {
        this.id = 15
        this.type = 0
        this.name = 'Napalm'
        this.projectile = null
        this.logoCanvas = Logos.napalm
        this.particles = []
        this.dissipated = false
        this.scoreTween = null
        this.removeTweens = []
        this._flameFrame = 0
    }

    reset = () => {
        this.projectile = null
        this.dissipated = false
        this.particles = []
        this.scoreTween = null
        this.removeTweens = []
        this._flameFrame = 0
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        // Outer glow ring — warm orange halo
        ctx.fillStyle = 'rgba(255,100,0,0.3)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 5, 0, Math.PI * 2)
        ctx.fill()
        // Core fireball — orange-yellow, 4px radius for visible glowing orb
        ctx.fillStyle = 'rgba(255,160,40,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 0
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.dissipated === false) {
            // Orange-flame trail
            weapon.updateTail(this.projectile, 15, 5, 4, {r: 255, g: 120, b: 20}, true)
            // Flickering flame particles — linger 600-1000ms, creating visible fire trail in wake
            this._flameFrame++
            if (this._flameFrame % 2 === 0) {
                var flameColors = [0xFF6600, 0xFFAA00, 0xFF4400, 0xFFCC00]
                for (var f = 0; f < 2; f++) {
                    weapon.spawnParticle(
                        this.projectile.body.x + (Math.random() - 0.5) * 4,
                        this.projectile.body.y + (Math.random() - 0.5) * 4,
                        flameColors[Math.floor(Math.random() * flameColors.length)],
                        0.8 + Math.random() * 0.8,
                        600 + Math.random() * 400,
                        { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 }
                    )
                }
            }
            weapon.defaultUpdate(this.projectile)
            this.checkCloseToTerrain(weapon, this.projectile)
        }
        if (this.dissipated === true) {
            this.particles.forEach(p => {
                if (p.body !== undefined)
                    weapon.defaultUpdate(p)
            })
            this.scoreTween.update()
            this.removeTweens.forEach(t => {t.update()})
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y

            if (this.dissipated === false) {
                this.dissipated = true
                this.projectile.body.stop()
                this.projectile.setGravity(0)
                this.blast(weapon, obj)
            }
            else {
                obj.body.stop()
                obj.setGravity(0)
            }
        }
    }

    checkCloseToTerrain = (weapon, obj) => {
        if (this.projectile.body === undefined) return
        if (weapon.checkCloseToTerrain(obj, 20) === false) return

        this.dissipated = true
        this.blast(weapon, this.projectile)
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
       //
    }

    onOutOfBound = (weapon, obj) => {
        if (obj === this.projectile) {
            obj.destroy(true)
            weapon.scene.textures.remove(obj.texture.key)
            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
        else {
            if (obj.smokeEmitter !== null) {
                obj.smokeEmitter.tween.remove()
                obj.smokeEmitter.remove()
            }
            this.particles = this.particles.filter(p => { return p === obj })
            obj.destroy(true)
            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        for (let i = 0; i < 20; i++) {
            var angle = 2 * Math.PI * (i/20 - 0.5)
            this.createParticle(weapon, angle, i)
        }

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')

        weapon.scene.sound.play('napalm')

        this.scoreTween = new Tween({
            targets: [weapon],
            frames: 35,
            loop: 7,
            onLoop: () => {
                var points1 = 0
                var points2 = 0
                var temp
                var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
                this.particles.forEach(ele => {
                    temp = Phaser.Math.Distance.BetweenPoints(ele, weapon.tank)
                    var k = Math.ceil((weapon.tank.hitRadius*2 - temp) * 0.5 / weapon.tank.hitRadius*2)
                    points1 += (temp < weapon.tank.hitRadius*2) ? Math.min(k, 5) : 0
                })
                setTimeout(() => {
                    weapon.constantUpdateScore(Math.floor(-points1)) 
                }, 600*Math.random());

                this.particles.forEach(ele => {
                    temp = Phaser.Math.Distance.BetweenPoints(ele, oppTank)
                    var k = Math.ceil((weapon.tank.hitRadius*2 - temp) * 0.5 / weapon.tank.hitRadius*2)
                    points2 += (temp < weapon.tank.hitRadius*2) ? Math.min(k, 5) : 0
                })
                setTimeout(() => {
                    weapon.constantUpdateScore(Math.floor(points2)) 
                }, 600*Math.random());
            },
        })
    }

    createParticle = (weapon, angle, index) => {
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        var g = ctx.createLinearGradient(canvas.width/2, 0, canvas.width/2, canvas.height)
        g.addColorStop(0, 'rgba(250,180,50,0)')
        g.addColorStop(0.5, 'rgba(250,180,50,0.1)')
        g.addColorStop(1, 'rgba(250,180,50,0)')

        ctx.fillStyle = 'rgba(250,180,50,0.5)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 1, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('particle-' + index)) weapon.scene.textures.remove('particle-' + index)
        weapon.scene.textures.addCanvas('particle-' + index, canvas);
        var p = weapon.scene.physics.add.sprite(this.projectile.body.x, this.projectile.body.y, 'particle-' + index)
        weapon.defaultShoot(p, 80, 200, {x: this.projectile.body.x, y: this.projectile.body.y}, angle)
        
        p.bounceCount = 0
        p.canvas = canvas
        p.smokeEmitter = null
        this.particles.push(p)

        var remTween = new Tween({
            targets: [p],
            frames: 36,
            loop: 7,
            props: [{key: 'alpha', value: 0}],
            onComplete: () => {
                if (p.body !== undefined) {
                    if (p.smokeEmitter !== null) {
                        p.smokeEmitter.tween.remove()
                        p.smokeEmitter.remove()
                    }
                    p.destroy(true)
                    this.particles = this.particles.filter(particle => { return particle === p })
                    if (this.particles.length === 0)
                        weapon.turret.activeWeapon = null
                }
            }
        })

        this.removeTweens.push(remTween)

        setTimeout(() => {
            this.addSmoke(weapon, p, canvas, ctx)
        }, Math.random() * 500);
    }

    addSmoke = (weapon, p, canvas, ctx) => {
        if (p.body === undefined) return
        
        canvas = document.createElement('canvas')
        ctx = canvas.getContext('2d')
        
        canvas.height = 4
        canvas.width = 4

        ctx.fillStyle = 'rgba(250,180,50,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        var smokeTexture = weapon.scene.textures.addCanvas('smoke', canvas, true)
        var smokeEmitter = weapon.scene.add.particles(smokeTexture).createEmitter({
            x: p.body.x,
            y: p.body.y,
            speed: 20,
            angle: { min: 180, max: 360 },
            scale: { start: 1, end: 3},
            alpha: { start: 0.05, end: 0},
            lifespan: 1500,
        });
    
        smokeEmitter.reserve(100);
        p.smokeEmitter = smokeEmitter

        p.smokeEmitter.tween = weapon.scene.tweens.add({
            targets: smokeEmitter,
            duration: 100,
            t: 1,
            loop: -1,
            onLoop: () => {
                if (p.body.speed === 0) {
                    var beta = Phaser.Math.RadToDeg(weapon.terrain.getSlope(p.body.x, p.body.y))
                    smokeEmitter.setAngle({min: beta, max: beta - 180})
                }
                else {
                    smokeEmitter.setAngle({min: (360 - p.body.velocity.angle()) - 90, max: (360 - p.body.velocity.angle()) + 90})
                }
                smokeEmitter.setPosition(p.body.x, p.body.y)
            }
        })
    }
}
















export class hailstorm {
    constructor() {
        this.id = 16
        this.type = 0
        this.name = 'Hail Storm'
        this.projectile = null
        this.ballsArray = []
        this.ballsCount = 20
        this.ballRadius = 5
        this.logoCanvas = Logos.hailstorm
        this.dissociated = false
        this.originalSlope = 0
        this.scoreTween = null
        this.spawnTween = null
        this.removeTween = null
        this.collider = null
    }

    reset = () => {
        this.dissociated = false
        this.projectile = null
        this.ballsArray = []
        this.originalSlope = 0
        this.scoreTween = null
        this.spawnTween = null
        this.removeTween = null
        this.collider = null
    }

    create = (weapon) => {
        this.reset()

        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 10
        canvas.width = 80

        ctx.fillStyle = 'rgba(180,220,255,1)'
        ctx.globalAlpha = 1.0

        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 4, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);
        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.canvas = canvas
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
    }    

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
    
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)

        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
    
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            if (obj === this.projectile) {
                obj.body.x = x
                obj.body.y = y
                obj.body.preUpdate(false, 0)
                this.dissociate(weapon, prevX, prevY)
            }
            else {
                weapon.spawnBurstEffect(obj.body.x, obj.body.y, 4, 0xDDEEFF, 8, 0.6, 250)
                var bounce = weapon.defaultBounce(obj, 1, 25)
                if (bounce) {
                    var slope = weapon.terrain.getSlope(prevX, prevY)
                    if (isNaN(slope) === true) {
                        if (obj.body.velocity.x > 0) {
                            slope = -Math.PI/2
                        }
                        else {
                            slope = Math.PI/2
                        }
                    }
                    var perpendicular = Phaser.Math.Angle.Wrap(slope - Math.PI/2)
                    var k = 20 * Math.exp(-Math.abs((perpendicular / Math.PI/2)))
                    var vec = new Phaser.Math.Vector2(k * Math.cos(perpendicular), k * Math.sin(perpendicular))
                    obj.body.velocity.add(vec)
                    obj.body.preUpdate(false, 0)
                }
                else {
                    this.ballsArray = this.ballsArray.filter(ball => { return ball !== obj })
                    obj.destroy(true)
                }
            }
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    onOutOfBound = (weapon, obj) => {
        weapon.scene.textures.remove(obj.texture.key)
        if (obj === this.projectile) {
            obj.destroy(true)
            weapon.turret.activeWeapon = null
        }
        else {
            this.ballsArray = this.ballsArray.filter(ball => {return obj !== ball})
            obj.destroy(true)
        }
    }

    update = (weapon, obj) =>  {
        if (this.projectile !== null) {
            weapon.updateTail(this.projectile, 15, 5, 4, {r: 180, g: 220, b: 255})
            weapon.defaultUpdate(this.projectile)
        }
        if (this.projectile === null) {
            this.spawnTween.update()
            this.removeTween.update()
            this.scoreTween.update()
            
            this.ballsArray.forEach(ball => {
                weapon.defaultUpdate(ball)
            })

            this.collider.update()
        }
        
        if (this.ballsArray.length === 0 && this.dissociated) {
            weapon.scene.sound.stopByKey('hailstorm')
            weapon.turret.activeWeapon = null
        }
    }

    dissociate = (weapon, prevX, prevY) => {
        weapon.scene.sound.play('aquabomb_splash')

        setTimeout(() => {
            weapon.scene.sound.play('hailstorm', {volume: 2})
        }, 2000);

        this.originalSlope = weapon.terrain.getSlope(prevX, prevY)

        if (isNaN(this.originalSlope) === true) {
            if (this.projectile.body.velocity.x > 0) {
                this.originalSlope = -Math.PI/2
            }
            else {
                this.originalSlope = Math.PI/2
            }
        }

        this.startSpawnTween(weapon, this.projectile.body.x, this.projectile.body.y)
        this.startRemoveTween(weapon)
        this.startScoreTween(weapon)

        this.collider = new Collider(true)
        
        weapon.scene.textures.remove(this.projectile.texture.key)
        this.projectile.destroy(true)
        this.projectile = null
    }

    startSpawnTween = (weapon, x, y) => {
        var i = 0;
        this.spawnTween = new Tween({
            targets: [],
            frames: 6,
            loop: this.ballsCount,
            onLoop: () => {
                this.spawnBall(weapon, i, x, y)
                i++
            },
            onComplete: () => {
                this.dissociated = true
            }
        })
    }

    startRemoveTween = (weapon) => {
        this.removeTween = new Tween({
            targets: [],
            frames: 1,
            loop: -1,
            onLoop: () => {
                this.ballsArray.forEach(ball => {
                    ball.lifetime--
                    if (ball.lifetime <= 0) ball.destroy(true)
                })
                this.ballsArray = this.ballsArray.filter(ball => { return ball.lifetime > 0 })
            },
        })
    }

    startScoreTween = (weapon) => {
        this.scoreTween = new Tween({
            targets: [],
            frames: 36,
            loop: 15,
            onLoop: () => {
                var points1 = 0
                var points2 = 0
                var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
                this.ballsArray.forEach(ele => {
                    if (weapon.tank.isPointInside(ele.body.x, ele.body.y)) {
                        points1 += 0.5
                    }
                })
                setTimeout(() => {
                    weapon.constantUpdateScore(Math.floor(-points1)) 
                }, 600*Math.random());
    
                this.ballsArray.forEach(ele => {
                    if (oppTank.isPointInside(ele.body.x, ele.body.y)) {
                        points2 += 0.5
                    }
                })
                setTimeout(() => {
                    weapon.constantUpdateScore(Math.ceil(points2)) 
                }, 600*Math.random()); 
            }
        })
    }

    createBall = (weapon, index) => {
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = this.ballRadius * 2
        canvas.width = this.ballRadius * 2

        // Ice shard: angular polygon instead of circle
        ctx.fillStyle = 'rgba(180,230,255,1)'
        ctx.beginPath()
        ctx.moveTo(canvas.width/2, canvas.height/2 - 3)
        ctx.lineTo(canvas.width/2 + 2, canvas.height/2)
        ctx.lineTo(canvas.width/2 + 1, canvas.height/2 + 3)
        ctx.lineTo(canvas.width/2 - 1, canvas.height/2 + 2)
        ctx.lineTo(canvas.width/2 - 2, canvas.height/2 - 1)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('ball-' + index)) weapon.scene.textures.remove('ball-' + index)
        weapon.scene.textures.addCanvas('ball-' + index, canvas)
    }

    spawnBall = (weapon, index, x, y) => {
        this.createBall(weapon, index)
        
        var deviate = [5, -1, 3, -8, -6, 9, 3, -7, 4, -2, 6, 7, -3, 2, 8, 6, -9, -4, -8, 4, -2, 6, 7, -3, 2, 8, 2, -7, 5, 8, -1]
        var ball = weapon.scene.physics.add.sprite(x, y, 'ball-' + index)

        ball.setDepth(3)
        ball.body.setSize(1,1)
        ball.setGravityY(150)
        ball.lifetime = 400
        ball.body.x = x
        ball.body.y = y
        ball.body.updateFromGameObject()
        this.ballsArray.push(ball)
        ball.body.setDragX(0.9)
        
        var perpendicular = this.originalSlope - Math.PI/2
        var vec1, vec2, vec3;
        
        vec1 = new Phaser.Math.Vector2(25 * Math.cos(perpendicular), 25 * Math.sin(perpendicular))
        vec2 = new Phaser.Math.Vector2(deviate[index] * Math.cos(this.originalSlope), deviate[index] * Math.sin(this.originalSlope))
        vec3 = vec1.add(vec2)
        ball.setVelocity(vec3.x, vec3.y)
        
        ball.body.preUpdate(false, 0)

        this.collider.add(ball, this.ballRadius/4)
    }
}













export class groundhog {
    constructor() {
        this.id = 17
        this.type = 3
        this.name = 'Ground Hog'
        this.projectile = null
        this.insideTerrain = false
        this.prevState = null
        this.logoCanvas = Logos.groundhog
        this._eruptFrame = 0
    }

    reset = () => {
        this.projectile = null
        this.insideTerrain = false
        this.prevState = null
        this._eruptFrame = 0
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 12
        canvas.width = 60

        ctx.fillStyle = 'rgba(150,100,255,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2 - 2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2 + 2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        this.prevState = {x: this.projectile.body.x, y: this.projectile.body.y}
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.insideTerrain === false) {
            weapon.updateTail(this.projectile, 15, 5, 3, {r: 150, g: 100, b: 255})
        }
        else {
            var canvas = this.projectile.canvas
            var ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Dirt eruption particles — "mole under a lawn" effect, erupting from surface above tunnel path
            this._eruptFrame++
            if (this._eruptFrame % 2 === 0) {
                // Find surface Y above current underground position (scan upward for transparent pixel)
                var surfaceY = this.projectile.body.y
                for (var checkY = this.projectile.body.y; checkY >= 0; checkY--) {
                    if (weapon.terrain.getPixel(Math.floor(this.projectile.body.x), Math.floor(checkY)).alpha === 0) {
                        surfaceY = checkY
                        break
                    }
                }
                // Spawn 3 dirt particles erupting upward from surface
                for (var d = 0; d < 3; d++) {
                    weapon.spawnParticle(
                        this.projectile.body.x + (Math.random() - 0.5) * 6,
                        surfaceY,
                        0x8B6914,   // dirt brown
                        1 + Math.random(),
                        500,
                        { x: (Math.random() - 0.5) * 8, y: -(3 + Math.random() * 8) }
                    )
                }
            }
        }

        weapon.defaultUpdate(this.projectile)

        if (this.projectile.body !== undefined) {
            this.digTerrain(weapon)
            this.checkOutsideTerrain(weapon)
        }
    }

    digTerrain = (weapon) => {
        if (this.projectile !== null)
            weapon.defaultDigTerrain(this.projectile, 3, 0.2)
    }

    onTerrainHit = (weapon, obj) => {
        this.insideTerrain = true
        this.projectile.setGravityY(0)
    }

    onBaseHit = (weapon) => {
        var [x, y, prevX, prevY] = weapon.retractBase(this.projectile)
        y = Math.min(y, weapon.terrain.height - 1)
        this.projectile.body.x = x
        this.projectile.body.y = y
        this.blast(weapon)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon)
    }

    onBounceHit = (weapon, obj) => {

    }

    checkOutsideTerrain = (weapon) => {
        if (this.insideTerrain === true) {
            if (weapon.terrain.getPixel(this.projectile.body.x, this.projectile.body.y).alpha === 0) {
                var [x, y, prevX, prevY] = weapon.retractInAir(this.projectile)
                this.projectile.body.x = x
                this.projectile.body.y = y
                // Debris burst on exit — dramatic dirt spray as projectile erupts from ground
                weapon.spawnBurstEffect(this.projectile.body.x, this.projectile.body.y, 12, 0x8B6914, 20, 1.5, 400)
                this.blast(weapon)
            }
        }
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    blast = (weapon) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(150,0,80,1)'}, {relativePosition: 1, color: 'rgba(255,0,100,1)'}]
        var data =  {thickness: 15, gradient: grd, blowPower: 100, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 70 - weapon.scene.tank1.hitRadius,data, true, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 70, 50/70)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}











export class worm {
    constructor() {
        this.id = 18
        this.type = 1
        this.name = 'Worm'
        this.projectile = null
        this.insideTerrain = false
        this.prevState = null
        this.logoCanvas = Logos.worm
    }

    reset = () => {
        this.projectile = null
        this.insideTerrain = false
        this.prevState = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 12
        canvas.width = 60

        ctx.fillStyle = 'rgba(150,100,255,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2 - 2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2 + 2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        this.prevState = {x: this.projectile.body.x, y: this.projectile.body.y}
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.insideTerrain === false) {
            weapon.updateTail(this.projectile, 15, 5, 3, {r: 150, g: 100, b: 255})
        }
        else {
            var canvas = this.projectile.canvas
            var ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        weapon.defaultUpdate(this.projectile)

        if (this.projectile.body !== undefined) {
            this.digTerrain(weapon)
            this.checkOutsideTerrain(weapon)
        }
    }

    digTerrain = (weapon) => {
        if (this.projectile !== null)
            weapon.defaultDigTerrain(this.projectile, 3, 0.2)
    }

    onTerrainHit = (weapon) => {
        this.insideTerrain = true
        this.projectile.setGravityY(-300)
    }

    onBaseHit = (weapon) => {
        var [x, y, prevX, prevY] = weapon.retractBase(this.projectile)
        y = Math.min(y, weapon.terrain.height - 1)
        this.projectile.body.x = x
        this.projectile.body.y = y
        this.blast(weapon)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon)
    }

    onBounceHit = (weapon, obj) => {
        
    }

    checkOutsideTerrain = (weapon) => {
        if (this.insideTerrain === true) {
            if (weapon.terrain.getPixel(this.projectile.body.x, this.projectile.body.y).alpha === 0) {
                var [x, y, prevX, prevY] = weapon.retractInAir(this.projectile)
                this.projectile.body.x = x
                this.projectile.body.y = y
                this.blast(weapon)
            }
        }
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    blast = (weapon) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(0,20,100,1)'}, {relativePosition: 1, color: 'rgba(150,100,255,1)'}]
        var data = {thickness: 12, gradient: grd, blowPower: 100, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 60 - weapon.scene.tank1.hitRadius, data, true, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 60, 50/60)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}













export class homingworm {
    constructor() {
        this.id = 19
        this.type = 1
        this.name = 'Homing Worm'
        this.projectile = null
        this.insideTerrain = false
        this.prevState = null
        this.logoCanvas = Logos.homingworm
        this.canTurn = true
    }

    reset = () => {
        this.projectile = null
        this.canTurn = true
        this.prevState = null
        this.insideTerrain = false
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 12
        canvas.width = 60

        ctx.fillStyle = 'rgba(150,100,255,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2 - 2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = 'rgba(220,220,220,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2 + 2, 1.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        this.prevState = {x: this.projectile.body.x, y: this.projectile.body.y}
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.insideTerrain === false) {
            weapon.updateTail(this.projectile, 15, 5, 3, {r: 150, g: 100, b: 255})
        }
        else {
            var canvas = this.projectile.canvas
            var ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        weapon.defaultUpdate(this.projectile)

        if (this.projectile.body !== undefined) {
            this.digTerrain(weapon)
            this.checkUnderTank(weapon)
            this.checkOutsideTerrain(weapon)
        }
    }

    digTerrain = (weapon) => {
        if (this.projectile !== null)
            weapon.defaultDigTerrain(this.projectile, 3, 0.2)
    }

    onTerrainHit = (weapon) => {
        this.insideTerrain = true
        this.projectile.setGravityY(-300)
    }

    onBaseHit = (weapon) => {
        var [x, y, prevX, prevY] = weapon.retractBase(this.projectile)
        y = Math.min(y, weapon.terrain.height - 1)
        this.projectile.body.x = x
        this.projectile.body.y = y
        this.blast(weapon)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon)
    }

    onBounceHit = (weapon, obj) => {
        
    }

    checkUnderTank = (weapon) => {
        if (this.insideTerrain === true) {
            var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
            if (Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) < 200) {
                if (Math.abs(oppTank.centre.x - this.projectile.body.x) < 10 && this.canTurn) {
                    this.canTurn = false
                    weapon.scene.sound.play('homing')
                    this.projectile.body.velocity.setAngle(-Math.PI/2)
                }
            }
        }
    }

    checkOutsideTerrain = (weapon) => {
        if (this.insideTerrain === true) {
            if (weapon.terrain.getPixel(this.projectile.body.x, this.projectile.body.y).alpha === 0) {
                var [x, y, prevX, prevY] = weapon.retractInAir(this.projectile)
                this.projectile.body.x = x
                this.projectile.body.y = y
                this.blast(weapon)
            }
        }
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    blast = (weapon) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(50,0,100,1)'}, {relativePosition: 1, color: 'rgba(100,0,200,1)'}]
        var data = {thickness: 14, gradient: grd, blowPower: 100, soundEffect: 'expshort', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 46 - weapon.scene.tank1.hitRadius, data, true, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 46, 30/46)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}













export class skipper {
    constructor() {
        this.id = 20
        this.type = 0
        this.name = 'Skipper'
        this.projectile = null
        this.logoCanvas = Logos.skipper
        this.bounce = 4
    }

    reset = () => {
        this.projectile = null
        this.bounce = 4
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        ctx.fillStyle = 'rgba(150,220,255,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 0
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        weapon.updateTail(this.projectile, 13, 5, 4, {r: 100, g: 200, b: 250}, false)
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        else if (this.bounce > 0) {
            bounce = this.skipperBounce(weapon, obj)
            if (bounce)
                this.bounce--
            else 
                this.blast(weapon, true)
        }
        else {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.setPosition(x, y)
            obj.body.updateFromGameObject()
            this.blast(weapon, true)
        }

    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    skipperBounce = (weapon, obj) => {
        if (this.bounce <= 0) return false
        weapon.scene.sound.play('skipperbounce')
        var count = Math.max(3, this.bounce + 2)
        weapon.spawnBurstEffect(obj.body.x, obj.body.y, count, 0xCCBB88, 12, 0.8, 300)
        return weapon.defaultBounce(obj)
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.3, color: 'rgba(50,50,0,1)'}, {relativePosition: 1, color: 'rgba(240,240,20,1)'}]
        var data = {thickness: 14, gradient: grd, blowPower: 100, soundEffect: 'expshort', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 52 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 52, 40/52)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}














export class chainreaction {
    constructor() {
        this.id = 21
        this.type = 0
        this.name = 'Chain Reaction'
        this.projectile = null
        this.logoCanvas = Logos.chainreaction
        this.emitter1 = null
        this.emitter2 = null
    }

    reset = () => {
        this.projectile = null
        this.emitter1 = null
        this.emitter2 = null
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 20
        canvas.width = 20

        // Outer glow
        ctx.fillStyle = 'rgba(255,255,200,0.3)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 6, 0, Math.PI * 2)
        ctx.fill()
        // White-hot core
        ctx.fillStyle = 'rgba(255,255,240,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3, 0, Math.PI * 2)
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 0
        this.projectile.canvas = canvas

        canvas = document.createElement('canvas')
        ctx = canvas.getContext('2d')

        canvas.height = 10
        canvas.width = 10

        ctx.fillStyle = 'rgba(240,240,240,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 1, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('chainparticle')) weapon.scene.textures.remove('chainparticle')
        weapon.scene.textures.addCanvas('chainparticle', canvas);

        this.emitter1 = weapon.scene.add.particles('chainparticle').createEmitter({
            alpha: { start: 0.7, end: 0.1},
            speed: 5,
            scale: 0.8,
            lifespan: 500,
        })

        this.emitter1.reserve(100)
        this.emitter1.startFollow(this.projectile)

        this.emitter2 = weapon.scene.add.particles('chainparticle').createEmitter({
            alpha: { start: 1, end: 0 },
            scale: { start: 1, end: 3.5 },
            lifespan: 250,
        })

        this.emitter2.reserve(5).setFrequency(100)
        this.emitter2.startFollow(this.projectile)
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
        if (this.emitter1 !== null) this.emitter1.stop()
        if (this.emitter2 !== null) this.emitter2.stop()
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.1, color: 'rgba(50,0,0,0)'}, {relativePosition: 0.4, color: 'rgba(100,0,0,1)'}, {relativePosition: 1, color: 'rgba(255,0,0,1)'}]
        var arr = [{x: -2, y: -4}, {x: 20, y: 16}, {x: -42, y: -12}, {x: 30, y: 16}, {x: -52, y: 10}, {x: -50, y: 6}, {x: 12, y: -20}, {x: 32, y: -16}, {x: 18, y: 34},
            {x: -40, y: -12}, {x: -2, y: 36}, {x: 54, y: 20}, {x: -24, y: -14}, {x: 20, y: -10}, {x: 46, y: 26}]

        var i = 0;
        var offx, offy

        var initX = this.projectile.body.x
        var initY = this.projectile.body.y

        offx = arr[i].x
        offy = arr[i].y
        weapon.terrain.blast(1, Math.floor(initX) + offx, Math.floor(initY) + offy, 46 - weapon.scene.tank1.hitRadius, {thickness: 16, gradient: grd, blowPower: 50}, blowTank, this.id.toString())
        weapon.defaultUpdateScore(initX + offx, initY + offy, 46, 20/46)
        i++

        const createBlast = () => {
            offx = arr[i].x
            offy = arr[i].y
            if (Math.floor(this.projectile.y) + offy < weapon.terrain.height) {
                var data = {thickness: 16, gradient: grd, blowPower: 50, soundEffect: 'expshort', soundConfig: {}}
                weapon.terrain.blast(1, Math.floor(initX) + offx, Math.floor(initY) + offy, 46 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
                weapon.defaultUpdateScore(initX + offx, initY + offy, 46, 20/46)

                // Energy arc from previous blast to current
                if (i > 1) {
                    var prevOff = arr[i-2]  // previous blast offset
                    var dx = offx - prevOff.x
                    var dy = offy - prevOff.y
                    for (var arc = 0; arc < 5; arc++) {
                        var t = arc / 5
                        weapon.spawnParticle(
                            Math.floor(initX) + prevOff.x + dx * t,
                            Math.floor(initY) + prevOff.y + dy * t,
                            0xFFFFFF, 1, 400,
                            { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 }
                        )
                    }
                }
            }
            i++
        }

        var timer = weapon.scene.time.addEvent({delay: 200, callback: createBlast, callbackScope: this, repeat: arr.length - 2});

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
        if (this.emitter1 !== null) this.emitter1.stop()
        if (this.emitter2 !== null) this.emitter2.stop()
    }
}


















export class pineapple {
    constructor() {
        this.id = 22
        this.type = 0
        this.name = 'Pineapple'
        this.projectile = null
        this.logoCanvas = Logos.pineapple
        this.particles = []
        this.maxParticles = 20
        this.dissociated = false
    }

    reset = () => {
        this.projectile = null
        this.particles = []
        this.dissociated = false
        this._pulseFrame = 0
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 24
        canvas.width = 24

        // Outer green glow
        ctx.fillStyle = 'rgba(0,200,50,0.25)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 8, 0, Math.PI * 2)
        ctx.fill()
        // Grenade body
        ctx.fillStyle = 'rgba(0,180,60,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 5, 0, Math.PI * 2)
        ctx.fill()
        // Segment lines for grenade look
        ctx.strokeStyle = 'rgba(0,140,40,0.6)'
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(canvas.width/2, canvas.height/2 - 5)
        ctx.lineTo(canvas.width/2, canvas.height/2 + 5)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(canvas.width/2 - 5, canvas.height/2)
        ctx.lineTo(canvas.width/2 + 5, canvas.height/2)
        ctx.stroke()
        // Bright core
        ctx.fillStyle = 'rgba(100,255,100,0.5)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.dissociated === false) {
            // Pulsing green glow
            if (this._pulseFrame === undefined) this._pulseFrame = 0
            this._pulseFrame++
            var s = 1 + Math.sin(this._pulseFrame * 0.15) * 0.12
            this.projectile.setScale(s)

            // Heavy green particle smoke
            if (this._pulseFrame % 2 === 0) {
                for (var g = 0; g < 2; g++) {
                    weapon.spawnParticle(
                        this.projectile.body.x + (Math.random() - 0.5) * 6,
                        this.projectile.body.y + (Math.random() - 0.5) * 6,
                        Math.random() > 0.5 ? 0x00BB33 : 0x009922,
                        1 + Math.random(),
                        700 + Math.random() * 300,
                        { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 }
                    )
                }
            }

            weapon.defaultUpdate(this.projectile)
            this.checkCloseToTank(weapon)
        }
        if (this.dissociated === true) {
            this.particles.forEach(p => {
                weapon.updateTail(p, 15, 5, 2, {r: 0, g: 255, b: 100})
                weapon.defaultUpdate(p)
            })
        }
    }

    checkCloseToTank = (weapon) => {
        if (this.projectile.body === undefined) return
        if (this.dissociated === true) return
        var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
        if (Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) < 200) {
            weapon.fixCloseToTank(this.projectile, {oppTankDist: 200})
            weapon.scene.sound.play('split')
            // green flash on scatter
            weapon.spawnBurstEffect(this.projectile.body.x, this.projectile.body.y, 20, 0x00FF44, 40, 2, 400)
            this.dissociate(weapon)
        }
    }

    dissociate = (weapon) => {
        for (let i = 0; i < this.maxParticles; i++) {
            var canvas = document.createElement('canvas')
            var ctx = canvas.getContext('2d')

            canvas.height = 10
            canvas.width = 40

            ctx.fillStyle = 'rgba(0,255,100,1)'
            ctx.beginPath()
            ctx.arc(canvas.width/2, canvas.height/2, 1.5, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
            
            if (weapon.scene.textures.exists('particle-' + i)) weapon.scene.textures.remove('particle-' + i)
            weapon.scene.textures.addCanvas('particle-' + i, canvas);
            var particle = weapon.scene.physics.add.sprite(this.projectile.body.x, this.projectile.body.y, 'particle-' + i)
            particle.setDepth(3)
            particle.bounceCount = 3
            particle.canvas = canvas    
            weapon.defaultShoot(particle, 160, undefined, {x: this.projectile.body.x, y: this.projectile.body.y}, Math.PI * 2 * (i / this.maxParticles))

            this.particles.push(particle)
        }

        weapon.scene.textures.remove('projectile')
        this.projectile.destroy(true)
        this.projectile = null
        this.dissociated = true
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, obj, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        if (obj === this.projectile) {
            weapon.turret.activeWeapon = null
        }
        else {
            this.particles = this.particles.filter(ele => { return obj !== ele })
            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(50,50,0,1)'}, {relativePosition: 0.4, color: 'rgba(100,100,0,1)'}, {relativePosition: 1, color: 'rgba(240,2400,0,1)'}]
        if (obj === this.projectile) {
            var data =  {thickness: 15, gradient: grd, blowPower: 100, soundEffect: 'expmedium', soundConfig: {}}
            weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 80 - weapon.scene.tank1.hitRadius, data, true, this.id.toString() + '.1')
            weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 80, 40/80)
            this.projectile.destroy(true)
            weapon.scene.textures.remove('projectile')
            weapon.turret.activeWeapon = null
        }
        else {
            var data = {thickness: 12, gradient: grd, blowPower: 50, optimize: true, soundEffect: 'expshort', soundConfig: {}}
            weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 20 - weapon.scene.tank1.hitRadius, data, true, this.id.toString() + '.2')
            weapon.defaultUpdateScore(obj.body.x, obj.body.y, 20, 32/20)
            this.particles = this.particles.filter(ele => { return obj !== ele })
            obj.destroy(true)
            weapon.scene.textures.remove(obj.texture.key)
            if (this.particles.length === 0)
                weapon.turret.activeWeapon = null
        }
    }
}

















export class firecracker {
    constructor() {
        this.id = 23
        this.type = 0
        this.name = 'Firecracker'
        this.projectile = null
        this.logoCanvas = Logos.firecracker
    }

    reset = () => {
        this.projectile = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 10
        canvas.width = 50

        ctx.fillStyle = 'rgba(240,0,0,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 0
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        weapon.updateTail(this.projectile, 15, 4, 4, {r: 240, g: 0, b: 0})
        weapon.defaultUpdate(this.projectile)
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        const totalBlast = 20
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.1, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.4, color: 'rgba(100,30,20,1)'}, {relativePosition: 1, color: 'rgba(255,150,50,1)'}]
        var arrRightX = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        var arrRightY = [-1,-2,3,4,-12,2,-4,2,-6,14,-14,2,-8,8,7,-13,2,0,-4,2]

        var arrLeftX = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        var arrLeftY = [2,-12,-4,0,7,15,3,-12,-2,6,-4,12,-14,4,8,-1,-13,7,2,-3]

        var i = 0;
        var initX = this.projectile.body.x
        var initY = this.projectile.body.y
        var offx, offy
        var data = {thickness: 16, gradient: grd, blowPower: 50, optimize: true, soundEffect: 'firecracker', soundConfig: {}}

        weapon.terrain.blast(1, Math.floor(initX), Math.floor(initY), 24 - weapon.scene.tank1.hitRadius, data, false, this.id.toString())
        weapon.defaultUpdateScore(initX, initY, 24, 5/24)

        const createBlast = () => {
            offx = -7*i + arrLeftX[i]
            offy = arrLeftY[i]
            var data = {thickness: 16, gradient: grd, blowPower: 50, optimize: true, soundEffect: 'firecracker', soundConfig: {}}
            weapon.terrain.blast(1, Math.floor(initX) + offx, Math.floor(initY) + offy, 24 - weapon.scene.tank1.hitRadius, data, false, this.id.toString())
            weapon.defaultUpdateScore(initX + offx, initY + offy, 24, 5/24)
            offx = 7*i + arrRightX[i]
            offy = arrRightY[i]
            weapon.terrain.blast(1, Math.floor(initX) + offx, Math.floor(initY) + offy, 24 - weapon.scene.tank1.hitRadius, data, false, this.id.toString())
            weapon.defaultUpdateScore(initX + offx, initY + offy, 24, 5/24)
            i++
        }

        var timer = weapon.scene.time.addEvent({delay: 100, callback: createBlast, callbackScope: this, repeat: totalBlast - 1});

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}
















export class homingmissile {
    constructor() {
        this.id = 24
        this.type = 0
        this.name = 'Homing Missile'
        this.projectile = null
        this.logoCanvas = Logos.homingmissile
        this.particles = []
        this.canTurn = true
    }

    reset = () => {
        this.canTurn = true
        this.projectile = null
        this.particles = []
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 30
        canvas.width = 30

        // Wider missile body (bulkier than Heatseeker)
        ctx.fillStyle = 'rgba(220,80,20,1)'
        ctx.beginPath()
        ctx.moveTo(3, 13)
        ctx.lineTo(16, 12)
        ctx.arc(canvas.width/2, canvas.height/2, 3, -Math.PI/2, Math.PI/2)
        ctx.lineTo(3, 17)
        ctx.closePath()
        ctx.fill()

        // Larger tail fins (red-orange)
        ctx.fillStyle = 'rgba(200,40,0,1)'
        ctx.beginPath()
        ctx.moveTo(3, 13)
        ctx.lineTo(11, 13)
        ctx.lineTo(3, 7)
        ctx.closePath()
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(3, 17)
        ctx.lineTo(11, 17)
        ctx.lineTo(3, 23)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        // Exhaust plume -- dense smoke particles trailing behind
        if (this.projectile.body !== undefined) {
            for (var e = 0; e < 3; e++) {
                weapon.spawnParticle(
                    this.projectile.body.x + (Math.random() - 0.5) * 4,
                    this.projectile.body.y + (Math.random() - 0.5) * 4,
                    Math.random() > 0.5 ? 0xAAAAAA : 0x888888,
                    1.2 + Math.random() * 0.8,
                    800 + Math.random() * 400,
                    { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 }
                )
            }
        }
        weapon.defaultUpdate(this.projectile)
        this.checkAboveTank(weapon)
    }

    checkAboveTank = (weapon) => {
        if (this.projectile.body === undefined) return
        var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
        if (Phaser.Math.Distance.Between(oppTank.centre.x, oppTank.centre.y, this.projectile.body.x, this.projectile.body.y) < 400) {
            if (Math.abs(oppTank.centre.x - this.projectile.body.x) < 10 && this.canTurn) {
                this.canTurn = false
                weapon.scene.sound.play('homing')
                this.projectile.body.velocity.setAngle(Math.PI/2)
                // Stall-and-drop visual: burst of exhaust at stall point
                weapon.spawnBurstEffect(this.projectile.body.x, this.projectile.body.y, 12, 0xCCCCCC, 15, 1.5, 600)
            }
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(20,0,100,0.8)'}, {relativePosition: 0.3, color: 'rgba(50,20,150,1)'}, {relativePosition: 0.6, color: 'rgba(100,80,180,1)'}, {relativePosition: 0.9, color: 'rgba(170,170,220,1)'}, {relativePosition: 1, color: 'rgba(200,200,255,1)'}]
        var data = {thickness: 16, gradient: grd, blowPower: 80, soundEffect: 'expmedium', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 80 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 80, 60/80)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
    }
}

















export class dirtball {
    constructor() {
        this.id = 25
        this.type = 0
        this.name = 'Dirtball'
        this.projectile = null
        this.logoCanvas = Logos.dirtball
        this.groundHit = false
        this.r = 70
        this.blastTween = null
        this.fixTerrainTween = null
        this._dustFrame = 0
    }

    reset = () => {
        this.blastTween = null
        this.fixTerrainTween = null
        this.projectile = null
        this.groundHit = false
        this._dustFrame = 0
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 20
        canvas.width = 80

        // Main dirt body — lumpy brown sphere
        ctx.fillStyle = 'rgba(140,90,40,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3, 0, Math.PI * 2)
        ctx.fill()
        // Lumps for irregular shape
        ctx.fillStyle = 'rgba(120,75,30,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 1.5, canvas.height/2 - 1, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(160,110,50,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 - 1, canvas.height/2 + 1.5, 2, 0, Math.PI * 2)
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.groundHit === false) {
            weapon.updateTail(this.projectile, 15, 5, 4, {r: 140, g: 90, b: 40})
            weapon.defaultUpdate(this.projectile)
            this._dustFrame++
            if (this._dustFrame % 3 === 0) {
                weapon.spawnParticle(
                    this.projectile.body.x,
                    this.projectile.body.y,
                    0x8C5A28, 0.8, 600,
                    { x: (Math.random() - 0.5) * 5, y: 3 + Math.random() * 5 }
                )
            }
        }
        else {
            this.blastTween.update()
            if (this.fixTerrainTween !== null) {
                this.fixTerrainTween.update()
            }
        }
    }

    onTerrainHit = (weapon, obj) => {
        this.groundHit = true

        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj, true)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
       //
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj, blowTank = false) => {
        var x, y;
        var vec = new Phaser.Math.Vector2(1,1)
        var dist = {currentLength: 0}
        var points = {}
        var highPoints = {}
        var lowPoints = {}
        var pixel;
        const projX = Math.floor(this.projectile.body.x)
        const projY = Math.floor(this.projectile.body.y)

        var ctx = weapon.terrain.getContext()
        ctx.globalCompositeOperation = "destination-over"

        var soundEffects = ['rocks_1', 'rocks_2', 'rocks_3', 'rocks_4', 'rocks_5', 'rocks_6']
        var soundEffectIndex = 0
        
        this.blastTween = new Tween({
            targets: [dist],
            frames: 90,
            props: [{key: 'currentLength', value: this.r}],
            onUpdate: () => {
                vec.setLength(dist.currentLength)
                for (let angle = 0; angle < 2*Math.PI; angle = angle + 0.03) {
                    vec.setAngle(angle);
                    x = Math.floor(projX + vec.x)
                    y = Math.floor(projY + vec.y)
                    if (x < 0 || x > weapon.terrain.width - 1) continue
                    if (y < 0 || y > weapon.terrain.height - 1) continue
                    if (weapon.terrain.getPixel(x, y).alpha < 100) {
                        weapon.terrain.setPixel(x, y, 180, 100, 50, 110 + 2*dist.currentLength)
                        if (points.hasOwnProperty(x)) {
                            points[x].push(y)
                        }
                        else {
                            points[x] = [y]
                        }
                        if (highPoints.hasOwnProperty(x)) {
                            if (highPoints[x] > y) {
                                highPoints[x] = y
                            }
                        }
                        else {
                            highPoints[x] = y
                        }
                        if (lowPoints.hasOwnProperty(x)) {
                            if (lowPoints[x] < y) {
                                lowPoints[x] = y
                            }
                        }
                        else {
                            lowPoints[x] = y
                        }
                    }
                }
                for (let i = 0; i < soundEffects.length; i++) {
                    const e = soundEffects[i];
                    var res = weapon.scene.sound.get(e)
                    if (res !== null) break
                    if (i === soundEffects.length - 1) {
                        weapon.scene.sound.play(soundEffects[soundEffectIndex])
                        soundEffectIndex++
                        if (soundEffectIndex >= soundEffects.length) {
                            soundEffectIndex = 0
                        }
                    }
                }
            },
            onComplete: () => {
                var canvas = document.createElement('canvas');
                canvas.width = this.r * 2;
                canvas.height = this.r * 2;
                weapon.terrain.update()

                //console.log(points.length)

                this.startFixTerrainTween(weapon, points, highPoints, lowPoints)

                // for (var i in points) {
                //     //console.log(lowPoints[i], highPoints[i])
                //     weapon.terrain.setPixel(i, lowPoints[i], 255,0,0,255)
                //     weapon.terrain.setPixel(i, highPoints[i], 255,255,0,255)
                // }
                
            }
        })

        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
    }

    startFixTerrainTween = (weapon, points, highPoints, lowPoints) => {
        var soundEffects = ['rocks_1', 'rocks_2', 'rocks_3', 'rocks_4', 'rocks_5', 'rocks_6']
        var soundEffectIndex = 0
        var pixel;

        this.fixTerrainTween = new Tween({
            targets: [],
            frames: 1,
            loop: -1,
            onLoop: () => {
                var toDelete = []

                for (var x in points) {
                    pixel = weapon.terrain.getPixel(x, lowPoints[x] + 1)
                    while (lowPoints[x] - highPoints[x] >= 0) {
                        if (pixel.alpha < 100) {
                            break;
                        }
                        lowPoints[x] = lowPoints[x] - 1
                        pixel = weapon.terrain.getPixel(x, lowPoints[x] + 1)
                    }

                    if (lowPoints[x] - highPoints[x] >= 0) {
                        var data = weapon.terrain.context.getImageData(x, highPoints[x], 1, lowPoints[x] - highPoints[x] + 1)
                        weapon.terrain.context.putImageData(data, x, highPoints[x] + 1)
                        weapon.terrain.setPixel(x, highPoints[x], 0, 0, 0, 0)
                        highPoints[x] = highPoints[x] + 1
                        lowPoints[x] = lowPoints[x] + 1
                    }
                    else {
                        toDelete.push(x)
                    }
                }

                toDelete.forEach((x) => {
                    delete points[x]
                })

                weapon.terrain.update()

                for (let i = 0; i < soundEffects.length; i++) {
                    const e = soundEffects[i];
                    var res = weapon.scene.sound.get(e)
                    if (res !== null) break
                    if (i === soundEffects.length - 1) {
                        weapon.scene.sound.play(soundEffects[soundEffectIndex])
                        soundEffectIndex++
                        if (soundEffectIndex >= soundEffects.length) {
                            soundEffectIndex = 0
                        }
                    }
                }
            },
        })

        var myInterval = setInterval(() => {
            if (Object.keys(points).length === 0) {
                this.fixTerrainTween.destroy()
                weapon.turret.activeWeapon = null
                clearInterval(myInterval)
            }
        }, 500);
    }
}















export class tommygun {
    constructor() {
        this.id = 26
        this.type = 0
        this.name = 'Tommy Gun'
        this.particles = []
        this.particleCount = 12
        this.logoCanvas = Logos.tommygun
        this.allShot = false
    }

    reset = () => {
        this.allShot = false
        this.particles = []
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        for (let i = 0; i < this.particleCount; i++) {
            this.makeTexture(weapon, i)
        }
    }

    makeTexture = (weapon, index) => {
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 10
        canvas.width = 40

        // Alternating blue-white tracers with gold tint for prestige
        var isBlue = index % 2 === 0
        ctx.fillStyle = isBlue ? 'rgba(150,180,255,1)' : 'rgba(255,240,200,1)'
        ctx.fillRect(canvas.width/2 - 2, canvas.height/2 - 0.5, 4, 1)

        if (weapon.scene.textures.exists('projectile-' + index)) weapon.scene.textures.remove('projectile-' + index)
        weapon.scene.textures.addCanvas('projectile-' + index, canvas);
    }

    shoot = (weapon) => {
        const vOffset = [0, 12, -3, 4, -8, 6, 2, 0, -4, -13, 5, -1]
        const aOffset = [0, -3, 4, 6, -1, 0, 2, 5, -3.5, 4.5, -1.5, 2]
        var i = 0;

        var myInterval = setInterval(() => {
            var projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile-' + i)
            projectile.setDepth(3)
            projectile.bounceCount = 3
            projectile.canvas = projectile.texture.canvas
            projectile.index = i
            this.particles.push(projectile)
            weapon.scene.sound.play('rungun')
            weapon.spawnBurstEffect(weapon.turret.x + (weapon.turret.height/2) * Math.sin(weapon.turret.rotation), weapon.turret.y - (weapon.turret.height/2) * Math.cos(weapon.turret.rotation), 3, 0xFFEECC, 6, 0.5, 100)
            weapon.defaultShoot(projectile, weapon.tank.power * weapon.powerFactor + vOffset[i], undefined, undefined, weapon.tank.turret.rotation - Math.PI/2 + Phaser.Math.DegToRad(aOffset[i]))
            i++
            if (i === this.particleCount) {
                this.allShot = true
                clearInterval(myInterval)
            }
        }, 100);
    }

    update = (weapon) => {
        this.particles.forEach(obj => {
            var c = obj.index % 2 === 0 ? {r: 150, g: 180, b: 255} : {r: 255, g: 240, b: 200}
            weapon.updateTail(obj, 24, 3, 1, c)
        })
        this.particles.forEach(obj => {
            weapon.defaultUpdate(obj)
        })
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y
            this.blast(weapon, obj)
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, obj)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.particles = this.particles.filter((ele) => { return ele.index !== obj.index })
        if (this.particles.length === 0 && this.allShot) {
            weapon.turret.activeWeapon = null
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, obj) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.01, color: 'rgba(50,50,150,1)'}, {relativePosition: 0.6, color: 'rgba(50,50,255,1)'}, {relativePosition: 0.7, color: 'rgba(230,240,255,1)'}, {relativePosition: 1, color: 'rgba(230,240,255,1)'}]
        var data = {thickness: 12, gradient: grd, blowPower: 30, soundEffect: 'expshort2', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 16 - weapon.tank.hitRadius, data, true, this.id.toString())
        weapon.defaultUpdateScore(obj.body.x, obj.body.y, 16, 20/16)
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        this.particles = this.particles.filter((ele) => { return ele.index !== obj.index })
        if (this.particles.length === 0 && this.allShot === true) {
            weapon.turret.activeWeapon = null
        }
    }
}












export class mountainmover {
    constructor() {
        this.id = 27
        this.type = 2
        this.name = 'Mountain Mover'
        this.logoCanvas = Logos.mountainmover
    }

    reset = () => {
        this.projectile = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        
        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);
        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.canvas = canvas
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile, 0, 0, undefined, undefined)
        this.projectile.y = Math.min(this.projectile.y, weapon.terrain.height - 1)
        this.projectile.body.x = this.projectile.x
        this.projectile.body.y = this.projectile.y
        this.blast(weapon)
    }

    update = (weapon) => {
        
    }

    onTerrainHit = (weapon, obj) => {
        
    }

    onBaseHit = (weapon, obj) => {
        //this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        //this.blast(weapon)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon) => {
        var grd1 = [{relativePosition: 0, color: 'rgba(100,100,100,1)'}, {relativePosition: 0.5, color: 'rgba(200,200,200,1)'}, {relativePosition: 1, color: 'rgba(250,250,250,1)'}]
        //var grd = []
        //grd.concat(grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1)
        var circles = [grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1, grd1]
        var data = {thickness: 10, circles: circles, soundEffect: 'explong', soundConfig: {}}
        weapon.terrain.blast(3, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 160, data, false, this.id.toString())
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
        // setTimeout(() => {
        // }, 1000);
    }
}












export class scattershot {
    constructor() {
        this.id = 28
        this.type = 0
        this.name = 'Scatter Shot'
        this.particles = []
        this.destroyed = false
        this.projectile = null
        this.maxParticles = 5
        this.logoCanvas = Logos.scattershot
    }

    reset = () => {
        this.particles = []
        this.destroyed = false
        this.projectile = null
    }

    /**
    * @param {Weapon} weapon 
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')
        
        canvas.height = 20
        canvas.width = 80

        ctx.fillStyle = 'rgba(255,0,100,1)'
        ctx.globalAlpha = 1.0
        
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);
        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.canvas = canvas
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 3
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.destroyed === false) {
            weapon.updateTail(this.projectile, 20, 4, 4, {r: 255, g: 0, b: 100})
            weapon.defaultUpdate(this.projectile)
        }
        if (this.destroyed === true) {
            this.particles.forEach((particle) => {
                weapon.updateTail(particle, 30, 4, 2, {r: 255, g: 0, b: 100})
                weapon.defaultUpdate(particle)
            })
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false

        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)

        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }
        
        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            obj.body.x = x
            obj.body.y = y

            if (this.destroyed === false) {
                this.dissociate(weapon)
                weapon.scene.textures.remove('projectile')
                obj.destroy(true)
                this.destroyed = true
            }
            else {
                this.blast(weapon, obj, true)
            }
        }
    }

    onBaseHit = (weapon, obj) => {
        if (!this.destroyed) {
            this.onTerrainHit(weapon, obj)
        }
        else {
            this.onTerrainHit(weapon, obj)
        }
    }

    onTankHit = (weapon, obj, tank) => {
        if (!this.destroyed) {
            var x = this.projectile.body.x
            var y = this.projectile.body.y
            //this.projectile.body.stop()
            //this.projectile.body.y = Math.min(y, weapon.terrain.height - 1)
            
            this.dissociate(weapon)
            this.destroyed = true
            this.projectile.destroy(true)
            weapon.scene.textures.remove('projectile')
        }
        else {
            this.blast(weapon, obj, true)
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    /**
    * @param {Weapon} weapon 
    */
    dissociate = (weapon) => {
        weapon.scene.sound.play('split')
        for (let index = 0; index < this.maxParticles; index++) {            
            var canvas = document.createElement('canvas')
            var ctx = canvas.getContext('2d')

            canvas.height = 10
            canvas.width = 20

            ctx.fillStyle = 'rgba(255,0,100,1)'
            ctx.globalAlpha = 1.0
            
            ctx.beginPath()
            ctx.arc(canvas.width/2, canvas.height/2, 1, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
            
            if (weapon.scene.textures.exists('projectile-' + index)) weapon.scene.textures.remove('projectile-' + index)
            weapon.scene.textures.addCanvas('projectile-' + index, canvas);
            
            var particle = weapon.scene.physics.add.sprite(this.projectile.body.x, this.projectile.body.y, 'projectile-' + index)
            particle.canvas = canvas
            particle.index = index
            particle.setDepth(3)
            particle.bounceCount = 3
            this.particles.push(particle)

            var spreadAngle = Math.PI/6
            var angle = - (spreadAngle/2) - Math.PI/2
            var delta = spreadAngle / (this.maxParticles - 1)
            weapon.defaultShoot(particle, 250, 300, {x: this.projectile.body.x, y: this.projectile.body.y}, angle + index * delta)

        }
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        if (obj === this.projectile) {
            weapon.turret.activeWeapon = null
        }
        else {
            this.particles = this.particles.filter((ele) => {
                return (ele.index !== obj.index) 
            })
            
            if (this.particles.length === 0) {
                weapon.turret.activeWeapon = null
            }
        }
    }

    blast = (weapon, obj, blowTank) => {
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.1, color: 'rgba(50,0,0,0)'}, {relativePosition: 0.4, color: 'rgba(100,0,0,1)'}, {relativePosition: 1, color: 'rgba(255,0,0,1)'}]
        var data = {thickness: 14, gradient: grd, blowPower: 30, soundEffect: 'expshort', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(obj.body.x), Math.floor(obj.body.y), 36, data, true, this.id.toString())
        weapon.defaultUpdateScore(obj.body.x, obj.body.y, 36, 10/36)
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key);
        this.particles = this.particles.filter((ele) => {
            return (ele.index !== obj.index) 
        })
        
        if (this.particles.length === 0) {
            weapon.turret.activeWeapon = null
        }
    }
}














export class cruiser {
    constructor() {
        this.id = 29
        this.type = 0
        this.name = 'Cruiser'
        this.projectile = null
        this.logoCanvas = Logos.cruiser
        this.rolling = false
        this.rollingRight = false
        this.destroyed = false
        this.tail = null
        this.blastTween = null
    }

    reset = () => {
        this.projectile = null
        this.rolling = false
        this.rollingRight = false
        this.destroyed = false
        this.tail = null
        this.blastTween = null
        this._rollFrame = 0
    }

    /**
    * @param {Weapon} weapon
    */
    create = (weapon) => {
        this.reset()
        var canvas = document.createElement('canvas')
        var ctx = canvas.getContext('2d')

        canvas.height = 20
        canvas.width = 80

        // Metallic silver projectile
        var g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, 4)
        g.addColorStop(0, 'rgba(255,255,255,1)')
        g.addColorStop(0.5, 'rgba(200,210,220,1)')
        g.addColorStop(1, 'rgba(150,160,170,1)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(canvas.width/2, canvas.height/2, 3.5, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        if (weapon.scene.textures.exists('projectile')) weapon.scene.textures.remove('projectile')
        weapon.scene.textures.addCanvas('projectile', canvas);

        this.projectile = weapon.scene.physics.add.sprite(0, 0, 'projectile')
        this.projectile.setDepth(3)
        this.projectile.bounceCount = 0
        this.projectile.canvas = canvas
    }

    shoot = (weapon) => {
        weapon.defaultShoot(this.projectile)
        weapon.scene.sound.play('launch', {volume: 0.5})
    }

    update = (weapon) => {
        if (this.rolling === false) {
            weapon.updateTail(this.projectile, 12, 5, 5, {r: 200, g: 210, b: 220}, true)
            weapon.defaultUpdate(this.projectile)
        }
        else {
            this.roll(weapon)
            this.blastTween.update()
        }
    }

    onTerrainHit = (weapon, obj) => {
        var bounce = false
        
        var [x, y, prevX, prevY] = weapon.retractInTerrain(obj)
        
        for (let tempX = prevX - 1; tempX <= prevX + 1; tempX++) {
            for (let tempY = prevY - 1; tempY <= prevY + 1; tempY++) {
                var pixel = weapon.terrain.getPixel(tempX, tempY)
                if (pixel.r === 230 && pixel.g === 0 && pixel.b === 230) {
                    bounce = true
                    break
                }
            }
            if (bounce) break
        }

        if (bounce && obj.bounceCount > 0) {
            this.onBounceHit(weapon, obj)
        }
        
        if (!bounce || obj.bounceCount <= 0) {
            y = Math.min(y, weapon.terrain.height - 1)
            if (this.projectile.body.velocity.x > 0) {
                this.rollingRight = true
            }
            obj.body.stop()
            obj.setGravity(0)
            obj.body.x = x
            obj.body.y = y

            if (weapon.terrain.getPixel(x, y).alpha !== 0) {
                this.blast(weapon, true)
            }
            else {
                this.rolling = true
                this.makeRollingTexture(weapon)
                
                this.blastTween = new Tween({
                    targets: [],
                    frames: 120,
                    onComplete: () => {
                        this.blast(weapon, true)
                    }
                })
            }
        }
    }

    onBaseHit = (weapon, obj) => {
        this.onTerrainHit(weapon, obj)
    }

    onTankHit = (weapon, obj, tank) => {
        this.blast(weapon, true)
    }

    onOutOfBound = (weapon, obj) => {
        obj.destroy(true)
        weapon.scene.textures.remove(obj.texture.key)
        weapon.turret.activeWeapon = null
        this.destroyed = true
        if (this.tail !== null) {
            this.tail.destroy(true)
        }
    }

    onBounceHit = (weapon, obj) => {
        obj.bounceCount--
        if (obj.bounceCount < 0) return
        weapon.defaultBounce(obj)
    }

    blast = (weapon, blowTank = false) => {
        if (this.destroyed === true) return
        this.destroyed = true
        this.projectile.body.y = Math.min(weapon.terrain.height - 1, this.projectile.body.y)
        var grd = [{relativePosition: 0, color: 'rgba(0,0,0,0)'}, {relativePosition: 0.1, color: 'rgba(50,0,0,20)'}, {relativePosition: 0.4, color: 'rgba(100,0,40,1)'}, {relativePosition: 1, color: 'rgba(255,0,100,1)'}]
        var data = {thickness: 16, gradient: grd, blowPower: 100, soundEffect: 'expshort', soundConfig: {}}
        weapon.terrain.blast(1, Math.floor(this.projectile.body.x), Math.floor(this.projectile.body.y), 80 - weapon.scene.tank1.hitRadius, data, blowTank, this.id.toString())
        weapon.defaultUpdateScore(this.projectile.body.x, this.projectile.body.y, 80, 80/80)
        this.projectile.destroy(true)
        weapon.scene.textures.remove('projectile')
        weapon.turret.activeWeapon = null
        if (this.tail !== null) {
            this.tail.destroy(true)
        }
    }

    roll = (weapon) => {
        var next, base, delta

        if (this.rollingRight && weapon.terrain.getRightGround(this.projectile.body.x, this.projectile.body.y) == null) {
            var base = weapon.terrain.getSurfaceUp(this.projectile.body.x, this.projectile.body.y)
            if (base !== null) {
                this.projectile.body.x = base.x
                this.projectile.body.y = base.y
            }
        }
        else if (weapon.terrain.getLeftGround(this.projectile.body.x, this.projectile.body.y) == null) {
            var base = weapon.terrain.getSurfaceUp(this.projectile.body.x, this.projectile.body.y)
            if (base !== null) {
                this.projectile.body.x = base.x
                this.projectile.body.y = base.y
            }
        }

        if (this.rollingRight === true) {
            next = weapon.terrain.getRightGround(this.projectile.body.x, this.projectile.body.y)
            delta = Math.PI/8
            if (next !== null) {
                this.projectile.body.x = next.x
                this.projectile.body.y = next.y
            }
        }
        else {
            next = weapon.terrain.getLeftGround(this.projectile.body.x, this.projectile.body.y)
            delta = -Math.PI/8
            if (next !== null) {
                this.projectile.body.x = next.x
                this.projectile.body.y = next.y
            }
        }

        this.tail.setPosition(this.projectile.body.x, this.projectile.body.y)
        var alpha = weapon.terrain.getSlope(this.projectile.body.x, this.projectile.body.y)
        var correction = (this.rollingRight === true) ? 0 : Math.PI
        this.tail.setRotation(alpha + correction)
        this.projectile.setRotation(this.projectile.rotation + delta)

        var circle = weapon.scene.add.circle(this.projectile.body.x, this.projectile.body.y, 2, 0xDDDDDD, 0.4)
        weapon.scene.tweens.add({
            targets: circle,
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 500,
            t: 1,
            onComplete: () => {
                circle.destroy(true)
            }
        })

        // Rolling sparks (every 3rd frame)
        if (this._rollFrame === undefined) this._rollFrame = 0
        this._rollFrame++
        if (this._rollFrame % 3 === 0) {
            weapon.spawnParticle(
                this.projectile.body.x, this.projectile.body.y,
                0xFFDD88, 0.8, 300,
                { x: (Math.random() - 0.5) * 6, y: -(2 + Math.random() * 4) }
            )
            weapon.spawnParticle(
                this.projectile.body.x, this.projectile.body.y,
                0xFFEEAA, 0.6, 200,
                { x: (Math.random() - 0.5) * 8, y: -(1 + Math.random() * 3) }
            )
        }

        var x = this.projectile.body.x
        var y = this.projectile.body.y
        if (x < 0 || x > weapon.scene.terrain.width - 1) {
            this.onOutOfBound(weapon, this.projectile)
        }
        
        var tank1 = weapon.scene.tank1
        var tank2 = weapon.scene.tank2
        var dist1 = Math.sqrt(Math.pow((tank1.x - x), 2) + Math.pow((tank1.y - y), 2)) 
        var dist2 = Math.sqrt(Math.pow((tank2.x - x), 2) + Math.pow((tank2.y - y), 2))
        
        if (dist1 < tank1.hitRadius) {
            y = Math.min(y, weapon.terrain.height - 1)
            this.projectile.body.y = y
            this.blast(weapon, true)
        }

        else if (dist2 < tank2.hitRadius) {
            y = Math.min(y, weapon.terrain.height - 1)
            this.projectile.body.y = y
            this.blast(weapon, true)
        }
    }

    makeRollingTexture = (weapon) => {
        var canvas = this.projectile.texture.canvas
        var ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = 'rgba(240,240,240,1)'
        ctx.beginPath()
        ctx.arc(canvas.width/2 + 2, canvas.height/2, 1.2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.arc(canvas.width/2 - 2, canvas.height/2, 1.2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()

        canvas = document.createElement('canvas')
        ctx = canvas.getContext('2d')
        canvas.width = 40
        canvas.height = 20

        var grd = ctx.createLinearGradient(canvas.width, canvas.height/2, 0, canvas.width/2)
        grd.addColorStop(0, 'rgba(240,240,240,1)')
        grd.addColorStop(1, 'rgba(240,240,240,0)')

        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.ellipse(canvas.width/2 - 8, canvas.height/2, 8, 2, 0, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
        
        if (weapon.scene.textures.exists('cruiser-tail')) weapon.scene.textures.remove('cruiser-tail')
        weapon.scene.textures.addCanvas('cruiser-tail', canvas)
        this.tail = weapon.scene.add.sprite(0, 0, 'cruiser-tail')
        this.tail.setVisible(false)
    }
}






