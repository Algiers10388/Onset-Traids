//! Pool discovery (factory lookups) and per-block state refresh (getReserves / slot0 + liquidity) over HTTP JSON-RPC.
//! Nothing here is seeded or hard-coded: every number comes from the chain.
use crate::config::{dex_kind, parse_addr, ChainConfig, DexKind};
use crate::evm::{call_decode, multicall, sel, tok_uint, u256_to_f64};
use dashmap::DashMap;
use ethers::abi::{ParamType, Token};
use ethers::prelude::*;
use std::collections::HashSet;
use std::sync::Arc;
use tracing::{debug, info, warn};

const Q96: f64 = 79228162514264337593543950336.0; // 2^96
const V3_FEE_TIERS: [u32; 4] = [100, 500, 3000, 10_000];
/// Fee assumed for V2-style pairs (Uniswap V2 / Sushiswap = 0.30%). Camelot's is configurable per pair;
/// the eth_call simulation is the source of truth, this only drives the pre-filter.
const V2_FEE_PPM: u32 = 3000;

#[derive(Debug, Clone)]
pub struct PoolSnapshot {
    pub pool_address: Address,
    pub router: Address,
    pub dex_name: String,
    pub token0: Address,
    pub token1: Address,
    pub is_v3: bool,
    /// Swap fee in parts-per-million (V3 fee tier, or 3000 for V2-style pairs)
    pub fee_ppm: u32,
    pub reserve0: U256,
    pub reserve1: U256,
    pub sqrt_price_x96: U256,
    pub liquidity: u128,
    pub last_updated_block: u64,
}

/// Returns (base_reserve, other_reserve) in raw token units. For V3 these are the *virtual* reserves of the
/// current liquidity (x = L/sqrtP, y = L*sqrtP), i.e. a constant-product model valid while the price stays in range.
pub fn virtual_reserves(pool: &PoolSnapshot, base: Address) -> Option<(f64, f64)> {
    let (r0, r1) = if pool.is_v3 {
        if pool.liquidity == 0 || pool.sqrt_price_x96.is_zero() {
            return None;
        }
        let sp = u256_to_f64(pool.sqrt_price_x96) / Q96;
        let l = pool.liquidity as f64;
        (l / sp, l * sp)
    } else {
        (u256_to_f64(pool.reserve0), u256_to_f64(pool.reserve1))
    };
    if !(r0 > 0.0 && r1 > 0.0 && r0.is_finite() && r1.is_finite()) {
        return None;
    }
    if base == pool.token0 {
        Some((r0, r1))
    } else if base == pool.token1 {
        Some((r1, r0))
    } else {
        None
    }
}

pub struct PriceMonitor {
    pub config: ChainConfig,
    pub provider: Arc<Provider<Http>>,
    pub pools: Arc<DashMap<Address, PoolSnapshot>>,
    pub decimals: Arc<DashMap<Address, u8>>,
    pub latest_block: Arc<tokio::sync::RwLock<u64>>,
}

impl PriceMonitor {
    pub fn new(config: ChainConfig) -> eyre::Result<Self> {
        let provider = Provider::<Http>::try_from(config.rpc_http.as_str())?;
        Ok(Self {
            config,
            provider: Arc::new(provider),
            pools: Arc::new(DashMap::new()),
            decimals: Arc::new(DashMap::new()),
            latest_block: Arc::new(tokio::sync::RwLock::new(0)),
        })
    }

    pub fn token(&self, symbol: &str) -> Option<Address> {
        self.config.tokens.get(symbol).and_then(|s| parse_addr(s))
    }

    pub fn dec(&self, token: Address) -> Option<u8> {
        self.decimals.get(&token).map(|d| *d)
    }

    fn is_excluded(&self, token: Address) -> bool {
        self.config
            .risk
            .excluded_tokens
            .iter()
            .any(|e| parse_addr(e).map_or(false, |a| a == token))
    }

    /// Tokens we are allowed to trade (configured, parsable, not excluded)
    pub fn tradable_tokens(&self) -> Vec<(String, Address)> {
        let mut v: Vec<(String, Address)> = self
            .config
            .tokens
            .iter()
            .filter_map(|(sym, s)| parse_addr(s).map(|a| (sym.clone(), a)))
            .filter(|(_, a)| !self.is_excluded(*a))
            .collect();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    }

