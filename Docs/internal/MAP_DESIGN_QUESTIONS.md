# Designer Questions — Pre-Empted

**Purpose:** the 14 questions a senior designer reading `Docs/MAP_DESIGN_BRIEF.md` cold would
ask before committing time. Use this to pre-answer in the brief or to have answers ready when
the designer pings.

**Status:** drafted by main-claude playing designer-hat after reading the brief end-to-end.
JJ to mark each one ANSWERED / DRAFT REPLY / NEEDS DECISION before sending the brief out.

---

## Day-1 blockers (designer can't start without these)

### Q1 — Can I see the game in motion?

The brief reads well but I haven't watched a tank fire a shot. A 30-second screen recording
of a 2-player match plus a still frame of an active aim moment would change every design
decision I make. Without it, I'm guessing at trajectory readability, blast scale, terrain
deformation behaviour, and pacing.

**Why I'd ask:** trajectory visibility against the backdrop is design rule #2 in the brief.
I can't verify my paintings hold up without seeing what a real shot looks like.

**Suggested answer:** ship a 1-min Loom or YouTube link with a 2P match. JJ has Looms planned
anyway — record one specifically for the designer.

---

### Q2 — What colours are the tanks and projectiles?

Surface art has to NOT compete with the sprites. If tanks are sand-coloured and I paint Desert
as sand-on-sand, the game's unplayable. Need:

- Tank body palette (player 1 / player 2 / per-player swatch system?)
- Projectile size in pixels + colour
- Blast radius colour samples for the 3-4 most-fired weapons (default shell, napalm, jackhammer)

**Why I'd ask:** can't make contrast decisions on the surface layer without knowing what's on top
of it.

**Suggested answer:** point at `Assets/tank-turret.png`, `tank-tinted.png`, weapon icons in
`Assets/w-*.png`. Add a short note on the current player-tint scheme.

---

### Q3 — Source file format — Figma, PSD, or Affinity?

Brief says "your preference." Mine has a strong default. Need to know if there's a compatibility
constraint on the engineering side (e.g., "we extract layers via PSD API, please ship PSD").
Otherwise I'd default to Figma.

**Why I'd ask:** different tools have different costs for the same output. Figma is fastest for
me; PSD is the industry-standard handoff format; Affinity is fastest end-to-end but rarer.

**Suggested answer:** Figma is fine — engineering will export PNGs from designer's published
file via the Figma API. If designer prefers PSD/Affinity, ship the layered file + exported PNGs
and engineering will work from the PNGs.

---

### Q4 — When weapons crater the terrain, what colour fills the crater interior?

I'm only painting the top surface in the brief as written. If the engine reveals "underground"
when a crater forms, I need to:

