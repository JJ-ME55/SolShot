import { Textures } from "phaser";
import { drawTerrain, setTerrain } from "../graphics/terrain";
import { Blast } from "./Blast";
import { Tank } from "./Tank";
import Phaser from "phaser";
import { weaponArray } from "../weapons/array";

export class Terrain extends Textures.CanvasTexture {
    /**
    * @param {Phaser.Scene} scene
    */
    constructor (scene) {
        var width = scene.game.renderer.width
        var height = scene.game.renderer.height

        var canvas = document.createElement('canvas');
        canvas.height = height
        canvas.width = width
        // Initialize 2D context with willReadFrequently BEFORE Phaser wraps it —
        // terrain uses getImageData heavily (gravity sim, heightmap sync).
        // Must be set on first getContext call; subsequent calls ignore options.
        canvas.getContext('2d', { willReadFrequently: true });
        if (scene.textures.exists('terrain')) scene.textures.remove('terrain')
        scene.textures.addCanvas('terrain', canvas);

        super(scene.textures, 'terrain', canvas, canvas.width, canvas.height)

        // CRITICAL: Replace the texture manager's entry with `this` (the Terrain object).
        // addCanvas() above creates a SEPARATE CanvasTexture in the manager.
        // super() creates `this` as another CanvasTexture wrapping the same canvas.
        // Without this, the Image references the addCanvas texture, but this.update()
        // only refreshes `this` — so canvas changes never appear on screen.
        scene.textures.list['terrain'] = this;

        scene.add.image(width/2, height/2, 'terrain');

        this.canvas = canvas
        this.scene = scene
        this.background = this.scene.background
        this.width = canvas.width;
        this.height = canvas.height;
        this.matrix = [];
        this.animate = false
        this.blastArray = [];
        this.path = []
        this.multiplayerPoints = []
        this.addPixels = []
        this.previousSaved = null
        this.frameCount = -1
        this.soundEffects = ['rocks_1', 'rocks_2', 'rocks_3', 'rocks_4', 'rocks_5', 'rocks_6']
        this.soundEffectIndex = 0

        this.scene.physics.world.on('worldstep', this.updateTerrain, this)
    }



    create = () => {
        var width = this.width
        var height = this.height
        var ctx = this.canvas.getContext('2d')

        this.path = drawTerrain(ctx, width, height, this)
        this.update()
    }



    setPath = (path) => {
        this.path = path
        var width = this.width
        var height = this.height
        var ctx = this.canvas.getContext('2d')

        setTerrain(ctx, width, height, path, this)
        this.update()
    }



    save = () => {
        const ctx = this.context || this.canvas.getContext('2d');
        this.previousSaved = ctx.getImageData(0, 0, this.width, this.height)
    }



    restore = () => {
        const ctx = this.context || this.canvas.getContext('2d');
        ctx.putImageData(this.previousSaved, 0, 0)
        this.update()
    }

    // Multiplayer terrain correction — syncs terrain between players.
    // Original implementation was a no-op (returned immediately).
    // Each player runs terrain physics independently; this is kept for API compatibility.
    multiplayerCorrection = (data) => {
        return
    }

    /**
     * Apply a server-authoritative heightmap to sync terrain after a shot.
     * The heightmap is a 1D array where heightmap[x] = Y-coordinate of terrain surface.
     * Handles BOTH craters (clearing terrain) AND raised terrain (drawing new terrain).
     *
     * @param {number[]} heightmap - 1200-element array of Y-values
     */
    applyHeightmap = (heightmap) => {
        if (!heightmap || !heightmap.length) {
            console.warn('[SolShot] applyHeightmap: no heightmap data');
            return;
        }

        try {
            const ctx = this.canvas.getContext('2d');
            const width = this.width;
            const height = this.height;
            const currentData = ctx.getImageData(0, 0, width, height);
            const pixels = currentData.data;
            const cols = Math.min(width, heightmap.length);

            // Brown color for newly raised terrain (walls, mounds)
            const TERRAIN_R = 139, TERRAIN_G = 90, TERRAIN_B = 43, TERRAIN_A = 255;

            for (let x = 0; x < cols; x++) {
                const serverY = Math.floor(heightmap[x]);

                // Find current client surface Y for this column
                // (first opaque pixel scanning top-down = terrain surface)
                let clientY = height; // default: no terrain in this column
                for (let y = 0; y < height; y++) {
                    const idx = (y * width + x) * 4;
                    if (pixels[idx + 3] > 0) {
                        clientY = y;
                        break;
                    }
                }

                if (serverY > clientY) {
                    // CRATER: server surface is lower (higher Y) → clear pixels above serverY
                    for (let y = clientY; y < Math.min(serverY, height); y++) {
                        const idx = (y * width + x) * 4;
                        pixels[idx] = 0;
                        pixels[idx + 1] = 0;
                        pixels[idx + 2] = 0;
                        pixels[idx + 3] = 0;
                    }
                } else if (serverY < clientY) {
                    // RAISED TERRAIN: server surface is higher (lower Y) → draw terrain pixels
                    for (let y = serverY; y < clientY; y++) {
                        const idx = (y * width + x) * 4;
                        pixels[idx] = TERRAIN_R;
                        pixels[idx + 1] = TERRAIN_G;
                        pixels[idx + 2] = TERRAIN_B;
                        pixels[idx + 3] = TERRAIN_A;
                    }
                }
                // if equal: no change needed for this column
            }

            ctx.putImageData(currentData, 0, 0);
            this.update();
        } catch (err) {
            console.error('[SolShot] applyHeightmap error:', err);
        }
    }


