---
phase: 02-todo-completion
plan: 05
subsystem: infra
tags: [dns, cors, vercel, render, solshot.gg]

# Dependency graph
requires:
  - phase: 02-todo-completion
    provides: CORS config baseline in render.yaml
provides:
  - render.yaml CORS_ORIGINS updated with solshot.gg and www.solshot.gg
  - DNS records set at Spaceship registrar (A @ → 216.198.79.1, CNAME www → cname.vercel-dns.com)
  - Vercel configured with solshot.gg and www.solshot.gg domains
affects: [06-mainnet-deployment, production-server-cors]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Vercel apex A record + CNAME www pattern for custom domain DNS"]

key-files:
  created: []
  modified: ["render.yaml"]

key-decisions:
  - "Existing Vercel deploy is sol-shot.vercel.app — user also needs to update CORS_ORIGINS in Render dashboard manually when deploying server"
  - "A record IP used: 216.198.79.1 (Vercel-provided); CNAME: cname.vercel-dns.com"
  - "render.yaml seeds CORS_ORIGINS but Render dashboard env var takes precedence after first deploy"

patterns-established:
  - "CORS_ORIGINS: comma-separated list in render.yaml; Render dashboard must also be updated post-deploy"

# Metrics
duration: ~5min
completed: 2026-02-19
---

# Phase 2 Plan 5: DNS and CORS Summary

**render.yaml CORS_ORIGINS updated with solshot.gg origins; DNS A+CNAME set at Spaceship registrar; Vercel configured for solshot.gg and www.solshot.gg custom domains**

## Performance

- **Duration:** ~5 min (Task 1 auto; Task 2 human-action checkpoint)
- **Started:** 2026-02-19
- **Completed:** 2026-02-19
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Task 1 (auto): `render.yaml` CORS_ORIGINS updated from the pre-existing Vercel preview URL to include `https://solshot.gg` and `https://www.solshot.gg`
- Task 2 (human-action): User set DNS records at Spaceship registrar — A record `@` → `216.198.79.1`, CNAME `www` → `cname.vercel-dns.com.`
- Vercel project configured with `solshot.gg` and `www.solshot.gg` as custom domains

## Task Commits

Each task was committed atomically:

1. **Task 1: Update render.yaml CORS_ORIGINS** - `e6cc69c` (chore)
2. **Task 2: DNS records set (human checkpoint)** - no code commit; user action

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `render.yaml` — CORS_ORIGINS now reads `https://solshot.gg,https://www.solshot.gg,https://sol-shot.vercel.app`

## Decisions Made

- **Render dashboard update still needed:** render.yaml seeds the initial value for a new Render service. Once the server is deployed to Render, John must also update `CORS_ORIGINS` in the Render dashboard to include `https://solshot.gg,https://www.solshot.gg` (in addition to any Vercel preview URLs). The dashboard value overrides render.yaml after the first deploy.
- **A record IP:** 216.198.79.1 was the Vercel-provided IP for apex domain configuration.
- **Existing Vercel deploy:** The client is currently at `sol-shot.vercel.app`. The same project was configured to serve `solshot.gg` and `www.solshot.gg` as additional domains.

## Deviations from Plan

None - plan executed exactly as written. Task 1 was auto (render.yaml update + DNS docs), Task 2 was a human-action checkpoint that the user completed by setting DNS records at Spaceship and configuring Vercel.

## Issues Encountered

None.

## User Setup Required

**Render dashboard CORS update still needed before production use.**

When the SolShot server is deployed to Render, manually update the `CORS_ORIGINS` environment variable in the Render dashboard to include the solshot.gg origins:

```
https://solshot.gg,https://www.solshot.gg,https://sol-shot.vercel.app
```

The render.yaml value only seeds a fresh Render service. The dashboard value takes precedence once set.

## Next Phase Readiness

- DNS is live: solshot.gg points to Vercel via A record and www via CNAME
- Client is served at solshot.gg over HTTPS (Vercel auto-provisioned SSL)
- render.yaml has solshot.gg in CORS_ORIGINS — server will accept these origins once deployed
- Remaining Phase 2 items: 02-01 (sounds, Task 2 blocked on WAV files), 02-02 (escrow devnet test), 02-03 (SHOT token metadata)
- Phase 2 is 3/5 plans complete (02-01 partial, 02-04 done, 02-05 done); 02-02 and 02-03 not yet started

---
*Phase: 02-todo-completion*
*Completed: 2026-02-19*
