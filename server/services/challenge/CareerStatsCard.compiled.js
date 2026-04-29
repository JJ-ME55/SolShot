import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React from "react";
const C = {
  bgDeep: "#0e1209",
  bgDeeper: "#0a0d07",
  ink: "#06080a",
  accent: "#ff7a1a",
  accentDeep: "#c44d12",
  accentSoft: "#ffb05a",
  blood: "#a83a1f",
  bone: "#fff8e8",
  bonePale: "#f4e7c8",
  olive: "#c4a65d",
  oliveDim: "rgba(196,166,93,0.6)"
};
const F = {
  display: "'BlackOpsOne', 'Black Ops One', sans-serif",
  mono: "'ShareTechMono', 'Share Tech Mono', monospace"
};
const CAREER_CARD_W = 1080;
const CAREER_CARD_H = 608;
function fmtK(n) {
  if (n == null) return "\u2014";
  if (n >= 1e5) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function clip(s, n) {
  return (s ?? "").toString().slice(0, n);
}
const TIER_LABEL = {
  NONE: "UNRANKED",
  BRONZE: "BRONZE TIER",
  SILVER: "SILVER TIER",
  GOLD: "GOLD TIER",
  PLATINUM: "PLATINUM TIER",
  DIAMOND: "DIAMOND TIER"
};
function CareerStatsCard({
  callsign = "GRIZZLY-07",
  registryId = "A37F",
  tierName = "BRONZE",
  tierBadgeUrl = null,
  // base64 data-URL or null
  rank = 47,
  // null if unranked
  record = { wins: 47, losses: 12, winRate: 78 },
  totalDamage = 47400,
  kills = 127,
  deaths = 89,
  streak = { current: 9, best: 14 },
  mvpWeapon = { name: "HEATSEEK", damage: 12400 },
  matchesPlayed = 59,
  joinedLabel = "JOINED MAR 2026"
}) {
  const w = CAREER_CARD_W;
  const h = CAREER_CARD_H;
  const cs = clip(callsign, 14);
  const reg = clip(registryId, 6).toUpperCase();
  const wpn = clip(mvpWeapon?.name ?? "\u2014", 14);
  const tier = TIER_LABEL[tierName] || "UNRANKED";
  const isUnranked = tierName === "NONE" || !tierBadgeUrl;
  const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : "\u221E";
  const streakBig = streak?.current > 0 ? streak.current : streak?.best ?? 0;
  const streakSub = streak?.current > 0 ? "CURRENT" : `BEST ${streak?.best ?? 0}`;
  return /* @__PURE__ */ jsxs("div", { style: {
    width: w,
    height: h,
    position: "relative",
    background: C.bgDeep,
    display: "flex",
    overflow: "hidden"
  }, children: [
    /* @__PURE__ */ jsxs("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: { position: "absolute", left: 0, top: 0 }, children: [
      /* @__PURE__ */ jsxs("defs", { children: [
        /* @__PURE__ */ jsx("pattern", { id: "cs-grid", width: "32", height: "32", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("path", { d: "M 32 0 L 0 0 0 32", fill: "none", stroke: "rgba(196,166,93,0.06)", strokeWidth: "1" }) }),
        /* @__PURE__ */ jsxs("linearGradient", { id: "cs-blade", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [
          /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: C.accent, stopOpacity: "0.6" }),
          /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: C.accentDeep, stopOpacity: "0.4" })
        ] }),
        /* @__PURE__ */ jsx("pattern", { id: "cs-scan", width: "3", height: "3", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("rect", { width: "3", height: "1", fill: "rgba(0,0,0,0.16)" }) })
      ] }),
      /* @__PURE__ */ jsx("rect", { width: w, height: h, fill: "url(#cs-grid)" }),
      /* @__PURE__ */ jsx("rect", { x: w * 0.66, y: "0", width: w * 0.34, height: h, fill: C.bgDeeper }),
      /* @__PURE__ */ jsx("rect", { x: w * 0.66, y: "0", width: "3", height: h, fill: C.accent }),
      /* @__PURE__ */ jsx(
        "polygon",
        {
          points: `0,${h} 0,${h * 0.78} ${w * 0.42},0 ${w * 0.66},0 ${w * 0.66},${h * 0.05} ${w * 0.18},${h}`,
          fill: "url(#cs-blade)",
          opacity: "0.55"
        }
      ),
      /* @__PURE__ */ jsx("rect", { width: w, height: h, fill: "url(#cs-scan)" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      right: 56,
      top: 28,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", fontFamily: F.display, fontSize: 30, color: C.bonePale, letterSpacing: "0.08em" }, children: [
        /* @__PURE__ */ jsx("span", { children: "SOL" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.accentSoft }, children: "SHOT" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("div", { style: { width: 44, height: 12, background: C.bone, marginRight: 12 } }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.mono, fontSize: 13, letterSpacing: "0.4em", color: C.bonePale }, children: `OPERATIVE FILE \xB7 ${reg}` }),
        /* @__PURE__ */ jsx("div", { style: { width: 44, height: 12, background: C.bone, marginLeft: 12 } })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: {
      position: "absolute",
      left: 56,
      top: 70,
      display: "flex",
      alignItems: "center",
      fontFamily: F.mono,
      fontSize: 11,
      letterSpacing: "0.45em",
      color: C.olive
    }, children: /* @__PURE__ */ jsx("span", { children: `\u2501\u2501\u2501 CLASSIFIED \xB7 TIER: ${tier} \u2501\u2501\u2501` }) }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      top: 116,
      width: w * 0.62 - 56,
      display: "flex",
      flexDirection: "column"
    }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 13, letterSpacing: "0.4em", color: "rgba(255,255,255,0.7)", marginBottom: 6 }, children: "OPERATIVE" }),
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.display,
        fontSize: 84,
        lineHeight: 0.92,
        color: C.bone,
        letterSpacing: "0.02em",
        textShadow: "0 4px 0 rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
        overflow: "hidden"
      }, children: cs }),
      /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        fontFamily: F.mono,
        fontSize: 14,
        letterSpacing: "0.25em",
        marginTop: 14,
        color: C.bonePale
      }, children: [
        rank != null ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { style: { display: "flex", background: C.accent, color: C.ink, padding: "3px 10px", letterSpacing: "0.15em", fontFamily: F.display, fontSize: 18 }, children: `#${rank}` }),
          /* @__PURE__ */ jsx("span", { style: { marginLeft: 10, marginRight: 10, opacity: 0.4 }, children: "\xB7" })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("span", { style: { display: "flex", border: `1px solid ${C.olive}`, color: C.olive, padding: "3px 10px", letterSpacing: "0.25em", fontSize: 12 }, children: "UNRANKED" }),
          /* @__PURE__ */ jsx("span", { style: { marginLeft: 10, marginRight: 10, opacity: 0.4 }, children: "\xB7" })
        ] }),
        /* @__PURE__ */ jsx("span", { style: { color: C.bone, fontWeight: "normal" }, children: `${record.wins}W` }),
        /* @__PURE__ */ jsx("span", { style: { margin: "0 6px", color: C.olive }, children: "\u2013" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.bone }, children: `${record.losses}L` }),
        /* @__PURE__ */ jsx("span", { style: { marginLeft: 10, marginRight: 10, opacity: 0.4 }, children: "\xB7" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.accentSoft }, children: `${record.winRate}% WR` })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "row", marginTop: 26 }, children: [
        /* @__PURE__ */ jsx(Stat, { label: "TOTAL DMG", big: fmtK(totalDamage), sub: "HP DEALT" }),
        /* @__PURE__ */ jsx(Spacer, {}),
        /* @__PURE__ */ jsx(Stat, { label: "K / D", big: `${kills}/${deaths}`, sub: `${kdRatio} RATIO`, smallBig: true }),
        /* @__PURE__ */ jsx(Spacer, {}),
        /* @__PURE__ */ jsx(Stat, { label: "STREAK", big: String(streakBig), sub: streakSub }),
        /* @__PURE__ */ jsx(Spacer, {}),
        /* @__PURE__ */ jsx(Stat, { label: "MVP WEAPON", big: wpn, sub: `${fmtK(mvpWeapon?.damage)} DMG`, smallBig: true })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: w * 0.66,
      top: 0,
      width: w * 0.34,
      height: h - 56,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 28
    }, children: [
      /* @__PURE__ */ jsx("div", { style: {
        position: "absolute",
        left: 0,
        right: 0,
        top: "50%",
        display: "flex",
        justifyContent: "center",
        fontFamily: F.display,
        fontSize: 110,
        letterSpacing: "0.05em",
        color: "rgba(196,166,93,0.06)",
        transform: "translateY(-50%) rotate(-8deg)",
        pointerEvents: "none"
      }, children: "CLASSIFIED" }),
      isUnranked ? /* @__PURE__ */ jsx(UnrankedPlate, {}) : /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 220,
        height: 220,
        position: "relative"
      }, children: [
        /* @__PURE__ */ jsx("div", { style: {
          position: "absolute",
          inset: 0,
          border: `2px solid ${C.accent}`,
          borderRadius: 9999,
          opacity: 0.6
        } }),
        /* @__PURE__ */ jsx("div", { style: {
          position: "absolute",
          inset: 8,
          border: `1px solid rgba(255,176,90,0.5)`,
          borderRadius: 9999
        } }),
        /* @__PURE__ */ jsx("img", { src: tierBadgeUrl, width: 200, height: 200, style: { display: "flex" } })
      ] }),
      /* @__PURE__ */ jsx("div", { style: {
        marginTop: 22,
        fontFamily: F.display,
        fontSize: 28,
        letterSpacing: "0.15em",
        color: C.bone,
        display: "flex"
      }, children: tier }),
      /* @__PURE__ */ jsx("div", { style: {
        marginTop: 6,
        fontFamily: F.mono,
        fontSize: 11,
        letterSpacing: "0.35em",
        color: C.olive,
        display: "flex"
      }, children: "\u25B8 STATUS \xB7 ACTIVE" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 56,
      background: C.bgDeeper,
      borderTop: `2px solid ${C.accentSoft}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 56px"
    }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 13, color: C.olive, letterSpacing: "0.3em" }, children: "SOLSHOT.GG \xB7 ARTILLERY COMBAT ON SOLANA" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.mono, fontSize: 13, color: C.oliveDim, letterSpacing: "0.3em" }, children: `\u25B8 ${matchesPlayed} MATCHES \xB7 ${joinedLabel}` })
    ] })
  ] });
}
function Spacer() {
  return /* @__PURE__ */ jsx("div", { style: { width: 12, flexShrink: 0 } });
}
function Stat({ label, big, sub, smallBig }) {
  return /* @__PURE__ */ jsxs("div", { style: {
    flexGrow: 1,
    flexBasis: 0,
    display: "flex",
    flexDirection: "column",
    background: "rgba(10,13,7,0.85)",
    border: "1px solid rgba(255,176,90,0.35)",
    padding: "14px 16px"
  }, children: [
    /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.mono,
      fontSize: 10,
      color: C.olive,
      letterSpacing: "0.3em",
      marginBottom: 6
    }, children: label }),
    /* @__PURE__ */ jsx("div", { style: {
      display: "flex",
      fontFamily: F.display,
      fontSize: smallBig ? 30 : 40,
      color: C.bone,
      lineHeight: 0.95,
      letterSpacing: "0.02em",
      whiteSpace: "nowrap",
      overflow: "hidden"
    }, children: big }),
    /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.mono,
      fontSize: 10,
      color: "rgba(244,231,200,0.5)",
      letterSpacing: "0.25em",
      marginTop: 4
    }, children: sub })
  ] });
}
function UnrankedPlate() {
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 220,
    height: 220,
    border: `2px dashed rgba(196,166,93,0.5)`,
    background: "rgba(0,0,0,0.4)"
  }, children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.display, fontSize: 22, color: C.olive, letterSpacing: "0.2em" }, children: "[ CLASSIFIED ]" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 10, fontFamily: F.mono, fontSize: 11, letterSpacing: "0.3em", color: "rgba(196,166,93,0.6)" }, children: "TIER PENDING" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 4, fontFamily: F.mono, fontSize: 11, letterSpacing: "0.3em", color: "rgba(196,166,93,0.6)" }, children: "EARN A WIN" })
  ] });
}
export {
  CAREER_CARD_H,
  CAREER_CARD_W,
  CareerStatsCard as default
};
