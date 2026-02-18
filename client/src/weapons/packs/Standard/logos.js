const w = 30
const h = 30

function drawImageActualSize(ctx, img) {
    ctx.drawImage(img, 0, 0, w, h);
}

function makeLogo(src) {
    const canvas = document.createElement('canvas')
    canvas.height = h
    canvas.width = w
    const ctx = canvas.getContext('2d')
    const img = new Image(30, 30)
    img.src = src
    ctx.drawImage(img, 0, 0)
    img.addEventListener('load', () => { drawImageActualSize(ctx, img) })
    return canvas
}

// === 15 Base Weapons (Litepaper v2.0) ===
export const singleshot     = makeLogo('./assets/images/logos/standard/Single_Shot.png')
export const bigshot         = makeLogo('./assets/images/logos/standard/Big_Shot.png')
export const threeshot       = makeLogo('./assets/images/logos/standard/3_Shot.png')
export const jackhammer      = makeLogo('./assets/images/logos/standard/Jackhammer.png')
export const heatseeker      = makeLogo('./assets/images/logos/standard/Heatseeker.png')
export const piledriver      = makeLogo('./assets/images/logos/standard/Pile_Driver.png')
export const crazyivan       = makeLogo('./assets/images/logos/standard/Crazy_Ivan.png')
export const spider          = makeLogo('./assets/images/logos/standard/Spider.png')
export const sniperrifle     = makeLogo('./assets/images/logos/standard/Sniper_Rifle.png')
export const magicwall       = makeLogo('./assets/images/logos/standard/Magic_Wall.png')
export const napalm          = makeLogo('./assets/images/logos/standard/Napalm.png')
export const hailstorm       = makeLogo('./assets/images/logos/standard/Hail_Storm.png')
export const groundhog       = makeLogo('./assets/images/logos/standard/Ground_Hog.png')
export const skipper         = makeLogo('./assets/images/logos/standard/Skipper.png')
export const dirtball        = makeLogo('./assets/images/logos/standard/Dirtball.png')

// === 5 Prestige Weapons ===
export const homingmissile   = makeLogo('./assets/images/logos/standard/Homing_Missile.png')
export const cruiser         = makeLogo('./assets/images/logos/standard/Cruiser.png')
export const tommygun        = makeLogo('./assets/images/logos/standard/Tommy_Gun.png')
export const chainreaction   = makeLogo('./assets/images/logos/standard/Chain_Reaction.png')
export const pineapple       = makeLogo('./assets/images/logos/standard/Pineapple.png')

// === Dead weapon stubs (Standard.js still references these — never used at runtime) ===
const _stub = makeLogo('')
export const fiveshot = _stub
export const tracer = _stub
export const dirtmover = _stub
export const dirtslinger = _stub
export const zapper = _stub
export const worm = _stub
export const homingworm = _stub
export const firecracker = _stub
export const mountainmover = _stub
export const scattershot = _stub
