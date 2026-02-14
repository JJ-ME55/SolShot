import * as Allweapons from './packs/Standard/Standard'

export const weaponArray = []

// === 13 Launch Weapons ===
// IDs kept: 0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 15, 16
// All weapon classes remain in Standard.js — only imports trimmed here

const singleshot = new Allweapons.singleshot()       // ID 0 — Free
weaponArray[singleshot.id] = singleshot

const bigshot = new Allweapons.bigshot()             // ID 1 — Rare (700g)
weaponArray[bigshot.id] = bigshot

const threeshot = new Allweapons.threeshot()          // ID 2 — Tactical (400g)
weaponArray[threeshot.id] = threeshot

const fiveshot = new Allweapons.fiveshot()            // ID 3 — Rare (800g)
weaponArray[fiveshot.id] = fiveshot

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

const magicwall = new Allweapons.magicwall()          // ID 12 — Tactical (200g)
weaponArray[magicwall.id] = magicwall

const napalm = new Allweapons.napalm()                // ID 15 — Rare (600g)
weaponArray[napalm.id] = napalm

const hailstorm = new Allweapons.hailstorm()          // ID 16 — Epic (1200g)
weaponArray[hailstorm.id] = hailstorm
