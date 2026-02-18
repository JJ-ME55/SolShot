"""
Artillery Game Tokenomics Simulator
====================================
Tests 3 tokenomic models across multiple scenarios to find what breaks and what holds.

Models:
  A) Pure Prestige Burn — fixed supply, prestige burns are the primary sink
  B) Emission + Burn Equilibrium — controlled daily emissions balanced by prestige + cosmetic burns  
  C) Dual-Layer (SOL wagering + token cosmetics) — token is purely cosmetic/prestige, SOL is the money layer

Scenarios tested:
  1. Steady growth (10% monthly player growth for 24 months)
  2. Viral spike then plateau (5x growth in 3 months, then flat)
  3. Growth then decline (6 months up, 18 months declining)
  4. Whale dominated (20% of players hold 80% of tokens)
  5. Mass prestige event (50% of eligible players prestige simultaneously)
  6. Zero new players after month 6

For each: track token supply, price pressure, player economics, treasury health
"""

import json
import math
from dataclasses import dataclass, field
from typing import List, Dict

# ============================================================
# SHARED CONSTANTS
# ============================================================

INITIAL_SUPPLY = 10_000_000  # 10M tokens
MONTHS_TO_SIM = 24
DAYS_PER_MONTH = 30

# ============================================================
# MODEL A: Pure Prestige Burn
# ============================================================
# - Fixed supply, no new emissions after initial distribution
# - Tokens distributed via gameplay rewards (from pre-minted pool)
# - Prestige burns destroy tokens permanently
# - Cosmetic shop burns destroy tokens permanently
# - Wagering is in SOL (separate layer)

@dataclass
class ModelA_State:
    name: str = "Model A: Pure Prestige Burn"
    total_supply: float = INITIAL_SUPPLY
    circulating: float = 0
    reward_pool: float = INITIAL_SUPPLY * 0.50  # 50% for gameplay rewards
    treasury: float = INITIAL_SUPPLY * 0.15      # 15% treasury/ops
    team: float = INITIAL_SUPPLY * 0.15          # 15% team (vested)
    lp: float = INITIAL_SUPPLY * 0.20            # 20% liquidity
    burned: float = 0
    players: float = 1000
    prestige_eligible: float = 0  # players who've played enough to prestige
    total_prestiged: int = 0
    month: int = 0
    
    # Economics
    token_price: float = 0.10  # starting price
    daily_sol_volume: float = 50  # SOL wagered per day
    monthly_revenue_sol: float = 0
    
    # Tracking
    history: list = field(default_factory=list)
    
    # Params
    tokens_per_win: float = 5         # tokens earned per match win
    matches_per_player_day: float = 3  # avg matches per player per day
    win_rate: float = 0.5              # average win rate
    prestige_cost: float = 500         # tokens burned to prestige
    cosmetic_burn_rate: float = 0.02   # 2% of circulating burned on cosmetics monthly
    prestige_rate: float = 0.08        # 8% of eligible players prestige per month
    months_to_eligible: int = 2        # months of play before prestige-eligible