    updateTerrain = () => {
        if (this.blastArray.length !== 0) {
            this.blastArray.forEach((hole) => {
                try {
                    hole.update()
                } catch (err) {
                    console.error('[SolShot] Blast.update() error:', err.message)
                    hole.toRemove = true
                }
            })

            this.blastArray = this.blastArray.filter((hole) => {
                return (hole.toRemove === false)
            })

            // Refresh the Phaser CanvasTexture so blast-drawn pixels appear on screen
            this.update()
        }

        if (this.matrix.length === 0) {
            this.animate = false
            return
        }
        else {
            for (let i = 0; i < this.soundEffects.length; i++) {
                const e = this.soundEffects[i];
                var res = this.scene.sound.get(e)
                if (res !== null) break
                if (i === this.soundEffects.length - 1) {
                    this.scene.sound.play(this.soundEffects[this.soundEffectIndex])
                    this.soundEffectIndex++
                    if (this.soundEffectIndex >= this.soundEffects.length) {
                        this.soundEffectIndex = 0
                    }
                }
            }

            this.matrix = this.matrix.filter((ele) => {
                return (ele.base < ele.ground)
            })

            try {
                const ctx = this.context || this.canvas.getContext('2d');
                this.matrix.forEach((ele, i) => {
                    // Guard: skip columns with zero/negative height (prevents getImageData crash)
                    const h = ele.base - ele.top;
                    if (h <= 0 || ele.x < 0 || ele.x >= this.width || ele.top < 0) return;
                    var data = ctx.getImageData(ele.x, ele.top, 1, h)
                    ctx.putImageData(data, ele.x, ele.top + 1)
                    this.setPixel(ele.x, ele.top, 0, 0, 0, 0)
                    ele.top = ele.top + 1
                    ele.base = ele.base + 1
                })
            } catch (err) {
                // CRITICAL: If gravity sim crashes, clear the matrix to prevent permanent freeze.
                // Without this, terrain.animate stays true forever → checkSwitchTurn blocks → game frozen.
                console.error('[SolShot] updateTerrain gravity error:', err.message);
                this.matrix = [];
                this.animate = false;
            }

            this.update()
        }
    }



    blast = (type, x, y, radius, data, blowTank, blastType) => {
        this.animate = true
        var hole = new Blast(this.scene, type, x, y, radius, data, blowTank, blastType)
        this.blastArray.push(hole)
    }



    fixTerrain = (x, y, r) => {
        if (y > this.height) return;
        
        var radius = r
        this.update()
    
        var left = x - radius
        var right = x + radius
        var do_break = false
        var duplicate = false
        var base, top, ground, duplicateIndex, i, j;

        for (i = left; i <= right; i++) {
            duplicate = false
            do_break = false
        
            // find base
            for (j = y; j >= 1; j--) {
                if (this.getPixel(i, j).alpha > 100) {
                    do_break = true;
                }
                if (do_break) {
                    break;
                }
            }
            base = j;
            do_break = false;
        
            // find top
            for (; j >= 0; j--) {
                if (this.getPixel(i, j).alpha === 0) {
                    do_break = true;
                }
                if (do_break) {
                    break;
                }
            }
            top = j;
            do_break = false

            // find ground
            for (j = y; j <= this.height; j++) {
                if (this.getPixel(i, j).alpha > 100) {
                    do_break = true;
                }
                if (do_break) {
                    break;
                }
            }
            ground = j;
            do_break = false;
            
            if (base !== 0 && top !== 0) {
                this.matrix.forEach((ele, index) => {
                    if (ele.x === i) {
                        duplicate = true
                        duplicateIndex = index
                    } 
                })

                if (duplicate) {
                    this.matrix[duplicateIndex].x = i
                    this.matrix[duplicateIndex].base = base
                    this.matrix[duplicateIndex].top = top
                    this.matrix[duplicateIndex].ground = ground
                }
                else
                    this.matrix.push({x: i, base, top, ground})
            }
        }
        //console.log(this.matrix)
        this.animate = true
    }



