use clap::Parser;
use ethers::prelude::*;
use std::path::PathBuf;
use std::time::Duration;
use tokio::signal;
use tracing::{debug, error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod evm;
mod executor;
mod monitor;
mod risk;
mod routes;
mod sim;

use config::{is_zero_address, ChainConfig};
use executor::TxExecutor;
use monitor::PriceMonitor;
use risk::RiskManager;
use routes::{PriceContext, RouteFinder};
use sim::Simulator;

#[derive(Parser, Debug)]
#[command(name = "flash-arb-searcher")]
#[command(about = "Multi-chain flash loan arbitrage searcher (reads real pool state, verifies with eth_call)", long_about = None)]
struct Args {
    /// Comma-separated list of chains to run (e.g. "arbitrum,base,optimism")
    #[arg(short, long, default_value = "arbitrum,base,optimism")]
    chains: String,

    /// Config directory path
    #[arg(long, default_value = "config")]
    config_dir: PathBuf,

    /// Minimum milliseconds between block polls (public RPCs rate-limit; use your own node to go lower)
    #[arg(long, default_value_t = 2000)]
    scan_ms: u64,
}

#[tokio::main]
async fn main() -> eyre::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,flash_arb_searcher=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();
    info!("flash-arb searcher starting (LIVE broadcasting only; no paper/dry-run mode)");

    let mut tasks = Vec::new();
    for chain in args.chains.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let config_file = args.config_dir.join(format!("{}.toml", chain));
        if !config_file.exists() {
            error!("Config file not found for chain: {:?}", config_file);
            continue;
        }

        let config = ChainConfig::load_from_file(&config_file)?;
        if is_zero_address(&config.flash_arb_contract) {
            error!("[{}] flash_arb_contract is not set: skipping chain (live-only; deploy with `npm run deploy:flash-arb` first)", config.chain_name);
            continue;
        }
        if std::env::var("FLASH_ARB_SIGNER_KEY").map(|k| k.trim().is_empty()).unwrap_or(true) {
            eyre::bail!("FLASH_ARB_SIGNER_KEY is not set (live-only searcher)");
        }
        if std::env::var("FLASH_ARB_PROFIT_WALLET").ok().and_then(|w| crate::config::parse_addr(&w)).is_none() {
            eyre::bail!("FLASH_ARB_PROFIT_WALLET is not set or not a valid address (live-only searcher)");
        }

        info!("Spawning LIVE worker for {} (chain id {})", config.chain_name, config.chain_id);
        let scan_ms = args.scan_ms;
        // Risk state lives outside the retry loop so a worker restart can never clear a tripped circuit breaker.
        let risk_manager = RiskManager::new(config.risk.clone());
        tasks.push(tokio::spawn(async move {
            let mut backoff: u64 = 5;
            loop {
                match run_chain_worker(config.clone(), scan_ms, risk_manager.clone()).await {
                    Ok(()) => break,
                    Err(e) => {
                        error!("[{}] worker failed: {:?}. Restarting in {}s", config.chain_name, e, backoff);
                        tokio::time::sleep(Duration::from_secs(backoff)).await;
                        backoff = (backoff * 2).min(300);
                    }
                }
            }
        }));
    }

    if tasks.is_empty() {
        eyre::bail!("no chain workers started (check --chains and --config-dir)");
    }

    tokio::select! {
        _ = signal::ctrl_c() => info!("Ctrl+C received. Exiting."),
        _ = futures_util::future::join_all(tasks) => error!("All chain workers exited."),
    }
    Ok(())
}

