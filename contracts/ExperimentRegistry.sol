// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Immutable ordering and digest receipts. This contract does not verify P&L.
contract ExperimentRegistry {
    address public immutable recorder;
    uint64 public constant MIN_DURATION = 7 days;
    uint32 public constant MIN_OBSERVATIONS = 1000;
    struct Record { bytes32 commitment; bytes32 result; uint64 blockNumber; uint64 timestamp; }
    mapping(bytes32 => Record) public records;
    event Frozen(bytes32 indexed id, bytes32 commitment, uint64 blockNumber);
    event Reported(bytes32 indexed id, bytes32 result, uint64 lastBlock, uint32 observations);
    error Unauthorized(); error InvalidRecord();
    constructor(address recorder_) { if (recorder_ == address(0)) revert InvalidRecord(); recorder = recorder_; }
    function freeze(bytes32 id, bytes32 commitment) external {
        if (msg.sender != recorder) revert Unauthorized();
        if (id == bytes32(0) || commitment == bytes32(0) || records[id].commitment != bytes32(0)) revert InvalidRecord();
        records[id] = Record(commitment, bytes32(0), uint64(block.number), uint64(block.timestamp));
        emit Frozen(id, commitment, uint64(block.number));
    }
    function report(bytes32 id, bytes32 result, uint64 lastBlock, uint32 observations) external {
        if (msg.sender != recorder) revert Unauthorized();
        Record storage r = records[id];
        if (r.commitment == bytes32(0) || r.result != bytes32(0) || result == bytes32(0)
            || block.timestamp < uint256(r.timestamp) + MIN_DURATION || lastBlock <= r.blockNumber
            || lastBlock >= block.number || observations < MIN_OBSERVATIONS) revert InvalidRecord();
        r.result = result;
        emit Reported(id, result, lastBlock, observations);
    }
}