    fixTerrainShape = (points) => {
        this.update()
        
        var r, x, y, angle;
        var ax, ay, do_break = false, base, top, ground, j, duplicateIndex, duplicate = false;
        
        for (let i = 0; i < points.length - 2; i++) {
            x = points[i].x
            y = points[i].y
            r = Phaser.Math.Distance.BetweenPoints(points[i], points[i + 2]) + 2
            angle = Phaser.Math.Angle.Between(points[i].x, points[i].y, points[i + 2].x, points[i + 2].y)

            for (let i = 0; i <= r; i = i + 1) { 
                ax = Math.floor(x + i * Math.cos(angle))
                ay = Math.floor(y + i * Math.sin(angle))
    
                duplicate = false
                do_break = false
    
                // find base
                for (j = ay; j >= 1; j--) {
                    if (this.getPixel(ax, j).alpha > 100) {
                        do_break = true;
                    }
                    if (do_break) {
                        break;
                    }
                }   
                base = j;
                do_break = false;
            
                // find top
                for (; j >= -200; j--) {
                    if (this.getPixel(ax, j).alpha === 0) {
                        do_break = true;
                    }
                    if (do_break) {
                        break;
                    }
                }
                top = j;
                do_break = false
    
                // find ground
                for (j = ay; j <= this.height; j++) {
                    if (this.getPixel(ax, j).alpha > 100) {
                        do_break = true;
                    }
                    if (do_break) {
                        break;
                    }
                }
                ground = j;
                do_break = false;
                
                if (base !== 0 && top !== 0 && base !== top && base !== ground) {
                    this.matrix.forEach((ele, index) => {
                        if (ele.x === ax) {
                            duplicate = true
                            duplicateIndex = index
                        } 
                    })
    
                    if (duplicate) {
                        this.matrix[duplicateIndex].x = ax
                        this.matrix[duplicateIndex].base = base
                        this.matrix[duplicateIndex].top = top
                        this.matrix[duplicateIndex].ground = ground
                    }
                    else {
                        this.matrix.push({x: ax, base, top, ground})
                    }
                }
            }
    
            //console.log(this.matrix)
            this.animate = true
        }
    }



    getNeighbouringPoints = (x, y, count = 5) => {
        return this.getSlope(x, y, count, true)
    }



    getSlope = (x, y, pointsCount = 5, returnPoints = false) => {
        var points = []
        var maxPoints = pointsCount
        var left = {x: x, y: y}, right = {x: x, y: y}, counter = Math.floor(maxPoints/2 - 1);
        points[Math.floor(maxPoints/2)] = {x: x, y: y}

        left = this.getLeftGround(x, y) ?? left

        while (left !== null && counter !== -1) {
            left = this.getLeftGround(left.x, left.y) ?? left
            points[counter] = {...left}
            counter--
        }
        
        right = this.getRightGround(x, y) ?? right
        counter = Math.ceil(maxPoints/2)
        
        while (right !== null && counter !== maxPoints) {
            right = this.getRightGround(right.x, right.y) ?? right
            points[counter] = {...right}
            counter++
        }

        if (right.x - left.x !== 0) {
            var slope = (right.y - left.y) / (right.x - left.x)
            var angle = Math.atan(slope) + ((right.x - left.x) > 0 ? 0 : Math.PI)
        }
        else {
            var angle = undefined
        }

        if (returnPoints === true)
            return points
        else
            return angle
   }



    getRightGround = (x, y) => {
        var pos = [{x: x, y: y + 1}, {x: x + 1, y: y + 1}, {x: x + 1, y: y}, {x: x + 1, y: y - 1}, {x: x, y: y - 1}, {x: x - 1, y: y + 1}, {x: x - 1, y: y}, {x: x - 1, y: y - 1}]
        var checkPos = [{x: x + 1, y: y + 1}, {x: x + 1, y: y}, {x: x + 1, y: y - 1}, {x: x, y: y - 1}, {x: x - 1, y: y - 1}, {x: x, y: y + 1}, {x: x - 1, y: y + 1}, {x: x - 1, y: y}]
        var k = null

        for (let index = 0; index < pos.length; index++) {
            if (this.getPixel(pos[index].x, pos[index].y).alpha > 0) {
                if (this.getPixel(checkPos[index].x, checkPos[index].y).alpha === 0) {
                    k = pos[index]
                }
            }
        }
        if (x >= this.width)
            k = null
        
        return k;
    }