    pub async fn load_decimals(&self) {
        for (sym, addr) in self.tradable_tokens() {
            match call_decode(&self.provider, addr, "decimals()", &[], &[ParamType::Uint(8)]).await {
                Ok(t) => {
                    let d = tok_uint(&t[0]).low_u32() as u8;
                    self.decimals.insert(addr, d);
                }
                Err(e) => warn!("[{}] decimals() failed for {}: {}", self.config.chain_name, sym, e),
            }
        }
    }

    /// Looks up pools on every supported DEX for each (base, other) pair, where base is WETH or USDC.
    pub async fn discover(&self) {
        let tokens = self.tradable_tokens();
        let mut seen: HashSet<(Address, Address)> = HashSet::new();
        for base_sym in ["WETH", "USDC"] {
            let Some(base) = self.token(base_sym) else { continue };
            for (_, other) in &tokens {
                if *other == base {
                    continue;
                }
                let key = if base < *other { (base, *other) } else { (*other, base) };
                if !seen.insert(key) {
                    continue;
                }
                self.discover_pair(base, *other).await;
            }
        }
        info!("[{}] Discovered {} pools", self.config.chain_name, self.pools.len());
    }

    async fn discover_pair(&self, a: Address, b: Address) {
        let (t0, t1) = if a < b { (a, b) } else { (b, a) };
        for (dex_id, dex) in &self.config.dexes {
            let kind = dex_kind(dex_id);
            if kind == DexKind::Unsupported {
                continue;
            }
            let Some(router) = dex.router.as_deref().and_then(parse_addr) else { continue };
            let Some(factory) = dex.factory.as_deref().and_then(parse_addr) else { continue };

            match kind {
                DexKind::V2 => {
                    let res = call_decode(
                        &self.provider,
                        factory,
                        "getPair(address,address)",
                        &[Token::Address(a), Token::Address(b)],
                        &[ParamType::Address],
                    )
                    .await;
                    match res {
                        Ok(t) => {
                            if let Some(pool) = t[0].clone().into_address() {
                                if pool != Address::zero() {
                                    self.register(PoolSnapshot {
                                        pool_address: pool,
                                        router,
                                        dex_name: dex_id.clone(),
                                        token0: t0,
                                        token1: t1,
                                        is_v3: false,
                                        fee_ppm: V2_FEE_PPM,
                                        reserve0: U256::zero(),
                                        reserve1: U256::zero(),
                                        sqrt_price_x96: U256::zero(),
                                        liquidity: 0,
                                        last_updated_block: 0,
                                    });
                                }
                            }
                        }
                        Err(e) => debug!("[{}] getPair failed on {}: {}", self.config.chain_name, dex_id, e),
                    }
                }
                DexKind::V3 => {
                    for fee in V3_FEE_TIERS {
                        let res = call_decode(
                            &self.provider,
                            factory,
                            "getPool(address,address,uint24)",
                            &[Token::Address(a), Token::Address(b), Token::Uint(U256::from(fee))],
                            &[ParamType::Address],
                        )
                        .await;
                        match res {
                            Ok(t) => {
                                if let Some(pool) = t[0].clone().into_address() {
                                    if pool != Address::zero() {
                                        self.register(PoolSnapshot {
                                            pool_address: pool,
                                            router,
                                            dex_name: format!("{}-{}", dex_id, fee),
                                            token0: t0,
                                            token1: t1,
                                            is_v3: true,
                                            fee_ppm: fee,
                                            reserve0: U256::zero(),
                                            reserve1: U256::zero(),
                                            sqrt_price_x96: U256::zero(),
                                            liquidity: 0,
                                            last_updated_block: 0,
                                        });
                                    }
                                }
                            }
                            Err(e) => debug!("[{}] getPool failed on {}: {}", self.config.chain_name, dex_id, e),
                        }
                    }
                }
                DexKind::Unsupported => {}
            }
        }
    }

    fn register(&self, pool: PoolSnapshot) {
        self.pools.insert(pool.pool_address, pool);
    }

