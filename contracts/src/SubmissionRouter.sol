// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IComplianceGate } from "./interfaces/IComplianceGate.sol";

/// @title SubmissionRouter
/// @notice Relayer-only entry point for private compliance submissions.
/// @dev The relayer broadcasts txs so the user's EOA is not the on-chain `From`
///      address. ComplianceGate sees this contract as `msg.sender`, so
///      `NullifierConsumed` events do not expose the end-user wallet.
contract SubmissionRouter {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error OnlyRelayer();
    error ZeroAddress();

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    address public immutable relayer;
    IComplianceGate public immutable gate;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address relayer_, address gate_) {
        if (relayer_ == address(0) || gate_ == address(0)) revert ZeroAddress();
        relayer = relayer_;
        gate = IComplianceGate(gate_);
    }

    // -------------------------------------------------------------------------
    // Submission
    // -------------------------------------------------------------------------

    /// @notice Submit a compliance proof on behalf of a user (relayer pays gas).
    /// @param proof        Serialized UltraHonk proof bytes.
    /// @param publicInputs Public inputs array (root at index 0).
    /// @param nullifier    One-time nullifier for replay protection.
    function submitCompliant(bytes calldata proof, bytes32[] calldata publicInputs, bytes32 nullifier) external {
        if (msg.sender != relayer) revert OnlyRelayer();
        gate.assertCompliant(proof, publicInputs, nullifier);
    }
}
