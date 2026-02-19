import Phaser from "phaser";
import { Turret } from "./Turret";
import { weaponArray } from "../weapons/array";


export class Weapon {
    
    /**
    * @param {Phaser.Scene} scene
    */

    constructor (scene, tank, id) {    
        if (id === null || id === undefined) id = 0

        this.scene = scene
        this.id = id
        this.tank = tank
        this.turret = this.tank.turret
        this.powerFactor = this.turret.powerFactor
        this.terrain = this.scene.terrain
        this.weaponHandler = weaponArray[this.id]
        this.allowUpdate = false
        
        this.create()

        setTimeout(() => {
            this.shoot()
            this.allowUpdate = true
        }, 500);
    }



    create = () => {
        this.weaponHandler.create(this)
    }



    shoot = () => {
        this.weaponHandler.shoot(this)
        this.update()
    }



    update = () => {
        if (this.allowUpdate)
            this.weaponHandler.update(this)
    }


    defaultShoot = (obj, v, g = 300, p, r) => {
        var velocity = v === undefined ? this.tank.power * this.powerFactor : v
        var gravity = g
        var rotation = r === undefined ? this.turret.rotation - Math.PI/2 : r

        if (p !== null && p !== undefined) {
            obj.setPosition(p.x, p.y)
        }
        else {
            obj.setPosition(this.turret.x + (this.turret.height/2) * Math.sin(this.turret.rotation), this.turret.y - (this.turret.height/2) * Math.cos(this.turret.rotation))
        }

        obj.setRotation(rotation)
        obj.setVelocity(velocity * Math.cos(rotation), velocity * Math.sin(rotation))
        obj.body.setGravityY(gravity)
        // Wind: horizontal acceleration matching server physics
        const wind = this.scene.wind || 0
        obj.body.setAccelerationX(wind)
        obj.setDepth(2)        
        //obj.body.prevCenter = new Phaser.Math.Vector2(obj.body.center.x, obj.body.center.y)
        
        //console.log(obj.body.prevCenter.x, obj.body.prevCenter.y)
        //obj.updateFromGameObject()
        obj.body.setSize(1,1)
        obj.body.preUpdate(false, 0)
        //obj.body.updateFromGameObject()
        //obj.body.center.x = obj.x
        //obj.body.center.y = obj.y
        //console.log(obj.body.center.x, obj.body.center.y)
    }



    defaultUpdate = (obj) => {
        var x = obj.body.x
        var y = obj.body.y

        //console.log('update pos', x, y, this.terrain.getPixel(x,y))
        //console.log('update vel', obj.body.velocity.x, obj.body.velocity.y)

        //this.terrain.setPixel(x,y, 255,255,255,255)
        
        var tank1 = this.tank
        var tank2 = (this.tank === this.scene.tank1) ? this.scene.tank2 : this.scene.tank1

        var hitTank1 = false
        var hitTank2 = false

        if (tank1.isPointInside(x, y)) {
            hitTank1 = true
        }
        if (tank2.isPointInside(x, y)) {
            hitTank2 = true
        }

        if (obj.body.velocity.x !== 0) {
            obj.setRotation(Math.atan(obj.body.velocity.y / obj.body.velocity.x))
    
            if (obj.body.velocity.x < 0) {
                obj.setRotation(obj.rotation + Math.PI)
            }
        }
        else {
            if (obj.body.velocity.y < 0) {
                obj.setRotation(-Math.PI/2)
            }
            if (obj.body.velocity.y > 0) {
                obj.setRotation(Math.PI/2)
            }
        }

        if (x <= 0 || x >= this.scene.terrain.width - 1) {
            this.weaponHandler.onOutOfBound(this, obj)
        }
        
        else if (y < 0) {

        }
        
        else if (y >= this.terrain.height) {
            this.weaponHandler.onBaseHit(this, obj)
        }
        
        else if (this.terrain.getPixel(x, y).alpha > 0) {
            this.weaponHandler.onTerrainHit(this, obj)
        }

        else if (hitTank1 === true) {
            this.weaponHandler.onTankHit(this, obj, tank1)
        }

        else if (hitTank2 === true) {
            this.weaponHandler.onTankHit(this, obj, tank2)
        }

        // else if (point.r === 230 && point.g === 0 && point.b === 230) {
        //     this.weaponHandler.onBounceHit(this, obj)
        // }


        // if (obj.body !== undefined) {
        //     obj.body.prevCenter.set(obj.body.center.x, obj.body.center.y)
        // }
    }



