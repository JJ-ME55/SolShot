# SolShot — P1 Launch Plan
**For Claude Code implementation**
Last updated: Practice Mode launch phase

---

## Context

SolShot is launching practice mode first — a working 2-player skill game with persistent stats, no wagering, no token. The goal is to build a real player base invested in their KD and reputation *before* $SHOT and wagering go live. This doc covers everything that must be true before the first external tester session.

The stat card is the primary organic marketing mechanic. Every share is a free impression. Lobby, stats persistence, and card export must all work together before Session 1.

> **Note for Claude Code:** The reference snapshot of this codebase may be outdated. Before implementing anything, check whether the described feature already exists. If it does, assess whether it meets the spec and optimise it. If it does not, build it. Never assume absence — always verify first by reading the actual files.

**Stat card spec and component code:** `/SOLSHOT_STAT_CARD_SPEC.md`

---

## GSD Workflow

Work through P1 items in sequence. Do not open tester sessions until every P1 box is checked.

```
P1 complete
  → Session 1 (3-8 mates, record everything)
    → Fix what breaks
      → Open Telegram, share session 1 clip or stat card as the hook
        → Tester week (30 players)
          → Soft X push (stat card + clip + "limited access" link)
            → SHOT token deploy (Pump.fun, announce in Telegram first)
              → Full launch (wagering live, all modes open)
```

---

## P1 Checklist

### ☐ 1. Lobby — Player Selection Flow

**Goal:** Player feels like they are choosing a game, not being dropped into one.

**Required flow:**
```
Home → Play → Lobby screen → sees listed open games (callsign + game type) → clicks CHALLENGE → enters game
```

**Check first:** Does a lobby scene or screen already exist?
- If yes — does it list available games with callsigns? Does the CHALLENGE button correctly gate entry rather than auto-joining? If auto-join is happening on socket event, find the handler (likely `game-found` or equivalent) and insert a user-click gate before `joinGame()` fires.
- If no — build the lobby screen as a step between the Play button and the game scene.

**Key socket pattern to look for:**
```js
// May currently be auto-joining like this:
socket.on('game-found', (gameData) => {
  joinGame(gameData) // ← gate this behind a button click
})

// Should instead populate a list:
socket.on('game-found', (gameData) => {
  setAvailableGames(prev => [...prev, gameData]) // show in lobby
  // actual join only fires on CHALLENGE button click
})
```

**Each listed game must show:**
- Host player callsign
- Game type label (e.g. "Practice — 1v1")
- CHALLENGE button

**Testing note:** On localhost with two tabs you may be the only connected player, so the lobby appears empty. This is expected — test with two actual separate connections before assuming the lobby is broken.

---

### ☐ 2. Mongo Stats Persistence

**Goal:** After every completed match, player stats write correctly to MongoDB and survive a page refresh.

**Check first:** Does the stats write logic already exist in the match completion handler (server-side)?
- If yes — run a test match and query the MongoDB document directly to verify all fields updated correctly after the match ended.
- If no — implement the write on match completion server-side. Never trust the client to write stats.

**Fields that must persist per player:**

| Field | Type | Notes |
|---|---|---|
| `callsign` | String | Primary identifier, set at registration |
| `walletAddress` | String or null | Null for practice mode — must exist in schema now for forward compatibility |
| `wins` | Number | Increment on match win |
| `losses` | Number | Increment on match loss |
| `totalDamage` | Number | Cumulative damage dealt across all matches |
| `bestWinStreak` | Number | Peak streak, not current streak |
| `currentWinStreak` | Number | Resets on loss |
| `matchesPlayed` | Number | Total completed matches |
| `matchHistory` | Array | Last N matches — opponent callsign, result, damage dealt, date |
| `signatureWeapon` | String or null | Most-used purchased weapon, excludes Single Shot |

**Schema note:** `walletAddress` must exist as a nullable field even though it is unused in practice mode. Omitting it now means a painful migration when wagering goes live.

**Verification steps:**
1. Play a full match to completion
2. Query the MongoDB document for both players directly
3. Confirm all fields updated — wins/losses incremented, damage added, matchHistory appended
4. Refresh the browser and confirm stats load from DB, not from local state

---

### ☐ 3. Stat Card — Generated and Exportable

**Goal:** After a match, a player can export their stat card as a PNG and share it to X.

**Spec:** Full design decisions, component code, and implementation notes are in `/SOLSHOT_STAT_CARD_SPEC.md`. Read that file before implementing anything here.

**Check first:** Does a Barracks section or stat card component already exist?
- If yes — check it against the spec. Key things to verify: 16:9 aspect ratio locked, no rank system, Signature Weapon excludes Single Shot and shows CLASSIFIED if none, QR and tappable link both pointing to solshot.gg.
- If no — implement from the reference code in the spec file.

**Where it lives:** Barracks section of solshot.gg. Accessible from main navigation. Read-only view of persistent stats. Not gated — available to all practice mode players from day one.

