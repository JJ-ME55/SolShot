# Claude Comms — Inter-Agent Async Log

> Append-only log between the two Claudes working on this codebase
> (one helping John on `main`/`launch`, one helping FishyBoy on
> `sandbox/fishyboy`). Treat it like a shared dev journal.

---

## Protocol

1. **Append, don't edit.** Once an entry is written, never change it.
   Preserves history and trust.
2. **Sign every entry.** Use `[main-claude]` or `[fishyboy-claude]`.
3. **Timestamp.** ISO format: `YYYY-MM-DD HH:MM UTC` (or local TZ if
   you note it).
4. **Tag** with one of: `STATUS` / `QUESTION` / `DECISION` / `HANDOFF`
   / `FYI`.
5. **For human attention**, prefix with `@johnk` so it can be grepped.
6. **Boot a session?** Leave a one-line check-in even if you have
   nothing else to say. Lets the other Claude know you're around.
7. **Commit each new entry** with message `docs(comms): <one-line summary>`
   so `git log Docs/CLAUDE_COMMS.md` is a useful timeline.

---

## Tag glossary

- **STATUS** — "I'm online" / "I just shipped X" / general check-in
- **QUESTION** — directed at the other Claude (or `@johnk`). Should
  get a reply before the asker continues.
- **DECISION** — record of a choice made. Update `Docs/DECISIONS.md`
  for anything architectural.
- **HANDOFF** — "I started X but ran out of time / context. Here's
  the state and the next step." Crucial for continuity.
- **FYI** — heads up about something the other Claude should know
  but doesn't need to act on.

---

## Log

---

### 2026-04-28 — `[main-claude]` — STATUS

Set up the FishyBoy sandbox today. Branch `sandbox/fishyboy` created
from `launch`. Populated `CLAUDE.md`, `Docs/PROJECT_BRIEF.md`, this
comms file, `Docs/DECISIONS.md`, `Docs/OPEN_QUESTIONS.md`, and the
`.githooks/pre-push` for soft branch enforcement.

When `fishyboy-claude` boots its first session, it will leave a STATUS
entry below. That's the heartbeat that confirms onboarding worked.

Recent shipped work on `main` since the project's last documented
state (relevant for FishyBoy):
- Full design system redesign (CRT terminal aesthetic) — every screen
- TrophyShareCard for post-match sharing (`client/src/components/TrophyShareCard.js`)
- MVP weapon tracking per match (server `formattedScores` now
  includes `weaponDamage` / `weaponShots` / `weaponHits`)
- All weapons display ×∞ (purchases are unlimited use within match)
- Telegram bot command handlers via Telegraf
  (`server/services/bot.js`)
- Code splitting via React.lazy() — main bundle dropped to 1.81 MB gz
- BarracksScreen RECENT ENGAGEMENTS table (last 6 matches)
- AI bot improvements: re-aims after taking damage, terrain peak
  clearance, vertical aim compensation

Phase 8 (Telegram Mini App) is the active work area on `launch`.
`Docs/TELEGRAM_PLAN.md` has the full phase plan. Phase 3 (challenge
sharing via `switchInlineQuery`) is the recommended first
contained-scope feature for FishyBoy if he's looking for ideas.

---

_(Append new entries below this line. Don't edit anything above.)_
