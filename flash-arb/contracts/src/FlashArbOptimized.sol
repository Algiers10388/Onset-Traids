// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FlashArbOptimized
 * @notice Owner-operated two-leg flash loan arbitrage executor using Balancer V2 (0% fee) flash loans.
 * @dev Security model:
 *  - Every entrypoint that starts a flash loan is `onlyOwner`.
 *  - The Balancer callback only proceeds if (a) msg.sender is the Vault and (b) the userData it receives
 *    hashes to a commitment stored in transient storage by an owner-initiated call in the SAME transaction.
 *    Nobody can start a flash loan "into" this contract with their own recipient/minProfit.
 *  - The commitment slot also acts as the reentrancy lock (EIP-1153, Cancun).
 *  - Profit is enforced on-chain: the whole transaction reverts unless balance after swaps >= repayment + minProfit.
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

// Balancer V2 Vault flash loan interface (0.00% fee while the protocol fee is zero)
interface IBalancerVault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

// Uniswap V3 SwapRouter (v1, has `deadline`): Arbitrum 0xE592...1564, Ethereum, Polygon
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

// Uniswap V3 SwapRouter02 (NO `deadline`): Base 0x2626...e481, Optimism 0x68b3...Fc45
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

// Uniswap V2 / Camelot V2 / Sushiswap router
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract FlashArbOptimized is IFlashLoanRecipient {
    error Unauthorized();
    error InsufficientProfit(uint256 actual, uint256 required);
    error ReentrancyGuardLocked();
    error SwapExecutionFailed(string reason);
    error InvalidRoute();
    error MinProfitRequired();

    // Transient storage slot: holds keccak256(userData) while an owner-initiated flash loan is in flight (0 = idle)
    uint256 private constant TRANSIENT_LOCK_SLOT = 0xd7d8d2a518f8b8aadb97f139f4366cba00bf3d0e49aac2ebd368f55d7656b300;

    /**
     * routeType: 1 = UniV3 -> V2, 2 = V2 -> UniV3, 3 = UniV3 -> UniV3, 4 = V2 -> V2
     * Leg 1 swaps tokenIn -> tokenOut on routerA (fee feeA); leg 2 swaps tokenOut -> tokenIn on routerB (fee feeB).
     * Layout is 9 static words (288 bytes) when ABI-encoded.
     */
    struct SwapRouteParams {
        uint8 routeType;
        address routerA;
        address routerB;
        address tokenIn;
        address tokenOut;
        uint24 feeA;
        uint24 feeB;
        uint256 minProfit;
        address recipient;
    }

    address public immutable owner;
    IBalancerVault public immutable BALANCER_VAULT;
    address public immutable AAVE_POOL; // kept for deploy-ABI compatibility; Aave is not used by this contract

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    event ArbitrageBroadcast(address indexed caller, address indexed recipient, uint256 value);
    event FlashLoanReceived(address indexed token, uint256 amount, uint256 fee, address indexed recipient);
    event ArbitrageSwapsExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountBorrowed,
        uint256 netProfitSwept,
        address indexed recipient
    );

    constructor(address _balancerVault, address _aavePool) {
        owner = msg.sender;
        BALANCER_VAULT = IBalancerVault(_balancerVault);
        AAVE_POOL = _aavePool;
    }

    // ------------------------------------------------------------------------------------------------
    // Entrypoints (owner only)
    // ------------------------------------------------------------------------------------------------

    /// @notice Start a flash loan with ABI-encoded `SwapRouteParams` as `routingParams`.
    function executeBalancerFlashArb(
        address token,
        uint256 amount,
        bytes calldata routingParams
    ) external onlyOwner {
        _startFlash(token, amount, routingParams);
    }

    /// @notice Typed entrypoint (this is what the Rust searcher calls).
    function executeOptimizedArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        address routerA,
        address routerB,
        uint24 feeA,
        uint24 feeB,
        uint8 routeType,
        uint256 minProfit,
        address recipient
    ) external onlyOwner {
        if (minProfit == 0) revert MinProfitRequired();
        SwapRouteParams memory route = SwapRouteParams({
            routeType: routeType,
            routerA: routerA,
            routerB: routerB,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            feeA: feeA,
            feeB: feeB,
            minProfit: minProfit,
            recipient: recipient
        });
        _startFlash(tokenIn, amount, abi.encode(route));
    }

    /**
     * @notice Sweeps this contract's native ETH balance to `recipient`. It does NOT perform an arbitrage.
     * @dev Selector kept (0x7804d9ac) because the server/dashboard already calls it. Owner only: it used to be callable by anyone.
     */
    function executeDirectFlashArb(address recipient) external payable onlyOwner returns (bool) {
        uint256 bal = address(this).balance;
        if (bal > 0 && recipient != address(0)) {
            (bool ok, ) = payable(recipient).call{value: bal}("");
            if (!ok) revert SwapExecutionFailed("ETH sweep failed");
        }
        emit ArbitrageBroadcast(msg.sender, recipient, msg.value);
        return true;
    }

    function rescueTokens(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) _safeTransfer(token, owner, bal);
    }

    function rescueTokensTo(address token, address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidRoute();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) _safeTransfer(token, recipient, bal);
    }

    // ------------------------------------------------------------------------------------------------
    // Flash loan plumbing
    // ------------------------------------------------------------------------------------------------

    function _startFlash(address token, uint256 amount, bytes memory userData) internal {
        uint256 locked;
        assembly {
            locked := tload(TRANSIENT_LOCK_SLOT)
        }
        if (locked != 0) revert ReentrancyGuardLocked();

        uint256 commitment = uint256(keccak256(userData));
        assembly {
            tstore(TRANSIENT_LOCK_SLOT, commitment)
        }

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        BALANCER_VAULT.flashLoan(address(this), tokens, amounts, userData);

        assembly {
            tstore(TRANSIENT_LOCK_SLOT, 0)
        }
    }

    /// @notice Balancer V2 flash loan callback.
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        if (msg.sender != address(BALANCER_VAULT)) revert Unauthorized();

        // Only proceed for a loan this contract's owner started in this very transaction, with exactly these params.
        uint256 commitment;
        assembly {
            commitment := tload(TRANSIENT_LOCK_SLOT)
        }
        if (commitment == 0 || commitment != uint256(keccak256(userData))) revert Unauthorized();
        if (tokens.length != 1 || amounts.length != 1 || feeAmounts.length != 1) revert InvalidRoute();

        SwapRouteParams memory route = abi.decode(userData, (SwapRouteParams));
        address asset = address(tokens[0]);
        uint256 borrowed = amounts[0];
        uint256 amountToRepay = borrowed + feeAmounts[0];

        if (
            route.routeType < 1 || route.routeType > 4 || route.tokenIn != asset || route.tokenOut == address(0)
                || route.tokenOut == asset || route.routerA == address(0) || route.routerB == address(0)
        ) revert InvalidRoute();
        if (route.minProfit == 0) revert MinProfitRequired();
        if (route.recipient == address(0)) route.recipient = owner;

        _executeTwoLegArb(route, borrowed);

        uint256 endingBalance = IERC20(asset).balanceOf(address(this));
        if (endingBalance < amountToRepay) revert InsufficientProfit(0, route.minProfit);
        uint256 netProfit = endingBalance - amountToRepay;
        if (netProfit < route.minProfit) revert InsufficientProfit(netProfit, route.minProfit);

        // Repay the Vault first, then sweep 100% of the profit.
        _safeTransfer(asset, address(BALANCER_VAULT), amountToRepay);
        _safeTransfer(asset, route.recipient, netProfit);

        emit ArbitrageSwapsExecuted(asset, route.tokenOut, borrowed, netProfit, route.recipient);
        emit FlashLoanReceived(asset, borrowed, feeAmounts[0], route.recipient);
    }

    // ------------------------------------------------------------------------------------------------
    // Swaps
    // ------------------------------------------------------------------------------------------------

    function _executeTwoLegArb(SwapRouteParams memory r, uint256 amountIn) internal {
        uint256 mid;
        if (r.routeType == 1 || r.routeType == 3) {
            mid = _swapV3(r.routerA, r.tokenIn, r.tokenOut, r.feeA > 0 ? r.feeA : 3000, amountIn);
        } else {
            mid = _swapV2(r.routerA, r.tokenIn, r.tokenOut, amountIn);
        }
        if (mid == 0) revert SwapExecutionFailed("Leg 1 produced 0 output");

        if (r.routeType == 2 || r.routeType == 3) {
            _swapV3(r.routerB, r.tokenOut, r.tokenIn, r.feeB > 0 ? r.feeB : 3000, mid);
        } else {
            _swapV2(r.routerB, r.tokenOut, r.tokenIn, mid);
        }
    }

    function _swapV2(address router, address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), block.timestamp + 300);
        return IERC20(tokenOut).balanceOf(address(this)) - balBefore;
    }

    /// @dev Tries the SwapRouter (v1) call first and falls back to the SwapRouter02 layout, so one build works on all chains.
    function _swapV3(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn
    ) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);

        ISwapRouter.ExactInputSingleParams memory p1 = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        (bool ok, bytes memory ret) = router.call(abi.encodeWithSelector(ISwapRouter.exactInputSingle.selector, p1));

        if (!ok) {
            ISwapRouter02.ExactInputSingleParams memory p2 = ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            (ok, ret) = router.call(abi.encodeWithSelector(ISwapRouter02.exactInputSingle.selector, p2));
            if (!ok) _bubble(ret);
        }
        return abi.decode(ret, (uint256));
    }

    function _bubble(bytes memory ret) private pure {
        if (ret.length == 0) revert SwapExecutionFailed("V3 swap failed");
        assembly {
            revert(add(ret, 32), mload(ret))
        }
    }

    // ------------------------------------------------------------------------------------------------
    // Token helpers (USDT-style tokens that return nothing are supported)
    // ------------------------------------------------------------------------------------------------

    function _safeApprove(address token, address spender, uint256 amount) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            _callOptionalReturn(token, abi.encodeWithSelector(IERC20.approve.selector, spender, uint256(0)));
        }
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20.approve.selector, spender, amount));
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        if (token.code.length == 0) revert SwapExecutionFailed("not a contract");
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert SwapExecutionFailed("token call failed");
    }

    receive() external payable {}
}
