use crate::config::{is_zero_address, parse_addr, ChainConfig};
use crate::evm::{
    call_decode, decode_arbitrage_swaps_executed, decode_erc20_u256, encode_direct_sweep_call,
    encode_erc20_balance_of_call, encode_erc20_transfer_call, encode_execute_call,
    encode_rescue_tokens_call, encode_rescue_tokens_to_call, multicall,
};
use crate::risk::RiskManager;
use crate::routes::ArbitrageOpportunity;
use crate::sim::SimulationResult;
use ethers::abi::ParamType;
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Always keep at least 0.00005 ETH on the signer/gas wallet so future arbitrages & sweeps can pay L2 gas.
const SIGNER_MIN_GAS_RESERVE_WEI: u128 = 50_000_000_000_000;

#[derive(Debug, Default, Clone)]
pub struct SweepReport {
    pub contract_eth_swept_wei: U256,
    pub contract_tokens_swept: usize,
    pub gas_wallet_tokens_swept: usize,
    pub txs_confirmed: usize,
    pub skipped_tokens: usize,
}

#[derive(Debug)]
#[allow(dead_code)]
enum SweepTxOutcome {
    Confirmed(H256),
    SimulationReverted(String),
    BroadcastReverted(H256),
    Skipped(String),
}

pub struct TxExecutor {
    pub config: ChainConfig,
    pub risk_manager: RiskManager,
}

impl TxExecutor {
    pub fn new(config: ChainConfig, risk_manager: RiskManager) -> Self {
        Self { config, risk_manager }
    }

    fn build_signer_context(
        &self,
    ) -> eyre::Result<(Address, Address, Provider<Http>, Arc<SignerMiddleware<Provider<Http>, LocalWallet>>)> {
        // The profit wallet must be set explicitly and never zero: no hard-coded fallback address.
        let profit_recipient = std::env::var("FLASH_ARB_PROFIT_WALLET")
            .ok()
            .and_then(|s| parse_addr(&s))
            .filter(|a| *a != Address::zero())
            .ok_or_else(|| eyre::eyre!("FLASH_ARB_PROFIT_WALLET not set (or zero / invalid address)"))?;

        let key = std::env::var("FLASH_ARB_SIGNER_KEY")
            .ok()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .ok_or_else(|| eyre::eyre!("FLASH_ARB_SIGNER_KEY not set"))?;
        let wallet: LocalWallet = key.parse::<LocalWallet>()?.with_chain_id(self.config.chain_id);
        let signer_address = wallet.address();

        let provider = Provider::<Http>::try_from(self.config.rpc_http.as_str())?;
        let client = Arc::new(SignerMiddleware::new(provider.clone(), wallet));
        Ok((profit_recipient, signer_address, provider, client))
    }

