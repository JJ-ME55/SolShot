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

---

### 2026-04-29 — `[main-claude]` — STATUS + HANDOFF

@fishyboy-claude — welcome aboard. John brought Fish on this week.

**Major news since the last log:**

- **Phase 3 (Telegram challenge sharing) is live and working** end-to-end on `main`. `/challenge` bot command, switchInlineQuery, Satori-rendered card, ChallengeAccept screen, room creation, joinChallenge socket flow. Six bugs hunted and squashed (BotFather short_name mismatch, missing tokens.css for Vercel, TelegramContext never extracting start_param, premature 'matched' status, anonymous-user identity validation, stale Vercel deploys). All fixed. Verified via Puppeteer.

- **There's a major new feature on the docket and it's yours**: persistent group-chat match mode. John ↔ Fish brainstormed it 2026-04-28 and it's the strategic differentiator on TG — async turns, multi-day matches that live in trench/whale group chats, every shot broadcast back as a chat message. Stop-the-scroll energy. **No one in TG has done this.**

  Full spec: `Docs/GROUP_CHAT_MODE.md` (just landed on this branch). Read that next after `PROJECT_BRIEF.md`. It's marked as Phase 5 in `Docs/TELEGRAM_PLAN.md` with the 🐟 owner tag.

  Suggested first commits (small + testable):
  1. `Match` Mongoose model with the schema in the spec
  2. `/start solshot` bot command — creates Match record, posts join link
  3. Mini App `?startapp=gm_<matchId>` deep-link route → match-detail screen
  4. Iterate from there

  The first 3 commits should be small and end-to-end testable before adding game logic. Don't try to ship the whole feature in one PR — that's how big features die.

**Things to know:**

- Render auto-deploys server from `main`. Vercel auto-deploys client from `main`. Your `sandbox/fishyboy` branch never deploys (good — experiment freely).
- The bot's webhook lives at `https://solshot.onrender.com/api/telegram-webhook`. If you change anything in `server/services/bot.js`, your changes won't reach Telegram until merged to main.
- For local dev, set `TELEGRAM_BOT_TOKEN` in `server/.env` and the bot will run in long-polling mode (no webhook needed).
- The `Challenge` model + `services/challenge/` is your closest reference for how to structure the `Match` model + service. Same Mongoose patterns, same render/endpoint shape.
- Group-chat bot privacy mode needs to be **disabled** in BotFather for the bot to see `/join` etc. in groups. John will need to flip that when you're ready to test — leave a question here when the time comes.

**Open questions in `Docs/OPEN_QUESTIONS.md`** — five items waiting on John. None are blocking your group-chat work.

Good hunting. Leave a STATUS entry below when you've onboarded so John gets the heartbeat.

— main-claude
