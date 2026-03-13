export class BlastCache {

    constructor (scene) {
        this.scene = scene
        this.canvasArray = {}
        this.infoArray = {}
        //this.type = []
    }



    initialise = (type) => {
        if (this.existsType(type) === false) {
            this.canvasArray[type] = {}
            this.infoArray[type] = {}
        }

    }



    addCanvas = (type, subType, canvas) => {
        if (this.exists(type, subType) === true) return;
        
        if (this.existsType(type) === false) {
            this.initialise(type);
        }

        if (this.canvasArray.hasOwnProperty(type)) {
            var c = document.createElement('canvas')
            var ctx = c.getContext('2d', { willReadFrequently: true })
            c.width = canvas.width
            c.height = canvas.height
            ctx.drawImage(canvas, 0, 0)
            
            this.canvasArray[type][subType] = c
            this.infoArray[type][subType] = 1
        }
    }



    exists = (type, subType) => {
        if (this.infoArray.hasOwnProperty(type)) {
            if (this.infoArray[type].hasOwnProperty(subType)) {
                return true
            }
        }
        return false
    }



    existsType = (type) => {
        if (this.infoArray.hasOwnProperty(type)) {
            return true
        }
        return false
    }



    getCanvas = (type, subType) => {
        if (this.exists(type, subType) === false) return null
        return this.canvasArray[type][subType]
    }
}