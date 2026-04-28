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
  bloodDeep: "#5a1e0a",
  bone: "#fff8e8",
  bonePale: "#f4e7c8",
  olive: "#c4a65d"
};
const F = {
  display: "BlackOpsOne",
  // Satori expects exact font.name match — see handoff doc
  mono: "ShareTechMono"
};
const DUEL_CARD_W = 1080;
const DUEL_CARD_H = 1080;
function DuelChallengeCard({
  challenger,
  // { callsign, rank, record, winRate, initials }
  opponent,
  // { callsign, handle, initials }
  wager,
  // { amount, token }
  format = "BO3",
  matchId,
  // e.g. "CH-#0A3F7"
  shortUrl,
  // e.g. "solshot.gg/c/0A3F7"
  expiresIn
  // e.g. "24:00:00" — pre-formatted string
}) {
  const W = DUEL_CARD_W;
  const H = DUEL_CARD_H;
  return /* @__PURE__ */ jsxs("div", { style: {
    width: W,
    height: H,
    position: "relative",
    background: C.bgDeep,
    display: "flex"
    // Satori requires display:flex on flex parents; we use absolute layout
    // for most children, but the root needs an explicit display.
  }, children: [
    /* @__PURE__ */ jsxs(
      "svg",
      {
        width: W,
        height: H,
        viewBox: `0 0 ${W} ${H}`,
        style: { position: "absolute", left: 0, top: 0 },
        children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsx("pattern", { id: "duel-grid", width: "40", height: "40", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx("path", { d: "M 40 0 L 0 0 0 40", fill: "none", stroke: "rgba(196,166,93,0.06)", strokeWidth: "1" }) }),
            /* @__PURE__ */ jsxs("linearGradient", { id: "duel-blade-l", x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: C.accent }),
              /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: C.accentDeep })
            ] }),
            /* @__PURE__ */ jsxs("linearGradient", { id: "duel-blade-r", x1: "100%", y1: "0%", x2: "0%", y2: "100%", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: C.blood }),
              /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: C.bloodDeep })
            ] })
          ] }),
          /* @__PURE__ */ jsx("rect", { width: W, height: H, fill: "url(#duel-grid)" }),
          /* @__PURE__ */ jsx(
            "polygon",
            {
              points: `0,0 ${W * 0.5 - 20},0 ${W * 0.5 - 60},${H} 0,${H}`,
              fill: "url(#duel-blade-l)",
              opacity: "0.92"
            }
          ),
          /* @__PURE__ */ jsx(
            "polygon",
            {
              points: `${W * 0.5 + 20},0 ${W},0 ${W},${H} ${W * 0.5 + 60},${H}`,
              fill: "url(#duel-blade-r)",
              opacity: "0.78"
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      right: 56,
      top: 36,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", fontFamily: F.display, fontSize: 40, color: C.bone, letterSpacing: "0.08em" }, children: [
        /* @__PURE__ */ jsx("span", { children: "SOL" }),
        /* @__PURE__ */ jsx("span", { style: { color: C.accentSoft }, children: "SHOT" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(10,13,7,0.7)",
        border: `1px solid rgba(255,176,90,0.5)`,
        padding: "6px 14px"
      }, children: [
        /* @__PURE__ */ jsx("div", { style: { width: 8, height: 8, background: C.accentSoft, borderRadius: 999 } }),
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 14, letterSpacing: "0.3em", color: C.bonePale }, children: "OPEN CHALLENGE" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: {
      position: "absolute",
      left: 56,
      top: 92,
      fontFamily: F.mono,
      fontSize: 11,
      letterSpacing: "0.3em",
      color: "rgba(196,166,93,0.6)"
    }, children: matchId }),
    /* @__PURE__ */ jsx("div", { style: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 130,
      display: "flex",
      justifyContent: "center",
      fontFamily: F.mono,
      fontSize: 16,
      letterSpacing: "0.5em",
      color: "rgba(255,248,232,0.6)"
    }, children: "\u2501\u2501\u2501 DIRECT CALL-OUT \u2501\u2501\u2501" }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 30,
      right: 30,
      top: 220,
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    }, children: [
      /* @__PURE__ */ jsx(
        DuelSide,
        {
          label: "CHALLENGER",
          initials: challenger.initials,
          callsign: challenger.callsign,
          subtitleColor: C.accentSoft,
          subtitleText: challenger.rank,
          metaText: `${challenger.record} \xB7 ${challenger.winRate}% WR`,
          tone: "hot"
        }
      ),
      /* @__PURE__ */ jsx("div", { style: {
        width: 160,
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
      }, children: /* @__PURE__ */ jsx("div", { style: {
        fontFamily: F.display,
        fontSize: 160,
        color: C.bone,
        lineHeight: 0.85,
        letterSpacing: "-0.02em",
        textShadow: `0 0 40px ${C.accent}, 4px 4px 0 ${C.ink}`,
        transform: "rotate(-3deg)",
        display: "flex"
      }, children: "VS" }) }),
      /* @__PURE__ */ jsx(
        DuelSide,
        {
          label: "SUMMONED",
          initials: opponent.initials,
          callsign: opponent.callsign,
          subtitleColor: C.bonePale,
          subtitleText: opponent.handle,
          metaText: "DECLINE = COWARD",
          tone: "cold"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 56,
      right: 56,
      bottom: 168,
      display: "flex",
      flexDirection: "row",
      background: C.ink,
      border: `2px solid ${C.accentSoft}`,
      padding: "20px 28px"
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", flexGrow: 1 }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 12, letterSpacing: "0.3em", color: C.olive, marginBottom: 4 }, children: "WAGER" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", fontFamily: F.display, fontSize: 56, color: C.accentSoft, lineHeight: 1 }, children: [
          /* @__PURE__ */ jsx("span", { children: wager.amount }),
          /* @__PURE__ */ jsx("span", { style: { color: C.bone, fontSize: 32, marginLeft: 14 }, children: wager.token })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        borderLeft: `1px solid rgba(196,166,93,0.3)`,
        paddingLeft: 28
      }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 12, letterSpacing: "0.3em", color: C.olive, marginBottom: 4 }, children: "FORMAT" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", fontFamily: F.display, fontSize: 56, color: C.bone, lineHeight: 1 }, children: [
          /* @__PURE__ */ jsx("span", { children: format }),
          /* @__PURE__ */ jsx("span", { style: { fontSize: 22, color: C.olive, letterSpacing: "0.1em", marginLeft: 14 }, children: "\xB7 FIRST TO 2" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 56px",
      background: C.bgDeeper,
      borderTop: `2px solid ${C.accentSoft}`
    }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.display, fontSize: 24, color: C.accentSoft, letterSpacing: "0.15em" }, children: "\u25B8 ACCEPT NOW" }),
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 14, letterSpacing: "0.3em", color: C.olive, marginTop: 2 }, children: shortUrl })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 12, letterSpacing: "0.3em", color: C.olive }, children: "EXPIRES IN" }),
        /* @__PURE__ */ jsx("div", { style: { fontFamily: F.display, fontSize: 28, color: C.bone, letterSpacing: "0.05em" }, children: expiresIn })
      ] })
    ] })
  ] });
}
function DuelSide({ label, initials, callsign, subtitleColor, subtitleText, metaText, tone }) {
  const ringColor = tone === "hot" ? C.accentSoft : C.bonePale;
  const initialsColor = tone === "hot" ? C.accentSoft : C.bonePale;
  return /* @__PURE__ */ jsxs("div", { style: {
    flexGrow: 1,
    flexBasis: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 10px"
  }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontFamily: F.mono, fontSize: 13, letterSpacing: "0.4em", color: "rgba(255,248,232,0.7)", marginBottom: 10 }, children: label }),
    /* @__PURE__ */ jsx("div", { style: {
      width: 140,
      height: 140,
      background: C.ink,
      border: `4px solid ${ringColor}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }, children: /* @__PURE__ */ jsx("div", { style: { fontFamily: F.display, fontSize: 56, color: initialsColor, letterSpacing: "0.05em" }, children: initials }) }),
    /* @__PURE__ */ jsx("div", { style: {
      marginTop: 18,
      maxWidth: "100%",
      height: 50,
      display: "flex",
      justifyContent: "center",
      overflow: "hidden"
    }, children: /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.display,
      fontSize: 52,
      color: C.bone,
      lineHeight: 1,
      letterSpacing: "0.02em",
      textShadow: "0 4px 0 rgba(0,0,0,0.4)",
      whiteSpace: "nowrap"
    }, children: callsign }) }),
    /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.mono,
      fontSize: 13,
      letterSpacing: "0.3em",
      color: subtitleColor,
      marginTop: 12
    }, children: subtitleText }),
    /* @__PURE__ */ jsx("div", { style: {
      fontFamily: F.mono,
      fontSize: 12,
      letterSpacing: "0.25em",
      color: "rgba(255,248,232,0.6)",
      marginTop: 4
    }, children: metaText })
  ] });
}
export {
  DUEL_CARD_H,
  DUEL_CARD_W,
  DuelChallengeCard as default
};
