export class Score {
    /**
     * @param {Phaser.Scene} scene 
     * @param {*} tank 
     */
    constructor(scene, tank) {
        this.scene = scene
        this.tank = tank
        this.pointsArray = []
        this.hp = 250  // Server-authoritative HP (updated via applyTurnResult)
    }


    add = (points) => {
        var initX = this.tank.x
        var initY = this.tank.y

        this.tank.score = this.tank.score + points
        var text = this.scene.add.text(initX, initY, points)
        text.setOrigin(0.5)
        if (!this.scene.game.device.os.desktop) {
            text.setFontSize(22)
        }
        this.pointsArray.push({value: points, t: 0.0, text: text, initX: initX, initY: initY})
    }



    update = () => {
        this.pointsArray.forEach((point) => {
            this.animatePoint(point)
        })

        this.pointsArray = this.pointsArray.filter((point) => {
            return point.text.y > -20
        })
    }


    animatePoint = (point) => {
        var factor = 0.06
        point.text.setPosition(point.initX + 36 * Math.sin(point.t), point.initY - 20 * point.t)
        point.t += factor
    }
}