    /// Refresh every known pool at `block` using Multicall3: one eth_call per 100 calls instead of 1-2 calls per pool.
    /// Pools whose call fails keep their old `last_updated_block` and are ignored by `pools_for_pair` for this block
    /// (no trading on stale state).
    pub async fn refresh_all(&self, block: u64) {
        let snaps: Vec<PoolSnapshot> = self.pools.iter().map(|e| e.value().clone()).collect();
        let slot0_types = [
            ParamType::Uint(160),
            ParamType::Int(24),
            ParamType::Uint(16),
            ParamType::Uint(16),
            ParamType::Uint(16),
            ParamType::Uint(8),
            ParamType::Bool,
        ];
        // Camelot's getReserves returns 4 words (two fee percents instead of a timestamp); decoding the first 3 is safe for both.
        let reserve_types = [ParamType::Uint(112), ParamType::Uint(112), ParamType::Uint(32)];

        for chunk in snaps.chunks(50) {
            let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
            for p in chunk {
                if p.is_v3 {
                    calls.push((p.pool_address, sel("slot0()")));
                    calls.push((p.pool_address, sel("liquidity()")));
                } else {
                    calls.push((p.pool_address, sel("getReserves()")));
                }
            }
            let results = match multicall(&self.provider, &calls, block).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("[{}] multicall refresh failed: {}", self.config.chain_name, e);
                    continue;
                }
            };

            let mut i = 0usize;
            for p in chunk {
                let mut pool = p.clone();
                let ok = if p.is_v3 {
                    let s0 = results.get(i).cloned().flatten();
                    let lq = results.get(i + 1).cloned().flatten();
                    i += 2;
                    match (s0, lq) {
                        (Some(s0), Some(lq)) => {
                            let a = ethers::abi::decode(&slot0_types, &s0).ok();
                            let b = ethers::abi::decode(&[ParamType::Uint(128)], &lq).ok();
                            match (a, b) {
                                (Some(a), Some(b)) => {
                                    pool.sqrt_price_x96 = tok_uint(&a[0]);
                                    pool.liquidity = tok_uint(&b[0]).low_u128();
                                    true
                                }
                                _ => false,
                            }
                        }
                        _ => false,
                    }
                } else {
                    let r = results.get(i).cloned().flatten();
                    i += 1;
                    match r.and_then(|r| ethers::abi::decode(&reserve_types, &r).ok()) {
                        Some(t) => {
                            pool.reserve0 = tok_uint(&t[0]);
                            pool.reserve1 = tok_uint(&t[1]);
                            true
                        }
                        None => false,
                    }
                };
                if ok {
                    pool.last_updated_block = block;
                    self.pools.insert(pool.pool_address, pool);
                }
            }
        }
    }

    pub fn pools_for_pair(&self, a: Address, b: Address, block: u64) -> Vec<PoolSnapshot> {
        self.pools
            .iter()
            .filter(|e| {
                let p = e.value();
                p.last_updated_block == block
                    && ((p.token0 == a && p.token1 == b) || (p.token0 == b && p.token1 == a))
            })
            .map(|e| e.value().clone())
            .collect()
    }

    /// ETH/USD from the deepest on-chain WETH/USDC pool (no external API, no hard-coded fallback).
    pub fn eth_price_usd(&self) -> Option<f64> {
        let weth = self.token("WETH")?;
        let usdc = self.token("USDC")?;
        let dw = self.dec(weth)? as i32;
        let du = self.dec(usdc)? as i32;
        let mut best: Option<(f64, f64)> = None; // (usdc depth, price)
        for e in self.pools.iter() {
            let p = e.value();
            let is_pair = (p.token0 == weth && p.token1 == usdc) || (p.token0 == usdc && p.token1 == weth);
            if !is_pair || p.last_updated_block == 0 {
                continue;
            }
            if let Some((u, w)) = virtual_reserves(p, usdc) {
                let price = (u / 10f64.powi(du)) / (w / 10f64.powi(dw));
                if price.is_finite() && price > 0.0 && best.map_or(true, |(d, _)| u > d) {
                    best = Some((u, price));
                }
            }
        }
        best.map(|(_, price)| price)
    }
}
