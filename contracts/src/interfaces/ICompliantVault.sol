// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICompliantVault
/// @notice Reference DeFi integration: atomic deposit + ZK compliance check.
interface ICompliantVault {
    event Deposited(
        address indexed depositor,
        uint256 amount,
        bytes32 indexed nullifier,
        bytes32 indexed root
    );

    event Withdrawn(address indexed depositor, uint256 amount);

    function deposit(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier
    ) external payable;

    function withdraw(uint256 amount) external;

    function balanceOf(address account) external view returns (uint256);

    function complianceGate() external view returns (address);
}
