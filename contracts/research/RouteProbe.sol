// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ProbeToken {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}
interface ProbeRouter {
    struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata) external payable returns (uint256);
}

/// @notice LOCAL FORK RESEARCH ONLY. Allows a losing round trip to measure it.
/// @dev This probe is not the guarded AtomicRoundTrip executor or a live strategy.
contract RouteProbe {
    address public immutable owner = msg.sender;
    ProbeToken public immutable asset;
    ProbeRouter public immutable router;
    event Measured(uint256 amountIn, uint256 amountOut, uint256 beforeBalance, uint256 afterBalance);
    constructor(address asset_, address router_) { asset = ProbeToken(asset_); router = ProbeRouter(router_); }
    function execute(bytes calldata path, uint256 amountIn) external returns (uint256 amountOut) {
        require(msg.sender == owner && amountIn > 0 && amountIn <= 0.02 ether, "research bounds");
        require(path.length == 66 || path.length == 89, "two or three pools");
        address first; address last;
        assembly { first := shr(96, calldataload(path.offset)) last := shr(96, calldataload(add(path.offset, sub(path.length, 20)))) }
        require(first == address(asset) && last == address(asset), "WETH cycle only");
        uint256 beforeBalance = asset.balanceOf(address(this));
        require(beforeBalance >= amountIn, "research inventory");
        require(asset.approve(address(router), 0) && asset.approve(address(router), amountIn), "approve");
        router.exactInput(ProbeRouter.ExactInputParams(path, address(this), amountIn, 0));
        require(asset.approve(address(router), 0), "reset");
        uint256 afterBalance = asset.balanceOf(address(this));
        amountOut = afterBalance + amountIn - beforeBalance;
        emit Measured(amountIn, amountOut, beforeBalance, afterBalance);
    }
}
