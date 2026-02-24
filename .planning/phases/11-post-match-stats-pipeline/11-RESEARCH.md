# Phase 11: Post-Match & Stats Pipeline - Research

**Researched:** 2026-02-24
**Domain:** Post-match UI (WinScreen/LoseScreen tabbed refactor), MongoDB stats persistence, html2canvas PNG export, X/Twitter Web Intent, Socket.IO rate limiting
**Confidence:** HIGH (all major technical areas verified against codebase + official sources)

---

## Summary

Phase 11 builds on a well-established codebase. The major components — `WinScreen.js`, `LoseScreen.js`, `BarracksScreen.js`, `CombatCard.js`, `User.js`, and the `getStats`/`persistStats` handlers in `main.js` — all exist and contain substantial working logic. The task is primarily **augmentation and connection**, not greenfield work.

The WinScreen needs a tabbed layout (Result / Progress / Action) wrapping its existing content. The "SHOT milestones earned this match" requires surfacing the `shotResults[myId]` object already present in the `matchEnd` payload — it contains `{ earned, milestone, newBalance, matchesPlayed }` from `recordMatchPlayed()`. The prestige progress display requires reading `getPrestigeInfo()` data, which is already returned on `shotInfo` events but not yet embedded in the `matchEnd` payload.

`html2canvas@1.4.1` is already installed in `client/package.json` and is already used in `CombatCard.js` with `scale: 3, useCORS: true`. The share card is a simpler sibling component that captures a single-match result. The X/Twitter share uses a simple `window.open()` with `https://twitter.com/intent/tweet?text=...&url=...` — no SDK needed.

MongoDB stats persistence for basic fields (`matchesPlayed`, `wins`, `losses`, `totalSolWon`, `totalSolLost`, `totalShotEarned`) is **already implemented** in `persistStats()` at line 2291 in `main.js`. What is **missing** is per-weapon stats (`weaponStats` map), K/D ratio fields (`kills`, `deaths` on the User model), and the `getStats` rate limiting. The `getStats` socket handler at line 1661 works but has no per-client cooldown.

**Primary recommendation:** Treat this phase as wire-up + augmentation. The hard parts (html2canvas export, MongoDB upsert pattern, socket auth, SHOT emission) are already working. The new work is: tab UI on WinScreen, prestige progress data in matchEnd payload, weapon stats schema addition, getStats rate limiting, share card component, and escrow explainer.

---

## Standard Stack

### Core (already installed, no new installs needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `html2canvas` | 1.4.1 | DOM-to-canvas for PNG export | Already in `client/package.json`, used in `CombatCard.js` |
| `mongoose` | 9.2.1 | MongoDB ODM for stats persistence | Already in `server/package.json` |
| `socket.io` | 4.4.1 | Real-time stats delivery | Already installed |
| React | 18.1.0 | UI rendering for tabs, cards | Already installed |

### Technique: X/Twitter Web Intent (no library needed)

```javascript
// Source: https://developer.twitter.com/en/docs/twitter-for-websites/tweet-button/guides/web-intent
const tweetUrl = `https://twitter.com/intent/tweet?` +
  `text=${encodeURIComponent(text)}&` +
  `url=${encodeURIComponent(url)}&` +
  `via=SolShotGG`;
window.open(tweetUrl, '_blank', 'noopener,noreferrer,width=550,height=450');
```

Parameters supported: `text`, `url`, `via`, `hashtags`. No SDK, no API key, no OAuth. Just a URL opened in a popup window. This is stable and documented at developer.twitter.com. (HIGH confidence)

### Alternatives Considered

| Instead of | Could Use | Why Standard Was Kept |
|------------|-----------|----------------------|
| `html2canvas` | `html-to-image` | html2canvas is already installed and working in CombatCard.js; switching adds churn for no benefit |
| `window.open` Twitter Intent | Twitter SDK embed | SDK is overkill for a one-button CTA; Web Intent is the documented lightweight approach |
| MongoDB `$inc` on match end | Separate stats collection | User.stats subdoc is already the schema; no reason to split |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended File Structure Changes

```
client/src/
├── screens/
│   ├── WinScreen.js         # Refactor: add tabs (Result/Progress/Action)
│   ├── LoseScreen.js        # Refactor: add tabs (same structure, fewer action items)
│   └── LobbyScreen.js       # Add: escrow explainer modal before first wager
├── components/
│   ├── CombatCard.js        # Exists: K/D ratio + prestige tier already planned
│   ├── ShareCard.js         # NEW: lightweight single-match share image card
│   └── WinScreenTabs.js     # Optional: extract tab logic if WinScreen gets large

