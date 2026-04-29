import { jsx, jsxs } from "react/jsx-runtime";
import React from "react";
const C = {
  bgDeep: "#0e1209",
  bgDeeper: "#0a0d07",
  ink: "#06080a",
  accent: "#ff7a1a",
  accentDeep: "#c44d12",
  accentSoft: "#ffb05a",
  bone: "#fff8e8",
  bonePale: "#f4e7c8",
  olive: "#c4a65d",
  oliveDim: "rgba(196,166,93,0.6)"
};
const F = {
  display: "'BlackOpsOne', 'Black Ops One', sans-serif",
  mono: "'ShareTechMono', 'Share Tech Mono', monospace"
};
const TROPHY_CARD_W = 1080;
const TROPHY_CARD_H = 608;
function TrophyShareCard({
  winner = { callsign: "GRIZZLY-07", damage: 742, accuracy: 68, shots: 22, best: "CRAZY IVAN" },
  loser = { callsign: "VIPER-12" },
  score = "2 \u2013 1",
  matchId = "M-#00000",
  terrain = "UNKNOWN",
  duration = "00:00"
}) {
  const w = TROPHY_CARD_W;
  const h = TROPHY_CARD_H;
  return /* @__PURE__ */ jsxs("div", { style: {
    width: w,
    height: h,
    position: "relative",
    background: C.bgDeep,
    display: "flex",
    // Satori: parents of multi children need display:flex
    overflow: "hidden"
  }, children: [
    /* @__PURE__ */ jsxs(
      "svg",
      {
        width: w,
        height: h,
        viewBox: `0 0 ${w} ${h}`,
        style: { position: "absolute", left: 0, top: 0 },
        children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsx("pattern", { id: "trophy-grid", width: "32", height: "32", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("path", { d: "M 32 0 L 0 0 0 32", fill: "none", stroke: "rgba(196,166,93,0.08)", strokeWidth: "1" }) }),
            /* @__PURE__ */ jsxs("linearGradient", { id: "trophy-blade", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: C.accent }),
              /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: C.accentDeep })
            ] }),
            /* @__PURE__ */ jsx("pattern", { id: "trophy-scan", width: "3", height: "3", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("rect", { width: "3", height: "1", fill: "rgba(0,0,0,0.18)" }) })
          ] }),
          /* @__PURE__ */ jsx("rect", { width: w, height: h, fill: "url(#trophy-grid)" }),
          /* @__PURE__ */ jsx(
            "polygon",
            {
              points: `0,${h} 0,${h * 0.55} ${w * 0.62},0 ${w},0 ${w},${h * 0.18} ${w * 0.42},${h}`,
              fill: "url(#trophy-blade)",
              opacity: "0.95"
            }
          ),
          /* @__PURE__ */ jsx("rect", { width: w, height: h, fill: "url(#trophy-scan)" })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      right: 56,
      top: 32,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", fontFamily: F.display, fontSize: 32, color: C.bonePale, letterSpacing: "0.08em" }, children: [
        /* @__PURE__ */ jsx("span", { children: "SOL" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.accentSoft }, children: "SHOT" })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.mono, fontSize: 13, letterSpacing: "0.35em", color: "rgba(244,231,200,0.6)" }, children: `MATCH \xB7 ${matchId}` })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      top: 110,
      width: 200,
      height: 200,
      background: C.bgDeep,
      border: `4px solid ${C.accentSoft}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column"
    }, children: [
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.display,
        fontSize: 140,
        color: C.accentSoft,
        lineHeight: 0.8,
        textShadow: "0 0 30px rgba(255,176,90,0.5)"
      }, children: "W" }),
      /* @__PURE__ */ jsx("div", { style: {
        fontFamily: F.mono,
        fontSize: 13,
        color: C.bonePale,
        letterSpacing: "0.3em",
        opacity: 0.7,
        marginTop: 8
      }, children: "VICTORY" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 290,
      top: 130,
      right: 56,
      display: "flex",
      flexDirection: "column"
    }, children: [
      /* @__PURE__ */ jsx("div", { style: {
        fontFamily: F.mono,
        fontSize: 14,
        letterSpacing: "0.4em",
        color: "rgba(255,255,255,0.7)",
        marginBottom: 8
      }, children: "OPERATIVE" }),
      /* @__PURE__ */ jsx("div", { style: {
        display: "flex",
        fontFamily: F.display,
        fontSize: 110,
        lineHeight: 0.9,
        color: C.bone,
        letterSpacing: "0.02em",
        textShadow: "0 4px 0 rgba(0,0,0,0.4)",
        whiteSpace: "nowrap",
        overflow: "hidden"
      }, children: winner.callsign }),
      /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        fontFamily: F.mono,
        fontSize: 16,
        letterSpacing: "0.25em",
        color: "rgba(255,255,255,0.85)",
        marginTop: 14
      }, children: [
        /* @__PURE__ */ jsx("span", { children: "DEFEATED" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.bone, marginLeft: 10 }, children: loser.callsign }),
        /* @__PURE__ */ jsx("span", { style: { margin: "0 14px", opacity: 0.4 }, children: "|" }),
        /* @__PURE__ */ jsx("span", { style: {
          display: "flex",
          fontFamily: F.display,
          fontSize: 28,
          color: C.bgDeep,
          background: C.bone,
          padding: "2px 12px",
          letterSpacing: "0.04em"
        }, children: score })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      right: 56,
      bottom: 88,
      display: "flex",
      flexDirection: "row"
    }, children: [
      /* @__PURE__ */ jsx(TrophyStat, { label: "DMG DEALT", v: String(winner.damage), sub: "HP" }),
      /* @__PURE__ */ jsx(Spacer, {}),
      /* @__PURE__ */ jsx(TrophyStat, { label: "ACCURACY", v: `${winner.accuracy}%`, sub: `${winner.shots} SHOTS` }),
      /* @__PURE__ */ jsx(Spacer, {}),
      /* @__PURE__ */ jsx(TrophyStat, { label: "MVP WEAPON", v: winner.best, sub: "SIGNATURE" })
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
      /* @__PURE__ */ jsx("div", { style: { display: "flex", fontFamily: F.mono, fontSize: 13, color: C.oliveDim, letterSpacing: "0.3em" }, children: `\u25B8 TERRAIN ${terrain} \xB7 ${duration}` })
    ] })
  ] });
}
function Spacer() {
  return /* @__PURE__ */ jsx("div", { style: { width: 16, flexShrink: 0 } });
}
function TrophyStat({ label, v, sub }) {
  return /* @__PURE__ */ jsxs("div", { style: {
    flexGrow: 1,
    flexBasis: 0,
    display: "flex",
    flexDirection: "column",
    background: "rgba(10,13,7,0.85)",
    border: "1px solid rgba(255,176,90,0.4)",
    padding: "16px 20px"
  }, children: [
    /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.mono,
      fontSize: 11,
      color: C.olive,
      letterSpacing: "0.3em",
      marginBottom: 6
    }, children: label }),
    /* @__PURE__ */ jsx("div", { style: {
      display: "flex",
      fontFamily: F.display,
      fontSize: 48,
      color: C.bone,
      lineHeight: 0.95,
      letterSpacing: "0.02em",
      whiteSpace: "nowrap",
      overflow: "hidden"
    }, children: v }),
    /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.mono,
      fontSize: 11,
      color: "rgba(244,231,200,0.5)",
      letterSpacing: "0.25em",
      marginTop: 4
    }, children: sub })
  ] });
}
export {
  TROPHY_CARD_H,
  TROPHY_CARD_W,
  TrophyShareCard as default
};
