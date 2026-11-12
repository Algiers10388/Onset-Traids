// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPool, IPoolAddressesProvider, IFlashLoanSimpleReceiver} from "./interfaces/IAaveV3Pool.sol";
import {ISwapRouter} from "./interfaces/IUniswapV3.sol";
import {IUniswapV2Router02} from "./interfaces/IUniswapV2.sol";
import {ICurvePool} from "./interfaces/ICurvePool.sol";

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/**
 * @title FlashArb
 * @notice Production atomic DeFi Flash Loan Arbitrage Contract
 * @dev Integrates Aave V3 FlashLoanSimple, Uniswap V3, Uniswap V2 / Camelot, and Curve.
 *      Enforces strict revert condition: profit >= minProfit.
 *      Holds zero funds in storage; sweeps all net profits to owner immediately.
 */
contract FlashArb is IFlashLoanSimpleReceiver {
    // --- Custom Errors for Gas Efficiency ---
    error Unauthorized();
    error InvalidCaller();
    error InsufficientProfit(uint256 netProfit, uint256 minProfit);
    error UnsupportedDexProtocol(uint8 protocol);
    error ZeroAddress();
    error ExecutionFailed(string reason);

    // --- Enums ---
    enum DexProtocol {
        UNISWAP_V2,
        UNISWAP_V3,
        CURVE
    }

    // --- Structs ---
    struct SwapLeg {
        DexProtocol protocol;
        address routerOrPool; // Router for V2/V3, or direct Pool for Curve
        address tokenIn;
        address tokenOut;
        uint24 v3Fee;         // e.g. 500 (0.05%), 3000 (0.3%), 10000 (1%)
        int128 curveIndexIn;  // Token index for Curve
        int128 curveIndexOut; // Token index for Curve
    }

    struct ArbParams {
        uint256 minProfit;
        SwapLeg leg1;
        SwapLeg leg2;
        address profitRecipient;
    }

    // --- State Variables ---
    address public immutable owner;
    IPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    IPool public immutable override POOL;

    // --- Events ---
    event FlashArbExecuted(
        address indexed asset,
        uint256 loanAmount,
        uint256 premium,
        uint256 netProfit,
        address indexed recipient
    );

    event FundsRecovered(address indexed token, uint256 amount);

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyPool() {
        if (msg.sender != address(POOL)) revert InvalidCaller();
        _;
    }

    constructor(address _addressProvider) {
        if (_addressProvider == address(0)) revert ZeroAddress();
        owner = msg.sender;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(IPoolAddressesProvider(_addressProvider).getPool());
    }

    /**
     * @notice Initiates flash loan arbitrage
     * @param asset The base asset to borrow (e.g. WETH, USDC)
     * @param amount The loan principal amount
     * @param params Arbitrage execution parameters (swaps and min profit)
     */
    function executeFlashArb(
        address asset,
        uint256 amount,
        ArbParams calldata params
    ) external onlyOwner {
        bytes memory encodedParams = abi.encode(params);
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            encodedParams,
            0 // referralCode
        );
    }

    /**
     * @notice Aave V3 Flash Loan Callback
     * @dev Called atomically by Aave V3 POOL after transferring loan amount
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override onlyPool returns (bool) {
        if (initiator != address(this)) revert Unauthorized();

        ArbParams memory arb = abi.decode(params, (ArbParams));
        uint256 amountToRepay = amount + premium;

        // Step 1: Execute First Leg (Borrow Asset -> Intermediary Asset)
        uint256 intermediateBalance = _executeSwap(arb.leg1, amount);

        // Step 2: Execute Second Leg (Intermediary Asset -> Borrow Asset)
        uint256 finalBalance = _executeSwap(arb.leg2, intermediateBalance);

        // Step 3: Check Solvency & Minimum Profit Constraint
        if (finalBalance < amountToRepay) {
            revert InsufficientProfit(0, arb.minProfit);
        }

        uint256 grossProfit = finalBalance - amountToRepay;
        if (grossProfit < arb.minProfit) {
            revert InsufficientProfit(grossProfit, arb.minProfit);
        }

        // Step 4: Approve Aave Pool to pull loan principal + premium
        _safeApprove(asset, address(POOL), amountToRepay);

        // Step 5: Transfer Net Profit to designated recipient (owner/treasury)
        address recipient = arb.profitRecipient == address(0) ? owner : arb.profitRecipient;
        if (grossProfit > 0) {
            _safeTransfer(asset, recipient, grossProfit);
        }

        emit FlashArbExecuted(asset, amount, premium, grossProfit, recipient);
        return true;
    }

    /**
     * @dev Internal swap dispatcher across Uniswap V2, Uniswap V3, and Curve
     */
    function _executeSwap(SwapLeg memory leg, uint256 amountIn) internal returns (uint256 amountOut) {
        if (leg.protocol == DexProtocol.UNISWAP_V2) {
            amountOut = _swapUniswapV2(leg.routerOrPool, leg.tokenIn, leg.tokenOut, amountIn);
        } else if (leg.protocol == DexProtocol.UNISWAP_V3) {
            amountOut = _swapUniswapV3(leg.routerOrPool, leg.tokenIn, leg.tokenOut, leg.v3Fee, amountIn);
        } else if (leg.protocol == DexProtocol.CURVE) {
            amountOut = _swapCurve(leg.routerOrPool, leg.tokenIn, leg.curveIndexIn, leg.curveIndexOut, amountIn);
        } else {
            revert UnsupportedDexProtocol(uint8(leg.protocol));
        }
    }

    /**
     * @dev Uniswap V2 / Sushiswap / Camelot Swap
     */
    function _swapUniswapV2(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV2Router02(router).swapExactTokensForTokens(
            amountIn,
            0, // Min out checked at the end by overall minProfit check
            path,
            address(this),
            block.timestamp
        );
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    /**
     * @dev Uniswap V3 ExactInputSingle Swap
     */
    function _swapUniswapV3(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn
    ) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        return ISwapRouter(router).exactInputSingle(params);
    }

    /**
     * @dev Curve Pool exchange
     */
    function _swapCurve(
        address pool,
        address tokenIn,
        int128 i,
        int128 j,
        uint256 dx
    ) internal returns (uint256) {
        _safeApprove(tokenIn, pool, dx);
        return ICurvePool(pool).exchange(i, j, dx, 0);
    }

    // --- Safety Helpers ---
    function _safeApprove(address token, address spender, uint256 amount) internal {
        // Handle USDT non-standard approve (reset to 0 first if necessary)
        uint256 currentAllowance = IERC20(token).allowance(address(this), spender);
        if (currentAllowance > 0) {
            (bool success0, ) = token.call(abi.encodeWithSelector(IERC20.approve.selector, spender, 0));
            require(success0, "Approve reset failed");
        }
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SafeApprove failed");
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SafeTransfer failed");
    }

    /**
     * @notice Emergency sweep function - contract should hold 0 funds at all times
     */
    function recoverERC20(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            _safeTransfer(token, owner, balance);
            emit FundsRecovered(token, balance);
        }
    }

    receive() external payable {}
}
