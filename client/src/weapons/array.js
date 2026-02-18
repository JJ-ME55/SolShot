import * as Allweapons from './packs/Standard/Standard'

export const weaponArray = []

// === 15 Launch Weapons (Litepaper v2.0) ===
// IDs: 0, 1, 2, 4, 5, 7, 9, 10, 11, 12, 15, 16, 17, 20, 25
// Removed: 5 Shot (ID 3) — not in litepaper
// Added: Skipper (20), Ground Hog (17), Dirt Ball (25)

const singleshot = new Allweapons.singleshot()       // ID 0 — Free
weaponArray[singleshot.id] = singleshot

const bigshot = new Allweapons.bigshot()             // ID 1 — Rare (700g)
weaponArray[bigshot.id] = bigshot

const threeshot = new Allweapons.threeshot()          // ID 2 — Tactical (400g)
weaponArray[threeshot.id] = threeshot

const jackhammer = new Allweapons.jackhammer()        // ID 4 — Epic (1000g)
weaponArray[jackhammer.id] = jackhammer

const heatseeker = new Allweapons.heatseeker()        // ID 5 — Tactical (500g)
weaponArray[heatseeker.id] = heatseeker

const piledriver = new Allweapons.piledriver()        // ID 7 — Rare (600g)
weaponArray[piledriver.id] = piledriver

const crazyivan = new Allweapons.crazyivan()          // ID 9 — Legendary (2500g)
weaponArray[crazyivan.id] = crazyivan

const spider = new Allweapons.spider()                // ID 10 — Tactical (400g)
weaponArray[spider.id] = spider

const sniperrifle = new Allweapons.sniperrifle()      // ID 11 — Rare (700g)
weaponArray[sniperrifle.id] = sniperrifle

const magicwall = new Allweapons.magicwall()          // ID 12 — Standard (200g)
weaponArray[magicwall.id] = magicwall

const napalm = new Allweapons.napalm()                // ID 15 — Rare (600g)
weaponArray[napalm.id] = napalm

const hailstorm = new Allweapons.hailstorm()          // ID 16 — Epic (1200g)
weaponArray[hailstorm.id] = hailstorm

const groundhog = new Allweapons.groundhog()          // ID 17 — Epic (900g)
weaponArray[groundhog.id] = groundhog

const skipper = new Allweapons.skipper()              // ID 20 — Tactical (350g)
weaponArray[skipper.id] = skipper

const dirtball = new Allweapons.dirtball()            // ID 25 — Standard (150g)
weaponArray[dirtball.id] = dirtball

// === 5 Prestige Weapons (unlocked by burning SHOT) ===

const chainreaction = new Allweapons.chainreaction()  // ID 21 — Platinum prestige
weaponArray[chainreaction.id] = chainreaction

const pineapple = new Allweapons.pineapple()          // ID 22 — Diamond prestige
weaponArray[pineapple.id] = pineapple

const homingmissile = new Allweapons.homingmissile()  // ID 24 — Bronze prestige
weaponArray[homingmissile.id] = homingmissile

const tommygun = new Allweapons.tommygun()            // ID 26 — Gold prestige
weaponArray[tommygun.id] = tommygun

const cruiser = new Allweapons.cruiser()              // ID 29 — Silver prestige
weaponArray[cruiser.id] = cruiser