    getLeftGround = (x, y) => {
        var pos = [{x: x, y: y + 1}, {x: x - 1, y: y + 1}, {x: x - 1, y: y}, {x: x - 1, y: y - 1}, {x: x, y: y - 1}, {x: x + 1, y: y + 1}, {x: x + 1, y: y}, {x: x + 1, y: y - 1}]
        var checkPos = [{x: x - 1, y: y + 1}, {x: x - 1, y: y}, {x: x - 1, y: y - 1}, {x: x, y: y - 1}, {x: x + 1, y: y - 1}, {x: x, y: y + 1}, {x: x + 1, y: y + 1}, {x: x + 1, y: y}]
        var k = null
        
        for (let index = 0; index < pos.length; index++) {
            if (this.getPixel(pos[index].x, pos[index].y).alpha > 0) {
                if (this.getPixel(checkPos[index].x, checkPos[index].y).alpha === 0) {
                    k = pos[index]
                }
            }
        }
        if (x <= 0)
            k = null

        return k;
    }



    getSurface = (x, y, angle) => {
        //if (this.getPixel(x - 1 * Math.sin(angle), y + 1 * Math.cos(angle)).alpha === 0) return null

        var newX = x, newY = y, prevX = x, prevY = y
        for (let i = 0; i < 60; i++) {
            prevX = newX
            prevY = newY
            newX = x + i * Math.cos(angle)
            newY = y + i * Math.sin(angle)
            if (this.getPixel(newX, newY).alpha === 0) {
                //this.scene.blastLayer.setPixel(newX, newY, 0, 0, 0, 255)
                return {x: prevX, y: prevY}
            }
            //this.setPixel(newX, newY, 255,0,0,255)
            //this.scene.blastLayer.setPixel(newX, newY, 255, 0, 0, 255)
        }

        return null
    }



    getBase = (x, y) => {
        var newX = x, newY = y, prevX = x, prevY = y
        for (let i = 0; i < 1000; i++) {
            prevX = newX
            prevY = newY
            newX = prevX
            newY = prevY + 1
            if (this.getPixel(newX, newY).alpha > 0) {
                //this.scene.blastLayer.setPixel(newX, newY, 0, 0, 0, 255)
                return {x: prevX, y: prevY}
            }
            //this.scene.blastLayer.setPixel(newX, newY, 255, 0, 0, 255)
        }

        return null
    }



    getSurfaceUp = (x, y) => {
        //if (this.getPixel(x - 1 * Math.sin(angle), y + 1 * Math.cos(angle)).alpha === 0) return null

        var newX = x, newY = y, prevX = x, prevY = y
        for (let i = 0; i < 60; i++) {
            prevY = newY
            newY = prevY - 1
            if (this.getPixel(newX, newY).alpha === 0) {
                //this.scene.blastLayer.setPixel(newX, newY, 0, 0, 0, 255)
                return {x: prevX, y: prevY}
            }
            //this.scene.blastLayer.setPixel(newX, newY, 255, 0, 0, 255)
        }

        return null
    }

    


    /**
     * Scan top-down for the first opaque pixel at column x.
     * Returns the Y coordinate of the terrain surface, or this.height if no terrain.
     */
    getTerrainSurfaceY = (x) => {
        const col = Math.floor(x);
        if (col < 0 || col >= this.width) return this.height;
        for (let y = 0; y < this.height; y++) {
            if (this.getPixel(col, y).alpha > 0) {
                return y;
            }
        }
        return this.height;
    }

    retractPoint = (x, y, velocity, accelaration, gravity) => {
        if (velocity === undefined) return
        if (accelaration === undefined) accelaration = new Phaser.Math.Vector2(0, 0)
        if (gravity === undefined) gravity = new Phaser.Math.Vector2(0, 0)

        if (velocity.length() === 0 && accelaration.length() === 0 && gravity.length() === 0) return [x, y, x, y]
        
        var prevX = x, prevY = y;
        var initX = x, initY = y;
        var maxCount = 100000
        var theta = velocity.angle()
        var sin = Math.sin(theta)
        var cos = Math.cos(theta)

        var accelarationX = accelaration.x + gravity.x
        var accelarationY = accelaration.y + gravity.y

        var t = 0.0001
        var v = velocity.length()

        while (this.getPixel(x, y).alpha !== 0) {
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
}
