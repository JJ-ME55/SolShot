import { Scene, GameObjects, BlendModes, Textures } from 'phaser';
import WebFontFile from '../../classes/WebFontFile';
import Phaser from 'phaser';
import assetLoader from '../../weapons/sounds'
import { createPlayButton } from '../../graphics/play-btn';
import { Tween } from '../../classes/Tween';
import { Collider } from '../../classes/Collider';

export class Scene1 extends Scene {
    constructor() {
        super('scene-1');
        this.fps = null
        this.playbtn = null
        this.checkResize = null
    }



    preload = () => {
        //console.log(window.gdsdk)
        //
    }




    create = () => {
        const screenCenterX = this.cameras.main.worldView.x + this.cameras.main.width / 2;
        const screenCenterY = this.cameras.main.worldView.y + this.cameras.main.height / 2;

        var cover = this.physics.add.image(screenCenterX, screenCenterY - 500, 'cover').setScale(1.01)

        this.tweens.add({
            targets: cover,
            y: cover.y + 400,
            ease: 'Bounce.Out',
            duration: 2200
        })

        // SolShot brand title overlay
        const title = this.add.text(screenCenterX, 30, 'SOLSHOT')
        title.setFontSize(28).setFontFamily('"Days One"').setOrigin(0.5, 0)
        title.setColor('rgba(255,204,0,1)')
        title.setStroke('rgba(178,143,0,1)', 4)
        title.setAlpha(0)

        // Tagline
        const tagline = this.add.text(screenCenterX, 62, 'Artillery Battles on Solana')
        tagline.setFontSize(14).setFontFamily('"Days One"').setOrigin(0.5, 0)
        tagline.setColor('rgba(180,180,180,1)')
        tagline.setAlpha(0)

        // Fade in branding after cover bounce
        this.time.delayedCall(2000, () => {
            this.tweens.add({ targets: [title, tagline], alpha: 1, duration: 800, ease: 'Sine.InOut' })
        })

        this.createPlayBtn()
        this.addScreenResize()

        this.sound.stopAll()
        this.sound.stopByKey('winner')
        this.sound.play('intro', {loop: true})

        const w = this.game.renderer.width

        var [guideOption, guideBox] = this.createOption('address-book-regular', 'Guide', w * 5/7, screenCenterY * 5/3 - 50)
        guideOption.setDisplaySize(80, 60)
        guideBox.setInteractive()
        guideBox.on('pointerdown', () => { this.sound.play('click', {volume: 0.3}); this.scene.start('guide-scene') })

        var [aboutOption, aboutBox] = this.createOption('question-solid', 'About', w * 2/7, screenCenterY * 5/3 - 50)
        aboutOption.setDisplaySize(60, 80)
        aboutBox.setInteractive()
        aboutBox.on('pointerdown', () => { this.sound.play('click', {volume: 0.3}); this.scene.start('about-scene') })

        var [controlsOption, controlsBox] = this.createOption('keyboard-regular', 'Controls', w * 1/7, screenCenterY * 5/3 - 50)
        controlsOption.setDisplaySize(100, 80)
        controlsBox.setInteractive()
        controlsBox.on('pointerdown', () => { this.sound.play('click', {volume: 0.3}); this.scene.start('controls-scene') })

        var [screenshotOption, screenshotBox] = this.createOption('screenshot', 'Screenshots', w * 6/7, screenCenterY * 5/3 - 50)
        screenshotOption.setDisplaySize(90, 75)
        screenshotBox.setInteractive()
        screenshotBox.on('pointerdown', () => { this.sound.play('click', {volume: 0.3}); this.scene.start('screenshot-scene') })
    }




