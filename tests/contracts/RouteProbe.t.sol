// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {RouteProbe} from '../../contracts/research/RouteProbe.sol';
import {Token,Router,Vm} from './Contracts.t.sol';
import {AtomicRoundTrip} from '../../contracts/AtomicRoundTrip.sol';
contract RouteProbeTest {
    Vm constant vm=Vm(address(uint160(uint256(keccak256('hevm cheat code')))));
    function testProbeMeasuresLossAndResetsAllowance() public {
        Token t=new Token();Router r=new Router(t);RouteProbe p=new RouteProbe(address(t),address(r));t.mint(address(p),1000);r.setup(90,false,AtomicRoundTrip(address(0)));
        uint256 output=p.execute(abi.encodePacked(address(t),uint24(100),address(2),uint24(500),address(t)),100);
        require(output==90 && t.balanceOf(address(p))==990,'loss not measured');require(t.allowance(address(p),address(r))==0,'approval not cleared');
    }
    function testProbeBoundsAndOwnerRejectWrongPaths() public {
        Token t=new Token();Router r=new Router(t);RouteProbe p=new RouteProbe(address(t),address(r));t.mint(address(p),1000);
        bytes memory path=abi.encodePacked(address(t),uint24(100),address(2),uint24(500),address(t));
        vm.prank(address(5));vm.expectRevert();p.execute(path,100);
        vm.expectRevert();p.execute(path,0.03 ether);vm.expectRevert();p.execute(hex'01',100);
        vm.expectRevert();p.execute(abi.encodePacked(address(3),uint24(100),address(2),uint24(500),address(t)),100);
    }
}