async fn run_chain_worker(config: ChainConfig, scan_ms: u64, risk_manager: RiskManager) -> eyre::Result<()> {
    let chain = config.chain_name.clone();
    let monitor = PriceMonitor::new(config.clone())?;
    let route_finder = RouteFinder::new(config.clone());
    let simulator = Simulator::new(config.clone())?;
    let executor = TxExecutor::new(config.clone(), risk_manager.clone());

    monitor.load_decimals().await;
    monitor.discover().await;
    if monitor.pools.len() < 2 {
        eyre::bail!("[{}] fewer than 2 pools discovered; check rpc_http / factory addresses", chain);
    }

    let mut interval = tokio::time::interval(Duration::from_millis(scan_ms.max(250)));
    let mut last_block: u64 = 0;
    let mut scans: u64 = 0;

    loop {
        interval.tick().await;

        let block = match monitor.provider.get_block_number().await {
            Ok(b) => b.as_u64(),
            Err(e) => {
                warn!("[{}] get_block_number failed: {}", chain, e);
                continue;
            }
        };
        if block == last_block {
            continue;
        }
        last_block = block;
        *monitor.latest_block.write().await = block;
        scans += 1;

        monitor.refresh_all(block).await;

        let Some(eth_price) = monitor.eth_price_usd() else {
            warn!("[{}] no ETH/USD price from on-chain WETH/USDC pools this block; skipping", chain);
            continue;
        };
        let gas_price_wei = match monitor.provider.get_gas_price().await {
            Ok(g) => g,
            Err(e) => {
                warn!("[{}] get_gas_price failed: {}", chain, e);
                continue;
            }
        };

        let tokens = monitor.tradable_tokens();
        let mut executed = false;

        'scan: for base_sym in ["WETH", "USDC"] {
            let Some(base) = monitor.token(base_sym) else { continue };
            let Some(base_decimals) = monitor.dec(base) else { continue };
            let ctx = PriceContext {
                base_decimals,
                base_price_usd: if base_sym == "WETH" { eth_price } else { 1.0 },
                eth_price_usd: eth_price,
                gas_price_wei,
            };

            for (other_sym, other) in &tokens {
                if *other == base {
                    continue;
                }
                let pools = monitor.pools_for_pair(base, *other, block);
                if pools.len() < 2 {
                    continue;
                }
                // Try the model-optimal size first, then smaller loans if the real simulation rejects it.
                for size_factor in [1.0, 0.5, 0.25] {
                    let Some(opp) = route_finder.find_best(base, base_sym, *other, other_sym, &pools, &ctx, size_factor) else {
                        break;
                    };
                    info!(
                        "[{}] candidate {}/{} (x{}): {} -> {} | spread {:.1} bps | loan {} | model net ${:.2}",
                        chain, opp.asset_symbol, opp.intermediate_symbol, size_factor, opp.buy_dex, opp.sell_dex,
                        opp.spread_bps, opp.optimal_loan_amount, opp.net_profit_usd
                    );

                    match simulator.simulate_opportunity(&opp).await {
                        Ok(sim) if sim.success => {
                            info!("[{}] eth_call simulation OK (gas {})", chain, sim.gas_used);
                            if let Err(e) = executor.execute(&opp, &sim).await {
                                error!("[{}] execution error: {:?}", chain, e);
                            }
                            executed = true;
                            break 'scan; // one tx per block per chain (nonce safety)
                        }
                        Ok(sim) => {
                            if !sim.verified {
                                // Cannot verify against the deployed contract: never broadcast unverified.
                                warn!("[{}] simulation could not be verified against the deployed contract; skipping", chain);
                                break;
                            }
                            debug!("[{}] simulation rejected at x{}: {:?}", chain, size_factor, sim.error_message);
                        }
                        Err(e) => {
                            warn!("[{}] simulation error: {:?}", chain, e);
                            break;
                        }
                    }
                }
            }
        }

        if scans % 15 == 0 {
            let loss = *risk_manager.daily_gas_loss_usd.read().await;
            info!(
                "[{}] heartbeat | block #{} | ETH ${:.2} | pools {} | gas lost today ${:.2} | traded this block: {}",
                chain, block, eth_price, monitor.pools.len(), loss, executed
            );
        }
    }
}
