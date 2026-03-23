# Friends Test #2 + Marketing Recording Session — 13 Mar 2026

## Fixes Applied

### Tank Physics
- **Tank sinking into terrain**: Added `setGravity(0)` to 3 settling paths in `Tank.js` that were missing it
- **Tank jumping/jittering after knockback**: Added speed > 20 guard to skip settling during active knockback arc
- **Opponent position desync**: Added `_syncTankPositions()` in `scenes/main/index.js` — syncs both X+Y from server BEFORE shot animation plays

### Mobile
- **Weapon shop not working on phones**: Added `stopPropagation` on touch events in `ShopScreen.js` backdrop/sheet
- **No visual feedback on mobile**: Added `onTouchStart`/`onTouchEnd` handlers to `Button.js` and `WeaponCard.js`

### Performance
- **Canvas warnings**: Added `{ willReadFrequently: true }` to `BlastCache.js` getContext call

### Weapon Balance (permanent)
- Single Shot nerfed: 60 → 35 damage (7 hits to kill at 250 HP)
- All paid weapons rebalanced — spending gold now matters
- `damageFactor` values updated in both `server/services/physics.js`, `server/models/Weapon.js`, and `client/src/data/weapons.js`

### Visual Effects (permanent)
- **Pineapple fragments**: Server now returns `scatterPoints` from `processFragmentShot()`
- **5 weapons with missing sub-explosions**: Added `scatterPoints` returns to Pile Driver, Jackhammer, Napalm, Hail Storm, Chain Reaction
- **Client scatter rendering**: Expanded from `weaponId === 9` to any weapon with `scatterPoints`
- **Per-weapon visual styles**: `_scatterStyles` object with 7 unique color/timing configs

## Commits
```
7e9612f  fix(P1): weapon rebalance + tank sink + mobile shop + canvas perf
a8d0e93  fix(P1): smooth tank knockback — skip settling during active arc
e18d53f  fix(P1): sync tank X+Y from server before shot animation
ad2f277  chore(P1): marketing mode — all weapons 1G + prestige unlocked
79ab90a  fix(P1): client marketing mode — 1G prices + prestige weapon metadata
9dbbd04  fix(P1): allow buying prestige weapons in marketing mode
0989a8e  fix(P1): Pineapple fragment explosions now visible on client
ec30e82  feat(P1): visual sub-explosions for 5 weapons + 45s shop timer
```

---

## MARKETING MODE — Active State

All changes are marked with `// MARKETING MODE` and `// TODO` comments for easy grep.

### What's changed

| File | Change | Revert to |
|------|--------|-----------|
| `server/models/Weapon.js` | All goldCost → 1 | Original prices (see table below) |
| `server/models/Weapon.js` | `getWeapon()` checks PRESTIGE_WEAPONS too | `WEAPON_CATALOG[weaponId] \|\| null` |
| `server/models/Weapon.js` | `getAllLaunchWeapons()` includes prestige | `Object.values(WEAPON_CATALOG)` |
| `server/socket-io/main.js` | Inventory init gives all prestige weapon IDs | Use `getPrestigeInfo()` gating |
| `server/socket-io/main.js` | SHOP_DURATION = 45 | SHOP_DURATION = 30 |
| `client/src/data/weapons.js` | All goldCost → 1 | Original prices (see table below) |
| `client/src/data/weapons.js` | 5 prestige entries in WEAPONS array | Remove lines 36–40 |

### Original Gold Prices (for revert)

| Weapon | ID | Original goldCost |
|--------|----|-------------------|
| Single Shot | 0 | 0 (FREE) |
| Dirt Ball | 25 | 150 |
| Magic Wall | 12 | 150 |
| Skipper | 20 | 200 |
| 3 Shot | 2 | 200 |
| Spider | 10 | 200 |
| Heatseeker | 5 | 350 |
| Napalm | 15 | 400 |
| Pile Driver | 7 | 400 |
| Sniper Rifle | 11 | 500 |
| Big Shot | 1 | 600 |
| Ground Hog | 17 | 600 |
| Jackhammer | 4 | 700 |
| Hail Storm | 16 | 700 |
| Crazy Ivan | 9 | 2500 |
| Prestige weapons | 24,29,26,21,22 | 0 (unlocked via SHOT burns, not gold) |

### How to find all marketing changes
```bash
grep -rn "MARKETING MODE" server/models/Weapon.js server/socket-io/main.js client/src/data/weapons.js
```

### Quick revert checklist
1. `server/models/Weapon.js` — restore goldCost values, revert `getWeapon()` and `getAllLaunchWeapons()`
2. `server/socket-io/main.js` — revert inventory init to prestige-gated, SHOP_DURATION back to 30
3. `client/src/data/weapons.js` — restore goldCost values, delete 5 prestige weapon lines

All TODO comments point to exactly what needs reverting.
