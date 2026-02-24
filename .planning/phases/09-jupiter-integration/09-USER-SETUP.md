# Phase 9: User Setup Required

**Generated:** 2026-02-24
**Phase:** 09-jupiter-integration
**Status:** Incomplete

Complete these items for the Jupiter integration to function. Claude automated all code changes; these items require your access to external dashboards.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `JUP_API_KEY` | portal.jup.ag → Create account → API Keys → Create Lite tier key (free, 60 req/min) | `server/.env` |

## Account Setup

- [ ] **Create Jupiter Portal account**
  - URL: https://portal.jup.ag
  - Skip if: Already have account
  - Note: The Lite tier is free and provides 60 requests/minute — sufficient for this integration

## Dashboard Configuration

- [ ] **Create API key**
  - Location: portal.jup.ag → API Keys → Create key
  - Tier: Lite (free)
  - Copy the key and add to `server/.env` as `JUP_API_KEY`

## Verification

After completing setup, verify the API key works:

```bash
# Test the API key directly
curl -s "https://api.jup.ag/price/v3?ids=4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd" \
  -H "x-api-key: YOUR_JUP_API_KEY_HERE" | head -c 200
```

Expected: JSON response with token price data (or empty `{}` if SHOT has no liquidity yet — this is expected pre-launch).

Start the server and check logs:

```bash
cd server && node index.js
# Expected: "[Jupiter] Price polling started (every 30s)"
# After 30s: "[Jupiter] SHOT price: $..." OR "[Jupiter] SHOT token has no price data"
```

---

**Once all items complete:** Mark status as "Complete" at top of file.
