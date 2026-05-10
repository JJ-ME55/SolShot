# Starter Prompts — Copy-Paste for Common Tasks

> Pre-baked prompts FishyBoy can paste into a Claude session to spin
> up quickly on common workflows without re-explaining the project
> every time.

---

## 0. First-time bootstrap (paste this when you start your very first session)

```
Read CLAUDE.md, then Docs/internal/PROJECT_BRIEF.md, then the last 5 entries
of Docs/internal/CLAUDE_COMMS.md. After that, leave a STATUS check-in in
CLAUDE_COMMS.md (sign as [fishyboy-claude]) saying you've onboarded
and are ready. Then tell me what you've understood about the project
in under 200 words so I can correct any gaps before we start work.
```

---

## 1. Catch up on what's changed since last session

```
Show me what's landed on `main` and `launch` since I last worked
(use `git log` to see commits in the last few days). Then read any
new entries in Docs/internal/CLAUDE_COMMS.md. Summarise in 5 bullets what's
changed, highlight anything that affects my current work area, and
ask me what I want to focus on today.
```

---

## 2. Pick up an unfinished feature

```
Read Docs/internal/CLAUDE_COMMS.md and find the most recent HANDOFF entry
from either Claude. Walk me through what state the work is in,
what files were touched, and what the next concrete step is. If
there are blocking questions in Docs/internal/OPEN_QUESTIONS.md tagged
relevant to that work, surface those first.
```

---

## 3. Start work on a new feature

Replace `<FEATURE>` with the thing you want to build. Examples:
"Phase 3 of TELEGRAM_PLAN.md" / "the closingConfirmation API" /
"theme sync to Telegram themeParams".

```
I want to work on <FEATURE>. Before writing any code:

1. Find the relevant background docs (Docs/internal/PROJECT_BRIEF.md,
   Docs/internal/TELEGRAM_PLAN.md, TODO.md, Docs/internal/DECISIONS.md).
2. Map the touch surface: which files will change, which forbidden-
   zone files (per CLAUDE.md) you must NOT touch.
3. Identify any open questions in Docs/internal/OPEN_QUESTIONS.md that block
   this work.
4. Propose a minimal first commit — under 200 lines of diff —
   and ask me to approve before you start writing.

Don't write any code until I say yes to your plan.
```

---

## 4. Sync your branch with latest from launch

```
Pull the latest from `origin/launch` and merge it into
`sandbox/fishyboy`. If there are conflicts, resolve them
conservatively (prefer launch's version for code I haven't touched
locally; flag any that need human judgment). Commit the merge
with a clear message and tell me what new files / changes I should
be aware of.
```

---

## 5. Leave a handoff note before context runs out

```
We're approaching context limit. Write a HANDOFF entry in
Docs/internal/CLAUDE_COMMS.md covering:
  - Current task and why
  - Files touched and what state they're in (clean / WIP / broken)
  - Next concrete step (1-3 sentences)
  - Any commands needed to resume (e.g. test commands, grep tips)
  - Anything blocking
Then commit the comms file with message
'docs(comms): handoff — <one-line summary>'.
```

---

## 6. Ask main-claude or John a question

```
I have a question I can't resolve alone: <YOUR QUESTION>. Append it
to Docs/internal/OPEN_QUESTIONS.md as a new Q-NNN entry following the format
in that file. Tag @johnk if it's a business/design question, or
[main-claude] if it's a technical question the other Claude could
weigh in on. Commit with message 'docs(questions): <short title>'.
```

---

## 7. Code review your own work before I look at it

```
Review your recent commits on this branch. For each commit:
  - Does it match the design intent in Docs/internal/PROJECT_BRIEF.md?
  - Did you touch any forbidden-zone files (escrow, shot-token,
    keys, telegram middleware)?
  - Are tests / type checks clean? (Run `node --check` on changed
    server files; run a build if React changed.)
  - Did you add a comm log entry if the change is significant?
Flag anything you'd want a senior dev to push back on.
```

---

## 8. Ship something to launch (when ready)

```
The work on <FEATURE> is complete and tested locally. Walk me
through the merge process to launch:
  1. List the commits on sandbox/fishyboy that should go to launch
  2. Confirm I'm not on launch (per CLAUDE.md branch rules — only
     I can merge, not you)
  3. Generate a clean commit message I can use when I run the merge
  4. List anything to verify post-merge (env vars, deploys, etc.)

Don't run any merge or push commands yourself.
```

---

## 9. Run the project locally for the first time

```
Walk me through running SolShot locally. I have node 20, mongodb
atlas (free tier), and git installed. Specifically:
  - What files / env vars do I need to set up?
  - Are there any project-specific gotchas in the install steps?
  - Confirm the pre-push hook is installed correctly (git config
    --get core.hooksPath should return '.githooks')
  - Test that the hook actually rejects a push to main without me
    actually pushing (use 'git push --dry-run origin HEAD:main')

Then verify I can hit localhost:3000 and connect to the local server.
```

---

## 10. Generate a status report for John

```
Generate a short status report I can send to John summarising my
work this week. Include:
  - Commits on sandbox/fishyboy (1-line summaries)
  - Open questions I've added to Docs/internal/OPEN_QUESTIONS.md
  - HANDOFF entries I've written
  - Anything blocking
  - What I plan to work on next

Keep it under 200 words. Format for Telegram message paste.
```
