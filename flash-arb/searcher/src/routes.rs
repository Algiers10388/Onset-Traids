//! Two-pool cycle sizing: borrow BASE, buy OTHER on pool `buy`, sell OTHER for BASE on pool `sell`.
//! Both pools are modelled as constant-product (V3 via virtual reserves of the current liquidity), which gives an
//! exact closed-form optimum. The model is only a pre-filter: the real go/no-go is the eth_call simulation.
use crate::config::ChainConfig;
use crate::evm::{f64_to_u256, u256_to_f64};
use crate::monitor::{virtual_reserves, PoolSnapshot};
use ethers::prelude::*;

/// Balancer V2 flash loans are fee-free while the protocol flash-loan fee is 0 (the contract's profit guard enforces it on-chain).
pub const FLASH_FEE_BPS: f64 = 0.0;
/// Rough gas for flash loan + 2 swaps
pub const GAS_UNITS_ESTIMATE: f64 = 350_000.0;
/// L2s also charge an L1 data fee that `eth_gasPrice` does not include; conservative flat allowance in USD.
pub const L1_FEE_BUFFER_USD: f64 = 0.15;
/// Ignore pools with less than this much base-asset depth (honeypots, dust pools)
pub const MIN_POOL_DEPTH_USD: f64 = 20_000.0;
/// Never size above this fraction of the thinner pool's base-side reserve (keeps the V3 in-range approximation sane)
pub const MAX_TRADE_FRACTION: f64 = 0.02;

#[derive(Debug, Clone)]
pub struct ArbitrageOpportunity {
    pub borrowed_asset: Address,
    pub intermediate_asset: Address,
    pub asset_symbol: String,
    pub intermediate_symbol: String,
    pub buy_dex: String,
    pub buy_pool: Address,
    pub buy_router: Address,
    pub buy_is_v3: bool,
    pub buy_fee_ppm: u32,
    pub sell_dex: String,
    pub sell_pool: Address,
    pub sell_router: Address,
    pub sell_is_v3: bool,
    pub sell_fee_ppm: u32,
    pub optimal_loan_amount: U256,
    pub expected_gross_profit: U256,
    pub gross_profit_usd: f64,
    pub estimated_gas_cost_usd: f64,
    pub net_profit_usd: f64,
    pub eth_price_usd: f64,
    pub spread_bps: f64,
}

pub struct PriceContext {
    pub base_decimals: u8,
    pub base_price_usd: f64,
    pub eth_price_usd: f64,
    pub gas_price_wei: U256,
}

/// Output of BASE after: x BASE -> pool1 (a1 base, b1 other, g1 = 1-fee) -> pool2 (a2 base, b2 other, g2 = 1-fee)
pub fn cycle_output(x: f64, a1: f64, b1: f64, g1: f64, a2: f64, b2: f64, g2: f64) -> f64 {
    let out1 = g1 * x * b1 / (a1 + g1 * x);
    g2 * out1 * a2 / (b2 + g2 * out1)
}

/// Closed-form maximiser of cycle_output(x) - k*x  (k = 1 + flash fee).
/// out(x) = A x / (Bc + C x)  =>  x* = (sqrt(A*Bc/k) - Bc) / C, profitable only if A > k*Bc.
pub fn optimal_input(a1: f64, b1: f64, g1: f64, a2: f64, b2: f64, g2: f64, k: f64) -> Option<f64> {
    let a = g1 * g2 * b1 * a2;
    let bc = b2 * a1;
    let c = g1 * (b2 + g2 * b1);
    if !(a > k * bc) || !(c > 0.0) {
        return None;
    }
    let x = ((a * bc / k).sqrt() - bc) / c;
    if x.is_finite() && x > 0.0 {
        Some(x)
    } else {
        None
    }
}

pub struct RouteFinder {
    pub config: ChainConfig,
}

impl RouteFinder {
    pub fn new(config: ChainConfig) -> Self {
        Self { config }
    }

    /// Best opportunity over all ordered pool pairs (both directions) for one (base, other) token pair.
    /// `size_factor` (0..1] shrinks the loan below the model optimum; used to retry when the on-chain simulation rejects the full size
    /// (e.g. a V3 pool whose liquidity ends before the modelled price impact).
    pub fn find_best(
        &self,
        base: Address,
        base_symbol: &str,
        other: Address,
        other_symbol: &str,
        pools: &[PoolSnapshot],
        ctx: &PriceContext,
        size_factor: f64,
    ) -> Option<ArbitrageOpportunity> {
        let mut best: Option<ArbitrageOpportunity> = None;
        for i in 0..pools.len() {
            for j in 0..pools.len() {
                if i == j {
                    continue;
                }
                if let Some(o) = self.evaluate(base, base_symbol, other, other_symbol, &pools[i], &pools[j], ctx, size_factor) {
                    if best.as_ref().map_or(true, |b| o.net_profit_usd > b.net_profit_usd) {
                        best = Some(o);
                    }
                }
            }
        }
        best
    }

