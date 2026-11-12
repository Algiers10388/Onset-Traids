use ethers::types::Address;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

fn default_balancer_vault() -> String {
    // Balancer V2 Vault: same deterministic address on Arbitrum, Base and Optimism
    "0xBA12222222228d8Ba445958a75a0704d566BF2C8".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub chain_name: String,
    pub rpc_http: String,
    /// Unused since v0.2 (block polling over HTTP); kept so old TOML files still load.
    #[serde(default)]
    pub rpc_ws: String,
    #[serde(default)]
    pub relay_endpoint: String,
    #[serde(default)]
    pub is_l2: bool,
    #[serde(default)]
    pub sequencer_priority_bidding: bool,
    pub tip_share_percent: u64,
    #[serde(default)]
    pub aave_v3_pool: String,
    #[serde(default)]
    pub aave_v3_addresses_provider: String,
    #[serde(default)]
    pub aave_flash_fee_bps: u64,
    #[serde(default = "default_balancer_vault")]
    pub balancer_vault: String,
    pub flash_arb_contract: String,
    pub dexes: HashMap<String, DexConfig>,
    pub tokens: HashMap<String, String>,
    pub risk: RiskConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DexConfig {
    pub router: Option<String>,
    pub quoter: Option<String>,
    pub factory: Option<String>,
    pub two_pool: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskConfig {
    pub min_net_profit_usd: f64,
    pub max_gas_per_tx: u64,
    pub daily_revert_loss_cap_usd: f64,
    pub consecutive_failure_limit: u32,
    #[serde(default)]
    pub simulation_engine: String,
    #[serde(default)]
    pub excluded_tokens: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DexKind {
    /// Uniswap-V2-style pair + router (`swapExactTokensForTokens(amountIn, min, path, to, deadline)`)
    V2,
    /// Uniswap V3 pools + SwapRouter / SwapRouter02
    V3,
    /// Curve, and Solidly forks (Aerodrome / Velodrome) whose routers use a different ABI; not supported by FlashArbOptimized
    Unsupported,
}

pub fn dex_kind(dex_id: &str) -> DexKind {
    match dex_id {
        "uniswap_v3" => DexKind::V3,
        "camelot_v2" | "sushiswap_v2" => DexKind::V2,
        _ => DexKind::Unsupported,
    }
}

pub fn parse_addr(s: &str) -> Option<Address> {
    s.trim().parse::<Address>().ok()
}

pub fn is_zero_address(s: &str) -> bool {
    parse_addr(s).map_or(true, |a| a == Address::zero())
}

impl ChainConfig {
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> eyre::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let mut config: ChainConfig = toml::from_str(&content)?;
        // Public RPCs rate-limit hard; let the user point at their own node without editing TOML.
        let var = format!("FLASH_ARB_RPC_{}", config.chain_name.to_uppercase());
        if let Ok(url) = std::env::var(&var) {
            if !url.trim().is_empty() {
                config.rpc_http = url.trim().to_string();
            }
        }
        Ok(config)
    }
}
