import { jsx, jsxs } from "react/jsx-runtime";
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
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function clip(s, n) {
  return (s ?? "").toString().slice(0, n);
}
const TIER_LABEL = {
  NONE: "UNRANKED",
  BRONZE: "BRONZE",
  SILVER: "SILVER",
  GOLD: "GOLD",
  PLATINUM: "PLATINUM",
  DIAMOND: "DIAMOND"
};
function CareerStatsCard({
  callsign = "GRIZZLY-07",
  registryId = "A37F",
  tierName = "BRONZE",
  tierBadgeUrl = null,
  rank = 47,
  record = { wins: 47, losses: 12, winRate: 78 },
  totalDamage = 47400,
  kills = 127,
  deaths = 89,
  streak = { current: 9, best: 14 },
  mvpWeapon = { name: "HEATSEEK", damage: 12400 },
  matchesPlayed = 59,
  joinedLabel = "JOINED MAR 2026",
  recentForm = null
  // optional: array of 'W' | 'L', up to 10, most-recent-last
}) {
  const w = CAREER_CARD_W;
  const h = CAREER_CARD_H;
  const cs = clip(callsign, 14);
  const reg = clip(registryId, 6).toUpperCase();
  const wpn = clip(mvpWeapon?.name ?? "\u2014", 14);
  const csLen = cs.length;
  const csSize = csLen <= 6 ? 108 : csLen <= 8 ? 96 : csLen <= 10 ? 82 : csLen <= 12 ? 70 : 60;
  const csTrack = csLen <= 8 ? "0.04em" : csLen <= 10 ? "0.02em" : csLen <= 12 ? "0.01em" : "0";
  const wpnLen = wpn.length;
  const wpnSize = wpnLen <= 5 ? 48 : wpnLen <= 7 ? 42 : wpnLen <= 9 ? 34 : wpnLen <= 11 ? 28 : wpnLen <= 13 ? 24 : 22;
  const wpnTrack = wpnLen <= 7 ? "0.02em" : wpnLen <= 11 ? "0.01em" : "0";
  const dmgStr = fmtK(totalDamage);
  const dmgLen = dmgStr.length;
  const dmgSize = dmgLen <= 3 ? 56 : dmgLen <= 4 ? 50 : dmgLen <= 5 ? 44 : 38;
  const dmgTrack = dmgLen <= 4 ? "0.02em" : "0.01em";
  const kdStr = `${kills}/${deaths}`;
  const kdLen = kdStr.length;
  const kdSize = kdLen <= 3 ? 56 : kdLen <= 5 ? 48 : kdLen <= 7 ? 40 : 34;
  const kdTrack = kdLen <= 5 ? "0.02em" : "0.01em";
  const tier = TIER_LABEL[tierName] || "UNRANKED";
  const isUnranked = tierName === "NONE" || !tierBadgeUrl;
  const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : "\u221E";
  const form = recentForm && recentForm.length > 0 ? recentForm.slice(-10) : Array.from({ length: 10 }, (_, i) => i < (streak?.current ?? 0) ? "W" : "L");
  const sealW = w * 0.34;
  const sealLeft = w - sealW;
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
        /* @__PURE__ */ jsx("pattern", { id: "cs-grid", width: "40", height: "40", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("path", { d: "M 40 0 L 0 0 0 40", fill: "none", stroke: "rgba(196,166,93,0.06)", strokeWidth: "1" }) }),
        /* @__PURE__ */ jsx("pattern", { id: "cs-scan", width: "3", height: "3", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("rect", { width: "3", height: "1", fill: "rgba(0,0,0,0.14)" }) })
      ] }),
      /* @__PURE__ */ jsx("rect", { width: w, height: h, fill: "url(#cs-grid)" }),
      /* @__PURE__ */ jsx("rect", { x: sealLeft, y: "0", width: sealW, height: h, fill: C.bgDeeper }),
      /* @__PURE__ */ jsx("rect", { x: sealLeft, y: "0", width: "3", height: h, fill: C.accent }),
      /* @__PURE__ */ jsx("rect", { width: w, height: h, fill: "url(#cs-scan)" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      right: 56,
      top: 30,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", fontFamily: F.display, fontSize: 36, color: C.bonePale, letterSpacing: "0.08em" }, children: [
          /* @__PURE__ */ jsx("span", { children: "SOL" }),
          /* @__PURE__ */ jsx("span", { style: { color: C.accentSoft }, children: "SHOT" })
        ] }),
        /* @__PURE__ */ jsx("div", { style: {
          display: "flex",
          marginLeft: 18,
          fontFamily: F.mono,
          fontSize: 16,
          letterSpacing: "0.3em",
          color: C.olive,
          borderLeft: `1px solid ${C.olive}`,
          paddingLeft: 18
        }, children: "OPERATIVE FILE" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.mono,
        fontSize: 16,
        letterSpacing: "0.3em",
        color: C.bonePale,
        background: "rgba(0,0,0,0.45)",
        border: `1px solid rgba(255,176,90,0.35)`,
        padding: "6px 14px"
      }, children: `ID \xB7 ${reg}` })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      top: 96,
      width: sealLeft - 56 - 32,
      display: "flex",
      flexDirection: "column"
    }, children: [
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.mono,
        fontSize: 17,
        letterSpacing: "0.4em",
        color: C.accentSoft,
        marginBottom: 10
      }, children: "OPERATIVE" }),
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.display,
        fontSize: csSize,
        lineHeight: 0.92,
        color: C.bone,
        letterSpacing: csTrack,
        textShadow: "0 4px 0 rgba(0,0,0,0.45)",
        whiteSpace: "nowrap"
      }, children: cs }),
      /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        fontFamily: F.mono,
        fontSize: 17,
        letterSpacing: "0.18em",
        marginTop: 18,
        color: C.bonePale
      }, children: [
        rank != null ? /* @__PURE__ */ jsx("span", { style: {
          display: "flex",
          background: C.accent,
          color: C.ink,
          padding: "5px 14px",
          letterSpacing: "0.12em",
          fontFamily: F.display,
          fontSize: 22
        }, children: `#${rank}` }) : /* @__PURE__ */ jsx("span", { style: {
          display: "flex",
          border: `1.5px solid ${C.olive}`,
          color: C.olive,
          padding: "5px 14px",
          letterSpacing: "0.25em",
          fontSize: 14
        }, children: "UNRANKED" }),
        /* @__PURE__ */ jsx("span", { style: { marginLeft: 14, marginRight: 14, opacity: 0.5 }, children: "\xB7" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.bone, fontSize: 22, fontFamily: F.display, letterSpacing: "0.04em" }, children: `${record.wins}W` }),
        /* @__PURE__ */ jsx("span", { style: { margin: "0 8px", color: C.olive }, children: "\u2013" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.bone, fontSize: 22, fontFamily: F.display, letterSpacing: "0.04em" }, children: `${record.losses}L` }),
        /* @__PURE__ */ jsx("span", { style: { marginLeft: 14, marginRight: 14, opacity: 0.5 }, children: "\xB7" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.accentSoft, fontSize: 22, fontFamily: F.display, letterSpacing: "0.04em" }, children: `${record.winRate}%` })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "row", marginTop: 26 }, children: [
        /* @__PURE__ */ jsx(Stat, { label: "TOTAL DMG", big: dmgStr, sub: "HP DEALT", bigSize: dmgSize, bigTrack: dmgTrack }),
        /* @__PURE__ */ jsx(Spacer, {}),
        /* @__PURE__ */ jsx(Stat, { label: "K / D", big: kdStr, sub: `${kdRatio} RATIO`, bigSize: kdSize, bigTrack: kdTrack }),
        /* @__PURE__ */ jsx(Spacer, {}),
        /* @__PURE__ */ jsx(Stat, { label: "MVP WEAPON", big: wpn, sub: `${fmtK(mvpWeapon?.damage)} DMG`, bigSize: wpnSize, bigTrack: wpnTrack, flexGrow: 1.4 })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", marginTop: 22 }, children: [
        /* @__PURE__ */ jsx("div", { style: {
          display: "flex",
          fontFamily: F.mono,
          fontSize: 13,
          letterSpacing: "0.35em",
          color: C.olive,
          marginBottom: 8
        }, children: "> RECENT FORM \xB7 LAST 10" }),
        /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "row" }, children: form.map((r, i) => /* @__PURE__ */ jsx(FormCell, { result: r }, i)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: sealLeft,
      top: 0,
      width: sealW,
      height: h - 56,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 40
    }, children: [
      /* @__PURE__ */ jsx("div", { style: {
        position: "absolute",
        left: 0,
        right: 0,
        top: "52%",
        display: "flex",
        justifyContent: "center",
        fontFamily: F.display,
        fontSize: 96,
        letterSpacing: "0.05em",
        color: "rgba(196,166,93,0.07)",
        transform: "translateY(-50%) rotate(-8deg)"
      }, children: "CLASSIFIED" }),
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.mono,
        fontSize: 14,
        letterSpacing: "0.45em",
        color: C.olive,
        marginBottom: 18
      }, children: "- TIER -" }),
      isUnranked ? /* @__PURE__ */ jsx(UnrankedPlate, {}) : /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 240,
        height: 240,
        position: "relative"
      }, children: [
        /* @__PURE__ */ jsx("div", { style: {
          position: "absolute",
          inset: 0,
          border: `2px solid ${C.accent}`,
          borderRadius: 9999,
          opacity: 0.7
        } }),
        /* @__PURE__ */ jsx("div", { style: {
          position: "absolute",
          inset: 10,
          border: `1px solid rgba(255,176,90,0.5)`,
          borderRadius: 9999
        } }),
        /* @__PURE__ */ jsx("img", { src: tierBadgeUrl, width: 220, height: 220, style: { display: "flex" } })
      ] }),
      /* @__PURE__ */ jsx("div", { style: {
        marginTop: 22,
        display: "flex",
        fontFamily: F.display,
        fontSize: 40,
        letterSpacing: "0.12em",
        color: C.bone,
        textShadow: "0 3px 0 rgba(0,0,0,0.4)"
      }, children: tier })
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
      /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 14, color: C.olive, letterSpacing: "0.3em" }, children: "SOLSHOT.GG \xB7 ARTILLERY ON SOLANA" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.mono, fontSize: 14, color: C.oliveDim, letterSpacing: "0.3em" }, children: `> ${matchesPlayed} MATCHES \xB7 ${joinedLabel}` })
    ] })
  ] });
}
function Spacer() {
  return /* @__PURE__ */ jsx("div", { style: { width: 12, flexShrink: 0 } });
}
function Stat({ label, big, sub, bigSize = 44, bigTrack = "0.02em", flexGrow = 1 }) {
  return /* @__PURE__ */ jsxs("div", { style: {
    flexGrow,
    flexBasis: 0,
    display: "flex",
    flexDirection: "column",
    background: "rgba(10,13,7,0.85)",
    border: "1px solid rgba(255,176,90,0.4)",
    padding: "18px 20px 16px",
    minWidth: 0
  }, children: [
    /* @__PURE__ */ jsx("div", { style: {
      display: "flex",
      fontFamily: F.mono,
      fontSize: 14,
      color: C.accentSoft,
      letterSpacing: "0.28em",
      marginBottom: 10
    }, children: label }),
    /* @__PURE__ */ jsx("div", { style: {
      display: "flex",
      fontFamily: F.display,
      fontSize: bigSize,
      color: C.bone,
      lineHeight: 0.95,
      letterSpacing: bigTrack,
      whiteSpace: "nowrap"
    }, children: big }),
    /* @__PURE__ */ jsx("div", { style: {
      display: "flex",
      fontFamily: F.mono,
      fontSize: 13,
      color: "rgba(244,231,200,0.65)",
      letterSpacing: "0.22em",
      marginTop: 8
    }, children: sub })
  ] });
}
function FormCell({ result }) {
  const win = result === "W";
  return /* @__PURE__ */ jsx("div", { style: {
    flexGrow: 1,
    flexBasis: 0,
    height: 36,
    marginRight: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: win ? C.accent : "rgba(168,58,31,0.35)",
    border: `1px solid ${win ? C.accentSoft : "rgba(168,58,31,0.7)"}`,
    fontFamily: F.display,
    fontSize: 18,
    color: win ? C.ink : C.bonePale,
    letterSpacing: "0.05em"
  }, children: result });
}
function UnrankedPlate() {
  return /* @__PURE__ */ jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 240,
    height: 240,
    border: `2px dashed rgba(196,166,93,0.55)`,
    background: "rgba(0,0,0,0.4)"
  }, children: [
    /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.display, fontSize: 26, color: C.olive, letterSpacing: "0.18em" }, children: "[ CLASSIFIED ]" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 14, display: "flex", fontFamily: F.mono, fontSize: 13, letterSpacing: "0.3em", color: "rgba(196,166,93,0.7)" }, children: "TIER PENDING" }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 4, display: "flex", fontFamily: F.mono, fontSize: 13, letterSpacing: "0.3em", color: "rgba(196,166,93,0.7)" }, children: "EARN A WIN" })
  ] });
}
export {
  CAREER_CARD_H,
  CAREER_CARD_W,
  CareerStatsCard as default
};