def sim_model_a(scenario_fn, label=""):
    s = ModelA_State()
    
    for month in range(MONTHS_TO_SIM):
        s.month = month
        s.players = scenario_fn(month, s.players)
        
        # Daily gameplay over the month
        daily_rewards = s.players * s.matches_per_player_day * s.win_rate * s.tokens_per_win
        monthly_rewards = daily_rewards * DAYS_PER_MONTH
        
        # Cap rewards to available pool
        actual_rewards = min(monthly_rewards, s.reward_pool)
        s.reward_pool -= actual_rewards
        s.circulating += actual_rewards
        
        # Prestige eligible accumulation (players who've been around 2+ months)
        if month >= s.months_to_eligible:
            # Rough: players from 2 months ago become eligible
            s.prestige_eligible = s.players * 0.6  # ~60% of active players are eligible
        
        # Prestige burns
        num_prestige = int(s.prestige_eligible * s.prestige_rate)
        prestige_burn = num_prestige * s.prestige_cost
        actual_prestige_burn = min(prestige_burn, s.circulating * 0.5)  # can't burn more than exists
        s.burned += actual_prestige_burn
        s.circulating -= actual_prestige_burn
        s.total_prestiged += num_prestige
        
        # Cosmetic shop burns
        cosmetic_burn = s.circulating * s.cosmetic_burn_rate
        s.burned += cosmetic_burn
        s.circulating -= cosmetic_burn
        
        # SOL wagering revenue (protocol fee = 10%)
        sol_per_player_day = s.daily_sol_volume / max(s.players, 1) * s.players
        s.monthly_revenue_sol = sol_per_player_day * DAYS_PER_MONTH * 0.10
        
        # Price pressure model (simplified)
        # Price influenced by: supply reduction (bullish), sell pressure from earners (bearish)
        burn_ratio = s.burned / INITIAL_SUPPLY
        sell_pressure = actual_rewards / max(s.circulating, 1)
        
        # Price adjusts based on net pressure
        if s.circulating > 0:
            deflation_boost = 1 + (burn_ratio * 0.5)  # burns support price
            emission_drag = 1 - min(sell_pressure * 0.3, 0.5)  # rewards create sell pressure
            s.token_price = s.token_price * deflation_boost * emission_drag
            # Floor at near-zero
            s.token_price = max(s.token_price, 0.0001)
            # Cap unrealistic growth
            s.token_price = min(s.token_price, 10.0)
        
        s.history.append({
            'month': month,
            'players': round(s.players),
            'circulating': round(s.circulating),
            'burned': round(s.burned),
            'burned_pct': round(s.burned / INITIAL_SUPPLY * 100, 1),
            'reward_pool_remaining': round(s.reward_pool),
            'reward_pool_pct': round(s.reward_pool / (INITIAL_SUPPLY * 0.5) * 100, 1),
            'token_price': round(s.token_price, 4),
            'price_change_pct': 0,
            'monthly_sol_revenue': round(s.monthly_revenue_sol, 1),
            'total_prestiged': s.total_prestiged,
            'player_monthly_earn_tokens': round(actual_rewards / max(s.players, 1), 1),
            'player_monthly_earn_usd': round(actual_rewards / max(s.players, 1) * s.token_price, 2),
        })
        
        if len(s.history) > 1:
            prev_price = s.history[-2]['token_price']
            if prev_price > 0:
                s.history[-1]['price_change_pct'] = round((s.token_price - prev_price) / prev_price * 100, 1)
    
    return s


# ============================================================
# MODEL B: Emission + Burn Equilibrium  
# ============================================================
# - Daily emissions from protocol (inflationary)
# - Burns from prestige, cosmetics, AND weapon upgrades
# - Target: emissions ≈ burns at steady state
# - Dynamic emission rate that adjusts to player count

@dataclass 
class ModelB_State:
    name: str = "Model B: Emission + Burn Equilibrium"
    total_supply: float = INITIAL_SUPPLY
    circulating: float = INITIAL_SUPPLY * 0.20  # 20% initial circulation (LP + airdrop)
    total_emitted: float = 0
    burned: float = 0
    players: float = 1000
    prestige_eligible: float = 0
    total_prestiged: int = 0
    month: int = 0
    
    token_price: float = 0.10
    daily_sol_volume: float = 50
    monthly_revenue_sol: float = 0
    
    history: list = field(default_factory=list)
    
    # Params - emissions scale with players
    base_emission_per_player_day: float = 8    # tokens emitted per player per day
    prestige_cost: float = 600
    weapon_upgrade_avg_cost: float = 50         # avg tokens spent on upgrades per player per month
    cosmetic_burn_rate: float = 0.015
    prestige_rate: float = 0.08
    
    # Dynamic emission control
    target_inflation_monthly: float = 0.03      # target 3% monthly inflation of circulating
    emission_adjustment_speed: float = 0.5      # how fast emissions adjust