- Paint a sub-surface layer (additional file per map), OR
- Be told the engine fills craters with a flat colour I should match against, OR
- Be told the surface layer should extend ~120 px deep with sub-surface art baked in (the brief
  hints at this in §2c but doesn't fully spec it)

**Why I'd ask:** craters are visible 100% of every match. If they look wrong, the whole map
looks broken.

**Suggested answer:** the brief says "carry surface art down ~120 px into the silhouette." So
the answer is: designer paints the sub-surface as part of `surface.png`, no separate underground
layer. Confirm this is sufficient for the depths weapons can reach (need engineering input —
what's the deepest crater the meta makes?).

---

### Q5 — Is "painterly broad-strokes" a mandate, or the bar?

The existing three backdrops are atmospheric, low-saturation, dusk-mood, painterly. Beautiful,
but high effort per map. If I can deliver a stronger competitive map in a more graphic /
illustrated style (think Worms cartoon line-art, or modern flat-shaded Risk of Rain style) for
the same cost, is that on the table?

**Why I'd ask:** style locks scope. "Match this exact aesthetic" is 2× the effort of "deliver
something in a coherent style of your choice."

**Suggested answer:** match the existing three. The 3 backdrops are SolShot's visual identity
and the marketing benefits of style cohesion outweigh the production savings of a freer hand.
BUT — if designer comes with a portfolio sample of an alternative style that's clearly stronger,
JJ is open to a paid 1-map style test before committing to the full pool.

---

## Art direction (needed in week 1, before committing to a style)

### Q6 — Is dusk-mood the locked aesthetic across all 8?

Desert is dusk, Jungle is twilight, Moon is night. The existing three suggest a "moody atmospheric"
standard. If Arctic should be bright midday for visibility/contrast and Canyon should be high-noon
sun, that's a different brief. Need a call: matching moodboard across all 8, or each-map-its-own
time-of-day?

**Why I'd ask:** lighting drives everything — palette, contrast, ambient mood, shadow direction.

**Suggested answer:** each map gets its own time-of-day to maximise visual differentiation, BUT
the painterly broad-stroke style stays consistent across all 8. Mood lives in the palette;
technique stays steady.

---

### Q7 — For symmetric maps (Urban / Castle / Canyon), do I paint full 3456 or half?

If the engine mirrors a half-canvas paint around x=1728, that's 50% less work on three of the
maps. If you want full-width control for stylistic asymmetry within the broader symmetric
composition (e.g., one half has a clock tower, the other has a bell tower — visually different
but spawn-equivalent), I'll do full-width.

**Why I'd ask:** affects time estimate per map by 30%.

**Suggested answer:** designer paints full 3456 for all 8 maps. The mirror-around-centre rule
is for SPAWN ANCHORS (numerical), not visual symmetry. Designer has full visual control across
the canvas as long as spawn anchors are mirrored.

---

### Q8 — Can I break visual mirroring on asymmetric maps for stronger composition?

Volcanic's most iconic composition is one giant volcano on the left, a lava river flowing right.
Mirrored, it becomes "two medium volcanoes" — less iconic, more generic. The engine handles
spawn parity numerically regardless of visual symmetry. Permission to break visual mirror on
the 5 asymmetric maps (Desert / Jungle / Moon / Arctic / Volcanic)?

**Why I'd ask:** the brief implies yes in §4 ("Desert, Jungle, Moon, Arctic, Volcanic can be
asymmetric overall but each anchor's local 600 × 200 neighbourhood should be mirrored") but
doesn't fully spell out the permission. Designer wants the licence in writing.

**Suggested answer:** yes, with the local-neighbourhood-mirror caveat from §4. Designer is
free to break global visual symmetry on the 5 asymmetric maps; spawn-anchor neighbourhoods
must stay locally mirrored.

---

### Q9 — Is there a SolShot brand palette / typography / design-system reference?

The existing three backdrops have a coherent feel — that's not accidental. Is there a brand
doc I should align to, or are the three backdrops the only style anchor I get?

**Why I'd ask:** if there's a token system (CRT terminal colours, brand palette, weapon-tier
hierarchy), my maps should respect it or the game's UI will fight the maps.

**Suggested answer:** point at `client/src/styles/tokens.css` (CRT-themed design system),
`Docs/SolShot_Litepaper_v2.2.md` for brand voice, and the 3 backdrops as the visual anchor.
No formal brand-bible yet; SolShot is small enough that JJ + designer can co-author one if
useful.

---

## Workflow (needed before iteration starts)

### Q10 — Who playtests each map and decides "ship"?

Brief says JJ approves. Realistic — but is JJ alone, or does engineering playtest too?
Is there a player-tester pool? When in the iteration loop do mobile checks happen — designer
or engineering?

**Why I'd ask:** the iteration loop determines turnaround per map. If JJ tests solo on his
laptop, I get fast feedback but no mobile signal. If engineering tests on iPhone, slower
but I get the real signal.

**Suggested answer:** Round 1 — JJ desktop playtest, 2-3P match, gut-check. Round 2 — JJ on
iPhone landscape, real device. Round 3 (only if needed) — engineering plays full 6-8P match
on dev branch. Designer never has to playtest themselves; deliverables are PNGs + JSONs,
playtesting is JJ/engineering's job.

---

### Q11 — Rate, payment cadence, iteration count baked in?

The brief talks about deliverables and timeline but not commercials. Standard questions:

- Per-map rate, per-week retainer, or milestone-based?
- How many iteration rounds per map are included in the rate? (Brief implies ~1-2; I'd push
  for 3 on the Hard tier — Urban/Castle/Canyon spawn tuning is finicky.)
- Net-30 / net-15 / on-delivery payment?

**Why I'd ask:** I plan my time around this.

**Suggested answer:** JJ to set rate based on designer's day-rate. Recommend
**per-map fixed fee with 3 iteration rounds baked in**, additional rounds at half-rate.
Payment on map-merged-to-main, net-7 to keep cadence tight.

---

### Q12 — IP / portfolio rights — can I show this work?

Work-for-hire / shared rights / credited / portfolio rights?

**Why I'd ask:** designers care about portfolio. Crypto projects have a reputation for
work-for-hire-with-no-credit. If I can't show this in my portfolio, my rate goes up to
compensate.

**Suggested answer:** work-for-hire on the engine-loaded assets (SolShot owns the PNGs and
JSONs outright), BUT designer retains portfolio rights — can show the maps in any portfolio,
case study, or showreel, with attribution as "SolShot, 2026, design by [name]." SolShot
credits designer in the in-game lobby "Map by ___" line when each map loads.

---

## Deeper engagement (designer signalling they read the brief carefully)

### Q13 — The difficulty tier table is doing a lot of work. What is "difficulty" actually about?

Brief tags Easy/Medium/Hard per map. Reading carefully, "difficulty" seems to bundle three
different things:

- **Visual readability** (Arctic is "low contrast — harder to read trajectory")
- **Terrain complexity** (Canyon is "precision angles, vertical play")
- **Tactical density** (Urban is "indestructible building faces")

These are independent axes. A map could be high-readability-but-tactically-dense (an open
plain with mirror-symmetric forts), or low-readability-but-tactically-simple (a foggy open
field). Right now the brief collapses all three into one dimension. Can the meta.json have
three separate difficulty fields so matchmaking can balance more intelligently?

**Why I'd ask:** this is the kind of question that shows the designer is engaging with the
spec, not just executing it. It's also genuinely a better matchmaking signal.

**Suggested answer:** great point — split into `readability`, `terrainComplexity`,
`tacticalDensity` fields, each 1-3. Aggregate to a single Easy/Medium/Hard for the UI but
keep the breakdown in the data. Engineering to confirm matchmaking can ingest it.

---

### Q14 — Indestructible feature proportion on Castle?

Brief calls Castle "mix of indestructible stone (tower bases, foundation walls) and
destructible rubble (battlements, debris)." Need the proportion before I paint. Specifically:

- What % of the map's terrain is indestructible?
- Are indestructible features stable across patches forever, or can they shift?
- Does indestructible terrain BLOCK projectiles (hard wall) or DEFLECT them (bounce)?

**Why I'd ask:** Castle's identity depends on the indestructible bits feeling permanent and
strategic. If I paint 80% indestructible, the map plays static. If 20%, it plays nearly
identical to a non-Castle map. The right answer is somewhere in between, but you have to
commit.

**Suggested answer:** target ~40% of the map's mass is indestructible (the tower bases and
the foundation walls connecting them). Indestructible features block projectiles like normal
terrain — same collision rules, just immune to deformation. Locked across patches once
shipped (memorability rule from §8.6).

---

## Honest reactions (questions the designer would think but might not voice)

These are the ones JJ should be ready for even if they aren't asked directly.

- **"Four weeks is tight."** The brief says ~4 weeks elapsed at half-time. With Hard maps
  needing real iteration, more realistic is 5-6 weeks. JJ should be ready to flex on this
  rather than push and get rushed art.

- **"Eight maps is a lot for one designer."** A more typical scope is 4-6 maps for v1, then
  expand. Designer might push back asking to cut Volcanic and Castle to v1.5. JJ should know
  which two maps he'd cut if forced (my guess: keep all 8 because the variety is the
  product).

- **"The mirror-around-centre rule will frustrate me."** It's the right engineering call but
  it constrains composition. Expect 1-2 sessions of designer pushing on whether they can
  break the rule for "just this one map." Hold the line — the rule is what makes the
  competitive promise real.

- **"Where's the rest of the game's art coming from?"** Designer will notice that tank
  sprites, weapon icons, and UI are not part of this brief. They might assume the existing
  in-game art is the SolShot standard. Heads up — some of that art is older / from an
  earlier era and will eventually need a refresh pass. Don't promise that pass as part of
  this contract, but flag it as a potential follow-up.

---

## How to use this list

1. JJ reads through. Marks each Q with: **answered in brief** / **draft reply ready** /
   **needs decision**.
2. For the "answered in brief" ones — verify the answer is actually clear in §X of the brief.
   If it's only implied, make it explicit.
3. For the "draft reply ready" ones — paste the suggested answer into a section of the brief
   (probably §11 "Questions before kick-off" or a new "FAQ" section).
4. For the "needs decision" ones — block on those before sending the brief out. These are
   the ones that change the project's shape.

If most of Q1-Q5 turn out to be "needs decision," consider a 30-min call with the designer
before shipping the brief — answers to those five compound and a live conversation surfaces
them faster than email.
