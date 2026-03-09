---
phase: 25-menu-token-masking
verified: 2026-03-01T12:00:00Z
status: gaps_found
score: 4/7 must-haves verified
gaps:
  - truth: "WinScreen/LoseScreen Progress tab shows raw SHOT amounts"
    status: failed
    reason: "Progress tab still shows raw SHOT amounts in milestone rewards and prestige progress bar labels"
    artifacts:
      - path: "client/src/screens/WinScreen.js"
        issue: "Lines 463, 486 display raw SHOT amounts in milestone rewards and prestige progress"
      - path: "client/src/screens/LoseScreen.js"
        issue: "Lines 436, 459 same SHOT references as WinScreen in Progress tab"
    missing:
      - "Replace milestone reward text with masked values or hide SHOT milestone section entirely"
      - "Replace prestige progress label with masked values"
  - truth: "All visible SHOT references replaced with ???"
    status: failed
    reason: "No ??? replacements found anywhere in the codebase. Multiple screens still display raw SHOT amounts."
    artifacts:
      - path: "client/src/screens/PrestigeScreen.js"
        issue: "Lines 281, 301, 306, 332, 368 show raw SHOT amounts"
      - path: "client/src/components/WalletDisplay.js"
        issue: "Lines 57-63 show SHOT balance chip when connected wallet is present"
      - path: "client/src/components/PrestigeIntro.js"
        issue: "Line 114 says Burn SHOT to unlock prestige tiers"
      - path: "client/src/screens/ArmoryScreen.js"
        issue: "Line 6 has SHOT BURNS tab label; line 181 filters by SHOT"
      - path: "client/src/screens/BarracksScreen.js"
        issue: "Line 282 shows SHOT EARNED stat label"
      - path: "client/src/components/FAQ.js"
        issue: "Lines 13, 17-18, 23, 33 contain detailed SHOT token explanations"
      - path: "client/src/components/ShareCard.js"
        issue: "Line 138 shows +N SHOT in share card image"
      - path: "client/src/data/tiers.js"
        issue: "Lines 18-47 show all cosmetic item prices as N SHOT"
    missing:
      - "Replace all user-visible SHOT amount displays with ??? across affected files"
      - "Note: PrestigeScreen and ArmoryScreen disabled from menu but reachable via PrestigeIntro"
  - truth: "PrestigeScreen SHOT references masked"
    status: failed
    reason: "PrestigeScreen still fully functional with raw SHOT amounts. Reachable via PrestigeIntro nudge."
    artifacts:
      - path: "client/src/screens/PrestigeScreen.js"
        issue: "Full SHOT economy UI: burn buttons with costs, balance display, Jupiter Swap, tier list"
    missing:
      - "Either mask all SHOT amounts with ??? on PrestigeScreen or block PrestigeIntro navigation"
---

# Phase 25: Menu and Token Masking Verification Report

**Phase Goal:** The menu presents a clean practice-mode product with no token economy visible.
**Verified:** 2026-03-01
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Menu subtagline reads SKILL-BASED ARTILLERY COMBAT | VERIFIED | MenuScreen.js line 204: correct text, old wager text is gone |
| 2 | Armory, Prestige, Barracks buttons greyed out with COMING SOON badge | VERIFIED | MenuScreen.js lines 177-179: comingSoon: true; line 219: variant disabled; line 220: onClick undefined; lines 225-227: COMING SOON badge |
| 3 | PLAY FREE is the only active button | VERIFIED | MenuScreen.js line 176: PLAY FREE has no comingSoon flag, variant primary, navigates to lobby |
| 4 | SHOT price ticker removed from TopBar | VERIFIED | TopBar.js has no import of ShotPriceTicker. File exists but is orphaned |
| 5 | WinScreen hides SHOT reward card, Jupiter CTA, CONVERT WINNINGS | PARTIAL | No SHOT reward card in Result tab. No Jupiter CTA or CONVERT WINNINGS. BUT Progress tab still shows raw SHOT amounts in milestone rewards (line 463) and prestige progress bar (line 486) |
| 6 | ShotExplainer modal disabled | VERIFIED | ShotExplainer.js exists but not imported anywhere -- cannot render |
| 7 | All visible SHOT references replaced with ??? | FAILED | Zero ??? replacements found in codebase. SHOT amounts shown raw in WinScreen, LoseScreen, PrestigeScreen, WalletDisplay, ArmoryScreen, BarracksScreen, FAQ, ShareCard, PrestigeIntro |