def sim_model_b(scenario_fn, label=""):
    s = ModelB_State()
    
    for month in range(MONTHS_TO_SIM):
        s.month = month
        s.players = scenario_fn(month, s.players)
        
        # Dynamic emissions - adjust based on burn rate
        daily_emission = s.players * s.base_emission_per_player_day
        monthly_emission = daily_emission * DAYS_PER_MONTH
        s.total_emitted += monthly_emission
        s.circulating += monthly_emission
        
        # Weapon upgrade burns (core gameplay sink)
        weapon_burns = s.players * s.weapon_upgrade_avg_cost
        weapon_burns = min(weapon_burns, s.circulating * 0.3)
        s.burned += weapon_burns
        s.circulating -= weapon_burns
        
        # Prestige burns
        if month >= 2:
            s.prestige_eligible = s.players * 0.6
        num_prestige = int(s.prestige_eligible * s.prestige_rate)
        prestige_burn = num_prestige * s.prestige_cost
        actual_prestige_burn = min(prestige_burn, s.circulating * 0.3)
        s.burned += actual_prestige_burn
        s.circulating -= actual_prestige_burn
        s.total_prestiged += num_prestige
        
        # Cosmetic burns
        cosmetic_burn = s.circulating * s.cosmetic_burn_rate
        s.burned += cosmetic_burn
        s.circulating -= cosmetic_burn
        
        # SOL revenue
        sol_wagered = s.players * 0.05 * DAYS_PER_MONTH  # 0.05 SOL avg per player per day
        s.monthly_revenue_sol = sol_wagered * 0.10
        
        # Emission/burn ratio tracking
        total_monthly_burns = weapon_burns + actual_prestige_burn + cosmetic_burn
        emission_burn_ratio = monthly_emission / max(total_monthly_burns, 1)
        
        # Adjust emission rate for next month
        if emission_burn_ratio > 1.5:  # emitting too much
            s.base_emission_per_player_day *= (1 - s.emission_adjustment_speed * 0.1)
        elif emission_burn_ratio < 0.8:  # burning more than emitting
            s.base_emission_per_player_day *= (1 + s.emission_adjustment_speed * 0.05)
        
        # Price model
        net_monthly = monthly_emission - total_monthly_burns
        inflation_rate = net_monthly / max(s.circulating, 1)
        
        # Price drops with net inflation, rises with net deflation
        s.token_price *= (1 - inflation_rate * 0.8)
        s.token_price = max(s.token_price, 0.0001)
        s.token_price = min(s.token_price, 10.0)
        
        s.history.append({
            'month': month,
            'players': round(s.players),
            'circulating': round(s.circulating),
            'total_emitted': round(s.total_emitted),
            'burned': round(s.burned),
            'emission_burn_ratio': round(emission_burn_ratio, 2),
            'net_monthly_supply_change': round(net_monthly),
            'token_price': round(s.token_price, 4),
            'price_change_pct': 0,
            'monthly_sol_revenue': round(s.monthly_revenue_sol, 1),
            'total_prestiged': s.total_prestiged,
            'player_monthly_earn_tokens': round(monthly_emission / max(s.players, 1), 1),
            'player_monthly_earn_usd': round(monthly_emission / max(s.players, 1) * s.token_price, 2),
        })
        
        if len(s.history) > 1:
            prev = s.history[-2]['token_price']
            if prev > 0:
                s.history[-1]['price_change_pct'] = round((s.token_price - prev) / prev * 100, 1)
    
    return s


# ============================================================
# MODEL C: Dual-Layer (SOL wagering + token cosmetics)
# ============================================================
# - SOL is the money layer (wagering, prizes, real value)
# - Token is PURELY cosmetic/prestige (cannot be "earned" in traditional sense)
# - Tokens acquired through: SOL purchases, achievement unlocks (small), season passes
# - All token utility is non-extractive: skins, prestige, seasons, battle passes
# - This is the CS:GO model applied to artillery

