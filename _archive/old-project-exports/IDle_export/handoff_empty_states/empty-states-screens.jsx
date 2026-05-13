/* global React, PhoneFrame, StatusBar, MobileChrome, MobileOverlays, NotchPill, EmptyState, ErrorState, SkeletonRow, SkeletonCard, Icon, CornerBracket, CTA */
// SolShot — Per-screen empty / loading / error compositions
// Each screen exports { Empty, Loading, Error } as a triplet, wrapped in a
// realistic phone chrome so reviewers can read the state in context.
//
// All artboards are 844×390 (mobile landscape — Telegram Mini App primary).
// Screens that ship at desktop (1200×800) use the same primitives at larger
// scale; see SkeletonRow/SkeletonCard sizing notes in the README.

// ─── Shared chrome wrapper ───────────────────────────────────
// Renders the phone bezel + status bar + screen title + a centered content
// region. Children fill the content region as `position: absolute, inset: 0`.
function ScreenShell({ title, right, children, currency = true }) {
  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <MobileChrome
        onBack={() => {}}
        title={title}
        right={right || (currency ? (
          <span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>◆ 1,240</span>
        ) : null)}
      />
      <div style={{
        position: "absolute", top: 44, left: 52, right: 20, bottom: 22, zIndex: 5,
      }}>
        {children}
      </div>
    </PhoneFrame>
  );
}

