// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { ExperimentRegistry } from '../../contracts/ExperimentRegistry.sol';
import { AtomicRoundTrip, IRouter } from '../../contracts/AtomicRoundTrip.sol';
interface Vm { function warp(uint256) external; function roll(uint256) external; function prank(address) external; function expectRevert() external; }
contract Token {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    function mint(address a,uint256 n) external { balanceOf[a]+=n; }
    function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
    function transfer(address a,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;}
    function transferFrom(address a,address b,uint256 n)external{allowance[a][msg.sender]-=n;balanceOf[a]-=n;balanceOf[b]+=n;}
}
contract Factory { function getPool(address,address,uint24 fee) external pure returns(address){return fee==500?address(10):fee==3000?address(11):address(0);} }
contract Router {
    Token public t; uint256 public output; bool public reenter; AtomicRoundTrip public target;
    constructor(Token t_){t=t_;}
    function setup(uint256 n,bool r,AtomicRoundTrip e)external{output=n;reenter=r;target=e;}
    function exactInput(IRouter.ExactInputParams calldata p)external payable returns(uint256){
        t.transferFrom(msg.sender,address(this),p.amountIn);
        if(reenter)target.execute(0,1,500,3000,1,block.timestamp);
        // Deliberately ignores amountOutMinimum: the executor must check actual balance itself.
        t.mint(p.recipient,output);return output;
    }
}
contract ContractsTest {
    Vm constant vm=Vm(address(uint160(uint256(keccak256('hevm cheat code')))));
    Token t;Token q;Factory f;Router r;AtomicRoundTrip e;
    function setUp() public {t=new Token();q=new Token();f=new Factory();r=new Router(t);e=new AtomicRoundTrip(address(this),address(t),address(q),address(f),address(r),1,1000);t.mint(address(e),1000);r.setup(110,false,e);}
    function testRegistryOrderingAndFinalization()public{ExperimentRegistry reg=new ExperimentRegistry(address(this));bytes32 id=keccak256('trial');reg.freeze(id,keccak256('commit'));vm.expectRevert();reg.report(id,keccak256('result'),10,1000);vm.warp(block.timestamp+7 days);vm.roll(100);reg.report(id,keccak256('result'),99,1000);vm.expectRevert();reg.report(id,keccak256('other'),99,1000);vm.expectRevert();reg.freeze(id,keccak256('again'));}
    function testRegistryUnauthorizedAndSampleGate()public{ExperimentRegistry reg=new ExperimentRegistry(address(this));vm.prank(address(5));vm.expectRevert();reg.freeze(keccak256('id'),keccak256('commit'));reg.freeze(keccak256('id'),keccak256('commit'));vm.warp(block.timestamp+7 days);vm.roll(100);vm.expectRevert();reg.report(keccak256('id'),keccak256('r'),99,999);vm.prank(address(5));vm.expectRevert();reg.report(keccak256('id'),keccak256('r'),99,1000);}
    function testProfitAndApprovalReset() public {uint256 gain=e.execute(0,100,500,3000,10,block.timestamp);require(gain==10&&e.nonce()==1&&t.balanceOf(address(e))==1010);require(t.allowance(address(e),address(r))==0);}
    function testActualBalanceWinsOverRouterReturn()public{r.setup(99,false,e);vm.expectRevert();e.execute(0,100,500,3000,1,block.timestamp);require(e.nonce()==0&&t.balanceOf(address(e))==1000);}
    function testReplayAndDeadline()public{e.execute(0,100,500,3000,1,block.timestamp);vm.expectRevert();e.execute(0,100,500,3000,1,block.timestamp);vm.expectRevert();e.execute(1,100,500,3000,1,block.timestamp+61);vm.warp(100);vm.expectRevert();e.execute(1,100,500,3000,1,99);}
    function testSamePoolAndZeroPoolRejected()public{vm.expectRevert();e.execute(0,100,500,500,1,block.timestamp);vm.expectRevert();e.execute(0,100,500,10000,1,block.timestamp);}
    function testUnauthorizedExecutionAndWithdrawal()public{vm.prank(address(5));vm.expectRevert();e.execute(0,100,500,3000,1,block.timestamp);vm.prank(address(5));vm.expectRevert();e.withdraw(address(5),100);}
    function testAmountAndFloor()public{vm.expectRevert();e.execute(0,1001,500,3000,1,block.timestamp);vm.expectRevert();e.execute(0,100,500,3000,0,block.timestamp);}
    function testReentrantRouterCannotExecute()public{r.setup(110,true,e);vm.expectRevert();e.execute(0,100,500,3000,1,block.timestamp);require(e.nonce()==0);}
    function testFuzzBalanceInvariant(uint96 gain)public{uint256 n=uint256(gain)+1;r.setup(100+n,false,e);uint256 measured=e.execute(0,100,500,3000,n,block.timestamp);require(measured==n&&t.balanceOf(address(e))==1000+n);}
}
