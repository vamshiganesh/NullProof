// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SanctionsList} from "../src/SanctionsList.sol";
import {ISanctionsList} from "../src/interfaces/ISanctionsList.sol";

contract SanctionsListTest is Test {
    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    SanctionsList public sanctionsList;

    address public owner   = makeAddr("owner");
    address public oracle  = makeAddr("oracle");
    address public stranger = makeAddr("stranger");

    bytes32 public constant ROOT_A = keccak256("root_a");
    bytes32 public constant ROOT_B = keccak256("root_b");
    bytes32 public constant ROOT_C = keccak256("root_c");

    uint256 public constant COUNT_A = 3_412;
    uint256 public constant COUNT_B = 3_424;
    uint256 public constant COUNT_C = 3_430;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        vm.prank(owner);
        sanctionsList = new SanctionsList(owner, oracle);
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructor_setsOwner() public view {
        assertEq(sanctionsList.owner(), owner);
    }

    function test_constructor_authorisesOracle() public view {
        assertTrue(sanctionsList.isAuthorisedUpdater(oracle));
    }

    function test_constructor_strangerNotAuthorised() public view {
        assertFalse(sanctionsList.isAuthorisedUpdater(stranger));
    }

    function test_constructor_revertsOnZeroUpdater() public {
        vm.prank(owner);
        vm.expectRevert("SanctionsList: zero updater");
        new SanctionsList(owner, address(0));
    }

    function test_constructor_initialRootIsZero() public view {
        assertEq(sanctionsList.currentRoot(), bytes32(0));
    }

    // -------------------------------------------------------------------------
    // updateRoot — happy path
    // -------------------------------------------------------------------------

    function test_updateRoot_setsCurrentRoot() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        assertEq(sanctionsList.currentRoot(), ROOT_A);
    }

    function test_updateRoot_setsAddressCount() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        assertEq(sanctionsList.currentAddressCount(), COUNT_A);
    }

    function test_updateRoot_setsLastUpdatedAt() public {
        uint256 ts = 1_000_000;
        vm.warp(ts);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        assertEq(sanctionsList.lastUpdatedAt(), ts);
    }

    function test_updateRoot_emitsRootUpdated() public {
        vm.expectEmit(true, true, false, true);
        emit ISanctionsList.RootUpdated(bytes32(0), ROOT_A, COUNT_A, block.timestamp);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
    }

    function test_updateRoot_secondUpdate_emitsPreviousRoot() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);

        vm.expectEmit(true, true, false, true);
        emit ISanctionsList.RootUpdated(ROOT_A, ROOT_B, COUNT_B, block.timestamp);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, COUNT_B);
    }

    function test_updateRoot_storesRootHistory() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);

        (uint256 count, uint256 ts, bool exists) = sanctionsList.getRootHistory(ROOT_A);
        assertTrue(exists);
        assertEq(count, COUNT_A);
        assertEq(ts, block.timestamp);
    }

    function test_updateRoot_isKnownRootAfterUpdate() public {
        assertFalse(sanctionsList.isKnownRoot(ROOT_A));
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        assertTrue(sanctionsList.isKnownRoot(ROOT_A));
    }

    // -------------------------------------------------------------------------
    // updateRoot — access control
    // -------------------------------------------------------------------------

    function test_updateRoot_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert("SanctionsList: not authorised");
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
    }

    function test_updateRoot_revertsForOwnerIfNotOracle() public {
        vm.prank(owner);
        vm.expectRevert("SanctionsList: not authorised");
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
    }

    function test_updateRoot_revertsForZeroRoot() public {
        vm.prank(oracle);
        vm.expectRevert("SanctionsList: zero root");
        sanctionsList.updateRoot(bytes32(0), COUNT_A);
    }

    function test_updateRoot_revertsForUnchangedRoot() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);

        vm.prank(oracle);
        vm.expectRevert("SanctionsList: root unchanged");
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
    }

    // -------------------------------------------------------------------------
    // getRecentRoots
    // -------------------------------------------------------------------------

    function test_getRecentRoots_returnsNewestFirst() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, COUNT_B);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_C, COUNT_C);

        (bytes32[] memory roots,) = sanctionsList.getRecentRoots(3);

        assertEq(roots[0], ROOT_C);
        assertEq(roots[1], ROOT_B);
        assertEq(roots[2], ROOT_A);
    }

    function test_getRecentRoots_capsAtTotal() public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, COUNT_B);

        (bytes32[] memory roots,) = sanctionsList.getRecentRoots(10);
        assertEq(roots.length, 2);
    }

    function test_getRecentRoots_returnsEmptyWhenNoRoots() public view {
        (bytes32[] memory roots, uint256[] memory timestamps) = sanctionsList.getRecentRoots(5);
        assertEq(roots.length, 0);
        assertEq(timestamps.length, 0);
    }

    function test_getRecentRoots_timestampsMatchHistory() public {
        uint256 ts1 = 1_000_000;
        uint256 ts2 = 1_086_400;

        vm.warp(ts1);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);

        vm.warp(ts2);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, COUNT_B);

        (, uint256[] memory timestamps) = sanctionsList.getRecentRoots(2);
        assertEq(timestamps[0], ts2);
        assertEq(timestamps[1], ts1);
    }

    // -------------------------------------------------------------------------
    // Updater management
    // -------------------------------------------------------------------------

    function test_authoriseUpdater_addsNewUpdater() public {
        vm.prank(owner);
        sanctionsList.authoriseUpdater(stranger);
        assertTrue(sanctionsList.isAuthorisedUpdater(stranger));
    }

    function test_authoriseUpdater_newUpdaterCanUpdateRoot() public {
        vm.prank(owner);
        sanctionsList.authoriseUpdater(stranger);

        vm.prank(stranger);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        assertEq(sanctionsList.currentRoot(), ROOT_A);
    }

    function test_authoriseUpdater_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit ISanctionsList.UpdaterAuthorised(stranger);
        vm.prank(owner);
        sanctionsList.authoriseUpdater(stranger);
    }

    function test_authoriseUpdater_revertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("SanctionsList: zero address");
        sanctionsList.authoriseUpdater(address(0));
    }

    function test_authoriseUpdater_revertsIfAlreadyAuthorised() public {
        vm.prank(owner);
        vm.expectRevert("SanctionsList: already authorised");
        sanctionsList.authoriseUpdater(oracle);
    }

    function test_authoriseUpdater_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert();
        sanctionsList.authoriseUpdater(stranger);
    }

    function test_revokeUpdater_removesOracle() public {
        vm.prank(owner);
        sanctionsList.revokeUpdater(oracle);
        assertFalse(sanctionsList.isAuthorisedUpdater(oracle));
    }

    function test_revokeUpdater_revokedOracleCannotUpdateRoot() public {
        vm.prank(owner);
        sanctionsList.revokeUpdater(oracle);

        vm.prank(oracle);
        vm.expectRevert("SanctionsList: not authorised");
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
    }

    function test_revokeUpdater_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit ISanctionsList.UpdaterRevoked(oracle);
        vm.prank(owner);
        sanctionsList.revokeUpdater(oracle);
    }

    function test_revokeUpdater_revertsIfNotAuthorised() public {
        vm.prank(owner);
        vm.expectRevert("SanctionsList: not authorised");
        sanctionsList.revokeUpdater(stranger);
    }

    // -------------------------------------------------------------------------
    // Fuzz tests
    // -------------------------------------------------------------------------

    function testFuzz_updateRoot_anyNonZeroRoot(bytes32 root, uint256 count) public {
        vm.assume(root != bytes32(0));
        vm.prank(oracle);
        sanctionsList.updateRoot(root, count);
        assertEq(sanctionsList.currentRoot(), root);
        assertEq(sanctionsList.currentAddressCount(), count);
        assertTrue(sanctionsList.isKnownRoot(root));
    }

    function testFuzz_getRecentRoots_neverExceedsTotal(uint8 n) public {
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, COUNT_A);
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, COUNT_B);

        (bytes32[] memory roots,) = sanctionsList.getRecentRoots(n);
        assertLe(roots.length, 2);
    }
}