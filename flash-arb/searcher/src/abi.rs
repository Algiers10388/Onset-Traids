use ethers::prelude::*;

// ==============================================================================
// Strongly-Typed ABI Bindings for EVM Arbitrage Execution
// Generated via ethers-rs abigen! macro & native contract wrappers
// ==============================================================================

// 1. FlashArb Execution Contract
abigen!(
    FlashArbContract,
    r#"[
        function executeFlashArb(address asset, uint256 amount, tuple(uint256 minProfit, tuple(uint8 protocol, address routerOrPool, address tokenIn, address tokenOut, uint24 v3Fee, int128 curveIndexIn, int128 curveIndexOut) leg1, tuple(uint8 protocol, address routerOrPool, address tokenIn, address tokenOut, uint24 v3Fee, int128 curveIndexIn, int128 curveIndexOut) leg2, address profitRecipient) params) external
        function recoverERC20(address token) external
        function owner() external view returns (address)
        function POOL() external view returns (address)
        event FlashArbExecuted(address indexed asset, uint256 loanAmount, uint256 premium, uint256 netProfit, address indexed recipient)
    ]"#
);

// 2. Aave V3 Pool Interface
abigen!(
    AaveV3PoolContract,
    r#"[
        function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external
        function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128)
    ]"#
);

// 3. Uniswap V3 Pool Interface (Tick math & Slot0)
abigen!(
    UniswapV3PoolContract,
    r#"[
        function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)
        function liquidity() external view returns (uint128)
        function token0() external view returns (address)
        function token1() external view returns (address)
        function fee() external view returns (uint24)
        event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    ]"#
);

// 4. Uniswap V2 / Sushiswap / Camelot Pair
abigen!(
    UniswapV2PairContract,
    r#"[
        function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
        function token0() external view returns (address)
        function token1() external view returns (address)
        event Sync(uint112 reserve0, uint112 reserve1)
        event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
    ]"#
);

// 5. Curve 2-Pool / 3-Pool Exchange Interface
abigen!(
    CurvePoolContract,
    r#"[
        function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256)
        function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)
    ]"#
);

// 6. ERC-20 Token Interface
abigen!(
    ERC20TokenContract,
    r#"[
        function balanceOf(address account) external view returns (uint256)
        function decimals() external view returns (uint8)
        function symbol() external view returns (string)
        function approve(address spender, uint256 amount) external returns (bool)
        function transfer(address recipient, uint256 amount) external returns (bool)
    ]"#
);
