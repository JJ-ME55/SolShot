# Pool — Design Handoff Brief

For: a fresh Claude (or human) design session producing screen mockups
Game: SolShot Pool (working name) — 8-Ball Pool entry into TheArcade
Status: handoff-ready, but **design phase has not begun** — pick this up when JJ greenlights
Companion doc (read first): [POOL_DESIGN_TARGET.md](POOL_DESIGN_TARGET.md) — the full gameplay spec
Cold-pickup contract: this doc should be enough to start screen mockups without reading anything else

---

## 1. Game in one paragraph

8-ball pool, server-authoritative, agile-async like SolShot. Two players in a web lobby (random match or invite link) or you play vs computer. When it's your turn, you have 12 hours to open the match. Once you open it you can think as long as you want — drag the cue, pick spin, set power. When you tap **READY TO SHOOT**, a 45-second sync timer starts. Release within 45s or your shot is skipped. Server simulates physics, both clients render the same result, opponent's turn (or yours again if you potted). First to legally clear all your balls and sink the 8 wins.

## 2. Visual language — borrow from SolShot

The pool game lives in TheArcade alongside SolShot, basketball, keepie-uppies, free-kicks. Per `ARCADE_PLAYBOOK §5`: **HUD chrome stays consistent across all arcade games** (SolShot's tokens), **gameplay canvas palette flexes per game** (felt green is fine; the surrounding HUD is olive/bone/orange-rust).

### 2.1 Tokens to use (file: `client/src/styles/tokens.css` in SolShot repo)

| Token | Value | Use |
|-------|-------|-----|
| `--bg-deep` | `#0e1209` | Page background |
| `--bg-surface` | `#111806` | Cards / panels |
| `--bg-raised` | `#141c0d` | Buttons (default) |
| `--border` | `#1e2a14` | Standard borders |
| `--border-hot` | `#2e3e20` | Hover borders |
| `--bone` | `#c8b87a` | Primary text |
| `--olive` | `#7a9060` | Secondary text / labels |
| `--muted` | `#3a4e2a` | Dashed lines / disabled |
| `--orange` | `#c8781a` | Accent / primary CTA |
| `--orange-hot` | `#da8a28` | Accent hover |
| `--rust` | `#8a4a12` | Warning / destruct |
| `--red` | `#a83a1a` | Critical / loss |

**Fonts:**
- `Black Ops One` (`--f-display`) — stencil display, all headlines, all-caps
- `Share Tech Mono` (`--f-mono`) — body, stats, code
- `Days One` (`--f-sec`) — secondary display, sparingly

**Shape:** clipped corners on every card/button via `clip-path`. Use the `--clip-10` / `--clip-16` / `--clip-6` variants. Buttons get `--clip-10`. Larger panels get `--clip-16`.

**Effects:** scanlines + grain + vignette overlays sit on top of everything (`.scanlines`, `.grain`, `.vignette` classes). Keep.

### 2.2 Themes available
Three themes ship in SolShot — `field` (default tactical olive), `crt` (phosphor green), `poster` (bone-dominant high contrast). Pool should default to **`field`** to match SolShot.

### 2.3 Gameplay canvas palette (the table itself)
The felt + balls + cushions need their own palette — not olive/bone. Recommend:
- **Felt:** deep tournament green `#1a4a2e` (default), with V3 cosmetic variants (blue, red, slate, custom decals)
- **Cushions / rails:** dark wood `#3a2818` with brass corner detail
- **Cue ball:** standard white-bone `#e8dfb8`
- **Object balls:** match standard 8-ball pool palette (yellow/red/maroon/purple/blue/orange/green/black)
- **Cue stick:** wood-brown default, accent metal ferrule

The contrast: gameplay canvas is "warm wood + green felt" inside an HUD frame of "cold olive + bone + orange." Same pattern as basketball (warm gym wood inside SolShot HUD).

## 3. Screens needed for V1

In presentation order. The lobby/profile/prestige screens **mirror SolShot's existing screens** — designer should reference `client/src/screens/` in the SolShot repo for direct lift.

### 3.1 Splash / loading
- SolShot Pool wordmark (Black Ops One stencil, orange-rust)
- "TheArcade" badge below
- Loading bar in olive, scanlines on
- Auto-advance after assets load

### 3.2 Main menu
Mirror SolShot's [Menu.js](client/src/screens/MenuScreen.js) layout:
- Top: Pool wordmark + player handle + prestige badge
- Center: 4 primary buttons:
  - **PLAY ONLINE** (random match, primary orange CTA)
  - **VS COMPUTER** (4 difficulty levels in a sub-modal)
  - **INVITE A FRIEND** (generates a share link)
  - **PRACTICE** (solo free play, no opponent)
- Right rail: Profile / Prestige / Settings / About
- Bottom: SolShot Arcade logo strip (link back to arcade hub)

### 3.3 Online matchmaking
Mirror SolShot's `LobbyScreen`:
- "Searching for opponent…" with olive blinking dots
- Player avatar/handle on left, "VS" stencil, "?" placeholder on right
- Cancel CTA (ghost button bottom)
- When opponent found: opponent card slides in from right with handle + prestige badge → "READY?" prompt → match starts

### 3.4 In-match HUD (the core screen)
The screen players spend 95% of their time on. Layout follows the Miniclip-proven HUD pattern (player blocks corners, stakes/match-info center, controls bottom strip, no zoom/pan ever):

```
┌──────────────────────────────────────────────────────────────┐
│ [@PlayerA] 🏅Bronze    [MATCH 5-3]    🏅Silver [@PlayerB]    │  ← player blocks
│  stripes 3/7  ★3        🎱 BO5         solids 2/7  ★4         │  (avatar + handle
│  ━━━━ ACTIVE             [45s ⏱]       ─────                  │   + prestige badge
├──────────────────────────────────────────────────────────────┤   + ball group + #
│                                                              │   + win-streak ★
│                  ╱─aim line──→                               │   + active glow
│                 ●  ←cue ball                                 │   + sync timer
│              ╱   ●●●                                         │
│   [    POOL TABLE CANVAS — full width, top-down view    ]   │  ← gameplay area
│                                                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [🎱 SPIN]   [───●─── POWER]   [💬 CHAT]   [READY TO SHOOT] │  ← shot controls
└──────────────────────────────────────────────────────────────┘
```

**Top-left player block:** avatar, handle, prestige badge, ball group (stripes/solids/open), balls remaining, win streak (small star + number). When this player's turn: full block gets orange-rust border glow + `━━━ ACTIVE` underline.

**Top-right player block:** mirror of top-left.

**Top-center stake/match info:**
- V1: match format ("BO5" / "Best of 5") + current score (5-3) + ball icon
- V3: when wagered tables exist, add pot/stake amount above match format
- When in sync mode: 45s shot clock appears here, large stencil-display digits, red flash at 10s

**Bottom strip controls** (mobile-first, thumb zone):
- **🎱 SPIN** (bottom-left, ~60×60px) — tap opens cue-ball widget modal. Drag the contact point inside the cue ball circle to set spin vector (top / back / side / combinations). Returns spin vector. Visible state on the button: small dot showing current spin offset
- **POWER SLIDER** (center-left, ~50% width) — horizontal slider, bone fill, transitions to orange-rust as it approaches max. Tap-and-drag the thumb, releases on lift
- **💬 CHAT** (center-right, ~60×60px) — tap to open canned-phrase wheel (see §3.11). Subtle pulse if opponent has sent a recent phrase
- **READY TO SHOOT** (bottom-right, primary CTA) — `btn-primary` style with `clip-path: var(--clip-10)`. Tapping commits the shot to sync mode

**Aim line overlay** (on canvas):
- Solid white line: cue ball → first contact point
- Colored line continuation: predicted first-contact-ball deflection
- Dotted line: cue ball's one-bounce-after-contact trajectory
- **Never predict 2+ bounces** — preserves skill expression on safety shots
- Settings can toggle this OFF (pro mode) or SHORT (intermediate). When OFF, the cue stick is the only visible aim indicator

**Async mode (default after opening match):**
- All controls editable, no timer running
- Cue stick floats around table, drag to aim
- Spin, power, chat all available
- "READY TO SHOOT" button enabled once aim + power are set

**Sync mode (after READY tapped):**
- 45s timer prominent top-center
- Aim/power/spin still adjustable but timer is running
- At 10s: red flash + optional audio cue
- At 0s: shot skipped, opponent's turn (per §7.3 pure-skip rule — opponent shoots with cue ball wherever it lies, no ball-in-hand)

**Foul / ball-in-hand mode (special):**
- Cue ball becomes draggable (kitchen / anywhere depending on foul type)
- "Place cue ball, then SHOOT" overlay text top-center
- Same async + sync gates apply once the ball is placed

### 3.4.1 Aiming Wheel toggle (Miniclip's UX refinement)
Mobile-only Settings toggle. Default: drag-the-cue (touch cue stick directly to rotate). Alternative: **Aiming Wheel** — a dedicated rotation wheel on the right edge of the screen, drag clockwise/counterclockwise for fine angle adjustment. Miniclip added this c.2015-16 after community feedback that fingers blocked the table when dragging the cue directly. Per Settings, both modes available; player picks preference.

### 3.5 Post-shot result (in-match toast)
After each shot, brief overlay (~2s):
- "STRIPES DOWN" / "SCRATCH!" / "8-BALL POCKETED" stamped diagonal stencil
- Sub-line: balls remaining count change
- Then dismisses to next-turn state

### 3.6 Match-end / Pool Card
Mirror SolShot's [Combat Card](client/src/components/CombatCard.js) — the shareable stat card:
- "VICTORY" or "DEFEAT" stencil
- Final score (5-3 or whatever)
- Match duration (wall-clock + active time)
- Shot count
- Best shot of the match (clip thumbnail OR text "longest run: 4 balls")
- Prestige progress meter (XP earned this match)
- CTAs: REMATCH / SHARE / BACK TO LOBBY

### 3.7 Profile / cue collection
- Player handle + prestige badge
- Stats: matches played, win rate, longest streak, longest run in a single turn
- **Cue locker** — grid of cue thumbnails. Owned cues highlighted, locked cues dashed with unlock condition ("Win 10 matches" / "Reach Bronze prestige")
- **Felt locker** — grid of table cloth variants, same lock pattern
- All unlocks at V1 are **skill-gated**, not Tickets-gated (V3 will layer in Tickets purchases later — do not design Tickets UI yet)

### 3.8 Prestige screen
Mirror SolShot's [PrestigeScreen.js](client/src/screens/PrestigeScreen.js) exactly:
- 6 tier badges: Unranked / Bronze / Silver / Gold / Platinum / Diamond
- Each tier shows: badge sprite, name, unlock condition, reward unlocked (cue/felt cosmetic)
- Current tier highlighted with orange-rust glow
- Locked tiers dashed-frame style
- **Key difference vs SolShot:** at V1, prestige tiers are **skill-gated** (matches won / win rate / streaks), NOT SHOT-burn-gated. V3 will revisit. Per OD-7 in POOL_DESIGN_TARGET.md

**Tier unlock conditions (placeholder, finalise with JJ):**
| Tier | V1 unlock | Reward |
|------|-----------|--------|
| Unranked | Default | Wood cue, green felt |
| Bronze | 10 wins | Brass-ferrule cue, navy felt |
| Silver | 30 wins + 50% win rate | Chrome cue, slate felt |
| Gold | 75 wins + 55% win rate | Carbon cue, burgundy felt |
| Platinum | 150 wins + 60% win rate + 5-streak | Stencil cue, custom decal felt |
| Diamond | 300 wins + 65% win rate + 10-streak | Gold cue, "VALIDATED" decal felt |

### 3.9 Settings
- **Audio** on/off (default off — per `BALL_GAMES_PLAYBOOK`, TG WebView audio is fragile)
- **Aim guideline:** ON (default) / SHORT / OFF (pro mode)
- **Aim controls:** Drag-cue / Aiming Wheel (mobile only, per §3.4.1)
- **Cue sensitivity:** slider, low → high — adjusts how much screen drag = 1° cue rotation
- **Chat:** enabled / disabled (defaults on)
- **Color-blind mode** — high-contrast ball labels (number badges)
- **Haptic feedback** on shot (mobile only, defaults off — battery)
- **Account / wallet info** (Privy)
- **"Open in Safari ↗"** link (TG WebView escape hatch)

### 3.10 Empty / error states
- No opponent in matchmaking after 60s: "No one's around. Play vs Computer?" with CTA to switch
- Match expired (12h/72h timeout): "Match expired — opponent took too long. Win recorded."
- Disconnect mid-match: "Reconnecting… 30s" overlay (SolShot pattern)

### 3.11 Chat (canned phrases only — never free-text)
Per Miniclip's permanent design choice (we adopt this): no free-text chat, ever. Reduces moderation cost, kills harassment vector, creates a clean cosmetic monetization line in V3 (chat packs).

**Behaviour:**
- Tap `💬 CHAT` button (in §3.4 bottom strip) → radial phrase wheel slides up
- 6-8 canned phrases shown as buttons in a hex/grid layout
- Tap a phrase → animated chat bubble emerges from your player block on the table, fades after 3s
- Opponent's phrases appear from their player block, same animation pattern
- One phrase max per 10s cooldown per player (anti-spam)

**V1 default phrase set:**
- "Nice shot 🎱"
- "GG 🤝"
- "Sorry, AFK 🛌"
- "Wow 😮"
- "Tough break 😬"
- "GLHF 🍀"
- "Your turn 👀"
- "🤔"

**V3 cosmetic monetization:**
- Default pack: 8 phrases above, free
- Unlock phrase packs via Tickets (cosmetic shop): "Pro pack" / "Hustler pack" / "Tactical pack" / etc.
- Themed phrase sets with branded styling — never free-text

**Settings toggle:** Chat can be disabled entirely from §3.9 settings — opponent sees a small `🔇` icon next to muted player's handle.

## 4. Animation feel — match SolShot

Reference: `client/src/components/` and the existing flash/snap/stencil animations.

- **Button taps:** 80ms transform translate-y(1px), no slow easing
- **Stencil overlays:** stamp-in with slight rotation jitter, ~150ms
- **Score updates:** snap to new value, not interpolated count-up
- **Shot replay:** smooth camera follow on the cue ball, 1.2x time dilation on impact
- **Result toast:** slam-in 200ms, hold 1.5s, fade out 300ms
- **No bouncy/spring easing** — this is military stencil, not consumer-fun

## 5. Mobile-first

**Every screen must work in a TG WebView on iOS Safari at 390×844**, the smallest mainstream target. Test before assuming desktop layouts work.

- Bottom-of-screen control strip (thumb zone) for shot controls
- Avoid hover states (touch has none); use active/pressed instead
- Stale-pointer guard on every drag handler (per `BALL_GAMES_PLAYBOOK`)
- All tap targets ≥ 44×44 px

## 6. Assets needed (rough list)

To produce after screen mockups are approved:

| Asset | Notes |
|-------|-------|
| Wordmark | "POOL" stencil + "SolShot Arcade" tag |
| Loading spinner | Olive scan-line variant |
| 16 ball sprites | Cue + 1-15 (solids 1-7, 8, stripes 9-15) — high-res for retina |
| 5+ cue stick sprites | Default + 4 unlock tier variants |
| 5+ felt textures | Default + 4 unlock tier variants |
| Cushion + rail sprite set | One default, V3 variants later |
| Prestige badges 0-5 | 6 SVG/PNG, mirror SolShot's prestige badge style |
| HUD icons | Spin widget, power slider thumb, ball-in-hand cue, foul stamp |
| Stamped overlays | "STRIPES DOWN" / "SOLIDS DOWN" / "SCRATCH" / "FOUL" / "RACK UP" / "VICTORY" / "DEFEAT" |
| Sound FX (later, not V1) | Cue strike, ball collision, pocket drop, rack break, win sting |

## 7. Decisions deferred to design phase

Things the designer can decide / propose during mockup:
- Specific layout grid (12-col vs 16-col vs free-form)
- Exact dimensions of spin widget modal
- Whether power slider is horizontal (bottom) or radial (around cue stick)
- Empty-state illustration style — none in V1 SolShot, so propose
- Exact prestige badge artwork — SolShot's are crests; pool could be cue-themed (different cue tips representing tiers)
- Whether the table view tilts (~10° pseudo-3D) or stays flat top-down. Recommend flat top-down — easier physics, easier mobile, matches henshmi base

## 8. Things the designer should NOT design (V1)

Per V3 economy lock + the Miniclip antipatterns we explicitly reject (see POOL_DESIGN_TARGET.md §5.2), do not design:

**V3 economy elements (deferred, not rejected):**
- Tickets purchase UI / wallet top-up flows
- Pool Pass / season pass tracks
- Real-money store / hard-currency packs
- Wagered table tier selector (Seoul / Mumbai / Berlin city ladder — V3)
- Cosmetic cue / felt shop browser (V3 Tickets shop)
- Limited-edition cue drop reveal animation (V3 soulbound NFT mechanic)

**Antipatterns explicitly rejected (do not design, ever):**
- **Cue stat-upgrade UI** ("apply +1 Force / +1 Aim / +1 Spin / +1 Time") — cues are cosmetic only, never stat-affecting (locked OD-1)
- **Legendary Payback / entry-fee refund indicators** — the killer pay-to-win mechanic we permanently rejected
- **Gacha / surprise box reveal animations** (Silver / Gold / Diamond box opens) — fails skill-not-luck filter
- **RNG mini-game lottery interfaces** — Spin & Win, Scratch & Win, Lucky Shot all fail the skill-not-luck filter. Slot-machine UI patterns are out of brand and out of scope
- **VIP tier ladder display** (Silver → Black Diamond, IAP-spend-gated) — antipattern: progression decoupled from skill
- **Cue recharge / energy bar** — the implicit-rake consumable we reject
- **Free-text chat input** — canned phrases only (§3.11)
- **Cumulative-volume leaderboards** ("most shots taken," "most coins won lifetime") — per V3 rule #2, leaderboards are rate-based (win rate, accuracy, longest streak) not volume

**V1 gap (will exist later):**
- Spectator replay player — V1 has no in-chat replays (per match-flow §7.3). When we add replays in a later phase, design then

These rejections are intentional and *permanent* — they're not "V1 deferred → V3 design later." The economy mechanics behind each one are why Miniclip's community sentiment has eroded over 13 years. We don't repeat them.

## 9. Pickup checklist for the design Claude

When this brief is handed off, the design Claude should:
1. Read [POOL_DESIGN_TARGET.md](POOL_DESIGN_TARGET.md) first — gameplay spec, match flow, locked decisions
2. Read `client/src/styles/tokens.css` — actual variable values
3. Read `client/src/screens/MenuScreen.js`, `LobbyScreen.js`, `PrestigeScreen.js` in the SolShot repo — direct visual reference
4. Read `client/src/components/CombatCard.js` — the Pool Card analogue
5. Open the henshmi local server (`http://localhost:8765` if still running) — see the base game we're upgrading
6. Confirm with JJ before designing: OD-3 (which codebase base — TS remake or vanilla 2018), OD-5 (final name — "SolShot Pool" vs other), prestige tier unlock conditions (§3.8 table is placeholder)

---

**Tone reminder:** SolShot is military / billiards / tactical / understated. Not arcade-cartoon, not crypto-degen flashy, not Miniclip-bright. Restraint over flash. Stencil over gradient. Olive + bone + a single hot orange accent over multi-colour rainbows.
