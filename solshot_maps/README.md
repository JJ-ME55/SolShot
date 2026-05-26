# SolShot Maps — Engineering-Grade Procedural Set

> 8 maps × 5 deliverables = **40 files**. Each map is loadable and playtest-ready against the spec in `SolShot Map Brief.html`.

## What this is

**Procedural, not painted.** I generated these algorithmically so engineering has a complete, valid set to plumb into the loader **today** — backdrops, heightmaps, surfaces, spawn JSONs, and meta JSONs that all conform to the contract in the brief. The art is functional, not AAA.

Use these for:

1. **Pipeline validation** — load all 8 in the engine; verify the loader, mask, spawn-mirror, indestructible-box, and matchmaker-by-difficulty logic before commissioning real art.
2. **Playtest cover** — get a 4P playtest running on `desert` *this week*. Iterate the spawn-anchor math before paying for the real Desert.
3. **Visual reference for the real designer** — when they paint Castle, they can open `castle/heightmap.png` and see exactly what "symmetric tower foundations + crumbling rubble field" looks like as a silhouette.

The eventual real maps replace these file-by-file. The slugs, dimensions, and JSON contracts stay the same — drop in new PNGs, the engine doesn't care which were painted by hand.

## Per-map specs (matches the brief exactly)

| Slug | Name | Difficulty | Indestructible boxes | Notes |
|---|---|---|---|---|
| `desert` | Sand Dunes | easy | — | Rolling open dunes, warm orange/dusk. |
| `jungle` | Jungle Valley | medium | — | Mid-density tree spikes flanking a clearing. |
| `moon` | Lunar Surface | medium | — | Tall low-frequency dunes, crater dips, starfield sky w/ Earth. |
| `urban` | Neon Cityscape | hard | 8 boxes (tower bases, mirrored) | Hard-edge symmetric towers, neon window grid. |
| `arctic` | Iceberg Tundra | easy | — | Pale palette, iceberg dips, aurora streaks. |
| `volcanic` | Lava Lake | hard | — | Jagged peaks, glowing terrain cracks, ember backdrop. |
| `castle` | Stone Ruins | hard | 2 boxes (tower foundations, mirrored) | Symmetric, two towers + central rubble. |
| `canyon` | Red Mesa | hard | — | Narrow corridor + tall mesas at each spawn cluster. |

## Spawn anchors (all pass the 300/200 rules)

| Slug | anchors |
|---|---|
| `desert`   | `[400, 760, 1120, 1340, 1560]` |
| `jungle`   | `[500, 860, 1180, 1400, 1620]` |
| `moon`     | `[400, 760, 1100, 1340, 1580]` |
| `urban`    | `[600, 900, 1180, 1400, 1620]` |
| `arctic`   | `[400, 760, 1100, 1340, 1580]` |
| `volcanic` | `[400, 780, 1120, 1380, 1620]` |
| `castle`   | `[500, 860, 1180, 1400, 1620]` |
| `canyon`   | `[400, 800, 1180, 1400, 1620]` |

Each gets mirrored around x=1728 to produce 10 spawn positions.

## What's true to the brief

- ✅ 3456 × 800 px on every PNG, sized for native render
- ✅ Heightmap: grayscale, no anti-aliasing, white = solid, black = air, no floating islands
- ✅ Surface: RGBA with transparent above the heightmap silhouette
- ✅ `boundary: "open-pit"` on every map (same mechanics; Volcanic visual reskin)
- ✅ `skybox: "open"` on every map
- ✅ Indestructible bounding boxes on Castle (2) and Urban (8), mirrored
- ✅ Spawn parity guaranteed by mirror-around-1728

## What's *not* AAA — and why I'm flagging it

- **Backdrops** are gradient + procedural silhouettes, not painterly broad strokes. Functional, not Album-Cover-Of-The-Decade.
- **Surface art** is per-column striped fills with theme accents — recognisable as "sandy / icy / volcanic / etc." but not handcrafted texture.
- **No parallax layers** in the backdrops. Single-layer fill.

The real designer's job is replacing these PNGs with painted versions while keeping the slug + dimensions + heightmap geometry the same (or proposing revised geometry through the spec channel).

## Verifying these in the engine

Drop the `solshot_maps/` folder where the loader expects it. Each subfolder is self-contained.

```
solshot_maps/
├── arctic/        ── backdrop.png · heightmap.png · surface.png · spawns.json · meta.json
├── canyon/        ── (same 5 files)
├── castle/        ── (same 5 files)
├── desert/        ── (same 5 files)
├── jungle/        ── (same 5 files)
├── moon/          ── (same 5 files)
├── urban/         ── (same 5 files)
└── volcanic/      ── (same 5 files)
```

Run a 4-player playtest on `desert` first — it's the simplest geometry. Then `castle` to validate indestructible-box behaviour. Then the rest in parallel.

## If something breaks

- **Heightmap edge pixels are showing AA** → re-export the PNG through `pngquant --strip` to force a threshold. The generator emits crisp 0/255 only, but some image tools "helpfully" re-encode with a colour table.
- **Surface is opaque above the heightmap silhouette** → don't run the surface through any "remove transparency" filter. The alpha mask is the contract.
- **Spawn distance violations** → the JSONs are pre-validated against the 300/200 rules. If the engine disagrees, the engine's rule is wrong; surface it.