// Inset content frame — gives the empty state a visible card edge so it
// looks anchored to the screen, not just floating.
function ContentFrame({ children, accent = false }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "var(--bg-raised)",
      border: `1px solid ${accent ? "var(--accent)" : "var(--border)"}`,
      clipPath: "var(--clip-10)",
      overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

// Tiny "// LABEL" header used in some screens above the content frame
function ScreenLabel({ children, top = -2, left = 4 }) {
  return (
    <div style={{
      position: "absolute", top, left, zIndex: 6,
      fontFamily: "var(--f-mono)", fontSize: 7,
      color: "var(--olive)", letterSpacing: "0.3em",
      background: "var(--bg-deep)", padding: "0 4px",
    }}>{children}</div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 1. MyGames — "no active matches"
// ────────────────────────────────────────────────────────────────────────
const MyGames_Empty = () => (
  <ScreenShell title="MY GAMES">
    <ContentFrame>
      <EmptyState
        icon="radar"
        title="NO CONTACT ON RADAR"
        body="NO ACTIVE GROUP-CHAT MATCHES. START ONE TO BRING THE SQUAD ONLINE."
        primaryCTA={{ label: "FIND MATCH" }}
        secondaryCTA={{ label: "CREATE LOBBY" }}
      />
    </ContentFrame>
  </ScreenShell>
);
const MyGames_Loading = () => (
  <ScreenShell title="MY GAMES">
    <ContentFrame>
      <div style={{ position: "absolute", inset: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} height={42} lines={2} leftAccent />)}
      </div>
    </ContentFrame>
  </ScreenShell>
);
const MyGames_Error = () => (
  <ScreenShell title="MY GAMES">
    <ContentFrame>
      <ErrorState
        icon="txfail"
        title="LINK SEVERED"
        body="MATCH FEED UNAVAILABLE. CHECK YOUR CONNECTION."
        primaryCTA={{ label: "RETRY" }}
        secondaryCTA={{ label: "BACK TO BASE" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 2. Barracks · Combat Record — "new player, no stats"
//    Callsign card still renders; the stats grid is the empty zone.
// ────────────────────────────────────────────────────────────────────────
function BarracksHeader() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 70,
      padding: "8px 10px",
      background: "var(--bg-raised)",
      borderBottom: "1px solid var(--accent)",
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10,
      alignItems: "center",
    }}>
      <div style={{
        width: 50, height: 50,
        background: "var(--bg-deep)",
        border: "1px solid var(--accent)",
        clipPath: "var(--clip-6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--f-display)", fontSize: 22, color: "var(--accent)",
      }}>R</div>
      <div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// CALLSIGN</div>
        <div className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: "0.12em", lineHeight: 1 }}>RECRUIT</div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--accent)", letterSpacing: "0.25em" }}>REC · 0xNEW…000</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// SERVICE</div>
        <div style={{ fontFamily: "var(--f-display)", fontSize: 14, color: "var(--bone)", letterSpacing: "0.1em" }}>0 DAYS</div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.25em" }}>UNRANKED</div>
      </div>
    </div>
  );
}
const Barracks_Empty = () => (
  <ScreenShell title="BARRACKS">
    <ContentFrame>
      <BarracksHeader />
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, bottom: 0 }}>
        <EmptyState
          icon="reticle"
          title="NO COMBAT RECORD"
          body="DEPLOY YOUR FIRST MATCH TO BEGIN LOGGING STATS."
          primaryCTA={{ label: "DEPLOY NOW" }}
          density="compact"
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Barracks_Loading = () => (
  <ScreenShell title="BARRACKS">
    <ContentFrame>
      <BarracksHeader />
      <div style={{ position: "absolute", top: 80, left: 10, right: 10, bottom: 10,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "1fr 1fr", gap: 6 }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} variant="stat" />)}
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Barracks_Error = () => (
  <ScreenShell title="BARRACKS">
    <ContentFrame>
      <BarracksHeader />
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, bottom: 0 }}>
        <ErrorState
          icon="warning"
          title="STATS UNREACHABLE"
          body="COMBAT RECORD COULDN'T BE LOADED."
          primaryCTA={{ label: "RETRY" }}
          density="compact"
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 3. Barracks · Leaderboard — "no ranked operatives yet"
// ────────────────────────────────────────────────────────────────────────
const Leaderboard_Empty = () => (
  <ScreenShell title="LEADERBOARD" right={<span style={{ color: "var(--olive)", fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.2em" }}>S0 · BETA</span>}>
    <ContentFrame>
      <EmptyState
        icon="target"
        title="NO RANKED OPERATIVES"
        body="SEASON 0 IS LIVE. WIN A MATCH TO BE THE FIRST ON THE BOARD."
        primaryCTA={{ label: "DEPLOY NOW" }}
        secondaryCTA={{ label: "RULES" }}
      />
    </ContentFrame>
  </ScreenShell>
);
const Leaderboard_Loading = () => (
  <ScreenShell title="LEADERBOARD" right={<span style={{ color: "var(--olive)", fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.2em" }}>S0 · BETA</span>}>
    <ContentFrame>
      <div style={{ position: "absolute", inset: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} height={36} lines={2} leftAccent />)}
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Leaderboard_Error = () => (
  <ScreenShell title="LEADERBOARD" right={<span style={{ color: "var(--olive)", fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.2em" }}>S0 · BETA</span>}>
    <ContentFrame>
      <ErrorState
        icon="txfail"
        title="BOARD UNREACHABLE"
        body="LEADERBOARD FEED OFFLINE."
        primaryCTA={{ label: "RETRY" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 4. Lobby · Open Lobbies panel — "no open lobbies"
// ────────────────────────────────────────────────────────────────────────
function LobbyFilterRow() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 26,
      display: "flex", gap: 4, alignItems: "center",
      padding: "0 8px",
      background: "var(--bg-deep)",
      borderBottom: "1px dashed var(--muted)",
    }}>
      {[
        { l: "DUEL", on: true },
        { l: "QUICK", on: false },
        { l: "HIGH", on: false },
        { l: "ANY", on: false },
      ].map((f, i) => (
        <span key={i} style={{
          fontFamily: "var(--f-mono)", fontSize: 7, letterSpacing: "0.2em",
          color: f.on ? "var(--accent)" : "var(--olive)",
          padding: "2px 6px",
          border: "1px " + (f.on ? "solid var(--accent)" : "dashed var(--muted)"),
        }}>{f.l}</span>
      ))}
      <span style={{ flex: 1 }} />
      <span style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.2em" }}>
        WAGER ◆ 50–500
      </span>
    </div>
  );
}
const Lobby_Empty = () => (
  <ScreenShell title="OPEN LOBBIES">
    <ContentFrame>
      <LobbyFilterRow />
      <div style={{ position: "absolute", top: 26, left: 0, right: 0, bottom: 0 }}>
        <EmptyState
          icon="search"
          title="NO LOBBIES MATCH"
          body="NO OPEN LOBBIES FIT YOUR FILTERS. CREATE ONE OR LOOSEN THE CRITERIA."
          primaryCTA={{ label: "CREATE LOBBY" }}
          secondaryCTA={{ label: "CLEAR FILTERS" }}
          density="compact"
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Lobby_Loading = () => (
  <ScreenShell title="OPEN LOBBIES">
    <ContentFrame>
      <LobbyFilterRow />
      <div style={{ position: "absolute", top: 32, left: 8, right: 8, bottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} height={36} lines={2} />)}
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Lobby_Error = () => (
  <ScreenShell title="OPEN LOBBIES">
    <ContentFrame>
      <LobbyFilterRow />
      <div style={{ position: "absolute", top: 26, left: 0, right: 0, bottom: 0 }}>
        <ErrorState
          icon="txfail"
          title="LOBBY FEED DOWN"
          body="COULDN'T REACH MATCHMAKER."
          primaryCTA={{ label: "RETRY" }}
          density="compact"
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 5. Armory · Owned tab — "no cosmetics owned"
// ────────────────────────────────────────────────────────────────────────
function ArmoryTabs() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 26,
      display: "flex", alignItems: "center",
      padding: "0 8px", gap: 2,
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-deep)",
    }}>
      {[
        { l: "OWNED", on: true },
        { l: "SHOP", on: false },
        { l: "PRESTIGE", on: false },
      ].map((t, i) => (
        <span key={i} style={{
          fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.25em",
          color: t.on ? "var(--accent)" : "var(--olive)",
          padding: "3px 10px",
          borderBottom: t.on ? "2px solid var(--accent)" : "none",
        }}>{t.l}</span>
      ))}
    </div>
  );
}
const Armory_Empty = () => (
  <ScreenShell title="ARMORY">
    <ContentFrame>
      <ArmoryTabs />
      <div style={{ position: "absolute", top: 26, left: 0, right: 0, bottom: 0 }}>
        <EmptyState
          icon="crate"
          title="LOCKER EMPTY"
          body="NO COSMETICS ISSUED. VISIT THE SOL SHOP TO OUTFIT YOUR TANK."
          primaryCTA={{ label: "OPEN SHOP" }}
          density="compact"
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Armory_Loading = () => (
  <ScreenShell title="ARMORY">
    <ContentFrame>
      <ArmoryTabs />
      <div style={{ position: "absolute", top: 32, left: 8, right: 8, bottom: 8,
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "1fr 1fr", gap: 6 }}>
        {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} variant="tile" />)}
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Armory_Error = () => (
  <ScreenShell title="ARMORY">
    <ContentFrame>
      <ArmoryTabs />
      <div style={{ position: "absolute", top: 26, left: 0, right: 0, bottom: 0 }}>
        <ErrorState
          icon="warning"
          title="LOCKER LOCKED"
          body="INVENTORY SERVICE OFFLINE."
          primaryCTA={{ label: "RETRY" }}
          density="compact"
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 6. Loadout — "no consumables selected"
//    Initial state: 3 empty consumable slots. Show empty-slot affordance,
//    NOT a separate empty-state primitive (per brief).
// ────────────────────────────────────────────────────────────────────────
function ConsumableSlot({ index, filled = false }) {
  return (
    <div style={{
      flex: 1,
      position: "relative",
      background: "var(--bg-deep)",
      border: filled ? "1px solid var(--accent)" : "1px dashed var(--muted)",
      clipPath: "var(--clip-6)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 4,
      minHeight: 110,
      cursor: "pointer",
    }}>
      <div style={{
        position: "absolute", top: 4, left: 6,
        fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em",
      }}>SLOT {index}</div>
      {!filled && (
        <>
          <Icon name="slots" size={32} color="var(--muted)" />
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.25em", textTransform: "uppercase" }}>
            EMPTY
          </div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.25em" }}>
            + ASSIGN
          </div>
        </>
      )}
    </div>
  );
}
const Loadout_Empty = () => (
  <ScreenShell title="LOADOUT" right={<span style={{ color: "var(--bone)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>$SHOT 0</span>}>
    <ContentFrame>
      <div style={{
        position: "absolute", top: 6, left: 8, right: 8,
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <div className="stencil" style={{ fontSize: 12, color: "var(--bone)", letterSpacing: "0.2em" }}>CONSUMABLES</div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.25em" }}>0 / 3 ASSIGNED</div>
      </div>
      <div style={{
        position: "absolute", top: 30, left: 8, right: 8, bottom: 38,
        display: "flex", gap: 8,
      }}>
        {[1, 2, 3].map(i => <ConsumableSlot key={i} index={i} />)}
      </div>
      <div style={{
        position: "absolute", left: 8, right: 8, bottom: 8,
        display: "flex", gap: 6, alignItems: "center",
      }}>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.2em", flex: 1 }}>
          // CONSUMABLES BURN ON USE. EARN $SHOT TO STOCK UP.
        </div>
        <CTA kind="ghost" compact>BROWSE</CTA>
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Loadout_Loading = () => (
  <ScreenShell title="LOADOUT">
    <ContentFrame>
      <div style={{ position: "absolute", top: 30, left: 8, right: 8, bottom: 38, display: "flex", gap: 8 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} variant="tile" style={{ flex: 1 }} />)}
      </div>
      <div style={{ position: "absolute", top: 6, left: 8, right: 8, height: 16,
        background: "var(--muted)", opacity: 0.35, animation: "es-pulse 1s ease-in-out infinite" }} />
    </ContentFrame>
  </ScreenShell>
);
const Loadout_Error = () => (
  <ScreenShell title="LOADOUT">
    <ContentFrame>
      <ErrorState
        icon="warning"
        title="LOADOUT LOCKED"
        body="CONSUMABLES SERVICE UNREACHABLE."
        primaryCTA={{ label: "RETRY" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 7. Prestige — "next tier locked"
// ────────────────────────────────────────────────────────────────────────
function PrestigeLockedTier() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 12,
      padding: "12px 16px",
      alignItems: "center",
    }}>
      {/* Locked badge column */}
      <div style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}>
        <div style={{
          width: 88, height: 88,
          background: "var(--bg-deep)",
          border: "1px dashed var(--muted)",
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0.55,
          position: "relative",
        }}>
          <Icon name="lock" size={36} color="var(--muted)" />
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--accent)", letterSpacing: "0.3em",
            transform: "translateY(34px)",
          }}>SILVER</div>
        </div>
        <div className="stencil" style={{ fontSize: 11, color: "var(--olive)", letterSpacing: "0.2em" }}>TIER LOCKED</div>
      </div>
      {/* Body column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="stencil" style={{ fontSize: 16, color: "var(--bone)", letterSpacing: "0.18em", lineHeight: 1.1 }}>
          BURN PATH: BRONZE → SILVER
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          NEXT BURN COST · 5,000 $SHOT
        </div>
        <div style={{
          position: "relative",
          height: 10,
          background: "var(--bg-deep)",
          border: "1px solid var(--border)",
          clipPath: "var(--clip-6)",
          marginTop: 2,
        }}>
          <div style={{
            position: "absolute", top: 0, bottom: 0, left: 0, width: "24%",
            background: "var(--accent)",
            backgroundImage: "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.3) 2px 3px)",
          }} />
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.2em" }}>
          1,200 / 5,000 $SHOT · 24%
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.18em", marginTop: 2, textTransform: "uppercase", lineHeight: 1.4 }}>
          // EARN $SHOT BY WINNING WAGERED MATCHES OR COMPLETING DAILY OPS.
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <CTA kind="primary" compact>FIND MATCH</CTA>
          <CTA kind="ghost" compact>DAILY OPS</CTA>
        </div>
      </div>
    </div>
  );
}
const Prestige_Empty = () => (
  <ScreenShell title="PRESTIGE">
    <ContentFrame>
      <PrestigeLockedTier />
    </ContentFrame>
  </ScreenShell>
);
const Prestige_Loading = () => (
  <ScreenShell title="PRESTIGE">
    <ContentFrame>
      <div style={{ position: "absolute", inset: 12, display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 12 }}>
        <SkeletonCard variant="hero" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonRow height={24} lines={1} />
          <SkeletonRow height={18} lines={1} />
          <SkeletonRow height={20} lines={1} />
          <SkeletonRow height={14} lines={1} />
        </div>
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Prestige_Error = () => (
  <ScreenShell title="PRESTIGE">
    <ContentFrame>
      <ErrorState
        icon="warning"
        title="BURN LEDGER OFFLINE"
        body="COULDN'T VERIFY $SHOT BALANCE."
        primaryCTA={{ label: "RETRY" }}
        secondaryCTA={{ label: "BACK" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 8. ChallengeAccept · expired link
// ────────────────────────────────────────────────────────────────────────
const ChallengeExpired_Empty = () => (
  <ScreenShell title="CHALLENGE" currency={false} right={
    <span style={{ color: "var(--olive)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>CODE · GX7P2</span>
  }>
    <ContentFrame>
      <EmptyState
        icon="skull"
        title="CHALLENGE EXPIRED"
        body="THIS LINK NO LONGER POINTS TO A LIVE MATCH. THE WINDOW HAS CLOSED."
        primaryCTA={{ label: "FIND MATCH" }}
        secondaryCTA={{ label: "ISSUE NEW CHALLENGE" }}
      />
    </ContentFrame>
  </ScreenShell>
);
const ChallengeExpired_Loading = () => (
  <ScreenShell title="CHALLENGE" currency={false} right={
    <span style={{ color: "var(--olive)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>CODE · GX7P2</span>
  }>
    <ContentFrame>
      <div style={{ position: "absolute", inset: 16, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
        <SkeletonRow height={20} lines={1} />
        <SkeletonRow height={56} lines={2} leftAccent />
        <SkeletonRow height={20} lines={1} />
      </div>
    </ContentFrame>
  </ScreenShell>
);
const ChallengeExpired_Error = () => (
  <ScreenShell title="CHALLENGE" currency={false} right={
    <span style={{ color: "var(--olive)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>CODE · GX7P2</span>
  }>
    <ContentFrame>
      <ErrorState
        icon="txfail"
        title="LOOKUP FAILED"
        body="COULDN'T VERIFY CHALLENGE CODE."
        primaryCTA={{ label: "RETRY" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 9. ChallengeAccept · not found (typo'd shortcode)
// ────────────────────────────────────────────────────────────────────────
const ChallengeNotFound_Empty = () => (
  <ScreenShell title="CHALLENGE" currency={false} right={
    <span style={{ color: "var(--red)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>CODE · 7Z9XQ</span>
  }>
    <ContentFrame>
      <EmptyState
        icon="search"
        title="CHALLENGE NOT FOUND"
        body="NO LIVE MATCH FOR THIS CODE. CHECK SPELLING OR REQUEST A NEW LINK."
        primaryCTA={{ label: "ENTER CODE" }}
        secondaryCTA={{ label: "FIND MATCH" }}
      />
    </ContentFrame>
  </ScreenShell>
);
const ChallengeNotFound_Loading = ChallengeExpired_Loading;
const ChallengeNotFound_Error = ChallengeExpired_Error;

// ────────────────────────────────────────────────────────────────────────
// 10. GroupMatch · lobby waiting (1/N joined)
// ────────────────────────────────────────────────────────────────────────
function PlayerSlot({ filled, label }) {
  return (
    <div style={{
      flex: 1,
      height: 70,
      background: filled ? "var(--bg-raised)" : "var(--bg-deep)",
      border: filled ? "1px solid var(--accent)" : "1px dashed var(--muted)",
      clipPath: "var(--clip-6)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 3, position: "relative",
    }}>
      {filled ? (
        <>
          <div style={{
            width: 26, height: 26,
            background: "var(--accent)", color: "#0e1209",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--f-display)", fontSize: 14,
            clipPath: "var(--clip-6)",
          }}>K</div>
          <div className="stencil" style={{ fontSize: 9, color: "var(--bone)", letterSpacing: "0.15em" }}>{label}</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--accent)", letterSpacing: "0.25em" }}>READY</div>
        </>
      ) : (
        <>
          <div style={{
            width: 22, height: 22,
            border: "1px dashed var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--f-display)", fontSize: 14, color: "var(--muted)",
          }}>?</div>
          <div className="stencil" style={{ fontSize: 8, color: "var(--olive)", letterSpacing: "0.18em" }}>OPEN</div>
          <div className="blink" style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.25em" }}>WAITING</div>
        </>
      )}
    </div>
  );
}
const GroupWaiting_Empty = () => (
  <ScreenShell title="LOBBY · GX7P2" right={
    <span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>1 / 4</span>
  }>
    <ContentFrame>
      <div style={{ position: "absolute", top: 6, left: 8, right: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="stencil" style={{ fontSize: 12, color: "var(--bone)", letterSpacing: "0.2em" }}>AWAITING ORDERS</div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.25em" }}>WAGER ◆ 250 EACH</div>
      </div>
      <div style={{ position: "absolute", top: 30, left: 8, right: 8, height: 70, display: "flex", gap: 6 }}>
        <PlayerSlot filled label="KILLDOTEM" />
        <PlayerSlot />
        <PlayerSlot />
        <PlayerSlot />
      </div>
      <div style={{ position: "absolute", top: 110, left: 8, right: 8, fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.18em", textTransform: "uppercase", textAlign: "center", lineHeight: 1.4 }}>
        // SHARE LINK TO CALL UP THE SQUAD. MATCH STARTS WHEN ALL SLOTS FILL.
      </div>
      <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, display: "flex", gap: 6, justifyContent: "center" }}>
        <CTA kind="primary">SHARE LINK</CTA>
        <CTA kind="ghost">COPY CODE</CTA>
        <CTA kind="ghost">ABORT</CTA>
      </div>
    </ContentFrame>
  </ScreenShell>
);
const GroupWaiting_Loading = () => (
  <ScreenShell title="LOBBY">
    <ContentFrame>
      <div style={{ position: "absolute", top: 30, left: 8, right: 8, height: 70, display: "flex", gap: 6 }}>
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} variant="tile" style={{ flex: 1, height: 70 }} />)}
      </div>
      <div style={{ position: "absolute", top: 6, left: 8, right: 8, height: 16, background: "var(--muted)", opacity: 0.35, animation: "es-pulse 1s ease-in-out infinite" }} />
    </ContentFrame>
  </ScreenShell>
);
const GroupWaiting_Error = () => (
  <ScreenShell title="LOBBY">
    <ContentFrame>
      <ErrorState
        icon="txfail"
        title="LOBBY LOST CONTACT"
        body="MATCH STATE UNREACHABLE. RECONNECTING…"
        primaryCTA={{ label: "RETRY" }}
        secondaryCTA={{ label: "ABORT" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 11. GroupMatch · spectator
// ────────────────────────────────────────────────────────────────────────
const Spectator_Empty = () => (
  <ScreenShell title="MATCH · GX7P2" right={
    <span className="blink" style={{ color: "var(--red)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>● LIVE</span>
  }>
    <ContentFrame>
      <EmptyState
        icon="eye"
        title="SPECTATING"
        body="YOU'RE NOT IN THIS ENGAGEMENT. WATCH ONLY — CONTROLS ARE LOCKED."
        primaryCTA={{ label: "FOLLOW MATCH" }}
        secondaryCTA={{ label: "FIND OWN MATCH" }}
      />
    </ContentFrame>
  </ScreenShell>
);
const Spectator_Loading = () => (
  <ScreenShell title="MATCH">
    <ContentFrame>
      <div style={{ position: "absolute", inset: 10, display: "flex", gap: 8 }}>
        <SkeletonCard variant="hero" style={{ flex: 2 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonRow height={28} lines={1} />
          <SkeletonRow height={28} lines={1} />
          <SkeletonRow height={28} lines={1} />
        </div>
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Spectator_Error = () => (
  <ScreenShell title="MATCH">
    <ContentFrame>
      <ErrorState
        icon="txfail"
        title="FEED LOST"
        body="MATCH STREAM INTERRUPTED."
        primaryCTA={{ label: "RECONNECT" }}
        secondaryCTA={{ label: "BACK" }}
      />
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// 12. MenuScreen · wallet not connected
//    Currency readout in top bar replaces with CONNECT CTA.
// ────────────────────────────────────────────────────────────────────────
function MenuTopBar({ connected = false }) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 30,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 10px",
      background: "var(--bg-raised)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div className="stencil" style={{ fontSize: 14, color: "var(--accent)", letterSpacing: "0.2em" }}>SOLSHOT</div>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.25em" }}>FIELD MANUAL</span>
      </div>
      {connected ? (
        <span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em" }}>◆ 1,240 · ◇ 2.31</span>
      ) : (
        <button style={{
          background: "var(--accent)", color: "#0e1209",
          border: "none", clipPath: "var(--clip-6)",
          padding: "5px 12px",
          fontFamily: "var(--f-display)", fontSize: 11, letterSpacing: "0.2em",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Icon name="wallet" size={12} color="#0e1209" />
          CONNECT
        </button>
      )}
    </div>
  );
}
const Menu_Empty = () => (
  <ScreenShell title="MAIN MENU" currency={false} right={null}>
    <ContentFrame>
      <MenuTopBar connected={false} />
      {/* Quick-play tile available */}
      <div style={{
        position: "absolute", top: 36, left: 10, right: 10, height: 64,
        background: "var(--bg-deep)", border: "1px solid var(--border)",
        clipPath: "var(--clip-6)",
        display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center",
        padding: "0 12px",
      }}>
        <div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// CASUAL</div>
          <div className="stencil" style={{ fontSize: 14, color: "var(--bone)", letterSpacing: "0.2em" }}>QUICK PLAY</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.18em" }}>NO WAGER · NO WALLET REQUIRED</div>
        </div>
        <CTA kind="primary" compact>DEPLOY</CTA>
      </div>
      {/* Wagered tile — locked behind connect */}
      <div style={{
        position: "absolute", top: 108, left: 10, right: 10, bottom: 10,
        background: "var(--bg-deep)",
        border: "1px dashed var(--muted)",
        clipPath: "var(--clip-6)",
        position: "absolute",
        opacity: 0.95,
      }}>
        <EmptyState
          icon="wallet"
          title="CONNECT WALLET TO PLAY WAGERED"
          body="LINK A SOLANA WALLET TO ENTER RANKED, CHALLENGE, AND HIGH-ROLLER MATCHES."
          primaryCTA={{ label: "CONNECT WALLET" }}
          secondaryCTA={{ label: "PLAY CASUAL" }}
          density="compact"
          bracketed={false}
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Menu_Loading = () => (
  <ScreenShell title="MAIN MENU" currency={false} right={null}>
    <ContentFrame>
      <MenuTopBar connected={false} />
      <div style={{ position: "absolute", top: 36, left: 10, right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <SkeletonRow height={56} lines={2} />
        <SkeletonCard variant="hero" style={{ flex: 1 }} />
      </div>
    </ContentFrame>
  </ScreenShell>
);
const Menu_Error = () => (
  <ScreenShell title="MAIN MENU" currency={false} right={null}>
    <ContentFrame>
      <MenuTopBar connected={false} />
      <div style={{ position: "absolute", top: 30, left: 0, right: 0, bottom: 0 }}>
        <ErrorState
          icon="warning"
          title="WALLET LINK FAILED"
          body="COULDN'T REACH SOLANA RPC. RETRY OR PLAY CASUAL."
          primaryCTA={{ label: "RETRY" }}
          secondaryCTA={{ label: "PLAY CASUAL" }}
        />
      </div>
    </ContentFrame>
  </ScreenShell>
);

// ────────────────────────────────────────────────────────────────────────
// PRIMITIVE DEMO TILES — used in the "Primitives" section at the top of
// the canvas. Each tile is a labeled inline showcase, sized to fit a
// regular artboard (NOT inside a phone frame).
// ────────────────────────────────────────────────────────────────────────
function DemoCard({ width, height, children, label, sub }) {
  return (
    <div style={{ width, height, position: "relative", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--f-display)", fontSize: 14, color: "var(--bone)", letterSpacing: "0.18em", textTransform: "uppercase" }}>{label}</div>
        {sub && <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em", textTransform: "uppercase" }}>{sub}</div>}
      </div>
      <div style={{
        flex: 1,
        position: "relative",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        clipPath: "var(--clip-10)",
        overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

const Demo_EmptyState = () => (
  <DemoCard width={520} height={340} label="<EmptyState />" sub="ICON · TITLE · BODY · OPTIONAL CTAs">
    <EmptyState
      icon="radar"
      title="NO CONTACT ON RADAR"
      body="NO ACTIVE MATCHES IN YOUR FEED RIGHT NOW."
      primaryCTA={{ label: "FIND MATCH" }}
      secondaryCTA={{ label: "CREATE LOBBY" }}
    />
  </DemoCard>
);
const Demo_ErrorState = () => (
  <DemoCard width={520} height={340} label="<ErrorState />" sub="RED TITLE · WARNING ICON · RETRY DEFAULT">
    <ErrorState
      title="TRANSMISSION FAILURE"
      body="COULDN'T REACH SERVER. CHECK CONNECTION."
      secondaryCTA={{ label: "BACK TO MENU" }}
    />
  </DemoCard>
);
const Demo_Skeletons = () => (
  <DemoCard width={520} height={340} label="<SkeletonRow /> + <SkeletonCard />" sub="DASHED FRAME · 1S OPACITY PULSE · NO SHIMMER">
    <div style={{ position: "absolute", inset: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <SkeletonRow height={36} lines={2} leftAccent />
      <SkeletonRow height={36} lines={2} leftAccent />
      <div style={{ display: "flex", gap: 6 }}>
        <SkeletonCard variant="stat" style={{ flex: 1, height: 70 }} />
        <SkeletonCard variant="stat" style={{ flex: 1, height: 70 }} />
        <SkeletonCard variant="stat" style={{ flex: 1, height: 70 }} />
      </div>
    </div>
  </DemoCard>
);

// ────────────────────────────────────────────────────────────────────────
// Icon library showcase
// ────────────────────────────────────────────────────────────────────────
const IconLibrary = () => {
  const items = [
    { n: "radar", l: "RADAR", u: "no contact" },
    { n: "reticle", l: "RETICLE", u: "barracks" },
    { n: "search", l: "SEARCH", u: "not found" },
    { n: "lock", l: "LOCK", u: "locked tier" },
    { n: "target", l: "TARGET", u: "leaderboard" },
    { n: "crate", l: "CRATE", u: "armory" },
    { n: "slots", l: "SLOTS", u: "loadout" },
    { n: "hourglass", l: "HOURGLASS", u: "waiting" },
    { n: "eye", l: "EYE", u: "spectator" },
    { n: "wallet", l: "WALLET", u: "connect" },
    { n: "warning", l: "WARNING", u: "error" },
    { n: "txfail", l: "TX·FAIL", u: "no signal" },
    { n: "skull", l: "EXPIRED", u: "challenge expired" },
  ];
  return (
    <div style={{ width: 720, padding: 16, background: "var(--bg-raised)", border: "1px solid var(--border)", clipPath: "var(--clip-10)" }}>
      <div className="stencil" style={{ fontSize: 14, color: "var(--bone)", letterSpacing: "0.2em", marginBottom: 10 }}>ICON LIBRARY · 13 GLYPHS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            background: "var(--bg-deep)", border: "1px dashed var(--muted)",
            padding: 10, textAlign: "center",
            clipPath: "var(--clip-6)",
          }}>
            <Icon name={it.n} size={36} color="var(--olive)" style={{ margin: "0 auto" }} />
            <div style={{ fontFamily: "var(--f-display)", fontSize: 9, color: "var(--bone)", letterSpacing: "0.18em", marginTop: 6 }}>{it.l}</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.2em", marginTop: 1, textTransform: "uppercase" }}>{it.u}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, {
  // Screen triplets
  MyGames_Empty, MyGames_Loading, MyGames_Error,
  Barracks_Empty, Barracks_Loading, Barracks_Error,
  Leaderboard_Empty, Leaderboard_Loading, Leaderboard_Error,
  Lobby_Empty, Lobby_Loading, Lobby_Error,
  Armory_Empty, Armory_Loading, Armory_Error,
  Loadout_Empty, Loadout_Loading, Loadout_Error,
  Prestige_Empty, Prestige_Loading, Prestige_Error,
  ChallengeExpired_Empty, ChallengeExpired_Loading, ChallengeExpired_Error,
  ChallengeNotFound_Empty, ChallengeNotFound_Loading, ChallengeNotFound_Error,
  GroupWaiting_Empty, GroupWaiting_Loading, GroupWaiting_Error,
  Spectator_Empty, Spectator_Loading, Spectator_Error,
  Menu_Empty, Menu_Loading, Menu_Error,
  // Demos
  Demo_EmptyState, Demo_ErrorState, Demo_Skeletons, IconLibrary,
});
