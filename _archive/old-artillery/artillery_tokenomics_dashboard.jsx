import { useState } from "react";

const INITIAL_SUPPLY = 10000000;
const MONTHS = 24;
const DAYS = 30;

// === SCENARIO FUNCTIONS ===
const scenarios = {
  steady: { name: "Steady Growth (10%/mo)", fn: (m) => 1000 * Math.pow(1.10, m) },
  viral: { name: "Viral Spike → Plateau", fn: (m) => m <= 3 ? 1000 * Math.pow(5, m/3) : 5000 * Math.pow(0.98, m-3) },
  decline: { name: "Growth → Decline", fn: (m) => m <= 6 ? 1000 * Math.pow(1.25, m) : Math.max(200, 1000 * Math.pow(1.25, 6) * Math.pow(0.88, m-6)) },
  flat: { name: "Zero Growth After Mo 6", fn: (m) => m <= 6 ? 1000 * Math.pow(1.15, m) : 1000 * Math.pow(1.15, 6) * Math.pow(0.97, m-6) },
};

// === MODEL SIMULATIONS ===
function simModelA(scenarioFn) {
  let state = { circulating: 0, rewardPool: INITIAL_SUPPLY * 0.5, burned: 0, price: 0.10, prestiged: 0 };
  const history = [];
  for (let m = 0; m < MONTHS; m++) {
    const players = scenarioFn(m);
    const dailyRewards = players * 3 * 0.5 * 5;
    const monthlyRewards = Math.min(dailyRewards * DAYS, state.rewardPool);
    state.rewardPool -= monthlyRewards;
    state.circulating += monthlyRewards;
    const eligible = m >= 2 ? players * 0.6 : 0;
    const numPrestige = Math.floor(eligible * 0.08);
    const prestigeBurn = Math.min(numPrestige * 500, state.circulating * 0.5);
    state.burned += prestigeBurn;
    state.circulating -= prestigeBurn;
    state.prestiged += numPrestige;
    const cosmeticBurn = state.circulating * 0.02;
    state.burned += cosmeticBurn;
    state.circulating -= cosmeticBurn;
    const burnRatio = state.burned / INITIAL_SUPPLY;
    const sellPressure = monthlyRewards / Math.max(state.circulating, 1);
    state.price = Math.min(10, Math.max(0.0001, state.price * (1 + burnRatio * 0.5) * (1 - Math.min(sellPressure * 0.3, 0.5))));
    const solRev = players * 0.05 * DAYS * 0.10;
    history.push({ month: m, players: Math.round(players), circulating: Math.round(state.circulating), burned: Math.round(state.burned), burnedPct: +(state.burned / INITIAL_SUPPLY * 100).toFixed(1), price: +state.price.toFixed(4), solRev: +solRev.toFixed(1), poolPct: +(state.rewardPool / (INITIAL_SUPPLY * 0.5) * 100).toFixed(1) });
  }
  return history;
}

function simModelB(scenarioFn) {
  let state = { circulating: INITIAL_SUPPLY * 0.2, emitted: 0, burned: 0, price: 0.10, prestiged: 0, emissionRate: 8 };
  const history = [];
  for (let m = 0; m < MONTHS; m++) {
    const players = scenarioFn(m);
    const monthlyEmission = players * state.emissionRate * DAYS;
    state.emitted += monthlyEmission;
    state.circulating += monthlyEmission;
    const weaponBurns = Math.min(players * 50, state.circulating * 0.3);
    state.burned += weaponBurns;
    state.circulating -= weaponBurns;
    const eligible = m >= 2 ? players * 0.6 : 0;
    const numPrestige = Math.floor(eligible * 0.08);
    const prestigeBurn = Math.min(numPrestige * 600, state.circulating * 0.3);
    state.burned += prestigeBurn;
    state.circulating -= prestigeBurn;
    state.prestiged += numPrestige;
    const cosmeticBurn = state.circulating * 0.015;
    state.burned += cosmeticBurn;
    state.circulating -= cosmeticBurn;
    const totalBurns = weaponBurns + prestigeBurn + cosmeticBurn;
    const ratio = monthlyEmission / Math.max(totalBurns, 1);
    if (ratio > 1.5) state.emissionRate *= 0.95;
    else if (ratio < 0.8) state.emissionRate *= 1.025;
    const netMonthly = monthlyEmission - totalBurns;
    const inflationRate = netMonthly / Math.max(state.circulating, 1);
    state.price = Math.min(10, Math.max(0.0001, state.price * (1 - inflationRate * 0.8)));
    const solRev = players * 0.05 * DAYS * 0.10;
    history.push({ month: m, players: Math.round(players), circulating: Math.round(state.circulating), burned: Math.round(state.burned), burnedPct: +(state.burned / INITIAL_SUPPLY * 100).toFixed(1), price: +state.price.toFixed(4), solRev: +solRev.toFixed(1), ratio: +ratio.toFixed(2) });
  }
  return history;
}

