import Phaser from "phaser"

export class Blast {
    /**
     * @param {Phaser.Scene} scene 
     * @param {number} animationType 
     * @param {number} x 
     * @param {number} y 
     * @param {number} radius
     * @param {boolean} blowTank
     * @param {string} blastType
     */
    constructor(scene, animationType, x, y, radius, data, blowTank, blastType) {
        this.animationType = animationType
        this.data = data
        this.scene = scene
        this.count = 0
        this.blastType = blastType

        this.terrain = scene.terrain
        this.maxRadius = Math.max(radius, 1)
        this.outerRadius = 0
        this.innerRadius = 0
        this.thickness = 0
        this.x = x
        this.y = y
        this.canvas = document.createElement('canvas')
        this.canvas.width = this.maxRadius * 2
        this.canvas.height = this.maxRadius * 2
        this.textureId = Math.random().toString(32).slice(2, 7)

        this.scene.textures.addCanvas(this.textureId, this.canvas)
        this.image = this.scene.add.image(this.x, this.y, this.textureId).setOrigin(0.5, 0.5).setDepth(3)

        this.gradient = null
        this.circles = []
        this.toRemove = false
        this.blowTank = blowTank
        // Visual-only mode: show expanding ring but don't dig terrain canvas.
        // Used for opponent blasts — applyHeightmap handles terrain authoritatively.
        this.visualOnly = !!data.visualOnly
        this.soundEffect = data.soundEffect
        this.soundConfig = data.soundConfig

        this.init()
    }


    init = () => {
        if (this.animationType === 1) {
            this.gradient = this.data.gradient
            this.thickness = this.data.thickness
            if (this.soundEffect) {
                this.scene.sound.play(this.soundEffect, this.soundConfig)
            }
        }
        if (this.animationType === 2) {
            this.circles = this.data.circles
            this.thickness = this.data.thickness
            if (this.soundEffect) {
                this.scene.sound.play(this.soundEffect, this.soundConfig)
            }
        }
        if (this.animationType === 3) {
            this.circles = this.data.circles
            this.thickness = this.data.thickness
            this.variableRadius = this.maxRadius
            if (this.soundEffect) {
                this.scene.sound.play(this.soundEffect, this.soundConfig)
            }
        }

        // SolShot: Camera shake on explosion — intensity scales with blast radius
        if (this.scene && this.scene.cameras && this.scene.cameras.main) {
            const intensity = Math.min(0.02, this.maxRadius / 3000)
            const duration = Math.min(300, 80 + this.maxRadius * 2)
            this.scene.cameras.main.shake(duration, intensity)
        }
    }


    update = () => {
        if (this.animationType === 1) {
            this.updateType1()
        }
        if (this.animationType === 2) {
            this.updateType2()
        }
        if (this.animationType === 3) {
            this.updateType3()
        }
    }




    updateType1 = () => {
        this.outerRadius++
        this.count++
        if (this.maxRadius > this.innerRadius) {
            this.animateHole1()
            if (this.blowTank === true) {
                var dist1 = Phaser.Math.Distance.Between(this.x, this.y, this.scene.tank1.centre.x, this.scene.tank1.centre.y)
                var dist2 = Phaser.Math.Distance.Between(this.x, this.y, this.scene.tank2.centre.x, this.scene.tank2.centre.y)
                
                var tank1 = this.scene.tank1
                var tank2 = this.scene.tank2

                var hitTank1 = false
                var hitTank2 = false

                if (tank1.isPointInside(this.x, this.y)) {
                    hitTank1 = true
                }
                if (tank2.isPointInside(this.x, this.y)) {
                    hitTank2 = true
                }

                if (hitTank1) dist1 = 0
                if (hitTank2) dist2 = 0
            }
            
            var angle = 0
            if (this.blowTank && this.innerRadius + this.thickness + this.scene.tank1.hitRadius > dist1) {
                if (this.scene.tank1.top.x === this.x) {
                    if (this.scene.tank1.top.y > this.y) angle = -Math.PI/2
                    else angle = Math.PI/2
                }
                else angle = Math.atan((this.scene.tank1.top.y - this.y) / (this.scene.tank1.top.x - this.x))
                angle = angle + ((this.scene.tank1.top.x - this.x) > 0 ? 0 : -Math.PI)
                this.scene.tank1.body.setVelocity(this.data.blowPower * Math.cos(angle), 2 * this.data.blowPower * Math.sin(angle))
                this.scene.tank1.body.setGravityY(300)
                this.scene.tank1.setPosition(this.scene.tank1.centre.x, this.scene.tank1.centre.y)
                this.scene.tank1.body.position.set(this.scene.tank1.centre.x, this.scene.tank1.centre.y)
                this.blowTank = false
            }
            if (this.blowTank && this.innerRadius + this.thickness + this.scene.tank2.hitRadius > dist2) {
                if (this.scene.tank2.top.x === this.x) {
                    if (this.scene.tank2.top.y > this.y) angle = -Math.PI/2
                    else angle = Math.PI/2
                }
                else angle = Math.atan((this.scene.tank2.top.y - this.y) / (this.scene.tank2.top.x - this.x))
                angle = angle + ((this.scene.tank2.top.x - this.x) > 0 ? 0 : -Math.PI)
                this.scene.tank2.body.setVelocity(this.data.blowPower * Math.cos(angle), 2 * this.data.blowPower * Math.sin(angle))
                this.scene.tank2.body.setGravityY(300)
                this.scene.tank2.setPosition(this.scene.tank2.centre.x, this.scene.tank2.centre.y)
                this.scene.tank2.body.position.set(this.scene.tank2.centre.x, this.scene.tank2.centre.y)
                this.blowTank = false
            }
        }
        else {
            this.innerRadius = this.maxRadius
            // Only run fixTerrain (gravity sim) for own-shot blasts.
            // For opponent blasts (visualOnly), applyHeightmap handles terrain.
            if (!this.visualOnly) {
                this.terrain.fixTerrain(this.x, this.y, this.maxRadius)
            }
            this.toRemove = true
            this.image.destroy(true)
            this.scene.textures.remove(this.textureId)
        }
    }