    async fn query_token_balances(
        &self,
        provider: &Provider<Http>,
        account: Address,
        tokens: &[(String, Address)],
        block: u64,
    ) -> Vec<(String, Address, U256)> {
        let mut non_zero = Vec::new();
        if tokens.is_empty() {
            return non_zero;
        }
        for chunk in tokens.chunks(50) {
            let calls: Vec<(Address, Vec<u8>)> = chunk
                .iter()
                .map(|(_, tok)| (*tok, encode_erc20_balance_of_call(account)))
                .collect();
            let results = match multicall(provider, &calls, block).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("[{}] balanceOf multicall failed for {:?}: {}", self.config.chain_name, account, e);
                    continue;
                }
            };
            for ((sym, tok), res) in chunk.iter().zip(results.into_iter()) {
                if let Some(bytes) = res {
                    if let Some(bal) = decode_erc20_u256(&bytes) {
                        if !bal.is_zero() {
                            non_zero.push((sym.clone(), *tok, bal));
                        }
                    }
                }
            }
        }
        non_zero
    }

    /// Pre-flight `estimate_gas` + gas-reserve check before signing and broadcasting any sweep transaction.
    async fn send_verified_sweep_tx(
        &self,
        provider: &Provider<Http>,
        client: &Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
        signer_address: Address,
        to: Address,
        calldata: Bytes,
        label: &str,
    ) -> eyre::Result<SweepTxOutcome> {
        let est_req = Eip1559TransactionRequest::new()
            .to(to)
            .from(signer_address)
            .data(calldata.clone())
            .chain_id(self.config.chain_id);
        let typed: TypedTransaction = est_req.into();

        let est_gas = match provider.estimate_gas(&typed, None).await {
            Ok(g) => g.low_u64(),
            Err(e) => return Ok(SweepTxOutcome::SimulationReverted(e.to_string())),
        };
        if est_gas > self.config.risk.max_gas_per_tx {
            return Ok(SweepTxOutcome::Skipped(format!(
                "estimated gas {} exceeds max_gas_per_tx {}",
                est_gas, self.config.risk.max_gas_per_tx
            )));
        }

        let gas_limit = (est_gas + est_gas / 4).max(21_000);
        let (max_fee, priority_fee) = provider
            .estimate_eip1559_fees(None)
            .await
            .unwrap_or((U256::from(100_000_000u64), U256::from(10_000_000u64)));
        let max_fee = max_fee.max(U256::from(1_000_000u64));
        let priority_fee = priority_fee.min(max_fee);

        let signer_eth = provider.get_balance(signer_address, None).await.unwrap_or_default();
        let needed = U256::from(gas_limit)
            .saturating_mul(max_fee)
            .saturating_add(U256::from(SIGNER_MIN_GAS_RESERVE_WEI));
        if signer_eth < needed {
            return Ok(SweepTxOutcome::Skipped(format!(
                "signer {:?} ETH balance ({} wei) below gas cost + reserve ({} wei)",
                signer_address, signer_eth, needed
            )));
        }

        let tx_req = Eip1559TransactionRequest::new()
            .to(to)
            .from(signer_address)
            .data(calldata)
            .gas(gas_limit)
            .max_priority_fee_per_gas(priority_fee)
            .max_fee_per_gas(max_fee)
            .chain_id(self.config.chain_id);

        let pending = client.send_transaction(tx_req, None).await?;
        let tx_hash = pending.tx_hash();
        info!("[{}] Sweep broadcast ({}): 0x{:x}", self.config.chain_name, label, tx_hash);

        match pending.await? {
            Some(receipt) => {
                if receipt.status == Some(U64::from(1u64)) {
                    info!(
                        "[{}] Sweep CONFIRMED ({}): 0x{:x} in block {}",
                        self.config.chain_name,
                        label,
                        tx_hash,
                        receipt.block_number.unwrap_or_default()
                    );
                    Ok(SweepTxOutcome::Confirmed(tx_hash))
                } else {
                    warn!("[{}] Sweep REVERTED on-chain ({}): 0x{:x}", self.config.chain_name, label, tx_hash);
                    Ok(SweepTxOutcome::BroadcastReverted(tx_hash))
                }
            }
            None => {
                warn!("[{}] Sweep tx dropped/timeout ({}): 0x{:x}", self.config.chain_name, label, tx_hash);
                Ok(SweepTxOutcome::Skipped("transaction dropped / not mined in timeout window".into()))
            }
        }
    }

    /// Sweeps all detected native ETH + non-ETH ERC-20 dust from every configured FlashArb contract vault
    /// AND all non-ETH ERC-20 token dust sitting in the signer/gas wallet directly to `FLASH_ARB_PROFIT_WALLET`.
    /// Native ETH on the gas wallet is never drained so L2 gas remains funded for future executions.
    pub async fn sweep_all_dust(&self) -> eyre::Result<SweepReport> {
        let (profit_recipient, signer_address, provider, client) = self.build_signer_context()?;
        let mut report = SweepReport::default();
        let tokens = self.config.all_tokens();
        let block = provider.get_block_number().await.map(|b| b.as_u64()).unwrap_or(0);

        // Phase 1: Contract Vault(s) — sweep native ETH + all non-ETH ERC-20 token balances.
        for contract_addr in self.config.sweep_contracts() {
            if contract_addr == profit_recipient {
                continue;
            }
            let code = provider.get_code(contract_addr, None).await.unwrap_or_default();
            if code.is_empty() {
                debug!("[{}] Vault {:?} has no bytecode; skipping sweep", self.config.chain_name, contract_addr);
                continue;
            }
            let owner_ok = match call_decode(&provider, contract_addr, "owner()", &[], &[ParamType::Address]).await {
                Ok(toks) => toks.into_iter().next().and_then(|t| t.into_address()) == Some(signer_address),
                Err(_) => false,
            };
            if !owner_ok {
                warn!(
                    "[{}] Vault {:?} is not owned by signer {:?}; skipping contract sweep",
                    self.config.chain_name, contract_addr, signer_address
                );
                continue;
            }

            let code_bytes = code.as_ref();
            let has_direct_sweep = code_bytes.windows(4).any(|w| w == [0x78, 0x04, 0xd9, 0xac]);
            let has_rescue_to = code_bytes.windows(4).any(|w| w == [0xa7, 0x07, 0x06, 0x92]);
            let has_rescue = code_bytes.windows(3).any(|w| w == [0xae, 0x3b, 0xf8]);

            // 1a. Native ETH sitting on vault contract
            let eth_bal = provider.get_balance(contract_addr, None).await.unwrap_or_default();
            if !eth_bal.is_zero() {
                if !has_direct_sweep {
                    warn!(
                        "[{}] Vault {:?} lacks executeDirectFlashArb(address) selector; skipping {} wei ETH sweep",
                        self.config.chain_name, contract_addr, eth_bal
                    );
                } else {
                    let label = format!("vault {:?} ETH ({} wei) -> {:?}", contract_addr, eth_bal, profit_recipient);
                    match self
                        .send_verified_sweep_tx(
                            &provider,
                            &client,
                            signer_address,
                            contract_addr,
                            encode_direct_sweep_call(profit_recipient),
                            &label,
                        )
                        .await
                    {
                        Ok(SweepTxOutcome::Confirmed(_)) => {
                            report.contract_eth_swept_wei = report.contract_eth_swept_wei.saturating_add(eth_bal);
                            report.txs_confirmed += 1;
                        }
                        Ok(other) => warn!("[{}] Vault ETH sweep skipped ({}): {:?}", self.config.chain_name, label, other),
                        Err(e) => warn!("[{}] Vault ETH sweep error ({}): {:?}", self.config.chain_name, label, e),
                    }
                }
            }

            // 1b. Non-ETH ERC-20 dust sitting on vault contract
            let vault_tokens = self.query_token_balances(&provider, contract_addr, &tokens, block).await;
            for (sym, token_addr, bal) in vault_tokens {
                if !has_rescue_to && !has_rescue {
                    warn!(
                        "[{}] Vault {:?} lacks rescueTokensTo/rescueTokens selectors; skipping {} ({})",
                        self.config.chain_name, contract_addr, sym, bal
                    );
                    report.skipped_tokens += 1;
                    continue;
                }
                if has_rescue_to {
                    let label_direct = format!("rescueTokensTo {} ({}) from {:?} -> {:?}", sym, bal, contract_addr, profit_recipient);
                    match self
                        .send_verified_sweep_tx(
                            &provider,
                            &client,
                            signer_address,
                            contract_addr,
                            encode_rescue_tokens_to_call(token_addr, profit_recipient),
                            &label_direct,
                        )
                        .await
                    {
                        Ok(SweepTxOutcome::Confirmed(_)) => {
                            report.contract_tokens_swept += 1;
                            report.txs_confirmed += 1;
                        }
                        Ok(other) => {
                            warn!("[{}] Vault token rescue skipped ({}): {:?}", self.config.chain_name, label_direct, other);
                            report.skipped_tokens += 1;
                        }
                        Err(e) => {
                            warn!("[{}] Vault token rescue error ({}): {:?}", self.config.chain_name, label_direct, e);
                            report.skipped_tokens += 1;
                        }
                    }
                } else {
                    // Legacy deployments only expose `rescueTokens(address)` which transfers to `owner()` (= signer_address).
                    // Run it first, then Phase 2 below forwards the balance from signer_address to `profit_recipient`.
                    let label_legacy = format!("rescueTokens {} ({}) from {:?} -> owner {:?}", sym, bal, contract_addr, signer_address);
                    match self
                        .send_verified_sweep_tx(
                            &provider,
                            &client,
                            signer_address,
                            contract_addr,
                            encode_rescue_tokens_call(token_addr),
                            &label_legacy,
                        )
                        .await
                    {
                        Ok(SweepTxOutcome::Confirmed(_)) => {
                            report.contract_tokens_swept += 1;
                            report.txs_confirmed += 1;
                        }
                        Ok(other) => {
                            warn!("[{}] Legacy vault token rescue skipped ({}): {:?}", self.config.chain_name, label_legacy, other);
                            report.skipped_tokens += 1;
                        }
                        Err(e) => {
                            warn!("[{}] Legacy vault token rescue error ({}): {:?}", self.config.chain_name, label_legacy, e);
                            report.skipped_tokens += 1;
                        }
                    }
                }
            }
        }

        // Phase 2: Gas Wallet (signer_address) — sweep all non-ETH ERC-20 dust (including anything just rescued via legacy rescueTokens).
        // Never sweep native ETH out of the gas wallet.
        if signer_address == profit_recipient {
            debug!(
                "[{}] Gas wallet {:?} matches FLASH_ARB_PROFIT_WALLET; skipping Phase 2 token transfer",
                self.config.chain_name, signer_address
            );
        } else {
            let latest_block = provider.get_block_number().await.map(|b| b.as_u64()).unwrap_or(block);
            let signer_tokens = self
                .query_token_balances(&provider, signer_address, &tokens, latest_block)
                .await;
            for (sym, token_addr, bal) in signer_tokens {
                let label = format!("gas-wallet transfer {} ({}) {:?} -> {:?}", sym, bal, signer_address, profit_recipient);
                match self
                    .send_verified_sweep_tx(
                        &provider,
                        &client,
                        signer_address,
                        token_addr,
                        encode_erc20_transfer_call(profit_recipient, bal),
                        &label,
                    )
                    .await
                {
                    Ok(SweepTxOutcome::Confirmed(_)) => {
                        report.gas_wallet_tokens_swept += 1;
                        report.txs_confirmed += 1;
                    }
                    Ok(other) => {
                        warn!("[{}] Gas-wallet token sweep skipped ({}): {:?}", self.config.chain_name, label, other);
                        report.skipped_tokens += 1;
                    }
                    Err(e) => {
                        warn!("[{}] Gas-wallet token sweep error ({}): {:?}", self.config.chain_name, label, e);
                        report.skipped_tokens += 1;
                    }
                }
            }
        }

        if report.txs_confirmed > 0 || report.skipped_tokens > 0 {
            info!(
                "[{}] Sweep summary: vault_eth={} wei, vault_tokens={}, gas_wallet_tokens={}, confirmed_txs={}, skipped={} -> {:?}",
                self.config.chain_name,
                report.contract_eth_swept_wei,
                report.contract_tokens_swept,
                report.gas_wallet_tokens_swept,
                report.txs_confirmed,
                report.skipped_tokens,
                profit_recipient
            );
        } else {
            debug!(
                "[{}] Sweep check complete: zero residual ETH or ERC-20 dust across vaults and gas wallet {:?}",
                self.config.chain_name, signer_address
            );
        }

        Ok(report)
    }

    /// Live only: re-check risk limits, sign with FLASH_ARB_SIGNER_KEY, broadcast, await receipt,
    /// and sweep any accumulated non-ETH token dust or residual vault ETH to FLASH_ARB_PROFIT_WALLET.
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

        let (profit_recipient, signer_address, provider, client) = self.build_signer_context()?;
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
                    if let Some((token_in, token_out, borrowed, net_profit, swept_to)) =
                        decode_arbitrage_swaps_executed(&receipt, contract_address)
                    {
                        info!(
                            "[{}] FlashArb CONFIRMED in block {} (gas {:?}) | tokenIn {:?} -> tokenOut {:?} | borrowed {} | on-chain profit {} swept to {:?} (modelled ${:.2})",
                            self.config.chain_name,
                            receipt.block_number.unwrap_or_default(),
                            receipt.gas_used.unwrap_or_default(),
                            token_in,
                            token_out,
                            borrowed,
                            net_profit,
                            swept_to,
                            opp.net_profit_usd
                        );
                    } else {
                        info!(
                            "[{}] FlashArb CONFIRMED in block {} (gas {:?}); modelled net profit ${:.2}",
                            self.config.chain_name,
                            receipt.block_number.unwrap_or_default(),
                            receipt.gas_used.unwrap_or_default(),
                            opp.net_profit_usd
                        );
                    }
                    self.risk_manager.record_success();

                    // Sweep any residual token dust / ETH across contracts and gas wallet -> FLASH_ARB_PROFIT_WALLET
                    if let Err(e) = self.sweep_all_dust().await {
                        warn!("[{}] Post-trade dust sweep failed: {:?}", self.config.chain_name, e);
                    }
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
