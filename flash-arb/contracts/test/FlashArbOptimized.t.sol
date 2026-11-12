// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Offline unit tests (no fork needed): mock Balancer vault, mock V2 routers, mock tokens.
// Run: forge test --match-path test/FlashArbOptimized.t.sol -vvv

import {FlashArbOptimized, IERC20} from "../src/FlashArbOptimized.sol";

interface VmLike {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
}

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function transfer(address to, uint256 amt) external returns (bool) {
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

contract MockVault {
    function flashLoan(address recipient, IERC20[] memory tokens, uint256[] memory amounts, bytes memory userData) external {
        uint256 before = tokens[0].balanceOf(address(this));
        tokens[0].transfer(recipient, amounts[0]);
        uint256[] memory fees = new uint256[](1);
        (bool ok, bytes memory ret) = recipient.call(
            abi.encodeWithSignature("receiveFlashLoan(address[],uint256[],uint256[],bytes)", _toAddrs(tokens), amounts, fees, userData)
        );
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
        require(tokens[0].balanceOf(address(this)) >= before, "vault not repaid");
    }

    function _toAddrs(IERC20[] memory t) internal pure returns (address[] memory a) {
        a = new address[](t.length);
        for (uint256 i; i < t.length; i++) a[i] = address(t[i]);
    }
}

contract MockV2Router {
    uint256 public num;
    uint256 public den;

    constructor(uint256 n, uint256 d) { num = n; den = d; }

    function swapExactTokensForTokens(uint256 amountIn, uint256, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        MockToken(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = (amountIn * num) / den;
        MockToken(path[1]).transfer(to, out);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

contract FlashArbOptimizedTest {
    VmLike internal constant vm = VmLike(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal owner = address(0xA11CE);
    address internal stranger = address(0xBAD);
    address internal recipient = address(0xFEED);

    MockToken internal tokA; // borrowed asset (e.g. WETH)
    MockToken internal tokB; // intermediate (e.g. USDC)
    MockVault internal vault;
    FlashArbOptimized internal arb;

    function _setUp(uint256 rateBNum, uint256 rateBDen) internal returns (MockV2Router rA, MockV2Router rB) {
        tokA = new MockToken();
        tokB = new MockToken();
        vault = new MockVault();
        rA = new MockV2Router(2, 1);                 // A -> B at 2.00
        rB = new MockV2Router(rateBNum, rateBDen);   // B -> A at rateB
        tokA.mint(address(vault), 1_000 ether);
        tokB.mint(address(rA), 10_000 ether);
        tokA.mint(address(rB), 10_000 ether);
        vm.prank(owner);
        arb = new FlashArbOptimized(address(vault), address(0));
    }

    function test_ProfitableLoopSweepsProfit() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100); // 100 A -> 200 B -> 102 A  => +2 A
        vm.prank(owner);
        arb.executeOptimizedArbitrage(address(tokA), address(tokB), 100 ether, address(rA), address(rB), 0, 0, 4, 1 ether, recipient);
        require(tokA.balanceOf(recipient) == 2 ether, "profit not swept");
        require(tokA.balanceOf(address(arb)) == 0, "residual A");
        require(tokB.balanceOf(address(arb)) == 0, "residual B");
        require(tokA.balanceOf(address(vault)) == 1_000 ether, "vault not made whole");
    }

    function test_RevertsWhenUnprofitable() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(49, 100); // 100 A -> 200 B -> 98 A => loss
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.InsufficientProfit.selector, uint256(0), uint256(1 ether)));
        arb.executeOptimizedArbitrage(address(tokA), address(tokB), 100 ether, address(rA), address(rB), 0, 0, 4, 1 ether, recipient);
    }

    function test_StrangerCannotStartLoan() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.Unauthorized.selector));
        arb.executeOptimizedArbitrage(address(tokA), address(tokB), 100 ether, address(rA), address(rB), 0, 0, 4, 1 ether, stranger);
    }

    function test_StrangerCannotInjectOwnFlashLoan() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100);
        // Dust sitting in the contract must not be stealable via a hand-made vault.flashLoan(recipient = arb, ...)
        tokA.mint(address(arb), 5 ether);
        IERC20[] memory toks = new IERC20[](1);
        toks[0] = IERC20(address(tokA));
        uint256[] memory amts = new uint256[](1);
        amts[0] = 1 ether;
        FlashArbOptimized.SwapRouteParams memory route = FlashArbOptimized.SwapRouteParams({
            routeType: 4, routerA: address(rA), routerB: address(rB), tokenIn: address(tokA), tokenOut: address(tokB),
            feeA: 0, feeB: 0, minProfit: 1, recipient: stranger
        });
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.Unauthorized.selector));
        vault.flashLoan(address(arb), toks, amts, abi.encode(route));
        require(tokA.balanceOf(stranger) == 0, "stranger stole funds");
    }

    function test_OnlyOwnerCanSweepNative() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100);
        rA; rB;
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.Unauthorized.selector));
        arb.executeDirectFlashArb(stranger);
    }
}
