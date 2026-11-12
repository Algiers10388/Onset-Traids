use crate::config::RiskConfig;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{error, warn};

fn today() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() / 86_400).unwrap_or(0)
}

#[derive(Debug, Clone)]
pub struct RiskManager {
    pub config: RiskConfig,
    pub consecutive_reverts: Arc<AtomicU32>,
    pub circuit_breaker_tripped: Arc<AtomicBool>,
    pub daily_gas_loss_usd: Arc<RwLock<f64>>,
    day: Arc<AtomicU64>,
}

impl RiskManager {
    pub fn new(config: RiskConfig) -> Self {
        Self {
            config,
            consecutive_reverts: Arc::new(AtomicU32::new(0)),
            circuit_breaker_tripped: Arc::new(AtomicBool::new(false)),
            daily_gas_loss_usd: Arc::new(RwLock::new(0.0)),
            day: Arc::new(AtomicU64::new(today())),
        }
    }

    /// "Daily" caps really are daily: reset the loss counter at 00:00 UTC. A breaker tripped by the
    /// consecutive-failure limit stays tripped until reset manually (restart) so a bad day isn't silently retried.
    async fn roll_day(&self) {
        let t = today();
        if self.day.swap(t, Ordering::SeqCst) != t {
            *self.daily_gas_loss_usd.write().await = 0.0;
            if self.consecutive_reverts.load(Ordering::SeqCst) < self.config.consecutive_failure_limit {
                self.circuit_breaker_tripped.store(false, Ordering::SeqCst);
            }
        }
    }

    /// Pre-execution safety check
    pub async fn can_execute(&self, token_address: &str, gas_units: u64) -> Result<(), &'static str> {
        self.roll_day().await;

        if self.circuit_breaker_tripped.load(Ordering::SeqCst) {
            return Err("Circuit breaker is TRIPPED (consecutive reverts or daily loss cap)");
        }

        let clean_addr = token_address.to_lowercase();
        for excluded in &self.config.excluded_tokens {
            if excluded.to_lowercase() == clean_addr {
                return Err("Token is in the excluded/rebasing/fee-on-transfer blacklist");
            }
        }

        if gas_units > self.config.max_gas_per_tx {
            return Err("Estimated gas units exceed max_gas_per_tx limit");
        }

        let daily_loss = *self.daily_gas_loss_usd.read().await;
        if daily_loss >= self.config.daily_revert_loss_cap_usd {
            self.circuit_breaker_tripped.store(true, Ordering::SeqCst);
            return Err("Daily revert gas loss cap exceeded. Kill switch engaged.");
        }

        Ok(())
    }

    pub fn record_success(&self) {
        self.consecutive_reverts.store(0, Ordering::SeqCst);
    }

    pub async fn record_revert(&self, gas_spent_usd: f64) {
        self.roll_day().await;
        let fails = self.consecutive_reverts.fetch_add(1, Ordering::SeqCst) + 1;
        warn!("Recorded on-chain revert #{}. Gas lost: ${:.2}", fails, gas_spent_usd);

        let mut daily_loss = self.daily_gas_loss_usd.write().await;
        *daily_loss += gas_spent_usd;

        if fails >= self.config.consecutive_failure_limit {
            error!("CIRCUIT BREAKER TRIPPED! {} consecutive reverts. Halting automated execution.", fails);
            self.circuit_breaker_tripped.store(true, Ordering::SeqCst);
        }

        if *daily_loss >= self.config.daily_revert_loss_cap_usd {
            error!(
                "DAILY LOSS CAP REACHED! Gas lost: ${:.2} (limit ${:.2}). Halting.",
                *daily_loss, self.config.daily_revert_loss_cap_usd
            );
            self.circuit_breaker_tripped.store(true, Ordering::SeqCst);
        }
    }

    #[allow(dead_code)]
    pub fn reset_circuit_breaker(&self) {
        self.consecutive_reverts.store(0, Ordering::SeqCst);
        self.circuit_breaker_tripped.store(false, Ordering::SeqCst);
    }
}