server/
├── socket-io/main.js        # Augment: matchEnd payload, getStats rate limit, weapon stats persist
├── models/User.js           # Augment: add kills, deaths, weaponStats fields to stats subdoc
```

### Pattern 1: Tabbed WinScreen Layout

**What:** Three tabs rendered as pill nav (Result | Progress | Action). Active tab state is local React useState. Content panels conditionally rendered.

**When to use:** Already decided in CONTEXT.md. "Progress" tab = SHOT milestones + prestige progress. "Action" tab = share button + Jupiter swap CTA + escrow explainer.

**Key consideration:** The existing WinScreen already renders reward cards, stats grid, settlement TX, and Jupiter swap — these get redistributed across the three tabs without removing functionality.

```jsx
// Pattern: simple tab state, no library needed
const [activeTab, setActiveTab] = useState('result');

const tabs = [
  { id: 'result', label: 'RESULT' },
  { id: 'progress', label: 'PROGRESS' },
  { id: 'action', label: 'ACTION' },
];
```

Tab navigation style: underline pills matching the existing app aesthetic (Bebas Neue font, `var(--am)` amber highlight color). No animation library — CSS `borderBottom` on active tab.

### Pattern 2: SHOT Milestone Breakdown in matchEnd Payload

**What:** The `shotResults[playerId]` returned from `recordMatchPlayed()` currently only provides `{ earned, milestone, newBalance, matchesPlayed }`. For the receipt-style breakdown UI (SHOT from kills, wins, damage), the server needs to return a `breakdown` array.

**Current state:** `recordMatchPlayed()` returns a single `milestone` string (the label of the last triggered milestone). It does not break down individual milestone amounts.

**Required change:** Augment `recordMatchPlayed()` to return an array of triggered milestones with their rewards:
```javascript
// server/services/shot-token.js — augment return value
return {
  earned: totalEarned,
  milestone: milestoneLabel,        // backward compat, last milestone label
  milestones: earnedMilestones,     // NEW: [{ id, label, reward }]
  newBalance: state.balance,
  matchesPlayed: state.totalMatchesPlayed,
};
```

Also include `prestigeInfo` in the `matchEnd` payload so the client can show prestige progress without a separate `getShotInfo` request:
```javascript
// server/socket-io/main.js — in matchEndPayload
const matchEndPayload = {
  winner: matchResult.winner,
  scores: formattedScores,
  roundWins: ms.roundWins,
  goldBalance: goldStates[roomId] || {},
  settlement: settlementInfo,
  wager: ws ? ws.amount : 0,
  shotEarned: shotResults,             // existing
  prestigeInfo: {                      // NEW: per-player prestige snapshot
    [hostId]: hostWallet ? getPrestigeInfo(hostWallet) : null,
    [playerId]: playerWallet ? getPrestigeInfo(playerWallet) : null,
  }
}
```

### Pattern 3: Per-Weapon Stats Schema + Persistence

**What:** Add `kills`, `deaths`, and `weaponStats` Map to `User.stats` schema. Persist during `persistStats()` at match end.

**Schema addition to `server/models/User.js`:**
```javascript
stats: {
  // ... existing fields ...
  kills:        { type: Number, default: 0 },
  deaths:       { type: Number, default: 0 },
  weaponStats:  { type: Map, of: new mongoose.Schema({
    shotsFired:   { type: Number, default: 0 },
    hits:         { type: Number, default: 0 },
    damageDealt:  { type: Number, default: 0 },
  }, { _id: false }), default: new Map() },
}
```

**Why Map not Array:** The Map-of-subdocuments is keyed by weapon ID string. This allows atomic `$inc` on a specific weapon without scanning an array. With ~20 weapons max per game, the document will never approach the 16MB limit.

**Persistence (Mongoose 9.x `$inc` on Map):**
```javascript
// Atomic increment for each weapon used
const weaponInc = {};
for (const [weaponId, stats] of Object.entries(matchWeaponStats)) {
  weaponInc[`stats.weaponStats.${weaponId}.shotsFired`] = stats.shotsFired;
  weaponInc[`stats.weaponStats.${weaponId}.hits`]       = stats.hits;
  weaponInc[`stats.weaponStats.${weaponId}.damageDealt`] = stats.damageDealt;
}
await User.findOneAndUpdate(
  { walletAddress },
  { $inc: { 'stats.kills': killCount, 'stats.deaths': 1, ...weaponInc },
    $set: { lastActive: new Date() } },
  { upsert: true }
);
```

**Tracking weapon stats in match state:** The existing `ms.weaponsUsed` (a `Set` per player of weapon IDs) is already tracked. Need to add `ms.weaponShotsFired`, `ms.weaponHits`, `ms.weaponDamage` Maps on match state. The `fire` handler already iterates `result.damage` — add weapon ID tracking there.

### Pattern 4: getStats Rate Limiting (STAT-02)

**What:** Add per-client cooldown to the `getStats` socket handler. The existing ring-buffer rate limiter in main.js covers burst events globally. `getStats` needs a separate per-client cooldown because it triggers a DB read.

**Simple in-handler approach** (no new Map needed — use closure):
```javascript
client.on('getStats', async () => {
  const now = Date.now();
  if (client._lastStatsFetch && (now - client._lastStatsFetch) < 5000) {
    return; // silent drop — 5s cooldown per socket
  }
  client._lastStatsFetch = now;
  // ... existing DB query ...
});
```

This is consistent with how the existing server code throttles per-socket state — using properties on the `client` object. No new library needed.

### Pattern 5: X/Twitter Share Button

**What:** On the Action tab of WinScreen, a button opens `window.open()` with the pre-filled tweet. The "image card attached" requirement means the share button first triggers the ShareCard render/export to clipboard, then opens Twitter.

**Decision from CONTEXT.md:** Share text includes result + earnings, NO emojis. Pattern:
```
"Just won 0.18 SOL on @SolShotGG -- No download, skill-based artillery combat on Solana. solshot.gg"
```

**Implementation:**
```javascript
const handleShare = useCallback(async () => {
  // 1. Render share card to clipboard (if supported)
  if (shareCardRef.current) {
    await exportShareCard(shareCardRef.current); // html2canvas → clipboard
  }
  // 2. Open Twitter intent
  const text = `Just won ${solWon.toFixed(3)} SOL on @SolShotGG -- ` +
    `No download, skill-based artillery combat on Solana.`;
  const url = 'https://solshot.gg';
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&via=SolShotGG`;
  window.open(tweetUrl, '_blank', 'noopener,noreferrer,width=550,height=450');
}, [solWon, shareCardRef]);
```

**Note:** The share card image is copied to clipboard first, so the user can paste it into the tweet composer. Twitter Web Intent does not support attaching images programmatically.

### Pattern 6: ShareCard Component (Lightweight)

**What:** A simpler sibling to `CombatCard.js`. Renders a fixed-width card (320px wide) with: match outcome (W/L), SOL earned, SHOT earned. Uses the same brand design language.

**Implementation approach:** Same structure as `CombatCard` — `useRef` on a div, `html2canvas` to capture, `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`.

**Key difference from CombatCard:** ShareCard is NOT shown as an overlay — it renders offscreen (position: absolute, left: -9999px) so html2canvas can capture it without user-visible flash. The user never sees the card — they just see "Copied to clipboard."

```jsx
// Offscreen rendering pattern for html2canvas
<div ref={shareCardRef} style={{
  position: 'absolute',
  left: -9999,
  top: -9999,
  width: 320,
  // ... card styles ...
}} aria-hidden="true">
  {/* card content */}
</div>
```

### Pattern 7: Escrow Explainer (UI-16)

**What:** CONTEXT.md defers placement to Claude's discretion. Recommendation: show as a one-time modal in `LobbyScreen.js` when the user first selects a wager > 0. Track with `localStorage.getItem('solshot_escrow_seen')`.

**Why lobby (not post-match):** The post-match context is victory/defeat — attention is on results. The lobby is the natural pre-wager moment when the user is selecting wager amount and mode. A modal before confirming the first wager is the right educational moment.

**Implementation:**
```javascript
// In LobbyScreen.js, when wager > 0 is selected and room is joined
const hasSeenEscrow = localStorage.getItem('solshot_escrow_seen');
if (!hasSeenEscrow && wager > 0) {
  setShowEscrowExplainer(true);
}
// On modal dismiss:
localStorage.setItem('solshot_escrow_seen', '1');
```

### Pattern 8: Barracks Empty State + Live Stats (STAT-03)

**What:** The existing `BarracksScreen.js` already calls `socket.emit('getStats')` and renders stats. The "empty state" case (0 matches) renders `--` via `fmt()`. The requirement is to replace the `--` empty state with a CTA: "Play your first match" + button to lobby.

**Current code already handles this:** `matchesPlayed === 0` → fmt returns `'--'` → the statusLine shows "PLAY MATCHES TO BUILD YOUR RECORD". The CTA button just needs to be wired: `<Button onClick={() => navigate('lobby')}>FIND A MATCH</Button>`.

The K/D stats from the new `kills`/`deaths` fields need to be displayed in the stats grid. The `stats` object from `statsData` event will include them after the schema addition.

### Anti-Patterns to Avoid

- **Don't add prestige progress to WinScreen via a separate socket request.** Embed it in the `matchEnd` payload from the server. An extra `getShotInfo` roundtrip after matchEnd is redundant since the server already has the updated state.
- **Don't render the ShareCard as a visible modal.** Render it offscreen, capture it silently, copy to clipboard. Showing it as a second overlay creates UX noise.
- **Don't use `allowTaint: true` on html2canvas.** The existing `CombatCard.js` uses `useCORS: true` and `crossOrigin="anonymous"` on images — follow that pattern. `allowTaint` makes the canvas un-readable by the clipboard API.
- **Don't block matchEnd emit waiting for stat persistence.** The existing code fires `persistStats()` as fire-and-forget. Keep it that way. Stats latency is acceptable; match transition must be instant.
- **Don't create a new rate-limit Map for getStats.** Use `client._lastStatsFetch` property — consistent with existing patterns in main.js.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PNG export to clipboard | Custom canvas rasterizer | `html2canvas` (already installed) | Already working in CombatCard.js |
| Twitter share | Twitter SDK embed | `window.open()` + Web Intent URL | SDK is 50KB+, Web Intent is a URL |
| Per-weapon stat storage | Separate Mongoose model | Map subdoc on User.stats | Atomic `$inc` by key, no join needed |
| Tab navigation | react-tabs, @headlessui | Plain React useState | 3 tabs, no animation, no a11y complexity |
| Stats rate limiting | rate-limiter-flexible | `client._lastStatsFetch` timestamp | Already existing pattern in codebase |
| Clipboard image copy | FileReader tricks | `navigator.clipboard.write` + ClipboardItem | Already used in CombatCard.js |

**Key insight:** The codebase already solves most of these problems. The primary risk of this phase is re-implementing what already exists.

---

## Common Pitfalls

### Pitfall 1: html2canvas + Offscreen Element
**What goes wrong:** html2canvas fails to render or produces blank output when the target element is `display: none` or has `visibility: hidden`. It only works on visible (or off-screen-via-position) elements.
**Why it happens:** html2canvas walks the DOM and computes styles — `display: none` elements have no computed layout.
**How to avoid:** Render ShareCard with `position: absolute; left: -9999px; top: -9999px` (off-viewport but still in layout flow). Do NOT use `display: none` or `visibility: hidden`.
**Warning signs:** html2canvas returns a blank white canvas.

### Pitfall 2: html2canvas + CSS Variables
**What goes wrong:** html2canvas 1.4.x has partial support for CSS custom properties (`var(--rg)`, etc.). If the canvas renders with wrong colors, it's because html2canvas resolved `var(--X)` to empty string.
**Why it happens:** html2canvas resolves CSS variables at capture time. Variables defined on `:root` are generally fine, but variables that depend on dynamic context or component-scoped CSS may not resolve.
**How to avoid:** The existing `CombatCard.js` works with the app's CSS variables (confirmed by codebase reading). ShareCard should use the same inline style pattern with explicit fallback colors where critical.
**Warning signs:** Card renders with wrong colors in exported image.

### Pitfall 3: Clipboard API in Insecure Context
**What goes wrong:** `navigator.clipboard.write()` throws `NotAllowedError` in HTTP (non-HTTPS) or when called outside a user gesture.
**Why it happens:** Clipboard API requires a secure context and user activation.
**How to avoid:** Always call clipboard write inside a click handler (not in useEffect or after a timeout). The existing CombatCard.js already handles this correctly with a try/catch fallback to download. Reuse the same pattern in ShareCard.
**Warning signs:** `navigator.clipboard` is undefined or throws even in production.

### Pitfall 4: matchEnd Payload Missing Prestige Data
**What goes wrong:** WinScreen tries to read prestige progress from `screenData.prestigeInfo[myId]` but it's undefined because the server didn't add it to the payload yet.
**Why it happens:** The `matchEnd` payload in main.js currently has `{ winner, scores, roundWins, goldBalance, settlement, wager, shotEarned }` — no prestige data.
**How to avoid:** Add `prestigeInfo` field to `matchEndPayload` in main.js (see Pattern 2 above). The `getPrestigeInfo()` function already exists in shot-token.js and is synchronous.
**Warning signs:** `screenData.prestigeInfo` is `undefined` on WinScreen; prestige progress shows "--".

### Pitfall 5: Weapon Stats — Tracking vs. Persistence Mismatch
**What goes wrong:** `ms.weaponsUsed[playerId]` is a Set of weapon IDs used, but it does NOT track shots fired, hits, or damage per weapon. The fire handler tracks `ms.scores` (total damage) and `ms.kills` but not per-weapon breakdowns.
**Why it happens:** Per-weapon stats were never needed before; the existing tracking only records what weapons were used (for the `no_prestige_win` milestone check).
**How to avoid:** Add `ms.weaponShotsFired`, `ms.weaponHits`, `ms.weaponDamage` Maps on match state initialization. Update the `fire` handler to populate these maps by weapon ID.
**Warning signs:** `weaponStats` in MongoDB shows all zeros; "favorite weapon" on Barracks shows nothing.

### Pitfall 6: getStats Returns Stale Data
**What goes wrong:** Player plays a match, then immediately opens Barracks, sees 0 matches because `persistStats()` fire-and-forget hasn't completed yet.
**Why it happens:** `persistStats()` is async and fire-and-forget. The DB write may not complete before the `getStats` query runs.
**How to avoid:** This is acceptable latency for devnet. No fix needed. Document it: stats may lag by ~1 second after match end. Do not add `await` to `persistStats()` — it would delay the `matchEnd` emit.
**Warning signs:** Consistent discrepancy between in-match SHOT earned and Barracks stats.

### Pitfall 7: LoseScreen Parity
**What goes wrong:** WinScreen gets the tabbed layout but LoseScreen is forgotten. Players who lose also see SHOT earned and prestige progress (even if less exciting).
**Why it happens:** The requirements mention "post-match screen" generically. Both WinScreen and LoseScreen receive the same `matchEnd` payload spread.
**How to avoid:** Apply the same tab structure to LoseScreen. The "Result" tab shows loss; "Progress" tab shows SHOT earned + prestige progress; "Action" tab has Jupiter swap CTA (no share button, or share with "I lost but I'm improving" framing).
**Warning signs:** Tests on LoseScreen show no tab navigation.

---

## Code Examples

### SHOT Milestone Itemized Breakdown (server)

```javascript
// Source: server/services/shot-token.js — augment recordMatchPlayed return
const earnedMilestones = [];
for (const ms of SHOT_MILESTONES) {
  if (state.milestonesEarned.includes(ms.id)) continue;
  if (!ms.check(state, ctx)) continue;
  const reward = Math.floor(ms.reward * rateMultiplier);
  state.milestonesEarned.push(ms.id);
  state.balance += reward;
  totalEarned += reward;
  earnedMilestones.push({ id: ms.id, label: ms.label, reward });
  milestoneLabel = ms.label;
}
// Return:
return {
  earned: totalEarned,
  milestone: milestoneLabel,
  milestones: earnedMilestones,    // NEW: array of triggered milestones this match
  newBalance: state.balance,
  matchesPlayed: state.totalMatchesPlayed,
};
```

### Prestige Progress Display (client WinScreen)

```javascript
// Source: client/src/screens/WinScreen.js — Progress tab
const myId = window.socket?.id;
const myPrestige = screenData?.prestigeInfo?.[myId];
const myShot = screenData?.shotEarned?.[myId];

// Show: current SHOT balance, next tier cost, progress bar
const shotBalance = myPrestige?.balance || 0;
const nextTier = myPrestige?.nextTier;
const progressPct = nextTier
  ? Math.min(100, Math.round((shotBalance / nextTier.burnCost) * 100))
  : 100;
```

### Share Card Offscreen Capture

```javascript
// Source: pattern from CombatCard.js, adapted for offscreen
const exportShareCard = useCallback(async (cardElement) => {
  try {
    const canvas = await html2canvas(cardElement, {
      backgroundColor: '#0a0c08',
      scale: 2,          // 2x is sufficient for share; 3x is overkill
      logging: false,
      useCORS: true,
    });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
      return true;
    }
  } catch (err) {
    console.warn('[ShareCard] Export failed:', err.message);
  }
  return false;
}, []);
```

### Mongoose Per-Weapon $inc

```javascript
// Source: pattern from existing persistStats in main.js
const weaponInc = {};
for (const [wId, stats] of Object.entries(matchWeaponStats[playerAddr] || {})) {
  weaponInc[`stats.weaponStats.${wId}.shotsFired`] = stats.shotsFired || 0;
  weaponInc[`stats.weaponStats.${wId}.hits`]       = stats.hits || 0;
  weaponInc[`stats.weaponStats.${wId}.damageDealt`] = stats.damageDealt || 0;
}
await User.findOneAndUpdate(
  { walletAddress: playerAddr },
  {
    $inc: {
      'stats.matchesPlayed': 1,
      'stats.kills': killCount,
      'stats.deaths': deathCount,
      ...weaponInc,
    },
    $set: { lastActive: new Date() }
  },
  { upsert: true }
);
```

### getStats Rate Limiting

```javascript
// Source: pattern consistent with existing main.js per-socket state
client.on('getStats', async () => {
  const now = Date.now();
  if (client._lastStatsFetch && (now - client._lastStatsFetch) < 5000) {
    return; // 5s cooldown
  }
  client._lastStatsFetch = now;
  const wallet = authenticatedWallets[client.id] || null;
  const defaultStats = { /* ... existing ... */ };
  if (!wallet || !isDbConnected()) {
    client.emit('statsData', defaultStats);
    return;
  }
  try {
    const user = await User.findOne({ walletAddress: wallet });
    client.emit('statsData', user?.stats || defaultStats);
  } catch (err) {
    console.error('[Stats] getStats error:', err.message);
    client.emit('statsData', defaultStats);
  }
});
```

### X/Twitter Share Button

```javascript
// Source: https://developer.twitter.com/en/docs/twitter-for-websites/tweet-button/guides/web-intent
const handleShare = useCallback(async () => {
  // 1. Copy share card to clipboard (best-effort)
  if (shareCardRef.current) {
    const copied = await exportShareCard(shareCardRef.current);
    if (copied) setShareFeedback('CARD COPIED — PASTE INTO TWEET');
  }
  // 2. Open Twitter intent popup
  const text = wager > 0
    ? `Just won ${solWon.toFixed(3)} SOL on @SolShotGG -- No download, skill-based artillery combat on Solana.`
    : `Just played on @SolShotGG -- No download, skill-based artillery combat on Solana.`;
  const intentUrl = `https://twitter.com/intent/tweet?` +
    `text=${encodeURIComponent(text)}&` +
    `url=${encodeURIComponent('https://solshot.gg')}&` +
    `via=SolShotGG`;
  window.open(intentUrl, '_blank', 'noopener,noreferrer,width=550,height=450');
}, [wager, solWon, shareCardRef, exportShareCard]);
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Stats shown as "--" in Barracks | Live stats from MongoDB via `getStats` socket | `getStats` handler exists but lacks rate limit |
| WinScreen flat layout | WinScreen tabbed (Result/Progress/Action) | Current layout is flat; tabbing is the Phase 11 add |
| SHOT earned shown as single number | Receipt-style breakdown by milestone | `shotResults[id].milestone` only has last milestone; needs `milestones[]` array |
| No prestige progress on post-match | Prestige progress bar on Progress tab | Needs `prestigeInfo` added to `matchEnd` payload |
| No share button | X/Twitter share + clipboard image | Fully new feature |
| CombatCard shows basic stats | CombatCard to include K/D + prestige tier | Currently shows matchesPlayed/wins/losses/SOL/SHOT — K/D needs schema addition |