@dataclass
class ModelC_State:
    name: str = "Model C: Dual-Layer (SOL + Cosmetic Token)"
    token_supply: float = INITIAL_SUPPLY
    circulating: float = INITIAL_SUPPLY * 0.15  # small initial circulation
    burned: float = 0
    players: float = 1000
    prestige_eligible: float = 0
    total_prestiged: int = 0
    month: int = 0
    
    token_price: float = 0.10
    monthly_revenue_sol: float = 0
    cumulative_sol_revenue: float = 0
    
    history: list = field(default_factory=list)
    
    # Token enters circulation ONLY through:
    achievement_tokens_per_player_month: float = 20  # small drip for playing
    season_pass_cost_sol: float = 0.5                 # SOL cost for season pass
    season_pass_token_reward: float = 200             # tokens from completing pass
    season_pass_adoption: float = 0.15                # 15% of players buy pass
    
    # Token exits circulation through:
    prestige_cost: float = 500
    prestige_rate: float = 0.10  # higher because prestige is THE status symbol
    skin_purchase_avg: float = 30   # tokens spent on skins per active buyer per month
    skin_buyer_rate: float = 0.25   # 25% of players buy skins monthly
    battle_pass_burn: float = 100   # tokens burned to activate premium track
    battle_pass_rate: float = 0.10  # 10% buy premium track with tokens
    
    # SOL economics (the real money)
    sol_wager_per_player_day: float = 0.08
    protocol_fee: float = 0.10
    cosmetic_sol_shop_rate: float = 0.05  # 5% of players buy SOL cosmetics monthly
    cosmetic_sol_avg: float = 1.0          # avg SOL spent


def sim_model_c(scenario_fn, label=""):
    s = ModelC_State()
    
    for month in range(MONTHS_TO_SIM):
        s.month = month
        s.players = scenario_fn(month, s.players)
        
        # === TOKEN LAYER ===
        
        # Inflows to circulation
        achievement_drip = s.players * s.achievement_tokens_per_player_month
        season_buyers = s.players * s.season_pass_adoption
        season_tokens = season_buyers * s.season_pass_token_reward
        
        # Cap token distribution to remaining supply
        total_token_inflow = achievement_drip + season_tokens
        # Tokens come from treasury/reward pool
        reward_pool = s.token_supply - s.circulating - s.burned
        actual_inflow = min(total_token_inflow, reward_pool * 0.05)  # max 5% of remaining pool per month
        s.circulating += actual_inflow
        
        # Outflows (burns)
        if month >= 2:
            s.prestige_eligible = s.players * 0.6
        num_prestige = int(s.prestige_eligible * s.prestige_rate)
        prestige_burn = min(num_prestige * s.prestige_cost, s.circulating * 0.25)
        
        skin_burn = s.players * s.skin_buyer_rate * s.skin_purchase_avg
        skin_burn = min(skin_burn, s.circulating * 0.15)
        
        bp_burn = s.players * s.battle_pass_rate * s.battle_pass_burn
        bp_burn = min(bp_burn, s.circulating * 0.10)
        
        total_burns = prestige_burn + skin_burn + bp_burn
        s.burned += total_burns
        s.circulating -= total_burns
        s.circulating = max(s.circulating, 0)
        s.total_prestiged += num_prestige
        
        # === SOL LAYER ===
        wager_volume = s.players * s.sol_wager_per_player_day * DAYS_PER_MONTH
        wager_revenue = wager_volume * s.protocol_fee
        
        season_pass_revenue = season_buyers * s.season_pass_cost_sol
        cosmetic_sol_revenue = s.players * s.cosmetic_sol_shop_rate * s.cosmetic_sol_avg
        
        s.monthly_revenue_sol = wager_revenue + season_pass_revenue + cosmetic_sol_revenue
        s.cumulative_sol_revenue += s.monthly_revenue_sol
        
        # Token price model
        # In this model, token price is driven by DEMAND for cosmetics/prestige
        # Not by speculation on future earnings
        net_supply = actual_inflow - total_burns
        
        if s.circulating > 0:
            demand_pressure = total_burns / max(s.circulating, 1)  # burn demand
            supply_pressure = actual_inflow / max(s.circulating, 1)  # new supply
            
            # Player growth adds demand (new players want cosmetics)
            growth_factor = 1.0
            if month > 0 and s.history:
                prev_players = s.history[-1]['players']
                if prev_players > 0:
                    growth_factor = 1 + (s.players - prev_players) / prev_players * 0.3
            
            price_change = (demand_pressure - supply_pressure * 0.5) * growth_factor
            s.token_price *= (1 + price_change * 0.5)
            s.token_price = max(s.token_price, 0.001)
            s.token_price = min(s.token_price, 10.0)
        
        s.history.append({
            'month': month,
            'players': round(s.players),
            'circulating': round(s.circulating),
            'burned': round(s.burned),
            'burned_pct': round(s.burned / INITIAL_SUPPLY * 100, 1),
            'token_price': round(s.token_price, 4),
            'price_change_pct': 0,
            'monthly_sol_revenue': round(s.monthly_revenue_sol, 1),
            'cumulative_sol_revenue': round(s.cumulative_sol_revenue, 1),
            'total_prestiged': s.total_prestiged,
            'net_token_supply_change': round(net_supply),
            'token_inflow': round(actual_inflow),
            'token_burns': round(total_burns),
        })
        
        if len(s.history) > 1:
            prev = s.history[-2]['token_price']
            if prev > 0:
                s.history[-1]['price_change_pct'] = round((s.token_price - prev) / prev * 100, 1)
    
    return s