    animateHole1 = () => {
        // Only dig terrain when NOT visual-only.
        // For opponent blasts, applyHeightmap handles the crater authoritatively.
        if (!this.visualOnly) {
            var ctx = this.terrain.canvas.getContext('2d')
            ctx.globalCompositeOperation = 'destination-out'
            ctx.fillStyle = 'rgba(0,0,0,1)'
            ctx.beginPath()
            ctx.arc(this.x, this.y, Math.min(this.outerRadius, this.maxRadius), 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
            ctx.globalCompositeOperation = 'source-over'
        }

        var canvas = this.canvas
        var ctx2 = canvas.getContext('2d')
        this.innerRadius = Math.max(this.outerRadius - this.thickness, 0)
        ctx2.clearRect(0, 0, canvas.width, canvas.height)

        if (this.scene.blastCache.exists(this.blastType, this.outerRadius) === false) {
            ctx2.globalCompositeOperation = 'source-over'
    
            var grd = ctx2.createRadialGradient(this.maxRadius, this.maxRadius, this.innerRadius, this.maxRadius, this.maxRadius, this.outerRadius)
    
            this.gradient.forEach((ele) => {
                grd.addColorStop(ele.relativePosition, ele.color)
            });
            
            ctx2.fillStyle = grd
            ctx2.beginPath()
            ctx2.arc(this.maxRadius, this.maxRadius, this.outerRadius, 0, Math.PI * 2)
            ctx2.closePath()
            ctx2.fill()
            
            ctx2.globalCompositeOperation = 'destination-in'
    
            ctx2.fillStyle = 'rgba(0,0,0,1)'
            
            ctx2.beginPath()
            ctx2.arc(this.maxRadius, this.maxRadius, this.maxRadius, 0, Math.PI * 2)
            ctx2.closePath()
            ctx2.fill()

            this.scene.blastCache.addCanvas(this.blastType, this.outerRadius, canvas)
        }
        else {
            ctx2.drawImage(this.scene.blastCache.getCanvas(this.blastType, this.outerRadius), 0, 0)
        }

        // Refresh the Phaser texture so the updated canvas renders on screen
        var tex = this.scene.textures.get(this.textureId)
        if (tex && tex.update) tex.update()
    }





    updateType2 = () => {
        this.outerRadius++
        if (this.maxRadius > this.innerRadius) {
            this.animateHole2()
        }
        else {
            this.innerRadius = this.maxRadius
            if (!this.visualOnly) {
                this.terrain.fixTerrain(this.x, this.y, this.maxRadius)
            }
            this.toRemove = true
            this.image.destroy(true)
            this.scene.textures.remove(this.textureId)
        }
    }


    animateHole2 = () => {
        if (!this.visualOnly) {
            var ctx = this.terrain.canvas.getContext('2d')
            ctx.globalCompositeOperation = 'destination-out'
            ctx.fillStyle = 'rgba(0,0,0,1)'
            ctx.beginPath()
            ctx.arc(this.x, this.y, Math.min(this.outerRadius, this.maxRadius), 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
            ctx.globalCompositeOperation = 'source-over'
        }

        var canvas = this.canvas
        var ctx2 = canvas.getContext('2d')

        ctx2.clearRect(0, 0, canvas.width, canvas.height)
        
        if (this.scene.blastCache.exists(this.blastType, this.outerRadius) === false) {
            ctx2.globalCompositeOperation = 'source-over'
            
            for (var i = 0; i < this.circles.length; i++) {
                this.innerRadius = Math.max(this.outerRadius - this.thickness * (i + 1), 0)
                var grd = ctx2.createRadialGradient(this.maxRadius, this.maxRadius, this.innerRadius, this.maxRadius, this.maxRadius, Math.min(this.outerRadius, this.innerRadius + this.thickness))
                var gradient = this.circles[i]
                
                gradient.forEach((ele) => {
                    grd.addColorStop(ele.relativePosition, ele.color)
                });
                
                ctx2.fillStyle = grd
                ctx2.beginPath()
                ctx2.arc(this.maxRadius, this.maxRadius, Math.min(this.maxRadius, this.outerRadius, this.innerRadius + this.thickness), 0, Math.PI * 2)
                ctx2.closePath()
                ctx2.fill()
                
                if (this.innerRadius === 0) {
                    break
                }
            }
    
            ctx2.globalCompositeOperation = 'destination-in'
            ctx2.fillStyle = 'rgba(0,0,0,1)'
            
            ctx2.beginPath()
            ctx2.arc(this.maxRadius, this.maxRadius, this.maxRadius, 0, Math.PI * 2)
            ctx2.closePath()
            ctx2.fill()

            ctx2.globalCompositeOperation = 'destination-out'
            ctx2.fillStyle = 'rgba(0,0,0,1)'
            
            ctx2.beginPath()
            ctx2.arc(this.maxRadius, this.maxRadius, Math.max(this.innerRadius + 1, 0), 0, Math.PI * 2)
            ctx2.closePath()
            ctx2.fill()

            this.scene.blastCache.addCanvas(this.blastType, this.outerRadius, canvas)
        }
        else { 
            ctx2.drawImage(this.scene.blastCache.getCanvas(this.blastType, this.outerRadius), 0, 0)
        }

    }


    updateType3 = () => {
        this.outerRadius++
        if (this.outerRadius < 2*this.maxRadius) {
            this.animateHole3()
        }

        else {
            this.innerRadius = this.maxRadius
            if (!this.visualOnly) {
                this.terrain.fixTerrain(this.x, this.y, this.maxRadius)
            }
            this.toRemove = true
            this.image.destroy(true)
            this.scene.textures.remove(this.textureId)
        }
    }


    animateHole3 = () => {
        if (!this.visualOnly) {
            var ctx = this.terrain.canvas.getContext('2d')
            ctx.globalCompositeOperation = 'destination-out'
            ctx.fillStyle = 'rgba(0,0,0,1)'
            ctx.beginPath()
            ctx.arc(this.x, this.y, Math.min(this.outerRadius, this.maxRadius), 0, Math.PI * 2)
            ctx.closePath()
            ctx.fill()
            ctx.globalCompositeOperation = 'source-over'
        }

        var canvas = this.canvas
        var ctx2 = canvas.getContext('2d')

        ctx2.clearRect(0, 0 , canvas.width, canvas.height)
        
        if (this.scene.blastCache.exists(this.blastType, this.outerRadius) === false) {
            ctx2.globalCompositeOperation = 'source-over'
    
            for (var i = 0; i < this.circles.length; i++) {
                this.innerRadius = Math.max(this.outerRadius - this.thickness * (i + 1), 0)
        
                var grd = ctx2.createRadialGradient(this.maxRadius, this.maxRadius, this.innerRadius, this.maxRadius, this.maxRadius, Math.min(this.outerRadius, this.innerRadius + this.thickness))
                var gradient = this.circles[i]
    
                gradient.forEach((ele) => {
                    grd.addColorStop(ele.relativePosition, ele.color)
                });
          
                ctx2.fillStyle = grd
                ctx2.beginPath()
                ctx2.arc(this.maxRadius, this.maxRadius, Math.min(this.maxRadius, this.outerRadius, this.innerRadius + this.thickness), 0, Math.PI * 2)
                ctx2.closePath()
                ctx2.fill()
    
                if (this.innerRadius === 0) {
                    break
                }
            }
       
            ctx2.globalCompositeOperation = 'destination-in'
    
            ctx2.fillStyle = 'rgba(0,0,0,1)'
            
            ctx2.beginPath()
            ctx2.arc(this.maxRadius, this.maxRadius, Math.max(this.variableRadius, 0), 0, Math.PI * 2)
            ctx2.closePath()
            ctx2.fill()
    
            ctx2.globalCompositeOperation = 'destination-out'
    
            ctx2.fillStyle = 'rgba(0,0,0,1)'
            
            ctx2.beginPath()
            ctx2.arc(this.maxRadius, this.maxRadius, Math.max(this.innerRadius + 1, 0), 0, Math.PI * 2)
            ctx2.closePath()
            ctx2.fill()

            this.scene.blastCache.addCanvas(this.blastType, this.outerRadius, canvas)
        }
        else {
            ctx2.drawImage(this.scene.blastCache.getCanvas(this.blastType, this.outerRadius), 0, 0)
        }

        if (this.outerRadius >= this.maxRadius) {
            this.variableRadius--
        }
    }
}