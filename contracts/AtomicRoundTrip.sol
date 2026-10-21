// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}
interface IFactory { function getPool(address,address,uint24) external view returns(address); }
interface IRouter {
    struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata) external payable returns (uint256);
}

/// @notice WETH -> quote asset -> WETH only. No arbitrary call targets or LLM authority.
/// @dev Private-orderflow submission, gas profitability and secure key custody are out of scope.
contract AtomicRoundTrip {
    address public immutable controller;
    IERC20 public immutable asset;
    address public immutable quoteAsset;
    IFactory public immutable factory;
    IRouter public immutable router;
    uint256 public immutable minProfitFloor;
    uint256 public immutable maxAmount;
    uint256 public nonce;
    bool private entered;
    error Unauthorized(); error InvalidRoute(); error InvalidOrder(); error TokenFailure(); error InsufficientProfit();
    event Settled(uint256 indexed nonce, uint256 amount, uint256 actualGain);
    modifier locked() { if (entered) revert InvalidOrder(); entered=true; _; entered=false; }
    modifier onlyController() { if(msg.sender!=controller) revert Unauthorized(); _; }
    constructor(address controller_, address asset_, address quote_, address factory_, address router_, uint256 floor_,uint256 max_) {
        if(controller_==address(0)||asset_==quote_||asset_.code.length==0||quote_.code.length==0||factory_.code.length==0||router_.code.length==0||floor_==0||max_==0) revert InvalidOrder();
        controller=controller_;asset=IERC20(asset_);quoteAsset=quote_;factory=IFactory(factory_);router=IRouter(router_);minProfitFloor=floor_;maxAmount=max_;
    }
    function execute(uint256 expectedNonce,uint256 amount,uint24 feeOut,uint24 feeBack,uint256 minimumGain,uint256 deadline) external onlyController locked returns(uint256 gain) {
        if(expectedNonce!=nonce||amount==0||amount>maxAmount||minimumGain<minProfitFloor||deadline<block.timestamp||deadline>block.timestamp+60)revert InvalidOrder();
        address out=factory.getPool(address(asset),quoteAsset,feeOut);
        address back=factory.getPool(address(asset),quoteAsset,feeBack);
        if(out==address(0)||back==address(0)||out==back)revert InvalidRoute();
        uint256 beforeBalance=asset.balanceOf(address(this));
        if(beforeBalance<amount)revert InvalidOrder();
        nonce++;
        if(!asset.approve(address(router),0)||!asset.approve(address(router),amount))revert TokenFailure();
        router.exactInput(IRouter.ExactInputParams(abi.encodePacked(address(asset),feeOut,quoteAsset,feeBack,address(asset)),address(this),amount,amount+minimumGain));
        if(!asset.approve(address(router),0))revert TokenFailure();
        uint256 afterBalance=asset.balanceOf(address(this));
        if(afterBalance<beforeBalance+minimumGain)revert InsufficientProfit();
        gain=afterBalance-beforeBalance;
        emit Settled(expectedNonce,amount,gain);
    }
    function withdraw(address recipient,uint256 amount) external onlyController locked {
        if(recipient==address(0)||!asset.transfer(recipient,amount))revert TokenFailure();
    }
}
