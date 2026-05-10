# SolShot Pitch Video — 2-min Loom (v1)

**Format:** Loom, webcam talking-head + screenshare cuts. 2-min hard cap. Aim 1:55.
**Audience:** Colosseum Frontier Hackathon judges. Investors who'll watch on 2x.
**Goal:** Make the case that SolShot is a **category bet**, not a product bet. Demo video already proves the *what-shipped*. This video proves the *why-invest*.
**Status:** Draft v1, drafted 2026-05-10 ahead of the Tuesday morning submission.
**Recording target:** Monday evening or Tuesday morning.

---

## The thesis to land

Three things have to stick by the time the viewer closes the tab:

1. **What it is** — group-chat-native wagered gaming, on-chain settlement, shipped on Telegram now
2. **The wedge** — async-turn gameplay is the only mechanic that fits group chat. Real-time fights the chat, async fits it. That's a structural insight, not a UX preference
3. **The category** — chat surfaces are frontends to an existing API. Adding Seekr Mobile, iMessage, WhatsApp doesn't rebuild the product. Adding a new game (basketball, 8-ball, hockey) doesn't rebuild the backend. Two compounding axes, one shared SHOT economy

The close has to deliver the venture-scale tell: **"adding a chat surface should look like adding a frontend to an existing API, not building a new product."** That's the line that re-rates the perceived ceiling.

---

## Beat sheet (2:00 hard cap, aim 1:55)

| Beat | Time | What's on screen | What you say |
|---|---|---|---|
| 1. Hook | 0:00 – 0:12 | Webcam, full frame. Quick, direct. | "Here's a problem nobody's solved on Solana: how do you get a crypto-native game inside the chats where the audience already lives, without dragging them into yet another app?" |
| 2. The answer | 0:12 – 0:30 | Cut to a SolShot match in Telegram group chat — bot post + live update + 'Take your shot' button | "SolShot is artillery duels in your Telegram group chat. Async turns, hours-long matches, every shot posted back to chat. Wager SOL, last tank standing takes the pot — settled atomically by an Anchor program on Solana." |
| 3. Proof point | 0:30 – 0:50 | Cut to Solscan TX, the May 6 3-player settlement — winner +0.18 SOL, treasury 7%, ops 3% | "Live on devnet today. First end-to-end wagered match settled May 4th. First fully organic 3-player group-chat match auto-settled May 6th. Three audits passed: on-chain, math invariants, off-chain. All reports live in the repo." |
| 4. The wedge insight | 0:50 – 1:10 | Cut to side-by-side: a real-time crypto game (frantic) vs SolShot turn cadence in a TG chat | "Here's the wedge. Async-turn gameplay is the only mechanic that fits group chats. Real-time fights the chat for attention. Async fits it — your turn lives in the chat as a notification, the same way memes and links do. Once you see that, the question stops being 'how do we get gamers into crypto?' and starts being 'where else does group messaging live?'" |
| 5. The vision | 1:10 – 1:35 | Cut to ROADMAP.md preview — Phase 3 game list + Phase 4 platform list | "After artillery, we ship the same async loop on basketball, 8-ball, hockey, golf, darts. Same wallet, same SHOT economy, same prestige. After Telegram, we ship on Seekr Mobile — the Solana-native phone where a Colosseum judge runs the dApp Store. Then iMessage, then WhatsApp. Same Anchor programs every time." |
| 6. The venture-scale tell | 1:35 – 1:50 | Webcam, talking-head, slow down. This is the line. | "None of that requires net-new development beyond the chat shell itself. Adding a surface looks like adding a frontend to an existing API — it does not look like building a new product. That's the bet. We're not pitching one game. We're pitching infrastructure for an entire category that doesn't exist yet." |
| 7. Close | 1:50 – 2:00 | Webcam. Direct ask. | "Mainnet's a week away. We're applying because we want to skip the part where we slow down to fundraise. SolShot.gg. Code's open. Talk soon." |

---

## Delivery notes

- **Tone:** confident, plainspoken, no jargon. Talk like you're explaining it to a smart friend who's not in crypto.
- **Pacing:** Beat 6 is the punchline of the whole pitch. **Slow down on it.** Pause before "That's the bet." The instinct to rush will be strong; resist it.
- **Eyes:** stay on the webcam for Beats 1, 6, 7. Cuts to screenshare for Beats 2, 3, 4, 5.
- **No hands:** if you're a hand-talker, frame yourself tight from chest up so they're invisible. Hands distract from the words.
- **Background:** plain wall or dark backdrop. No bookshelf-flexing.

---

## Two phrases worth landing exactly

These are the lines that should make it verbatim into the cut. Re-take the beat if you flub them:

1. **"Async fits, real-time fights."** (or some near variant — the parallel structure is what makes it stick)
2. **"Adding a surface looks like adding a frontend to an existing API — it does not look like building a new product."**

If pacing requires a cut, drop the basketball/8-ball/hockey list (Beat 5) before dropping the venture-scale tell (Beat 6). The tell is the line judges will quote back to each other in the eval room. The list is fungible.

---

## Reference material

- `Docs/ROADMAP.md` — full forward-looking plan referenced in Beat 5
- `Docs/SolShot_Litepaper_v2.2.md` — for the Solscan TX + audit posture (Beats 3)
- `.docs/audit-summary.md` — summary across the three SVK audits
- `Docs/internal/DEMO_VIDEO_SCRIPT_v2.md` — sister doc, the 3-min technical demo (already shot). The pitch video should NOT re-tread what the demo covers; it stays at the strategy / vision layer.

---

## Provenance

- **Beat 4 + Beat 6 wedge insight + venture-scale tell:** [main-claude] May 6 thesis pitch (commit `cfd010c`)
- **Beat 5 game catalogue:** John Fish roadmap draft 2026-05-10 (basketball, 8-ball, hockey, etc.)
- **Beat 3 specific TX dates + audit framing:** litepaper Section 7 + `.docs/audit-summary.md`
- **Beat 7 "skip the part where we slow down to fundraise":** main-claude May 6 thesis (verbatim from earlier draft)
