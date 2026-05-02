# SolShot — Free Library Audio Shopping List

> Companion to `SolShot_Audio_Brief_Lite.docx`. Covers the ~54 commodity cues
> sourced from free libraries (the long tail). Custom engineer handles the
> ~27 identity cues; this fills the rest at ~£0–50.

---

## Recommended sources (commercial-license-safe)

| Source | License | Best for | Notes |
|---|---|---|---|
| **[Mixkit](https://mixkit.co/free-sound-effects/)** | Free, commercial OK, no attribution required | UI clicks, weapons, ambient | **Use this first.** Cleanest license, no compliance overhead. |
| **[Freesound.org](https://freesound.org/)** (filter: **CC0** only) | Public domain | Weapon variants, ambient, generic FX | Filter strictly to CC0 — CC-BY requires attribution which adds maintenance. |
| **[OpenGameArt](https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=13)** | Mixed (filter: CC0 / CC-BY) | Game-specific weapon SFX collections | Check per-asset. CC0 ones are gold. |
| **[GameMaster Audio Free Pack](https://www.gamemasteraudio.com/games/free-sfx-bundle/)** | Free, attribution required | Quality bar above most freebies | Decent baseline, but the attribution clause is a small ongoing cost. |
| **[Pixabay](https://pixabay.com/sound-effects/)** | Free, commercial OK, no attribution | Ambient loops, UI clicks | Decent breadth, easier search than Freesound. |
| **[Soundsnap](https://www.soundsnap.com/)** | Pay-per-download (~$5-10/cue) | When free quality isn't enough | **Use as fallback** for cues where free libraries don't have the right vibe. |

**Skip:** BBC Sound Effects (not commercial-licensed without paid agreement), Zapsplat (attribution required + watermark on free tier).

---

## Your shopping list — 54 cues

### A — Other weapons (~24 cues)

The 14 weapons not commissioned custom. Pitch-shift / layer in-engine to make these feel cohesive with the custom set.

| ID | Weapon | Cues needed | Search terms (Mixkit / Freesound CC0) |
|---|---|---|---|
| 2  | 3 Shot       | fire (3-tap) + impact ×3 | `shotgun blast small`, `triple shot` + small `cannon impact` |
| 4  | Jackhammer   | fire + drill loop + impact | `drill machine loop`, `chained explosion` |
| 7  | Pile Driver  | fire + chained drill impacts | `heavy mechanical thud`, `industrial drill` |
| 10 | Spider       | fire + spread + leg impacts | `mechanical click pop`, `metal scattering` |
| 12 | Magic Wall   | impact only (chime) | `magic chime fantasy short` |
| 15 | Napalm       | fire + burn loop + impact | `whoosh fire`, `crackle fire loop` |
| 16 | Hail Storm   | fire + rain impacts | `rain projectile`, `multi-hit rain` |
| 20 | Skipper      | fire + bounce ×3 | `bouncing thud rubber ball`, `metal skip` |
| 25 | Dirt Ball    | impact (terrain rise) | `soft thud`, `earth rumble short` |
| 26 | Tommy Gun    | rapid-fire burst | `machine gun burst gangster`, `tommy gun` |
| 21,22,24,29 | Prestige weapons (4) | fire + impact each | `explosion stylized`, `epic shot` (wider tier-themed) |

**~24 cues. Source: Mixkit + Freesound CC0.**

---

### B — Generic UI (~12 cues)

| Cue | Search terms | Notes |
|---|---|---|
| `ui_tap_secondary` | `ui click subtle`, `interface tap` | Pitch one octave below `ui_tap` (custom) for hierarchy |
| `ui_hover` | `ui hover sound` | Very subtle — desktop only |
| `ui_back` | `ui back button`, `interface back` | Slightly downward pitched |
| `ui_screen_transition` | `interface swoosh short`, `ui transition` | 300-500ms |
| `ui_gold_tick` | `coin pickup`, `currency click` | Loops as +1 +1 +1 popups stack |
| `ui_currency_change` | `cash register tick`, `digital coin` | One-shot, slightly chunkier than gold_tick |
| `ui_toast_success` | `notification success short` | Mixkit has a clean one |
| `match_start_countdown_tick` | `countdown beep`, `digital tick` | 3, 2, 1 — same cue, pitched up on final |
| `round_start` / `round_end` | `match start chime`, `round end` | Two distinct stings |
| `your_turn` / `opponent_turn` | `turn notification`, `your turn beep` | Subtle — opponent_turn very subtle |
| `turn_timer_warning` | `clock tick warning`, `urgent timer` | Loops on last 10s |

**~12 cues. Source: Mixkit (priority), Pixabay (fallback).**

---

### C — Movement / controls (~6 cues)

| Cue | Search terms | Notes |
|---|---|---|
| `tank_move_step` | `tank tread`, `metal chunk treads` | Loops while moving |
| `turret_rotate_tick` | `servo motor short`, `mechanical turn small` | Repeats while aiming with Q/E |
| `power_adjust_tick` | `digital tick`, `interface tick small` | Same family as turret_rotate, pitched up |
| `weapon_select` | `ui click confirm`, `weapon switch` | 200ms |
| `weapon_owned_chime` | `unlock chime short`, `purchase confirm` | Plays on successful weapon buy |
| `buyback_purchase` | `coin clatter ceremonial`, `re-entry sound` | Group-chat re-entry — slightly heavier than weapon buy |

**~6 cues. Source: Freesound CC0 (mechanical layer), Mixkit (chime/UI layer).**

---

### D — Damage feedback (~6 cues)

The lower / less-emotionally-loaded damage bands. Custom covers `dmg_critical` + `dmg_devastating`.

| Cue | Search terms | Notes |
|---|---|---|
| `dmg_taken_self` | `body hit grunt`, `tank dent` | What the local player hears when their tank takes damage |
| `dmg_dealt` | `confirmation hit`, `connect sound subtle` | Plays for the firer when their shot lands |
| `dmg_glancing` | `small impact`, `light hit` | ≤10 HP band — almost a non-event |
| `dmg_solid` | `medium thud`, `tank impact mid` | 10–50 HP band |
| `dmg_miss` | `whistle past`, `projectile miss` | Out-of-bounds projectile |
| `dmg_self_damage` | `oof grunt`, `self-inflicted impact` | Rare — heatseeker doubled back, etc. |

**~6 cues. Source: Freesound CC0 (impact/grunt) + Mixkit (UI layer).**

---

### E — Ambient biome loops (~6 cues)

30-60s seamless loops. Sit very low in the mix (-30dB or lower).

| Cue | Search terms | Notes |
|---|---|---|
| `amb_jungle` | `jungle ambience loop`, `tropical insects birds` | Insects + distant birds |
| `amb_arctic` | `wind cold loop`, `arctic ambience` | Sparse wind, occasional ice creak |
| `amb_desert` | `desert wind loop`, `dry dust ambient` | Dry wind, distant rumble |
| `amb_moon` | `space ambience low`, `vacuum drone subtle` | Near-silence + low rumble |
| `amb_volcanic` | `volcano rumble loop`, `lava ambience` | Distant rumble, occasional sizzle |
| `amb_default` | `outdoor ambience neutral loop` | Neutral hub ambience |

**~6 cues. Source: Pixabay + Freesound (filter: ambient + loop + CC0).**

---

### F — Optional menu music (1 track)

Skip if budget tight — gameplay doesn't depend on it.

| Cue | Search terms | Notes |
|---|---|---|
| `menu_theme` | `military strategy game music`, `retro arcade theme loop`, `field manual ambient music` | Pixabay free music has surprisingly good options. ~60-90s loop. Sparse, NOT anthemic. |

---

## Workflow

1. **Order #1 first** — message the £309 Fiverr seller with `SolShot_Audio_Brief_Lite.docx` attached. Wait for free sample cue (Single Shot fire+impact). Approve or move on.
2. **While waiting (~1 week)** — knock out the 54 free-library cues from this list. Plan ~3-4 hours total to download, audition, rename, and organise.
3. **Folder structure** — keep stock cues in `client/public/assets/sounds/library/` and custom in `client/public/assets/sounds/custom/` so you know what to swap if you ever upgrade individual cues.
4. **Naming convention** — match the brief's snake_case prefix scheme: `weap_*`, `ui_*`, `dmg_*`, `amb_*`, `match_*`, `tank_*`. Critical so the engine can find them.
5. **License compliance** — keep a `LICENSES.md` next to the library folder noting source URL + license per cue. Two minutes of work now, saves a legal headache later.

---

## Quality bar — when to upgrade a free cue to paid

If after dropping in a free cue, any of these are true:
- It clashes obviously with the custom cues' tone (e.g. cinematic next to crunchy)
- The mix peaks in the same 200-500Hz band as everything else (muddies the soundscape)
- It's clearly "stock" enough that a player would notice
- Multiple plays of the same loop become noticeable

→ Replace via Soundsnap ($5-10/cue) or commission a one-off from the same Fiverr seller as a follow-up.

Don't try to perfect this on day one. Ship with placeholders → upgrade as feedback comes in.

---

## Total budget projection

| Path | Custom | Library | Hours of your time | Total $ |
|---|---|---|---|---|
| **Hybrid (recommended)** | £309 (27 cues) | £0 (Mixkit + Freesound) | 3-4 hrs shopping | **~£309** |
| **Hybrid premium** | £309 (27 cues) | ~£100 (Soundsnap targeted) | 2-3 hrs | **~£409** |
| **All custom (brief default)** | £700-1,500 | £0 | 0 hrs | **£700-1,500** |
| **All free** | £0 | £0 | 6-8 hrs | **£0** (lower polish ceiling) |

The hybrid is what you've decided. £309 + ~half a day of library shopping.
