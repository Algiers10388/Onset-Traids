//! Pre-flight verification: `eth_estimateGas` of the exact FlashArbOptimized call from the owner account against
//! current chain state. A revert here (no profit, insufficient Balancer liquidity, bad route...) means the trade is rejected.
//! (The previous version returned a hard-coded "312450 gas, PASSED" without touching the chain.)
use crate::config::{is_zero_address, parse_addr, ChainConfig};
use crate::evm::encode_execute_call;
use crate::routes::ArbitrageOpportunity;
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;
use tracing::debug;

#[derive(Debug, Clone)]
pub struct SimulationResult {
    pub success: bool,
    /// true only if the call was really executed against chain state (contract deployed + owner address known)
    pub verified: bool,
    pub gas_used: u64,
    pub error_message: Option<String>,
}

pub struct Simulator {
    pub config: ChainConfig,
    provider: Provider<Http>,
}

impl Simulator {
    pub fn new(config: ChainConfig) -> eyre::Result<Self> {
        let provider = Provider::<Http>::try_from(config.rpc_http.as_str())?;
        Ok(Self { config, provider })
    }

    fn owner_address() -> Option<Address> {
        if let Ok(k) = std::env::var("FLASH_ARB_SIGNER_KEY") {
            if let Ok(w) = k.trim().parse::<LocalWallet>() {
                return Some(w.address());
            }
        }
        std::env::var("FLASH_ARB_OWNER_ADDRESS").ok().and_then(|s| parse_addr(&s))
    }

    pub async fn simulate_opportunity(&self, opp: &ArbitrageOpportunity) -> eyre::Result<SimulationResult> {
        if opp.optimal_loan_amount.is_zero() {
            return Ok(SimulationResult {
                success: false,
                verified: false,
                gas_used: 0,
                error_message: Some("loan size is zero".into()),
            });
        }
        if is_zero_address(&self.config.flash_arb_contract) {
            return Ok(SimulationResult {
                success: false,
                verified: false,
                gas_used: 0,
                error_message: Some("flash_arb_contract is 0x0 (not deployed): opportunity is model-only, UNVERIFIED".into()),
            });
        }
        let Some(from) = Self::owner_address() else {
            return Ok(SimulationResult {
                success: false,
                verified: false,
                gas_used: 0,
                error_message: Some("set FLASH_ARB_SIGNER_KEY or FLASH_ARB_OWNER_ADDRESS to simulate against the contract".into()),
            });
        };
        let contract = parse_addr(&self.config.flash_arb_contract).unwrap_or_default();
        let recipient = std::env::var("FLASH_ARB_PROFIT_WALLET").ok().and_then(|s| parse_addr(&s)).unwrap_or(from);

        let tx: TypedTransaction = TransactionRequest::new()
            .from(from)
            .to(contract)
            .data(encode_execute_call(opp, recipient))
            .into();

        match self.provider.estimate_gas(&tx, None).await {
            Ok(gas) => {
                let gas_used = gas.low_u64();
                if gas_used > self.config.risk.max_gas_per_tx {
                    return Ok(SimulationResult {
                        success: false,
                        verified: true,
                        gas_used,
                        error_message: Some(format!("gas {} exceeds max_gas_per_tx {}", gas_used, self.config.risk.max_gas_per_tx)),
                    });
                }
                Ok(SimulationResult { success: true, verified: true, gas_used, error_message: None })
            }
            Err(e) => {
                debug!("[{}] estimate_gas reverted: {}", self.config.chain_name, e);
                Ok(SimulationResult {
                    success: false,
                    verified: true,
                    gas_used: 0,
                    error_message: Some(format!("simulation reverted: {}", e)),
                })
            }
        }
    }
}
