# CLAUDE_COMMS — The Arcade repo

> Cross-session journal for any Claude working in this repo.
>
> **For arcade-only decisions and progress notes,** entries land here.
> **For cross-cutting decisions that span both repos** (Arcade + SolShot),
> the canonical comms file is `Docs/internal/CLAUDE_COMMS.md` in the
> SolShot repo (`JJ-ME55/SolShot`). Both Claudes read both files.

## Protocol

1. **Date-stamp every entry.** ISO date + UTC time.
2. **Sign every entry.** `[main-claude]`, `[fishyboy-claude]`, or `[other-claude]`.
3. **Categorise each entry.** STATUS / DECISION / HANDOFF / FYI / REPLY / QUESTION.
4. **Be honest about what got done.** Verify with `git log -1` before claiming a commit. Paste hashes.
5. **Don't restate the design doc.** Link to it. `THE_ARCADE_v1_DESIGN.md` is the source of truth for the proposal.
6. **Don't litigate decisions that have landed.** The decisions table at the bottom of `THE_ARCADE_v1_DESIGN.md` + the headline-decisions table in main-claude's 2026-05-19 reply on SolShot's `Docs/internal/CLAUDE_COMMS.md` are locked. Surface concerns; don't unilaterally reverse.

---

## 2026-05-19 · `[main-claude]` — KICKOFF

This repo is bootstrapped from a scaffold landed on SolShot worktree branch `claude/focused-elion-939d41`, commit `fdf6bab`.

The full reply to `@fishyboy-claude`'s `THE_ARCADE_v1_DESIGN.md` proposal lives in the SolShot repo at `Docs/internal/CLAUDE_COMMS.md` (2026-05-19 entry). That entry contains:

- 7 headline decisions locked
- 3 open architectural items deferred (Arcade Champion formula, $TOKENS/$SHOT, domain)
- File-by-file inventory of what landed on the SolShot side (server endpoints, client receiver hook, scaffold)

**Read order for `@fishyboy-claude` on first boot here:**

1. `docs/FISH_KICKOFF.md` (this repo) — soft-landing onboarding
2. `docs/THE_ARCADE_v1_DESIGN.md` (this repo) — design proposal
3. `docs/MIGRATION_PLAYBOOK.md` (this repo) — operational rollout
4. SolShot repo's `Docs/internal/CLAUDE_COMMS.md`, 2026-05-19 main-claude entry — cross-cutting decisions

### State as of kickoff

| Surface | State |
|---|---|
| SolShot server endpoints | ✅ `/api/arcade/session-handoff` + `/api/arcade/session-validate` shipped (commit `fdf6bab` on SolShot worktree) |
| SolShot client receiver | ✅ `useArcadeTokenReceiver` hook wired in App.js |
| SolShot CORS allowlist | ✅ `the-arcade.vercel.app` added (commit `9950e59` on SolShot worktree) |
| Render `ARCADE_SESSION_SECRET` | ✅ in `render.yaml`, `generateValue: true` |
| Vercel project (`the-arcade`) | ✅ created on `jj-me55s-projects` |
| GitHub repo | ✅ created (this repo); awaiting initial push |
| Privy origins (the-arcade.vercel.app) | ⏳ JJ to add in Privy dashboard |
| Vercel env vars (5 of them) | ⏳ JJ to set after first deploy succeeds |
| Brand mocks | ⏳ Fish to commit to `src/assets/brand/` |
| Game lift (KU + BB) | ⏳ awaits Fish's freeze + lift-moment coordination with JJ |

### Outstanding `@main-claude` work (in parallel to Fish's visual build)

1. New SolShot server endpoints: `GET /api/arcade/leaderboard/:game`, `POST /api/arcade/score`, `GET /api/arcade/profile/:callsign` — reads from existing `BasketballScore` + `KeepieUppiesScore` schemas, joins with `users` for callsign resolution. No schema migration in v1 — that's a deferred tidy-up PR.
2. `POST /api/wager-waitlist` endpoint + `WagerWaitlist` Mongo model.
3. Welcome banner component on SolShot client — reads `localStorage.solshot_arcade_referral`, dismissable.

JJ owns the green-light on order. Default is to start (1) once Fish has the freeze moment scheduled.

— main-claude
