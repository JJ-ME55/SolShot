# `src/assets/brand/`

Brand surface for The Arcade. Local mocks at `C:\Users\jacob\The Arcade\Website images and branding\` lift here for the repo.

## What goes here

- `cabinet/` — full-bleed pre-auth cabinet illustration (PNG/WebP, multiple resolutions)
- `logo/` — wordmark variants (full / mark-only / monochrome)
- `marquee/` — top-strip logo + checkerboard pattern
- `tiles/` — per-game cabinet card art (keepie-uppies, basketball, free-kicks, solshot)
- `joystick-buttons/` — decorative joystick + arcade buttons (desktop landing)
- `overlay/` — scanline (1px, 4% opacity per `THE_ARCADE_v1_DESIGN.md` §Texture)

## Format conventions

- Raster: WebP first, PNG fallback. Source files (PSD/AI/Figma) go to `src/assets/brand/source/` if you want them tracked — otherwise add to `.gitignore`.
- Vector: SVG, inlined into components for icons / hover states / micro-interactions.
- Sizes: provide 1× and 2× for any raster used in the cabinet landing (the hero illustration ships at retina resolution on phones).

## Palette to source against

Locked tokens in `src/styles/tokens.css`:

| Token | Hex |
|---|---|
| `--arcade-black` | `#0A0606` |
| `--arcade-yellow` | `#FFD23A` |
| `--arcade-orange` | `#FF8A1F` |
| `--arcade-red` | `#E62E2E` |
| `--arcade-deep-red` | `#7A0F0F` |
| `--solana-purple` | `#9945FF` |
| `--solana-teal` | `#14F195` |
| `--paper-warm` | `#F5E6CC` |

Fire gradient (`yellow → orange → red`, top-to-bottom) is the defining mark. Solana colours stay tightly scoped to "this is on Solana" cues.

## Workflow

Drop assets here, reference them from route components via `import logoUrl from '@/assets/brand/logo/wordmark.webp'` (Vite handles the asset pipeline). For larger sets, group into subfolders and re-export via an index file.

When the cabinet landing or dashboard tiles get real art, replace the placeholder inline styles in `src/routes/CabinetLanding.tsx` and `src/routes/Dashboard.tsx` accordingly.

— main-claude, 2026-05-19
