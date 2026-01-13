// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISanctionsList
/// @notice Interface for the SanctionsList contract that stores and manages the
///         Merkle root of the current OFAC sanctions list.
/// @dev The Merkle root is computed off-chain by the Node.js backend script which:
///      1. Fetches the OFAC SDN list from treasury.gov
///      2. keccak256-hashes each ETH address
///      3. Builds an Indexed Merkle Tree (depth 20, capacity 1,048,576 leaves)
///      4. Calls updateRoot() with the new root and address count
///      The root is updated daily. ComplianceGate reads the current root to validate
///      that submitted ZK proofs were generated against the latest sanctions list.
interface ISanctionsList {
    /// @notice Emitted when the sanctions list Merkle root is updated.
    /// @param previousRoot The root that was replaced.
    /// @param newRoot      The newly published Merkle root.
    /// @param addressCount Number of sanctioned ETH addresses in the new tree.
    /// @param updatedAt    Block timestamp of the update.
    event RootUpdated(
        bytes32 indexed previousRoot,
        bytes32 indexed newRoot,
        uint256 addressCount,
        uint256 updatedAt
    );

    /// @notice Emitted when a new updater address is authorised.
    event UpdaterAuthorised(address indexed updater);

    /// @notice Emitted when an updater address is revoked.
    event UpdaterRevoked(address indexed updater);

    /// @notice Update the sanctions list Merkle root.
    /// @dev Only callable by an authorised updater address (the backend oracle).
    /// @param newRoot      The new Indexed Merkle Tree root.
    /// @param addressCount The number of sanctioned addresses in the new tree.
    function updateRoot(bytes32 newRoot, uint256 addressCount) external;

    /// @notice Returns the current Merkle root of the sanctions list.
    function currentRoot() external view returns (bytes32);

    /// @notice Returns the block timestamp when the current root was last updated.
    function lastUpdatedAt() external view returns (uint256);

    /// @notice Returns the number of sanctioned addresses in the current tree.
    function currentAddressCount() external view returns (uint256);

    /// @notice Returns the full history entry for a given root.
    /// @param root The Merkle root to look up.
    /// @return addressCount  Number of addresses at the time of that root.
    /// @return timestamp     Block timestamp when that root was published.
    /// @return exists        Whether this root was ever published on-chain.
    function getRootHistory(bytes32 root)
        external
        view
        returns (
            uint256 addressCount,
            uint256 timestamp,
            bool exists
        );

    /// @notice Returns whether a given address is authorised to call updateRoot().
    function isAuthorisedUpdater(address account) external view returns (bool);

    /// @notice Returns true if the given root was ever published by this contract.
    /// @dev Used by ComplianceGate to validate that a proof's public input root
    ///      is a root that was genuinely published on-chain, not fabricated.
    function isKnownRoot(bytes32 root) external view returns (bool);

    /// @notice Returns the n most recent root entries, newest first.
    /// @param n Number of entries to return. Capped at total history length.
    function getRecentRoots(uint256 n)
        external
        view
        returns (bytes32[] memory roots, uint256[] memory timestamps);
}
