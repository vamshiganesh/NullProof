// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICompliantVault} from "./interfaces/ICompliantVault.sol";
import {IComplianceGate} from "./interfaces/IComplianceGate.sol";

/// @title CompliantVault
/// @notice Reference vault demonstrating protocol-integrated compliance.
/// @dev Calls ComplianceGate.assertCompliant atomically before crediting a deposit.
contract CompliantVault is ICompliantVault, ReentrancyGuard {
    error ZeroAmount();
    error InsufficientBalance();

    IComplianceGate public immutable gate;

    mapping(address => uint256) private _balances;

    constructor(address gate_) {
        require(gate_ != address(0), "CompliantVault: zero gate");
        gate = IComplianceGate(gate_);
    }

  /// @inheritdoc ICompliantVault
    function deposit(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier
    ) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        gate.assertCompliant(proof, publicInputs, nullifier);

        _balances[msg.sender] += msg.value;

        bytes32 root = publicInputs.length > 0 ? publicInputs[0] : bytes32(0);
        emit Deposited(msg.sender, msg.value, nullifier, root);
    }

  /// @inheritdoc ICompliantVault
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (_balances[msg.sender] < amount) revert InsufficientBalance();

        _balances[msg.sender] -= amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "CompliantVault: transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

  /// @inheritdoc ICompliantVault
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

  /// @inheritdoc ICompliantVault
    function complianceGate() external view returns (address) {
        return address(gate);
    }
}