**Deprecated/outdated:**
- The `shotResults[id].milestone` field (single string): Will be supplemented by `milestones[]` array. Keep for backward compat.

---

## Open Questions

1. **LoseScreen tab structure**
   - What we know: CONTEXT.md describes "post-match screen" without specifying win-only. Both WinScreen and LoseScreen receive the same `matchEnd` payload.
   - What's unclear: Should LoseScreen have an identical 3-tab structure, or a simplified 2-tab (Result + Action)?
   - Recommendation: Apply the same 3-tab structure. The "Progress" tab on LoseScreen shows SHOT earned (even if 0) and prestige progress. Symmetry reduces code duplication.

2. **ShareCard for LoseScreen**
   - What we know: CONTEXT.md says "share includes an image card." The context describes winning.
   - What's unclear: Does the loser get a share button? If so, what does the share card show?
   - Recommendation: Include a share button on LoseScreen but with different text: "I lost on @SolShotGG but I'll be back -- skill-based artillery combat on Solana." Keep the share card minimal — just result + SHOT earned.

3. **Weapon stats tracking: shots fired vs. hits**
   - What we know: The `fire` handler in main.js processes shots and tracks damage via `result.damage`. A "hit" currently means `result.damage > 0` for a player.
   - What's unclear: Does "shots fired" mean every `fire` event, or only those that produced `result.impact === 'direct'` (not terrain)?
   - Recommendation: "shots fired" = every `fire` event that completes (post-result). "hits" = shots where `Object.values(result.damage).some(d => d > 0)`. Track both.

