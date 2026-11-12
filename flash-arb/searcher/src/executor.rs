use crate::config::{is_zero_address, parse_addr, ChainConfig};
use crate::evm::encode_execute_call;
use crate::risk::RiskManager;
use crate::routes::ArbitrageOpportunity;
use crate::sim::SimulationResult;
use ethers::prelude::*;
use std::sync::Arc;
use tracing::{info, warn};

pub struct TxExecutor {
    pub config: ChainConfig,
    pub risk_manager: RiskManager,
}

impl TxExecutor {
    pub fn new(config: ChainConfig, risk_manager: RiskManager) -> Self {
        Self { config, risk_manager }
    }

    /// Live only: re-check risk limits, sign with FLASH_ARB_SIGNER_KEY, broadcast, await receipt.
    /// Refuses to send anything that was not verified by an eth_call simulation against the deployed contract.
    pub async fn execute(&self, opp: &ArbitrageOpportunity, sim: &SimulationResult) -> eyre::Result<()> {
        if !sim.verified || !sim.success {
            eyre::bail!("refusing to broadcast an unverified/failed simulation");
        }
        if is_zero_address(&self.config.flash_arb_contract) {
            eyre::bail!("flash_arb_contract is not set");
        }

        if let Err(reason) = self.risk_manager.can_execute(&format!("{:?}", opp.borrowed_asset), sim.gas_used).await {
            warn!("[{}] Risk check rejected trade: {}", self.config.chain_name, reason);
            return Ok(());
        }

        // The profit wallet must be set explicitly: no hard-coded fallback address.
        let profit_recipient = std::env::var("FLASH_ARB_PROFIT_WALLET")
            .ok()
            .and_then(|s| parse_addr(&s))
            .ok_or_else(|| eyre::eyre!("FLASH_ARB_PROFIT_WALLET not set (or not a valid address)"))?;

        let key = std::env::var("FLASH_ARB_SIGNER_KEY")
            .ok()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .ok_or_else(|| eyre::eyre!("FLASH_ARB_SIGNER_KEY not set"))?;
        let wallet: LocalWallet = key.parse::<LocalWallet>()?.with_chain_id(self.config.chain_id);
        let signer_address = wallet.address();

        let provider = Provider::<Http>::try_from(self.config.rpc_http.as_str())?;
        let client = Arc::new(SignerMiddleware::new(provider.clone(), wallet));
        let contract_address = self.config.flash_arb_contract.parse::<Address>()?;

        let (max_fee, _) = provider
            .estimate_eip1559_fees(None)
            .await
            .unwrap_or((U256::from(200_000_000u64), U256::from(50_000_000u64)));

        // Priority-fee bid: tip_share_percent of expected net profit, converted to wei/gas, capped at the base max fee
        // (so a mis-estimated profit can never make the tip dwarf the gas price).
        let tip_usd = opp.net_profit_usd * (self.config.tip_share_percent as f64) / 100.0;
        let tip_eth = tip_usd / opp.eth_price_usd.max(1.0);
        let tip_wei_per_gas = (tip_eth * 1e18 / (sim.gas_used.max(1) as f64)).max(0.0) as u128;
        let priority_fee = U256::from(tip_wei_per_gas).min(max_fee);

        let tx_request = Eip1559TransactionRequest::new()
            .to(contract_address)
            .from(signer_address)
            .data(encode_execute_call(opp, profit_recipient))
            .gas(sim.gas_used + sim.gas_used / 4) // +25% headroom over the simulated estimate
            .max_priority_fee_per_gas(priority_fee)
            .max_fee_per_gas(max_fee + priority_fee)
            .chain_id(self.config.chain_id);

        info!("[{}] Broadcasting FlashArb tx (borrow {} {})...", self.config.chain_name, opp.optimal_loan_amount, opp.asset_symbol);
        let pending_tx = client.send_transaction(tx_request, None).await?;
        let tx_hash = pending_tx.tx_hash();
        info!("[{}] Broadcast: 0x{:x}", self.config.chain_name, tx_hash);

        match pending_tx.await? {
            Some(receipt) => {
                if receipt.status == Some(U64::from(1u64)) {
                    info!(
                        "[{}] FlashArb CONFIRMED in block {} (gas {:?}); modelled net profit ${:.2}",
                        self.config.chain_name,
                        receipt.block_number.unwrap_or_default(),
                        receipt.gas_used.unwrap_or_default(),
                        opp.net_profit_usd
                    );
                    self.risk_manager.record_success();
                } else {
                    let gas_used = receipt.gas_used.unwrap_or_default();
                    let price = receipt.effective_gas_price.unwrap_or(max_fee);
                    let loss_eth = (gas_used.low_u128() as f64) * (price.low_u128() as f64) / 1e18;
                    let loss_usd = loss_eth * opp.eth_price_usd;
                    warn!("[{}] FlashArb REVERTED on-chain. Gas lost ~${:.2}", self.config.chain_name, loss_usd);
                    self.risk_manager.record_revert(loss_usd).await;
                }
            }
            None => warn!("[{}] Transaction dropped / not mined in timeout window", self.config.chain_name),
        }
        Ok(())
    }
}
