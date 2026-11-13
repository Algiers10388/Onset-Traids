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

/// Calldata for FlashArbOptimized.executeDirectFlashArb(recipient) (sweeps native ETH from contract)
pub fn encode_direct_sweep_call(recipient: Address) -> Bytes {
    let mut data: Vec<u8> = sel("executeDirectFlashArb(address)");
    data.extend(ethers::abi::encode(&[Token::Address(recipient)]));
    Bytes::from(data)
}

/// Calldata for legacy FlashArbOptimized.rescueTokens(token) (sweeps token from contract to owner)
pub fn encode_rescue_tokens_call(token: Address) -> Bytes {
    let mut data: Vec<u8> = sel("rescueTokens(address)");
    data.extend(ethers::abi::encode(&[Token::Address(token)]));
    Bytes::from(data)
}

/// Calldata for FlashArbOptimized.rescueTokensTo(token, recipient) (sweeps token directly to profit wallet)
pub fn encode_rescue_tokens_to_call(token: Address, recipient: Address) -> Bytes {
    let mut data: Vec<u8> = sel("rescueTokensTo(address,address)");
    data.extend(ethers::abi::encode(&[Token::Address(token), Token::Address(recipient)]));
    Bytes::from(data)
}

/// Calldata for IERC20.balanceOf(account)
pub fn encode_erc20_balance_of_call(account: Address) -> Vec<u8> {
    let mut data = sel("balanceOf(address)");
    data.extend(ethers::abi::encode(&[Token::Address(account)]));
    data
}

/// Calldata for IERC20.transfer(recipient, amount)
pub fn encode_erc20_transfer_call(recipient: Address, amount: U256) -> Bytes {
    let mut data = sel("transfer(address,uint256)");
    data.extend(ethers::abi::encode(&[Token::Address(recipient), Token::Uint(amount)]));
    Bytes::from(data)
}

/// Decode a single ABI-encoded uint256 return word (e.g. from IERC20.balanceOf).
pub fn decode_erc20_u256(bytes: &[u8]) -> Option<U256> {
    if bytes.len() < 32 {
        return None;
    }
    let decoded = ethers::abi::decode(&[ParamType::Uint(256)], bytes).ok()?;
    decoded.into_iter().next().and_then(|t| t.into_uint())
}

/// Decode `ArbitrageSwapsExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountBorrowed, uint256 netProfitSwept, address indexed recipient)`.
pub fn decode_arbitrage_swaps_executed(
    receipt: &TransactionReceipt,
    contract: Address,
) -> Option<(Address, Address, U256, U256, Address)> {
    let topic0 = H256::from(ethers::utils::keccak256(
        "ArbitrageSwapsExecuted(address,address,uint256,uint256,address)",
    ));
    for log in &receipt.logs {
        if log.address != contract || log.topics.len() < 4 || log.topics[0] != topic0 {
            continue;
        }
        let Ok(vals) = ethers::abi::decode(&[ParamType::Uint(256), ParamType::Uint(256)], log.data.as_ref()) else {
            continue;
        };
        if vals.len() < 2 {
            continue;
        }
        let borrowed = tok_uint(&vals[0]);
        let profit = tok_uint(&vals[1]);
        let token_in = Address::from(log.topics[1]);
        let token_out = Address::from(log.topics[2]);
        let recipient = Address::from(log.topics[3]);
        return Some((token_in, token_out, borrowed, profit, recipient));
    }
    None
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweep_selectors_and_lengths_match_abi() {
        let addr: Address = "0x65602EB9e09B07002872E074004400d37e27CCB9".parse().unwrap();
        let tok: Address = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831".parse().unwrap();

        let direct = encode_direct_sweep_call(addr);
        assert_eq!(&direct[..4], &[0x78, 0x04, 0xd9, 0xac]);
        assert_eq!(direct.len(), 36);

        let rescue = encode_rescue_tokens_call(tok);
        assert_eq!(&rescue[..4], &[0x00, 0xae, 0x3b, 0xf8]);
        assert_eq!(rescue.len(), 36);

        let rescue_to = encode_rescue_tokens_to_call(tok, addr);
        assert_eq!(rescue_to.len(), 68);

        let bal = encode_erc20_balance_of_call(addr);
        assert_eq!(&bal[..4], &[0x70, 0xa0, 0x82, 0x31]);
        assert_eq!(bal.len(), 36);

        let xfer = encode_erc20_transfer_call(addr, U256::from(12345u64));
        assert_eq!(&xfer[..4], &[0xa9, 0x05, 0x9c, 0xbb]);
        assert_eq!(xfer.len(), 68);
    }

    #[test]
    fn decodes_erc20_uint256_and_arb_event() {
        let raw = ethers::abi::encode(&[Token::Uint(U256::from(987654321u64))]);
        assert_eq!(decode_erc20_u256(&raw), Some(U256::from(987654321u64)));
        assert_eq!(decode_erc20_u256(&[0u8; 4]), None);

        let contract: Address = "0xeee31ff9e69904b43c124095b6f33aa61505bcc2".parse().unwrap();
        let token_in: Address = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1".parse().unwrap();
        let token_out: Address = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831".parse().unwrap();
        let recipient: Address = "0x65602EB9e09B07002872E074004400d37e27CCB9".parse().unwrap();

        let topic0 = H256::from(ethers::utils::keccak256(
            "ArbitrageSwapsExecuted(address,address,uint256,uint256,address)",
        ));
        let mut receipt = TransactionReceipt::default();
        let mut log = Log::default();
        log.address = contract;
        log.topics = vec![topic0, token_in.into(), token_out.into(), recipient.into()];
        log.data = Bytes::from(ethers::abi::encode(&[
            Token::Uint(U256::from(10_000_000_000u64)),
            Token::Uint(U256::from(42_000_000u64)),
        ]));
        receipt.logs.push(log);

        let decoded = decode_arbitrage_swaps_executed(&receipt, contract).expect("event decoded");
        assert_eq!(decoded.0, token_in);
        assert_eq!(decoded.1, token_out);
        assert_eq!(decoded.2, U256::from(10_000_000_000u64));
        assert_eq!(decoded.3, U256::from(42_000_000u64));
        assert_eq!(decoded.4, recipient);
    }
}