    createPlayBtn = () => {
        const screenCenterX = this.cameras.main.worldView.x + this.cameras.main.width / 2;
        const screenCenterY = this.cameras.main.worldView.y + this.cameras.main.height / 2;

        var canvas = createPlayButton()

        var playtxt = this.add.text(screenCenterX, screenCenterY * 5/3 - 50, 'play', {font: '400 Cabin'})
        playtxt.setDepth(20)
        playtxt.setColor('rgba(240,240,240,1)')
        playtxt.setStroke('rgba(155,155,155,1)', 4)
        playtxt.setFontSize(75)
        playtxt.setOrigin(0.5, 0.55)

        var playtexture = this.textures.addCanvas('play-btn', canvas, true)
        this.playbtn = this.add.image(screenCenterX, screenCenterY * 5/3 - 50, playtexture)

       this.clicktext = this.add.text(0, 0, "click").setFontFamily('Verdana').setVisible(false).setFontSize(14).setDepth(20).setStroke('rgba(80,80,80,1)', 4)


        this.playbtn.setInteractive()
        this.playbtn.on('pointerdown', () => {
            this.sound.play('click', {volume: 0.3})
            this.scene.start('scene-2')
        })

    }



    createOption = (image, text, x, y) => {
        var option = this.add.image(x, y - 15, image).setAlpha(0.8).setOrigin(0.5, 0.5)
        var box = this.add.rectangle(x, y, 120, 120).setStrokeStyle(2, 0xcccccc, 0)
        box.setInteractive()
        box.on('pointerover', () => {
            box.setStrokeStyle(2, 0xcccccc, 1)
        })
        box.on('pointerout', () => {
            box.setStrokeStyle(2, 0xcccccc, 0)
        })
        if (!this.game.device.os.desktop) {
            this.add.text(x, y + 50, text).setOrigin(0.5, 0.5).setFontFamily('Verdana').setFontSize(26)
        }
        else {
            this.add.text(x, y + 40, text).setOrigin(0.5, 0.5).setFontFamily('Verdana')
        }
        option.setInteractive()
        return [option, box]
    }




    addScreenResize = () =>{
        var w = this.renderer.width
        
        var resizeScreenContainer = this.add.container(w - 30, 30)
        var resizeScreenText = this.add.text(0, 0, 'Fullscreen').setOrigin(1, 0).setFontFamily('Verdana').setFontSize(18).setPadding(0,0,10,0)
        var expandScreenIcon = this.add.image(0, 0, 'expand').setOrigin(1, 0).setDisplaySize(20, 20).setAlpha(0.8)
        var compressScreenIcon = this.add.image(0, 0, 'compress').setOrigin(1, 0).setDisplaySize(20, 20).setVisible(false).setAlpha(0.8)

        if (!this.game.device.os.desktop) {
            resizeScreenText.setFontSize(30)
            expandScreenIcon.setDisplaySize(30, 30)
            compressScreenIcon.setDisplaySize(30, 30)
        }

        resizeScreenText.setX(resizeScreenText.x - expandScreenIcon.displayWidth)
        resizeScreenContainer.add([resizeScreenText, expandScreenIcon, compressScreenIcon])

        const onClickResize = () => {
            if (this.game.scale.isFullscreen === true) {
                this.game.scale.stopFullscreen()
            }
            else {
                this.game.scale.startFullscreen()
            }
        }

        resizeScreenText.setInteractive()
        expandScreenIcon.setInteractive()
        compressScreenIcon.setInteractive()
        resizeScreenText.on('pointerup', onClickResize)
        expandScreenIcon.on('pointerup', onClickResize)
        compressScreenIcon.on('pointerup', onClickResize)

        this.checkResize = () => {
            if (this.game.scale.isFullscreen === false) {
                resizeScreenText.setText('Fullscreen')
                compressScreenIcon.setVisible(false)
                expandScreenIcon.setVisible(true)
            }
            else {
                resizeScreenText.setText('Minimise')
                compressScreenIcon.setVisible(true)
                expandScreenIcon.setVisible(false)
            }
        }
    }




    update = (time, delta) => {
        if (this.checkResize !== null) {
            this.checkResize()
        }
    }

}
