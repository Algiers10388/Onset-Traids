//! Small, dependency-light EVM helpers: raw eth_call + ABI decode, number conversions, calldata encoding.
use crate::routes::ArbitrageOpportunity;
use ethers::abi::{ParamType, Token};
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;

/// eth_call `to.sig(args)` and decode the return data as `outs`.
pub async fn call_decode(
    provider: &Provider<Http>,
    to: Address,
    sig: &str,
    args: &[Token],
    outs: &[ParamType],
) -> eyre::Result<Vec<Token>> {
    let mut data: Vec<u8> = ethers::utils::id(sig).to_vec();
    data.extend(ethers::abi::encode(args));
    let tx: TypedTransaction = TransactionRequest::new().to(to).data(Bytes::from(data)).into();
    let out = provider.call(&tx, None).await?;
    let tokens = ethers::abi::decode(outs, out.as_ref())?;
    Ok(tokens)
}

pub fn tok_uint(t: &Token) -> U256 {
    t.clone().into_uint().unwrap_or_default()
}

/// Lossy but panic-free (U256::as_u128 panics on overflow).
pub fn u256_to_f64(v: U256) -> f64 {
    v.0.iter().rev().fold(0.0f64, |acc, limb| acc * 18446744073709551616.0 + (*limb as f64))
}

pub fn f64_to_u256(x: f64) -> U256 {
    if !x.is_finite() || x <= 0.0 {
        return U256::zero();
    }
    U256::from(x.min(3.0e38) as u128)
}

/// 1 = UniV3 -> V2, 2 = V2 -> UniV3, 3 = UniV3 -> UniV3, 4 = V2 -> V2 (matches FlashArbOptimized.sol)
pub fn route_type(opp: &ArbitrageOpportunity) -> u8 {
    match (opp.buy_is_v3, opp.sell_is_v3) {
        (true, false) => 1,
        (false, true) => 2,
        (true, true) => 3,
        (false, false) => 4,
    }
}

/// On-chain minimum profit guard, in units of the borrowed token: half of the modelled profit, never 0.
pub fn min_profit_onchain(opp: &ArbitrageOpportunity) -> U256 {
    let half = opp.expected_gross_profit / U256::from(2u64);
    if half.is_zero() {
        U256::one()
    } else {
        half
    }
}

/// Calldata for FlashArbOptimized.executeOptimizedArbitrage(...)
pub fn encode_execute_call(opp: &ArbitrageOpportunity, recipient: Address) -> Bytes {
    let sig = "executeOptimizedArbitrage(address,address,uint256,address,address,uint24,uint24,uint8,uint256,address)";
    let fee_a = if opp.buy_is_v3 { opp.buy_fee_ppm } else { 0 };
    let fee_b = if opp.sell_is_v3 { opp.sell_fee_ppm } else { 0 };
    let mut data: Vec<u8> = ethers::utils::id(sig).to_vec();
    data.extend(ethers::abi::encode(&[
        Token::Address(opp.borrowed_asset),
        Token::Address(opp.intermediate_asset),
        Token::Uint(opp.optimal_loan_amount),
        Token::Address(opp.buy_router),
        Token::Address(opp.sell_router),
        Token::Uint(U256::from(fee_a)),
        Token::Uint(U256::from(fee_b)),
        Token::Uint(U256::from(route_type(opp))),
        Token::Uint(min_profit_onchain(opp)),
        Token::Address(recipient),
    ]));
    Bytes::from(data)
}

pub fn sel(sig: &str) -> Vec<u8> {
    ethers::utils::id(sig).to_vec()
}

/// Multicall3 (same address on every EVM chain we support)
const MULTICALL3: &str = "0xcA11bde05977b3631167028862bE2a173976CA11";

/// Batch many read-only calls into ONE eth_call (Multicall3.aggregate3, allowFailure = true).
/// Returns, per call, Some(returndata) on success or None if that call reverted. State is read at `block`
/// (falls back to "latest" if the RPC node behind a load balancer doesn't have that block yet).
pub async fn multicall(
    provider: &Provider<Http>,
    calls: &[(Address, Vec<u8>)],
    block: u64,
) -> eyre::Result<Vec<Option<Vec<u8>>>> {
    if calls.is_empty() {
        return Ok(vec![]);
    }
    let mc: Address = MULTICALL3.parse()?;
    let items: Vec<Token> = calls
        .iter()
        .map(|(t, d)| Token::Tuple(vec![Token::Address(*t), Token::Bool(true), Token::Bytes(d.clone())]))
        .collect();
    let mut data = sel("aggregate3((address,bool,bytes)[])");
    data.extend(ethers::abi::encode(&[Token::Array(items)]));
    let tx: TypedTransaction = TransactionRequest::new().to(mc).data(Bytes::from(data)).into();

    let at_block = BlockId::Number(BlockNumber::Number(block.into()));
    let out = match provider.call(&tx, Some(at_block)).await {
        Ok(o) => o,
        Err(_) => provider.call(&tx, None).await?,
    };

    let ty = ParamType::Array(Box::new(ParamType::Tuple(vec![ParamType::Bool, ParamType::Bytes])));
    let decoded = ethers::abi::decode(&[ty], out.as_ref())?;
    let arr = decoded
        .into_iter()
        .next()
        .and_then(|t| t.into_array())
        .ok_or_else(|| eyre::eyre!("unexpected multicall return data"))?;
    Ok(arr
        .into_iter()
        .map(|t| {
            let tup = t.into_tuple()?;
            let ok = tup.get(0)?.clone().into_bool()?;
            if !ok {
                return None;
            }
            tup.get(1)?.clone().into_bytes()
        })
        .collect())
}