**Score:** 4/7 truths verified (truths 1-4 and 6 pass; truth 5 partial; truth 7 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| client/src/screens/MenuScreen.js | Subtagline changed, buttons disabled | VERIFIED | 297 lines, substantive, wired via App.js |
| client/src/components/TopBar.js | ShotPriceTicker removed | VERIFIED | 106 lines, no ShotPriceTicker import |
| client/src/screens/WinScreen.js | SHOT card/Jupiter/CONVERT removed | PARTIAL | No SHOT card in Result tab, but Progress tab leaks SHOT amounts |
| client/src/screens/LoseScreen.js | Same masking as WinScreen | PARTIAL | Same Progress tab SHOT leakage |
| client/src/components/ShotPriceTicker.js | Returns null or removed from TopBar | VERIFIED | Orphaned file, not imported anywhere |
| client/src/components/ShotExplainer.js | Disabled | VERIFIED | Orphaned file, not imported anywhere |
| client/src/screens/PrestigeScreen.js | SHOT amounts masked with ??? | FAILED | Full SHOT economy UI intact |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| MenuScreen ARMORY button | ArmoryScreen | navigate | BLOCKED | comingSoon: true sets onClick to undefined |
| MenuScreen PRESTIGE button | PrestigeScreen | navigate | BLOCKED | comingSoon: true prevents click |
| MenuScreen BARRACKS button | BarracksScreen | navigate | BLOCKED | comingSoon: true prevents click |
| WinScreen PrestigeIntro | PrestigeScreen | onNavigatePrestige | WIRED (leak) | Line 507: Learn More navigates to unmasked PrestigeScreen |
| LoseScreen PrestigeIntro | PrestigeScreen | onNavigatePrestige | WIRED (leak) | Line 480: Same backdoor as WinScreen |
| App.js | PrestigeScreen | case prestige | WIRED | Line 146-147: No guard against non-menu navigation |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| MENU-01: Armory/Prestige/Barracks disabled with COMING SOON | SATISFIED | None |
| MENU-02: PLAY FREE only active button | SATISFIED | None |
| MENU-03: Subtagline changed to SKILL-BASED ARTILLERY COMBAT | SATISFIED | None |
| MASK-01: ShotPriceTicker hidden, removed from TopBar | SATISFIED | None |
| MASK-02: WinScreen hides SHOT card, Jupiter CTA, CONVERT WINNINGS | PARTIALLY SATISFIED | Progress tab still shows raw SHOT amounts |
| MASK-03: ShotExplainer disabled | SATISFIED | Not imported anywhere |
| MASK-04: All visible SHOT references replaced with ??? | BLOCKED | Zero ??? found. SHOT amounts raw everywhere |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| WinScreen.js | 463 | Raw SHOT amounts in milestone rewards | BLOCKER | Users see +N SHOT on Progress tab after every match |
| WinScreen.js | 486 | Raw SHOT amounts in prestige bar label | BLOCKER | Users see balance/burnCost SHOT to TierName |
| LoseScreen.js | 436, 459 | Same as WinScreen | BLOCKER | Same SHOT leakage on loss |
| PrestigeScreen.js | 281, 301, 306, 332, 368 | Full SHOT economy UI | WARNING | Disabled from menu but reachable via PrestigeIntro |
| WalletDisplay.js | 57-63 | SHOT balance chip displayed | WARNING | Shows N SHOT next to SOL balance when wallet connected |
| PrestigeIntro.js | 114 | Burn SHOT to unlock prestige tiers | WARNING | Shows in WinScreen/LoseScreen Progress tab |
| FAQ.js | 13, 17-18, 23, 33 | Multiple SHOT token explanations | WARNING | FAQ accessible from HowToPlay screen |
| ShareCard.js | 138 | +N SHOT in exported share card | WARNING | Share card image contains SHOT references |

### Human Verification Required

#### 1. Menu Visual Appearance
**Test:** Load the app and view the MenuScreen
**Expected:** PLAY FREE prominent (primary red), ARMORY/PRESTIGE/BARRACKS greyed out with COMING SOON badges, subtagline reads SKILL-BASED ARTILLERY COMBAT
**Why human:** Visual layout and styling need visual confirmation

#### 2. Disabled Buttons Non-Interactive
**Test:** Click on ARMORY, PRESTIGE, BARRACKS buttons on MenuScreen
**Expected:** No navigation occurs, cursor shows not-allowed
**Why human:** Need to confirm disabled state prevents all interaction

#### 3. Progress Tab SHOT Visibility
**Test:** Complete a practice match, view WinScreen/LoseScreen, click PROGRESS tab
**Expected:** Currently shows raw SHOT amounts -- verify gap is visible
**Why human:** Need match completion to populate progress data

## Gaps Summary

The phase achieved its primary menu-level goals: the subtagline is correct (MENU-03), the three feature buttons are properly disabled with COMING SOON badges (MENU-01), PLAY FREE is the only active button (MENU-02), the SHOT price ticker is removed from TopBar (MASK-01), and ShotExplainer cannot render (MASK-03).

However, **MASK-04 (replace all SHOT references with ???) was not implemented at all**. Zero instances of ??? exist in the codebase. Raw SHOT amounts are visible in:

1. **WinScreen and LoseScreen Progress tabs** -- milestone rewards show +N SHOT, prestige progress bar shows balance / burnCost SHOT to TierName. These are visible after every match.

2. **PrestigeScreen** -- full SHOT economy intact (burn costs, balance display, Jupiter Swap, tier costs). Although disabled from the menu, it is reachable via the PrestigeIntro Learn More button on Win/LoseScreen Progress tabs.

3. **WalletDisplay** -- SHOT balance chip visible when wallet connected.

4. **Supporting components** -- FAQ, ShareCard, PrestigeIntro all contain unmasked SHOT references.

The core issue is that token masking was only applied at the menu navigation level (disabling buttons) and the TopBar (removing ticker), but the actual SHOT amount displays throughout the application were not modified. The requirement to replace visible SHOT references with ??? was not executed.

---

_Verified: 2026-03-01_
_Verifier: Claude (gsd-verifier)_