4. **K/D ratio definition with multiple rounds**
   - What we know: A player can die multiple times per match (in BO3/BO5). `ms.kills` and `ms.hp` track per-round but are reset between rounds.
   - What's unclear: Are "kills" and "deaths" per-match totals or per-round totals?
   - Recommendation: Track cumulative kills and deaths across all rounds in a match. Add `ms.totalKills` and `ms.totalDeaths` that accumulate without reset across rounds. These feed into the DB update at match end.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `C:/Users/johnk/SolShot-clean/client/src/screens/WinScreen.js` — existing screen structure
- Codebase: `C:/Users/johnk/SolShot-clean/client/src/screens/BarracksScreen.js` — existing stats display
- Codebase: `C:/Users/johnk/SolShot-clean/client/src/components/CombatCard.js` — existing html2canvas usage pattern
- Codebase: `C:/Users/johnk/SolShot-clean/server/socket-io/main.js` lines 1661-1675, 2270-2315 — getStats handler, persistStats, matchEnd payload
- Codebase: `C:/Users/johnk/SolShot-clean/server/services/shot-token.js` — recordMatchPlayed return value, SHOT_MILESTONES array
- Codebase: `C:/Users/johnk/SolShot-clean/server/models/User.js` — existing stats schema
- MDN Web Docs: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write — Clipboard.write() Baseline 2024, PNG support
- X/Twitter Developer Docs: https://developer.twitter.com/en/docs/twitter-for-websites/tweet-button/guides/web-intent — Web Intent URL parameters

### Secondary (MEDIUM confidence)
- WebSearch verified: html2canvas 1.4.1 `useCORS: true` + `crossOrigin="anonymous"` pattern for local assets — confirmed working by CombatCard.js in codebase
- WebSearch verified: Twitter Web Intent `https://twitter.com/intent/tweet?text=...&url=...&via=...` — confirmed via multiple developer documentation sources

### Tertiary (LOW confidence)
- WebSearch (html-to-image as alternative): Not needed; html2canvas already installed and working
- WebSearch (socket.io-ratelimiter npm package): Not needed; manual cooldown sufficient for single handler

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — html2canvas and mongoose are already installed and used; no new packages needed
- Architecture: HIGH — all patterns derived from existing codebase; small augmentations, not greenfield
- Pitfalls: HIGH — all pitfalls derived from reading actual code (CombatCard.js html2canvas usage, main.js fire handler, User.js schema)
- Open questions: MEDIUM — questions about K/D counting and LoseScreen parity require product decision, not technical research

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable libraries; only X/Twitter API could change)