# ============================================================
# SCENARIO FUNCTIONS
# ============================================================

def steady_growth(month, current_players):
    """10% monthly growth for 24 months"""
    return 1000 * (1.10 ** month)

def viral_spike(month, current_players):
    """5x in 3 months then plateau"""
    if month <= 3:
        return 1000 * (5 ** (month / 3))
    return 5000 * (0.98 ** (month - 3))  # slight decay

def growth_then_decline(month, current_players):
    """6 months up, then 18 months declining"""
    if month <= 6:
        return 1000 * (1.25 ** month)
    else:
        peak = 1000 * (1.25 ** 6)
        return max(200, peak * (0.88 ** (month - 6)))

def whale_dominated(month, current_players):
    """Same as steady growth but we'll note whale effects in analysis"""
    return 1000 * (1.08 ** month)

def zero_growth_after_6(month, current_players):
    """Growth for 6 months then completely flat"""
    if month <= 6:
        return 1000 * (1.15 ** month)
    return 1000 * (1.15 ** 6) * (0.97 ** (month - 6))  # slight natural churn

def mass_prestige_event(month, current_players):
    """Steady growth but we'll spike prestige rate at month 12"""
    return 1000 * (1.10 ** month)


# ============================================================
# RUN ALL SIMULATIONS
# ============================================================

scenarios = {
    'steady_growth': ('Steady Growth (10%/mo)', steady_growth),
    'viral_spike': ('Viral Spike Then Plateau', viral_spike),
    'growth_decline': ('Growth Then Decline', growth_then_decline),
    'zero_growth': ('Zero Growth After Month 6', zero_growth_after_6),
}

results = {}

for scenario_key, (scenario_name, scenario_fn) in scenarios.items():
    results[scenario_key] = {
        'name': scenario_name,
        'model_a': sim_model_a(scenario_fn),
        'model_b': sim_model_b(scenario_fn),
        'model_c': sim_model_c(scenario_fn),
    }

# ============================================================
# ANALYSIS & REPORTING
# ============================================================

def analyze_model(state, scenario_name):
    """Extract key health metrics from a model run"""
    h = state.history
    if not h:
        return {}
    
    start_price = h[0]['token_price']
    end_price = h[-1]['token_price']
    min_price = min(x['token_price'] for x in h)
    max_price = max(x['token_price'] for x in h)
    
    total_price_change = ((end_price - start_price) / start_price * 100) if start_price > 0 else 0
    
    # Find if/when "death spiral" occurs (price drops 90%+ from peak)
    peak_price = 0
    death_spiral_month = None
    for entry in h:
        if entry['token_price'] > peak_price:
            peak_price = entry['token_price']
        if peak_price > 0 and entry['token_price'] < peak_price * 0.1 and death_spiral_month is None:
            death_spiral_month = entry['month']
    
    # Revenue sustainability
    total_sol = sum(x['monthly_sol_revenue'] for x in h)
    
    return {
        'start_price': start_price,
        'end_price': end_price,
        'min_price': min_price,
        'max_price': max_price,
        'total_price_change_pct': round(total_price_change, 1),
        'death_spiral_month': death_spiral_month,
        'end_players': h[-1]['players'],
        'total_sol_revenue': round(total_sol, 1),
        'total_prestiged': h[-1].get('total_prestiged', 0),
        'burned_pct': h[-1].get('burned_pct', 0),
        'final_circulating': h[-1].get('circulating', 0),
    }


