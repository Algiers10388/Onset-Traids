// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Adapter {
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IAlgebraSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 limitSqrtPrice;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @title CamelotV3SwapAdapter
 * @notice Stateless, zero-custody ISwapRouter v1 shim for Camelot V3 (Algebra V1.9) on Arbitrum One.
 * @dev Lets an already-deployed FlashArbOptimized contract (which only speaks ISwapRouter / ISwapRouter02)
 *      execute atomic swaps against Camelot V3 without redeploying the flash-loan vault contract.
 */
contract CamelotV3SwapAdapter {
    error AdapterCallFailed(string reason);

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee; // Ignored by Algebra (dynamic fee); kept for ISwapRouter ABI compatibility
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    address public immutable camelotRouter;

    constructor(address _camelotRouter) {
        if (_camelotRouter == address(0)) revert AdapterCallFailed("zero router");
        camelotRouter = _camelotRouter;
    }

    /// @dev Matches ISwapRouter.exactInputSingle selector (0x414bf389)
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (params.amountIn == 0) revert AdapterCallFailed("zero amountIn");

        _safeTransferFrom(params.tokenIn, msg.sender, address(this), params.amountIn);
        _safeApprove(params.tokenIn, camelotRouter, params.amountIn);

        IAlgebraSwapRouter.ExactInputSingleParams memory alg = IAlgebraSwapRouter.ExactInputSingleParams({
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            recipient: params.recipient,
            deadline: params.deadline,
            amountIn: params.amountIn,
            amountOutMinimum: params.amountOutMinimum,
            limitSqrtPrice: params.sqrtPriceLimitX96
        });

        amountOut = IAlgebraSwapRouter(camelotRouter).exactInputSingle(alg);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20Adapter.transferFrom.selector, from, to, amount));
    }

    function _safeApprove(address token, address spender, uint256 amount) private {
        if (IERC20Adapter(token).allowance(address(this), spender) != 0) {
            _callOptionalReturn(token, abi.encodeWithSelector(IERC20Adapter.approve.selector, spender, uint256(0)));
        }
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20Adapter.approve.selector, spender, amount));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        if (token.code.length == 0) revert AdapterCallFailed("not a contract");
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) {
            revert AdapterCallFailed("token call failed");
        }
    }
}