    updateTail = (obj, factor, minimum, thickness, color, taper) => {
        var tailLength = obj.body.speed / factor + minimum
        //var tailLength = new Phaser.Math.Vector2(obj.velX, obj.velY).length() / factor + minimum
        tailLength = Math.floor(tailLength)
    
        var centreX = obj.canvas.width/2
        var centreY = obj.canvas.height/2

        var ctx = obj.canvas.getContext('2d')
        
        var grd = ctx.createLinearGradient(obj.canvas.width/2, obj.canvas.height/2, obj.canvas.width/2 - tailLength,  obj.canvas.height/2)
        grd.addColorStop(0, `rgba(${color.r},${color.g},${color.b},1)`)
        grd.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`)
        ctx.fillStyle = grd

        ctx.clearRect(0, 0, centreX, obj.canvas.height)

        if (taper === false) {
            ctx.fillRect(centreX - tailLength, centreY - thickness/2, tailLength, thickness)
        }
        else {
            ctx.beginPath()
            ctx.moveTo(centreX - tailLength, centreY - thickness/2 + thickness/8)
            ctx.lineTo(centreX, centreY - thickness/2)
            ctx.lineTo(centreX, centreY + thickness/2)
            ctx.lineTo(centreX - tailLength, centreY + thickness/2 - thickness/8)
            ctx.closePath()
            ctx.fill()
        }
        //ctx.fillRect(0, 0, tailLength, thickness)
    }



    spawnParticle = (x, y, color, size = 1, lifetime = 500, velocity = {x: 0, y: 0}) => {
        var particle = this.scene.add.circle(x, y, size, color, 1)
        particle.setDepth(2)
        this.scene.tweens.add({
            targets: particle,
            x: particle.x + velocity.x,
            y: particle.y + velocity.y,
            alpha: 0,
            duration: lifetime,
            ease: 'Quad.easeOut',
            onComplete: () => { particle.destroy(true) }
        })
        return particle
    }



    spawnBurstEffect = (x, y, count = 8, color = 0xffffff, spread = 20, size = 1, lifetime = 400) => {
        for (let i = 0; i < count; i++) {
            var angle = Math.random() * Math.PI * 2
            var dist = Math.random() * spread
            this.spawnParticle(
                x + (Math.random() - 0.5) * 4,
                y + (Math.random() - 0.5) * 4,
                color, size, lifetime,
                { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist }
            )
        }
    }



    defaultUpdateScore = (x, y, blastRadius, factor) => {
        if (isNaN(factor)) return

        var tank1 = this.scene.tank1
        var tank2 = this.scene.tank2

        var hitTank1 = false
        var hitTank2 = false

        if (tank1.isPointInside(x, y)) {
            hitTank1 = true
        }
        if (tank2.isPointInside(x, y)) {
            hitTank2 = true
        }

        if (hitTank1 && tank1 === this.tank) {
            this.tank.updateScore(-Math.floor(blastRadius * factor))
        }
        else if (hitTank1 && tank1 !== this.tank) {
            this.tank.updateScore(Math.ceil(blastRadius * factor))
        }
        if (hitTank2 && tank2 === this.tank) {
            this.tank.updateScore(-Math.floor(blastRadius * factor))
        }
        else if (hitTank2 && tank2 !== this.tank) {
            this.tank.updateScore(Math.ceil(blastRadius * factor))
        }

        if (hitTank1 || hitTank2) return

        var dist1 = Phaser.Math.Distance.Between(x, y, this.scene.tank1.centre.x, this.scene.tank1.centre.y)
        var dist2 = Phaser.Math.Distance.Between(x, y, this.scene.tank2.centre.x, this.scene.tank2.centre.y)

        if (tank1 === this.tank) {
            var pointReduce = dist1 - blastRadius > 0 ? 0 : Math.ceil((blastRadius - dist1) * factor)
            var pointIncrease = dist2 - blastRadius > 0 ? 0 : Math.ceil((blastRadius - dist2) * factor)
            
            this.tank.updateScore(pointIncrease)
            this.tank.updateScore(-pointReduce)
        }
        else if (tank2 === this.tank) {
            var pointReduce = dist2 - blastRadius > 0 ? 0 : Math.ceil((blastRadius - dist2) * factor)
            var pointIncrease = dist1 - blastRadius > 0 ? 0 : Math.ceil((blastRadius - dist1) * factor)

            this.tank.updateScore(pointIncrease)
            this.tank.updateScore(-pointReduce)
        }
    }

    
    
    constantUpdateScore = (points) => {
        if (isNaN(points)) return
            this.tank.updateScore(points)
    }



    defaultDigTerrain = (obj, thickness, intensity) => {
        if (obj.prevState !== null && obj.prevState !== undefined) {
            if (this.terrain.getPixel(obj.prevState.x, obj.prevState.y).alpha === 0 && this.terrain.getPixel(obj.body.x, obj.body.y).alpha === 0) {
                obj.prevState.x = obj.body.x
                obj.prevState.y = obj.body.y
                return
            }

            var x = obj.prevState.x, y = obj.prevState.y;
            if (this.terrain.getPixel(x, y).alpha === 0) {
                while (this.terrain.getPixel(x, y).alpha === 0) {
                    x = obj.prevState.x = obj.prevState.x + Math.cos(obj.rotation)
                    y = obj.prevState.y = obj.prevState.y + Math.sin(obj.rotation)
                }
            }
            if (this.terrain.getPixel(obj.prevState.x, obj.prevState.y).alpha === 0) {
                while (this.terrain.getPixel(x, y).alpha !== 0) {
                    x = obj.prevState.x = obj.prevState.x + Math.cos(obj.rotation)
                    y = obj.prevState.y = obj.prevState.y + Math.sin(obj.rotation)
                }
            }

            var ctx = this.terrain.getContext()

            ctx.globalCompositeOperation = 'source-atop'
            ctx.lineJoin = 'round'
            ctx.strokeStyle = `rgba(0,0,0,${intensity})`
            ctx.lineCap = 'round'
            ctx.globalAlpha = 1
            ctx.lineWidth = thickness

            ctx.beginPath()
            ctx.moveTo(obj.prevState.x, obj.prevState.y)
            ctx.lineTo(obj.body.x, obj.body.y)
            ctx.stroke()

            obj.prevState.x = obj.body.x
            obj.prevState.y = obj.body.y
        }

        else {
            obj.prevState = {x: obj.body.x, y: obj.body.y}
        }
    }



    defaultBounce = (obj, factor = 0.6, speed) => {
        var rotation = 0

        if (obj.body.speed === 0) {
            return false
        }

        //console.log('bounce pos', obj.body.center.x, obj.body.center.y)
        //console.log('bounce velocity', obj.body.velocity.x, obj.body.velocity.y)

        if (this.terrain.getPixel(obj.body.prev.x, obj.body.prev.y).alpha > 0) {
            //console.log('bounce inside terrain', obj.body.prev.x, obj.body.prev.y)
            obj.setPosition(obj.body.prev.x, obj.body.prev.y)
            obj.body.updateFromGameObject()
            return false
        }

        var rotation = obj.body.velocity.angle()

        if (this.terrain.getPixel(x, y).alpha !== 0) {
            var [x, y, prevX, prevY] = this.retractInTerrain(obj)
            //obj.setPosition(x,y)
            //obj.body.updateFromGameObject()
            obj.body.x = x
            obj.body.y = y
        
            var slope = this.terrain.getSlope(prevX, prevY)
            if (isNaN(slope) === true) {
                if (obj.body.velocity.x > 0) {
                    slope = -Math.PI/2
                }
                else {
                    slope = Math.PI/2
                }
            }

            //var perpendicular = slope - Math.PI/2
            //var alpha = perpendicular - rotation
            var diff = rotation - slope
            var reflect = slope - diff
            var newSpeed = speed ? speed : obj.body.speed * factor

            obj.body.velocity.setAngle(reflect)
            obj.body.velocity.setLength(newSpeed)
            obj.body.preUpdate(false, 0)
            //obj.body.updateFromGameObject()
            //obj.body.updateFromGameObject()

            //console.log('bounce---velocity', obj.body.velocity.x, obj.body.velocity.y)
            //console.log('bounce---pos', obj.body.center.x, obj.body.center.y)
            //console.log('bounce---', this.terrain.getPixel(obj.body.center.x, obj.body.center.y))
            //console.log(reflect)

            return true
        }

        return false
    }




    retractInTerrain = (obj) => {
        var x = obj.body.x
        var y = obj.body.y

        //console.log('retract pos', x, y)

        if (obj.body.speed === 0) {
            return [x, y, x, y]
        }

        if (this.terrain.getPixel(obj.body.prev.x, obj.body.prev.y).alpha > 0) {
            //console.log('prev inside terrain', obj.body.prev.x, obj.body.prev.y)
            return [obj.body.prev.x, obj.body.prev.y, obj.body.prev.x, obj.body.prev.y]
        }

        var prevX = x, prevY = y;
        var initX = x, initY = y;
        var maxCount = 100000
        var theta = obj.body.velocity.angle()
        // var theta = Phaser.Math.Angle.Wrap(new Phaser.Math.Vector2(obj.velX, obj.velY).angle() + Math.PI)
        var sin = Math.sin(theta)
        var cos = Math.cos(theta)

        var accelarationX = obj.body.gravity.x
        var accelarationY = obj.body.gravity.y

        var t = 0.0001
        var v = obj.body.speed
        // var v = new Phaser.Math.Vector2(obj.velX, obj.velY).length()

        while (this.terrain.getPixel(x, y).alpha !== 0) {
            prevX = x
            prevY = y

            x = initX - (v * cos + 1/2 * accelarationX * t) * t
            y = initY - (v * sin + 1/2 * accelarationY * t) * t

            t = t + 0.0001

            //this.terrain.setPixel(prevX,prevY,255,0,0,255)

            maxCount--
            if (maxCount <= 0) {
                x = initX
                y = initY
                break
            }
        }

        //console.log('retract----pos', x, y)
        //console.log('retract----', this.terrain.getPixel(x,y))

        return [x, y, prevX, prevY]
    }



    retractBase = (obj) => {
        var x = obj.body.x
        var y = obj.body.y

        if (obj.body.speed === 0) {
            return [x, y, x, y]
        }

        var prevX = x, prevY = y;
        var initX = x, initY = y;
        var maxCount = 100000
        var theta = obj.body.velocity.angle()
        // var theta = Phaser.Math.Angle.Wrap(new Phaser.Math.Vector2(obj.velX, obj.velY).angle() + Math.PI)
        var sin = Math.sin(theta)
        var cos = Math.cos(theta)

        var accelarationX = obj.body.gravity.x
        var accelarationY = obj.body.gravity.y

        var t = 0.0001
        var v = obj.body.speed

        while (y >= this.terrain.height - 1) {
            prevX = x
            prevY = y

            x = initX - (v * cos + 1/2 * accelarationX * t) * t
            y = initY - (v * sin + 1/2 * accelarationY * t) * t

            t = t + 0.0001

            maxCount--
            if (maxCount <= 0) {
                x = initX
                y = initY
                break
            }
        }

        return [x, y, prevX, prevY]
    }



    retractInAir = (obj) => {
        var x = obj.body.x
        var y = obj.body.y

        if (obj.body.speed === 0) {
            return [x, y, x, y]
        }

        if (obj.body.position.equals(obj.body.prev)) {
            return [x, y, x, y]
        }

        var prevX = x, prevY = y;
        var initX = x, initY = y;
        var maxCount = 100000
        var theta = obj.body.velocity.angle()
        // var theta = Phaser.Math.Angle.Wrap(new Phaser.Math.Vector2(obj.velX, obj.velY).angle() + Math.PI)
        var sin = Math.sin(theta)
        var cos = Math.cos(theta)

        var accelarationX = obj.body.gravity.x
        var accelarationY = obj.body.gravity.y

        var t = 0.0001
        var v = obj.body.speed
        // var v = new Phaser.Math.Vector2(obj.velX, obj.velY).length()

        while (this.terrain.getPixel(x, y).alpha === 0) {
            prevX = x
            prevY = y

            x = initX - (v * cos + 1/2 * accelarationX * t) * t
            y = initY - (v * sin + 1/2 * accelarationY * t) * t

            t = t + 0.0001

            maxCount--
            if (maxCount <= 0) {
                x = initX
                y = initY
                break
            }
        }

        return [x, y, prevX, prevY]
    }



    checkCloseToTerrain = (obj, distance) => {
        var x = obj.body.x
        var y = obj.body.y

        var prevX = x, prevY = y;
        var initX = x, initY = y;
        var maxCount = distance
        var theta = obj.body.velocity.angle()
        var sin = Math.sin(theta)
        var cos = Math.cos(theta)

        var accelarationX = obj.body.gravity.x
        var accelarationY = obj.body.gravity.y

        var t = 0.01
        var v = 100

        while (this.terrain.getPixel(x, y).alpha === 0) {
            prevX = x
            prevY = y

            x = initX + (v * cos + 1/2 * accelarationX * t) * t
            y = initY + (v * sin + 1/2 * accelarationY * t) * t

            t = t + 0.01

            maxCount--
            if (maxCount <= 0) {
                return false
            }
        }

        if (x >= this.terrain.width - 1 || x <= 0) {
            return false
        }

        if (y <= 0) return false

        return true
    }




    fixCloseToTank = (obj, data) => {
        var myTank = this.tank
        var oppTank = (this.tank === this.scene.tank1) ? this.scene.tank2 : this.scene.tank1

        if (data.oppTankDist !== undefined) {
            var x = obj.body.x
            var y = obj.body.y
            var prevX = x, prevY = y;
            var initX = x, initY = y;
            var maxCount = 10000
            var theta = obj.body.velocity.angle()
            //var theta = Phaser.Math.Angle.Wrap(new Phaser.Math.Vector2(obj.velX, obj.velY).angle() + Math.PI)
            var sin = Math.sin(theta)
            var cos = Math.cos(theta)

            var accelarationX = obj.body.gravity.x
            var accelarationY = obj.body.gravity.y
 
            var t = 0.0001
            var v = obj.body.speed

            while (Phaser.Math.Distance.BetweenPoints(obj.body.x, obj.body.y, oppTank.centre.x, oppTank.centre.y) < data.oppTankDist) {
                prevX = x
                prevY = y

                x = initX - (v * cos + 1/2 * accelarationX * t) * t
                y = initY - (v * sin + 1/2 * accelarationY * t) * t
                t = t + 0.0001

                maxCount--
                if (maxCount <= 0) {
                    x = initX
                    y = initY
                    break
                }
            }

            //obj.setPosition(prevX, prevY)
            //obj.body.updateFromGameObject()
            obj.body.x = prevX
            obj.body.y = prevY
        }
    }



    setBodyCenter = (obj, x, y) => {
        //this.center.set(this.position.x + this.halfWidth, this.position.y + this.halfHeight);
        obj.body.position.set(x - obj.body.halfWidth, y - obj.body.halfHeight)
    }
}