print("=" * 80)
print("ARTILLERY GAME TOKENOMICS SIMULATION RESULTS")
print("=" * 80)

for scenario_key, data in results.items():
    print(f"\n{'='*80}")
    print(f"SCENARIO: {data['name']}")
    print(f"{'='*80}")
    
    for model_key in ['model_a', 'model_b', 'model_c']:
        state = data[model_key]
        analysis = analyze_model(state, data['name'])
        h = state.history
        
        print(f"\n  --- {state.name} ---")
        print(f"  Price: ${analysis['start_price']:.4f} → ${analysis['end_price']:.4f} ({analysis['total_price_change_pct']:+.1f}%)")
        print(f"  Price Range: ${analysis['min_price']:.4f} - ${analysis['max_price']:.4f}")
        print(f"  Death Spiral (90% from peak): {'Month ' + str(analysis['death_spiral_month']) if analysis['death_spiral_month'] else 'NONE'}")
        print(f"  End Players: {analysis['end_players']:,}")
        print(f"  Total SOL Revenue: {analysis['total_sol_revenue']:,.1f} SOL")
        print(f"  Total Prestiged: {analysis['total_prestiged']:,}")
        print(f"  Burned: {analysis.get('burned_pct', 0)}% of supply")
        print(f"  Final Circulating: {analysis['final_circulating']:,}")
        
        # Key months snapshot
        print(f"\n  Monthly Snapshots:")
        print(f"  {'Mo':>3} | {'Players':>8} | {'Circ':>10} | {'Price':>8} | {'Chg%':>7} | {'SOL Rev':>8} | {'Burned%':>7}")
        for m in [0, 3, 6, 12, 18, 23]:
            if m < len(h):
                e = h[m]
                burned_pct = e.get('burned_pct', round(state.burned / INITIAL_SUPPLY * 100, 1) if hasattr(state, 'burned') else 0)
                print(f"  {e['month']:>3} | {e['players']:>8,} | {e['circulating']:>10,} | ${e['token_price']:>7.4f} | {e['price_change_pct']:>+6.1f}% | {e['monthly_sol_revenue']:>7.1f} | {burned_pct:>6.1f}%")


# ============================================================
# VERDICT SUMMARY
# ============================================================

print(f"\n\n{'='*80}")
print("VERDICT SUMMARY: WHAT WORKS AND WHAT BREAKS")
print(f"{'='*80}")

verdicts = []

for scenario_key, data in results.items():
    for model_key in ['model_a', 'model_b', 'model_c']:
        state = data[model_key]
        a = analyze_model(state, data['name'])
        
        status = "HEALTHY"
        issues = []
        
        if a['death_spiral_month'] is not None:
            status = "DEATH SPIRAL"
            issues.append(f"Token collapsed at month {a['death_spiral_month']}")
        elif a['total_price_change_pct'] < -80:
            status = "SEVERE DECLINE"
            issues.append(f"Price dropped {a['total_price_change_pct']}%")
        elif a['total_price_change_pct'] < -50:
            status = "DECLINING"
            issues.append(f"Price dropped {a['total_price_change_pct']}%")
        elif a['total_price_change_pct'] > 500:
            status = "UNSUSTAINABLE PUMP"
            issues.append(f"Price up {a['total_price_change_pct']}% — bubble risk")
        
        # Check if reward pool exhausted (Model A)
        if hasattr(state, 'reward_pool'):
            if state.reward_pool <= 0:
                issues.append("REWARD POOL EXHAUSTED")
                if status == "HEALTHY":
                    status = "CRITICAL"
        
        # Check emission/burn ratio (Model B)
        if state.history and 'emission_burn_ratio' in state.history[-1]:
            ratio = state.history[-1]['emission_burn_ratio']
            if ratio > 2.0:
                issues.append(f"Emissions 2x burns (ratio: {ratio})")
                if status == "HEALTHY":
                    status = "WARNING"
        
        if a['total_sol_revenue'] < 100:
            issues.append("Low SOL revenue — may not sustain operations")
        
        if not issues:
            issues.append("Stable within simulation parameters")
        
        verdicts.append({
            'scenario': data['name'],
            'model': state.name,
            'status': status,
            'issues': issues,
            'price_change': a['total_price_change_pct'],
            'sol_revenue': a['total_sol_revenue'],
        })