**URL structure:**
```
solshot.gg/barracks?callsign=BUCKSHOT
```
Enables shareable direct links and sets up the prestige card upgrade path at main launch.

**Export:**
- PNG via `html2canvas` targeting the card element only, not the page
- Filename: `solshot-[callsign]-card.png`
- Export button outside the card bounds — not rendered inside it

**Share to X pre-populated text:**
```
[CALLSIGN] // [WINS]W [LOSSES]L // [SIGNATURE WEAPON]
solshot.gg
```

**QR code:** `qrcode.react` — `<QRCodeSVG value="https://solshot.gg" />` — white foreground, transparent background, top-right of card.

**Signature weapon logic:**
```js
const displayWeapon = (!player.signatureWeapon || player.signatureWeapon === 'Single Shot')
  ? 'CLASSIFIED'
  : player.signatureWeapon.toUpperCase()
```

---

### ☐ 4. Post-Match Screen — Stat Card Export Trigger

**Goal:** The highest-intent moment for sharing is immediately after a match ends. The export button must be on the post-match screen while emotions are running hot — not buried in Barracks.

**Check first:** Does a post-match / winner screen already exist?
- If yes — does it have any share or export option? If there is a Telegram share ping, replace it with the stat card export. One consistent export mechanic, not multiple.
- If no — extend or build the post-match screen to include export.

**Post-match screen must show:**
- Winner callsign (hero, large)
- Loser callsign
- Damage dealt by each player this match
- Signature weapon used (most-used this match — if this updates the all-time `signatureWeapon` field, show the updated value)
- **EXPORT YOUR CARD** — triggers PNG download of the stat card
- **PLAY AGAIN** — returns to lobby, not auto-rematch
- **EXIT** — returns to home

---

### ☐ 5. Callsign Challenge Flow

**Goal:** Players can challenge a specific opponent by callsign from the lobby. This creates social behaviour that spills onto X — players post their callsign saying "come find me."

**Check first:** Does the lobby already support targeted challenges by callsign?
- If yes — verify end to end: Player A selects Player B by callsign → challenge sent → Player B sees notification → accepts → match starts.
- If no — add a callsign input field to the lobby. On submit, emit a socket event to find that player and send a challenge. The target player sees Accept / Decline.

**Why this is P1:** Without it, the lobby is passive — you wait and hope someone appears. With it, players post their callsign publicly. That is free acquisition that costs nothing to build.

---

### ☐ 6. Copyable Match Result Text

**Goal:** One-tap copy of a plain text result for players who won't bother with the full card export.

**Implementation:** Copy button on the post-match screen. Copies to clipboard:
```
Just beat [OPPONENT_CALLSIGN] on SolShot 🎯
[DAMAGE] damage dealt. [SIGNATURE_WEAPON] main.
solshot.gg
```

No image, no export process, just tap and paste into a tweet. Lowest friction share possible.

---

## Links Required From Jamie

Before Session 1, confirm and drop these into the relevant config or env files:

- [ ] **MongoDB connection string** — confirm this is the correct production DB, not a dev instance
- [ ] **solshot.gg deployment** — confirm live site points at the correct build with practice mode active
- [ ] **Telegram group link** — needed for the post-Session 1 open step, confirm it is live and joinable
- [ ] **Socket server URL** — confirm production socket server is running and reachable from the live site
- [ ] **QR target URL** — confirm `https://solshot.gg` is the correct destination, not a staging URL

---

## What Is NOT in P1

Do not build these now. Confirmed future items only.

| Item | Phase |
|---|---|
| Wallet connection | P3 — pre-SHOT launch |
| SOL wagering / escrow | P3 — pre-SHOT launch |
| $SHOT token UI | P3 — masked in UI until full launch, no references visible |
| Prestige system | Main launch |
| Prestige stat card | Main launch — entirely separate component, different palette |
| 4-player last-man-standing | Post-practice-mode |
| In-game leaderboard | P2 — before tester week opens to 30 |
| Full rematch flow | P2 — before tester week opens to 30 |

**On $SHOT references:** Any mention of SHOT, token, prestige, or wagering tiers in the UI must remain hidden until full launch. This is intentional — launch sniping prevention.

---

## P2 Preview (after Session 1 is done)

- Basic leaderboard in Barracks or Telegram showing top KDs and win counts
- Rematch flow — both players can agree to rematch from post-match screen without returning to lobby
- Session 1 bug fixes — address whatever breaks in real play before opening to 30

---

## Prestige Card — Main Launch Only, Do Not Build Now

At main launch, prestige players (Bronze → Diamond) get a completely separate card component. Different colour palette, weapon art, potentially animated. It should look categorically better than the practice card — the contrast *is* the conversion hook for $SHOT burns.

The practice card intentionally leaves the prestige space empty. No placeholder, no UNRANKED label. The absence is the message.
