// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVerifier
/// @notice Interface for the auto-generated UltraHonk proof verifier produced by `nargo`.
/// @dev This interface is implemented by the Solidity verifier contract that `nargo` exports
///      via `bb write_vk` + `bb contract`. The verifier takes a serialized proof and the
///      corresponding array of public inputs and returns true if the proof is valid.
///
///      Public inputs for NullProof:
///        [0] — Merkle root of the current OFAC sanctions list (as a field element)
interface IVerifier {
    /// @notice Verify a UltraHonk ZK proof against a set of public inputs.
    /// @param _proof   ABI-encoded serialized proof bytes produced by the browser prover.
    /// @param _publicInputs Array of public field elements. For NullProof this is exactly
    ///                      one element: the sanctions list Merkle root.
    /// @return          True if the proof is valid, false otherwise.
    function verify(
        bytes calldata _proof,
        bytes32[] calldata _publicInputs
    ) external view returns (bool);
}
