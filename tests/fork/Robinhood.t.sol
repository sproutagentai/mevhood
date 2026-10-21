// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { AtomicRoundTrip } from '../../contracts/AtomicRoundTrip.sol';
interface VmFork { function deal(address,uint256) external; function expectRevert() external; }
interface WETH { function deposit() external payable; function transfer(address,uint256) external returns(bool); function balanceOf(address) external view returns(uint256); }
interface F {function getPool(address,address,uint24) external view returns(address);}
contract RobinhoodForkTest {
    VmFork constant vm=VmFork(address(uint160(uint256(keccak256('hevm cheat code')))));
    address constant ASSET=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant QUOTE=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant FACTORY=0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant ROUTER=0xCaf681a66D020601342297493863E78C959E5cb2;
    function testRealRouterAtomicLossRevertsOnPinnedFork()public{
        require(block.chainid==4663,'wrong fork');
        require(F(FACTORY).getPool(ASSET,QUOTE,100)!=address(0),'missing pool');
        AtomicRoundTrip executor=new AtomicRoundTrip(address(this),ASSET,QUOTE,FACTORY,ROUTER,1,0.02 ether);
        vm.deal(address(this),1 ether);
        WETH(ASSET).deposit{value:0.001 ether}();
        WETH(ASSET).transfer(address(executor),0.001 ether);
        // All sampled routes lose before gas. Positive gain requirement must revert atomically.
        vm.expectRevert();executor.execute(0,0.001 ether,100,500,1,block.timestamp);
        require(WETH(ASSET).balanceOf(address(executor))==0.001 ether,'inventory changed');
        require(executor.nonce()==0,'failed nonce consumed');
    }
}