function simModelC(scenarioFn) {
  let state = { circulating: INITIAL_SUPPLY * 0.15, burned: 0, price: 0.10, prestiged: 0, cumSolRev: 0 };
  const history = [];
  for (let m = 0; m < MONTHS; m++) {
    const players = scenarioFn(m);
    const achieveDrip = players * 20;
    const seasonBuyers = players * 0.15;
    const seasonTokens = seasonBuyers * 200;
    const totalInflow = achieveDrip + seasonTokens;
    const remainingPool = INITIAL_SUPPLY - state.circulating - state.burned;
    const actualInflow = Math.min(totalInflow, remainingPool * 0.05);
    state.circulating += actualInflow;
    const eligible = m >= 2 ? players * 0.6 : 0;
    const numPrestige = Math.floor(eligible * 0.10);
    const prestigeBurn = Math.min(numPrestige * 500, state.circulating * 0.25);
    const skinBurn = Math.min(players * 0.25 * 30, state.circulating * 0.15);
    const bpBurn = Math.min(players * 0.10 * 100, state.circulating * 0.10);
    const totalBurns = prestigeBurn + skinBurn + bpBurn;
    state.burned += totalBurns;
    state.circulating = Math.max(0, state.circulating - totalBurns);
    state.prestiged += numPrestige;
    const wagerRev = players * 0.08 * DAYS * 0.10;
    const seasonRev = seasonBuyers * 0.5;
    const cosmeticSolRev = players * 0.05 * 1.0;
    const solRev = wagerRev + seasonRev + cosmeticSolRev;
    state.cumSolRev += solRev;
    const netSupply = actualInflow - totalBurns;
    if (state.circulating > 0) {
      const demandP = totalBurns / Math.max(state.circulating, 1);
      const supplyP = actualInflow / Math.max(state.circulating, 1);
      let growthF = 1.0;
      if (history.length > 0) {
        const prev = history[history.length - 1].players;
        if (prev > 0) growthF = 1 + (players - prev) / prev * 0.3;
      }
      const priceChange = (demandP - supplyP * 0.5) * growthF;
      state.price = Math.min(10, Math.max(0.001, state.price * (1 + priceChange * 0.5)));
    }
    history.push({ month: m, players: Math.round(players), circulating: Math.round(state.circulating), burned: Math.round(state.burned), burnedPct: +(state.burned / INITIAL_SUPPLY * 100).toFixed(1), price: +state.price.toFixed(4), solRev: +solRev.toFixed(1), cumSolRev: +state.cumSolRev.toFixed(1) });
  }
  return history;
}

// === MINI CHART COMPONENT ===
function MiniChart({ data, dataKey, color, label, format, height = 100 }) {
  if (!data || data.length === 0) return null;
  const values = data.map(d => d[dataKey]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 280;
  const h = height;
  const pad = 4;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const startVal = format ? format(values[0]) : values[0];
  const endVal = format ? format(values[values.length - 1]) : values[values.length - 1];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8a8a8a", marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color }}>{startVal} → {endVal}</span>
      </div>
      <svg width={w} height={h} style={{ background: "#1a1a2e", borderRadius: 6 }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {values.map((v, i) => {
          if (i % 6 !== 0 && i !== values.length - 1) return null;
          const x = pad + (i / (values.length - 1)) * (w - pad * 2);
          return <text key={i} x={x} y={h - 1} fill="#555" fontSize="8" textAnchor="middle">{i}</text>;
        })}
      </svg>
    </div>
  );
}

function StatusBadge({ modelData, modelName }) {
  const first = modelData[0];
  const last = modelData[modelData.length - 1];
  const priceChange = ((last.price - first.price) / first.price * 100);
  const peakPrice = Math.max(...modelData.map(d => d.price));
  const hasDeath = last.price < peakPrice * 0.1;
  const poolExhausted = last.poolPct !== undefined && last.poolPct <= 0;

  let status, color, bg;
  if (hasDeath) { status = "DEATH SPIRAL"; color = "#ff4444"; bg = "#3a1111"; }
  else if (poolExhausted) { status = "POOL EMPTY"; color = "#ff8800"; bg = "#3a2211"; }
  else if (priceChange < -60) { status = "DECLINING"; color = "#ff6b6b"; bg = "#2a1515"; }
  else if (priceChange < -30) { status = "WEAK"; color = "#ffaa44"; bg = "#2a2015"; }
  else if (priceChange > 200) { status = "BUBBLE RISK"; color = "#ffdd44"; bg = "#2a2a15"; }
  else { status = "HEALTHY"; color = "#44ff88"; bg = "#112a18"; }

  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, color, background: bg, letterSpacing: 0.5 }}>
      {status}
    </span>
  );
}