    fn evaluate(
        &self,
        base: Address,
        base_symbol: &str,
        other: Address,
        other_symbol: &str,
        buy: &PoolSnapshot,
        sell: &PoolSnapshot,
        ctx: &PriceContext,
        size_factor: f64,
    ) -> Option<ArbitrageOpportunity> {
        if buy.pool_address == sell.pool_address || ctx.base_price_usd <= 0.0 {
            return None;
        }
        let (a1, b1) = virtual_reserves(buy, base)?;
        let (a2, b2) = virtual_reserves(sell, base)?;
        let g1 = 1.0 - buy.fee_ppm as f64 / 1e6;
        let g2 = 1.0 - sell.fee_ppm as f64 / 1e6;
        let k = 1.0 + FLASH_FEE_BPS / 10_000.0;

        let unit = 10f64.powi(ctx.base_decimals as i32);
        let min_depth_raw = MIN_POOL_DEPTH_USD / ctx.base_price_usd * unit;
        if a1 < min_depth_raw || a2 < min_depth_raw {
            return None;
        }

        let mut x = optimal_input(a1, b1, g1, a2, b2, g2, k)?;
        x = x.min(MAX_TRADE_FRACTION * a1.min(a2)) * size_factor.clamp(0.01, 1.0);
        let profit_raw = cycle_output(x, a1, b1, g1, a2, b2, g2) - x * k;
        if !(profit_raw > 0.0) {
            return None;
        }

        let gross_usd = profit_raw / unit * ctx.base_price_usd;
        let gas_eth = GAS_UNITS_ESTIMATE * u256_to_f64(ctx.gas_price_wei) / 1e18;
        let gas_usd = gas_eth * ctx.eth_price_usd + L1_FEE_BUFFER_USD;
        let net_usd = gross_usd - gas_usd;
        if net_usd < self.config.risk.min_net_profit_usd {
            return None;
        }

        // Marginal price of OTHER in BASE: buy pool a1/b1, sell pool a2/b2
        let spread_bps = ((a2 / b2) / (a1 / b1) - 1.0) * 10_000.0;

        Some(ArbitrageOpportunity {
            borrowed_asset: base,
            intermediate_asset: other,
            asset_symbol: base_symbol.to_string(),
            intermediate_symbol: other_symbol.to_string(),
            buy_dex: buy.dex_name.clone(),
            buy_pool: buy.pool_address,
            buy_router: buy.router,
            buy_is_v3: buy.is_v3,
            buy_fee_ppm: buy.fee_ppm,
            sell_dex: sell.dex_name.clone(),
            sell_pool: sell.pool_address,
            sell_router: sell.router,
            sell_is_v3: sell.is_v3,
            sell_fee_ppm: sell.fee_ppm,
            optimal_loan_amount: f64_to_u256(x),
            expected_gross_profit: f64_to_u256(profit_raw),
            gross_profit_usd: gross_usd,
            estimated_gas_cost_usd: gas_usd,
            net_profit_usd: net_usd,
            eth_price_usd: ctx.eth_price_usd,
            spread_bps,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_form_matches_brute_force() {
        // pool1: 1000 base / 2_000_000 other ; pool2: 1000 base / 1_900_000 other (other is pricier in pool1's terms)
        let (a1, b1, a2, b2) = (1000.0, 2_000_000.0, 1000.0, 1_900_000.0);
        let (g1, g2) = (0.997, 0.997);
        let x_star = optimal_input(a1, b1, g1, a2, b2, g2, 1.0).expect("profitable");
        let p = |x: f64| cycle_output(x, a1, b1, g1, a2, b2, g2) - x;
        let mut best_x = 0.0;
        let mut best_p = f64::MIN;
        let mut x = 0.01;
        while x < 500.0 {
            if p(x) > best_p {
                best_p = p(x);
                best_x = x;
            }
            x += 0.01;
        }
        assert!((x_star - best_x).abs() < 0.05, "closed form {} vs brute force {}", x_star, best_x);
        assert!(p(x_star) >= best_p - 1e-6);
    }

    #[test]
    fn no_trade_when_fees_exceed_spread() {
        // 0.1% price gap, 0.3% fee on each side => not profitable
        assert!(optimal_input(1000.0, 2_000_000.0, 0.997, 1000.0, 1_998_000.0, 0.997, 1.0).is_none());
    }
}
