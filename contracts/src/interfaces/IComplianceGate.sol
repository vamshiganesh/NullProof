// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IComplianceGate
/// @notice Interface for the ComplianceGate contract — the main integration point
///         for DeFi protocols that want ZK-gated compliance enforcement.
/// @dev DeFi protocols integrate NullProof by:
///      1. Storing the ComplianceGate address at deploy time
///      2. Calling assertCompliant(proof, publicInputs, nullifier) inside their
///         deposit() or swap() function before executing the core logic
///      3. The call reverts if the proof is invalid, expired, or the nullifier
///         has already been used — protecting the protocol with zero PII on-chain
interface IComplianceGate {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when calldata nullifier does not match the proof public input.
    error NullifierMismatch(bytes32 expected, bytes32 provided);

    /// @notice Thrown when a submitted proof fails on-chain verification.
    error InvalidProof();

    /// @notice Thrown when the proof's public root is not a known sanctions list root.
    error UnknownRoot();

    /// @notice Thrown when the proof was generated against a root that is no longer
    ///         the current root and the validity window has expired.
    error ProofExpired();

    /// @notice Thrown when a nullifier has already been consumed by a previous call.
    error NullifierAlreadyUsed(bytes32 nullifier);

    /// @notice Thrown when proof submission is paused by the owner.
    error SubmissionPaused();

    /// @notice Thrown when caller provides a zero-length proof.
    error EmptyProof();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a valid compliance proof is successfully verified.
    /// @param nullifier    The unique proof nullifier. Stored to prevent replay.
    /// @param root         The sanctions list Merkle root the proof was generated against.
    /// @param validUntil   Block timestamp after which this proof is considered expired.
    event ProofVerified(
        bytes32 indexed nullifier,
        bytes32 indexed root,
        uint256 validUntil
    );

    /// @notice Emitted when a nullifier is consumed (used inside a protected call).
    event NullifierConsumed(bytes32 indexed nullifier, address indexed caller);

    /// @notice Emitted when the proof validity window is updated.
    event ValidityWindowUpdated(uint256 previousWindow, uint256 newWindow);

    /// @notice Emitted when the verifier contract address is updated.
    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);

    /// @notice Emitted when proof submission is paused or unpaused.
    event SubmissionPauseToggled(bool paused);

    // -------------------------------------------------------------------------
    // Core compliance check
    // -------------------------------------------------------------------------

    /// @notice Verify a ZK non-membership proof and mark its nullifier as used.
    /// @dev This is the primary integration point. DeFi protocols call this inside
    ///      their deposit() or swap() function. Reverts on any compliance failure.
    ///      On success, the nullifier is consumed and cannot be reused.
    /// @param proof        Serialized UltraHonk proof bytes from the browser prover.
    /// @param publicInputs Array of public field elements. Index 0 = Merkle root,
    ///                     index 1 = nullifier bound in-circuit.
    /// @param nullifier    A unique commitment derived from the proof, used to prevent
    ///                     the same proof being submitted twice.
    function assertCompliant(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier
    ) external;

    /// @notice Check compliance without consuming the nullifier.
    /// @dev Use this for read-only compliance checks (e.g. UI status queries).
    ///      Does NOT mark the nullifier as used. Does NOT revert — returns bool.
    /// @return valid  True if the proof is currently valid and unused.
    function checkCompliant(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier
    ) external view returns (bool valid);

    // -------------------------------------------------------------------------
    // Nullifier state
    // -------------------------------------------------------------------------

    /// @notice Returns true if the given nullifier has already been consumed.
    function isNullifierUsed(bytes32 nullifier) external view returns (bool);

    /// @notice Returns the block timestamp when a nullifier was consumed.
    ///         Returns 0 if the nullifier has not been used.
    function nullifierUsedAt(bytes32 nullifier) external view returns (uint256);

    // -------------------------------------------------------------------------
    // Configuration views
    // -------------------------------------------------------------------------

    /// @notice Returns the address of the ISanctionsList contract.
    function sanctionsList() external view returns (address);

    /// @notice Returns the address of the IVerifier contract.
    function verifier() external view returns (address);

    /// @notice Returns the proof validity window in seconds.
    /// @dev Default is 86400 (24 hours). After a root update, proofs generated
    ///      against the previous root remain valid for this window.
    function validityWindow() external view returns (uint256);

    /// @notice Returns whether proof submission is currently paused.
    function submissionPaused() external view returns (bool);
}