function ModelCard({ name, data, color, accentBg }) {
  const first = data[0];
  const last = data[data.length - 1];
  const priceChange = ((last.price - first.price) / first.price * 100).toFixed(1);
  const totalSol = data.reduce((s, d) => s + d.solRev, 0).toFixed(0);
  const fmt$ = (v) => `$${v.toFixed(4)}`;
  const fmtK = (v) => v > 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(0);
  const fmtPct = (v) => `${v.toFixed(1)}%`;

  return (
    <div style={{ background: "#12121f", border: `1px solid ${color}33`, borderRadius: 10, padding: 14, flex: 1, minWidth: 290 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{name}</div>
        <StatusBadge modelData={data} modelName={name} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10, fontSize: 11 }}>
        <div style={{ background: "#0a0a18", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#666", fontSize: 9 }}>PRICE Δ</div>
          <div style={{ color: priceChange >= 0 ? "#44ff88" : "#ff4444", fontWeight: 700 }}>{priceChange >= 0 ? "+" : ""}{priceChange}%</div>
        </div>
        <div style={{ background: "#0a0a18", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#666", fontSize: 9 }}>BURNED</div>
          <div style={{ color: "#ffaa44", fontWeight: 700 }}>{last.burnedPct}%</div>
        </div>
        <div style={{ background: "#0a0a18", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#666", fontSize: 9 }}>SOL REV</div>
          <div style={{ color: "#88aaff", fontWeight: 700 }}>{fmtK(parseFloat(totalSol))} SOL</div>
        </div>
        <div style={{ background: "#0a0a18", borderRadius: 6, padding: "6px 8px" }}>
          <div style={{ color: "#666", fontSize: 9 }}>CIRC</div>
          <div style={{ color: "#ccc", fontWeight: 700 }}>{fmtK(last.circulating)}</div>
        </div>
      </div>
      <MiniChart data={data} dataKey="price" color={color} label="Token Price" format={fmt$} />
      <MiniChart data={data} dataKey="circulating" color="#667799" label="Circulating Supply" format={fmtK} height={60} />
      <MiniChart data={data} dataKey="players" color="#886699" label="Players" format={fmtK} height={60} />
    </div>
  );
}

export default function App() {
  const [scenario, setScenario] = useState("steady");
  const sc = scenarios[scenario];
  const dataA = simModelA(sc.fn);
  const dataB = simModelB(sc.fn);
  const dataC = simModelC(sc.fn);

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", background: "#08081a", color: "#e0e0e0", minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: -0.5 }}>
            ARTILLERY GAME — TOKENOMICS SIM
          </h1>
          <p style={{ fontSize: 11, color: "#666", margin: "4px 0 16px" }}>
            3 models × 4 scenarios — find what survives
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(scenarios).map(([key, val]) => (
              <button key={key} onClick={() => setScenario(key)} style={{
                padding: "6px 12px", borderRadius: 6, border: scenario === key ? "1px solid #44ff88" : "1px solid #333",
                background: scenario === key ? "#44ff8815" : "#12121f", color: scenario === key ? "#44ff88" : "#888",
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s"
              }}>
                {val.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <ModelCard name="A: Pure Prestige Burn" data={dataA} color="#ff6b6b" />
          <ModelCard name="B: Emission + Burn Eq." data={dataB} color="#ffaa44" />
          <ModelCard name="C: Dual-Layer (SOL+Token)" data={dataC} color="#44ff88" />
        </div>

        <div style={{ background: "#12121f", borderRadius: 10, padding: 16, border: "1px solid #44ff8833" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#44ff88", margin: "0 0 10px" }}>VERDICT: MODEL C WINS</h2>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: "#aaa" }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong style={{ color: "#ff6b6b" }}>Model A</strong> bleeds out — fixed reward pool drains under any growth scenario. Once empty, no earning incentive remains. Prestige burns help price recovery but can't save an empty pool.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong style={{ color: "#ffaa44" }}>Model B</strong> inflates to death — emissions always outpace burns during growth. The dynamic adjuster lags behind reality. Price trends permanently downward. Classic P2E death pattern.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong style={{ color: "#44ff88" }}>Model C</strong> survives everything — decoupling money (SOL wagers) from status (token cosmetics) means the token never needs to be an "investment." Burns from prestige + skins create genuine scarcity. SOL revenue funds ops independently. No death spiral in ANY scenario tested.
            </p>
            <div style={{ borderTop: "1px solid #222", paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "#44ff88", fontWeight: 700, marginBottom: 4 }}>RECOMMENDED DESIGN</div>
              <div style={{ fontSize: 11, color: "#888", lineHeight: 1.8 }}>
                SOL layer = PvP wagers + season passes + cosmetic shop (real revenue)<br/>
                Token layer = fixed supply, tiny achievement drips, ALL burns are cosmetic/prestige<br/>
                Prestige = 10 tiers, escalating burn cost (200→4000), pure status rewards<br/>
                Key rule: prestige NEVER increases earn rate — status only, no yield boost
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