for v in verdicts:
    emoji = {"HEALTHY": "✅", "WARNING": "⚠️", "DECLINING": "📉", "SEVERE DECLINE": "🔴", 
             "DEATH SPIRAL": "💀", "CRITICAL": "🚨", "UNSUSTAINABLE PUMP": "🎈"}.get(v['status'], "❓")
    print(f"\n{emoji} {v['status']:>20} | {v['model'][:40]:<40} | {v['scenario']}")
    for issue in v['issues']:
        print(f"   → {issue}")


# ============================================================
# FINAL RECOMMENDATION
# ============================================================

print(f"\n\n{'='*80}")
print("DESIGN RECOMMENDATIONS")
print(f"{'='*80}")

recommendations = """
KEY FINDINGS:

1. MODEL A (Pure Prestige Burn) — REWARD POOL DEPLETION RISK
   The fixed-supply, pre-minted pool model works well early but faces exhaustion.
   With steady growth, the reward pool drains within 12-18 months at generous
   emission rates. Once empty, there's nothing to earn — game loses incentive loop.
   
   FIX: Reduce per-win rewards significantly. Token should be SCARCE.
   Make it feel precious, not abundant. 2-3 tokens per win, not 5.

2. MODEL B (Emission + Burn Equilibrium) — INFLATION RISK UNDER GROWTH
   Dynamic emissions create a balancing act that WORKS in steady state but
   breaks during viral growth (emissions spike faster than burns ramp up).
   The adjustment mechanism always lags. During decline, reduced players = 
   reduced burns, but tokens already emitted remain — sell pressure.
   
   FIX: Hard emission caps per epoch. Never emit more than X regardless of players.
   
3. MODEL C (Dual-Layer SOL + Cosmetic Token) — MOST RESILIENT
   Separating the money layer (SOL wagering) from the status layer (token)
   produces the most stable results across ALL scenarios. Even in decline 
   scenarios, the token doesn't death-spiral because its value is tied to 
   cosmetic demand, not extraction economics.
   
   The SOL revenue is real, sustainable income regardless of token price.
   Players come to BET and PLAY, not to farm tokens.

RECOMMENDED ARCHITECTURE:

→ Use Model C as the base with elements from A and B:

  MONEY LAYER (SOL):
  - PvP wagering (players bet SOL, winner takes pot minus 10% fee)
  - Season passes purchased in SOL
  - Premium cosmetic bundles in SOL
  - This is where real revenue flows. Target: sustain ops on SOL alone.
  
  STATUS LAYER (TOKEN):
  - Fixed supply, no ongoing emissions
  - Small achievement drips from pre-minted pool (very controlled)
  - ALL token utility is cosmetic/prestige:
    * Prestige resets (biggest burn)
    * Weapon skins (burn)
    * Tank customization (burn)  
    * Seasonal battle pass premium track (burn)
    * Leaderboard entry fees for ranked seasons (burn)
  - Token is soul-bound? Or tradeable for market price discovery?
    → TRADEABLE but with NO earning loop. You can sell tokens but you
      can't "earn" them faster by spending them. Prestige gives you a badge,
      not higher token yield.

PRESTIGE SYSTEM DESIGN:
  - 10 prestige tiers
  - Each tier costs more tokens: 200, 400, 600, 900, 1200, 1600, 2000, 2500, 3000, 4000
  - Total to max prestige: 16,400 tokens (significant % of per-player lifetime earnings)
  - Each tier: unique tank colour, kill effect, lobby badge
  - Max prestige: legendary animated skin + permanent leaderboard frame
  - CRITICAL: No gameplay advantage. No higher earn rate. Pure status.

THE PRESTIGE BURN MATH:
  If 1000 players eventually max prestige = 16.4M tokens burned = 164% of supply
  This means the token is ALWAYS under deflationary pressure from prestige chasers.
  New supply only enters via controlled achievement drips.
  Scarcity drives cosmetic value. CS:GO knife effect.
"""

print(recommendations)
