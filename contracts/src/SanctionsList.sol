// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ISanctionsList } from "./interfaces/ISanctionsList.sol";

/// @title SanctionsList
/// @notice Stores and manages the Merkle root of the OFAC sanctions list.
/// @dev Updated daily by the authorised Node.js oracle backend. The root is
///      computed off-chain by fetching the OFAC SDN list, hashing each ETH
///      address with keccak256, and building an Indexed Merkle Tree (depth 20).
///      ComplianceGate reads currentRoot() to validate submitted ZK proofs.
contract SanctionsList is ISanctionsList, Ownable {
    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @dev The current Merkle root of the OFAC sanctions list.
    bytes32 private _currentRoot;

    /// @dev Timestamp of the most recent root update.
    uint256 private _lastUpdatedAt;

    /// @dev Number of sanctioned ETH addresses in the current tree.
    uint256 private _currentAddressCount;

    /// @dev Ordered list of all roots ever published, newest last.
    bytes32[] private _rootHistory;

    /// @dev Maps a root hash to its metadata.
    struct RootEntry {
        uint256 addressCount;
        uint256 timestamp;
        bool exists;
    }
    mapping(bytes32 => RootEntry) private _rootEntries;

    /// @dev Addresses authorised to call updateRoot().
    mapping(address => bool) private _authorisedUpdaters;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param initialOwner Address that receives Ownable ownership.
    /// @param initialUpdater Address authorised to call updateRoot() (the oracle).
    constructor(address initialOwner, address initialUpdater) Ownable(initialOwner) {
        require(initialUpdater != address(0), "SanctionsList: zero updater");
        _authorisedUpdaters[initialUpdater] = true;
        emit UpdaterAuthorised(initialUpdater);
    }

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAuthorisedUpdater() {
        require(_authorisedUpdaters[msg.sender], "SanctionsList: not authorised");
        _;
    }

    // -------------------------------------------------------------------------
    // Root management
    // -------------------------------------------------------------------------

    /// @inheritdoc ISanctionsList
    function updateRoot(bytes32 newRoot, uint256 addressCount) external override onlyAuthorisedUpdater {
        require(newRoot != bytes32(0), "SanctionsList: zero root");
        require(newRoot != _currentRoot, "SanctionsList: root unchanged");

        bytes32 previousRoot = _currentRoot;

        _currentRoot = newRoot;
        _lastUpdatedAt = block.timestamp;
        _currentAddressCount = addressCount;

        _rootHistory.push(newRoot);
        _rootEntries[newRoot] = RootEntry({ addressCount: addressCount, timestamp: block.timestamp, exists: true });

        emit RootUpdated(previousRoot, newRoot, addressCount, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @inheritdoc ISanctionsList
    function currentRoot() external view override returns (bytes32) {
        return _currentRoot;
    }

    /// @inheritdoc ISanctionsList
    function lastUpdatedAt() external view override returns (uint256) {
        return _lastUpdatedAt;
    }

    /// @inheritdoc ISanctionsList
    function currentAddressCount() external view override returns (uint256) {
        return _currentAddressCount;
    }

    /// @inheritdoc ISanctionsList
    function getRootHistory(bytes32 root)
        external
        view
        override
        returns (uint256 addressCount, uint256 timestamp, bool exists)
    {
        RootEntry storage entry = _rootEntries[root];
        return (entry.addressCount, entry.timestamp, entry.exists);
    }

    /// @inheritdoc ISanctionsList
    function isAuthorisedUpdater(address account) external view override returns (bool) {
        return _authorisedUpdaters[account];
    }

    /// @inheritdoc ISanctionsList
    function isKnownRoot(bytes32 root) external view override returns (bool) {
        return _rootEntries[root].exists;
    }

    /// @inheritdoc ISanctionsList
    function getRecentRoots(uint256 n)
        external
        view
        override
        returns (bytes32[] memory roots, uint256[] memory timestamps)
    {
        uint256 total = _rootHistory.length;
        uint256 count = n > total ? total : n;

        roots = new bytes32[](count);
        timestamps = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            bytes32 root = _rootHistory[total - 1 - i];
            roots[i] = root;
            timestamps[i] = _rootEntries[root].timestamp;
        }
    }

    // -------------------------------------------------------------------------
    // Owner-only updater management
    // -------------------------------------------------------------------------

    /// @notice Authorise a new address to call updateRoot().
    /// @dev Only the owner can add updaters. In production this is the
    ///      backend oracle's hot wallet or a multisig.
    function authoriseUpdater(address updater) external onlyOwner {
        require(updater != address(0), "SanctionsList: zero address");
        require(!_authorisedUpdaters[updater], "SanctionsList: already authorised");
        _authorisedUpdaters[updater] = true;
        emit UpdaterAuthorised(updater);
    }

    /// @notice Revoke an address from calling updateRoot().
    function revokeUpdater(address updater) external onlyOwner {
        require(_authorisedUpdaters[updater], "SanctionsList: not authorised");
        _authorisedUpdaters[updater] = false;
        emit UpdaterRevoked(updater);
    }
}
