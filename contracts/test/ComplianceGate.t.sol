// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ComplianceGate} from "../src/ComplianceGate.sol";
import {SanctionsList} from "../src/SanctionsList.sol";
import {IComplianceGate} from "../src/interfaces/IComplianceGate.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

// -------------------------------------------------------------------------
// Mock Verifier — returns whatever we tell it to
// -------------------------------------------------------------------------

contract MockVerifier is IVerifier {
    bool private _shouldPass;

    constructor(bool shouldPass) {
        _shouldPass = shouldPass;
    }

    function setShouldPass(bool value) external {
        _shouldPass = value;
    }

    function verify(
        bytes calldata,
        bytes32[] calldata
    ) external view override returns (bool) {
        return _shouldPass;
    }
}

// -------------------------------------------------------------------------
// Main test contract
// -------------------------------------------------------------------------

contract ComplianceGateTest is Test {
    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    ComplianceGate public gate;
    SanctionsList public sanctionsList;
    MockVerifier public verifier;

    address public owner    = makeAddr("owner");
    address public oracle   = makeAddr("oracle");
    address public user     = makeAddr("user");
    address public stranger = makeAddr("stranger");

    bytes32 public constant ROOT_A    = keccak256("root_a");
    bytes32 public constant ROOT_B    = keccak256("root_b");
    bytes32 public constant NULLIFIER = keccak256("nullifier_1");

    bytes   public validProof    = abi.encodePacked(bytes32("proof_bytes"));
    bytes32[] public publicInputs;

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        // Deploy SanctionsList
        vm.prank(owner);
        sanctionsList = new SanctionsList(owner, oracle);

        // Deploy passing MockVerifier
        verifier = new MockVerifier(true);

        // Deploy ComplianceGate
        vm.prank(owner);
        gate = new ComplianceGate(owner, address(sanctionsList), address(verifier));

        // Publish ROOT_A on the sanctions list
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_A, 3_412);

        // Build publicInputs with ROOT_A at index 0 and NULLIFIER at index 1
        publicInputs = new bytes32[](2);
        publicInputs[0] = ROOT_A;
        publicInputs[1] = NULLIFIER;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    function test_constructor_setsOwner() public view {
        assertEq(gate.owner(), owner);
    }

    function test_constructor_setsSanctionsList() public view {
        assertEq(gate.sanctionsList(), address(sanctionsList));
    }

    function test_constructor_setsVerifier() public view {
        assertEq(gate.verifier(), address(verifier));
    }

    function test_constructor_setsDefaultValidityWindow() public view {
        assertEq(gate.validityWindow(), gate.DEFAULT_VALIDITY_WINDOW());
    }

    function test_constructor_notPausedByDefault() public view {
        assertFalse(gate.submissionPaused());
    }

    function test_constructor_revertsOnZeroSanctionsList() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceGate: zero sanctions list");
        new ComplianceGate(owner, address(0), address(verifier));
    }

    function test_constructor_revertsOnZeroVerifier() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceGate: zero verifier");
        new ComplianceGate(owner, address(sanctionsList), address(0));
    }

    // -------------------------------------------------------------------------
    // assertCompliant — happy path
    // -------------------------------------------------------------------------

    function test_assertCompliant_succeedsWithValidProof() public {
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    function test_assertCompliant_revertsOnNullifierMismatch() public {
        bytes32 wrong = keccak256("wrong_nullifier");
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IComplianceGate.NullifierMismatch.selector, NULLIFIER, wrong)
        );
        gate.assertCompliant(validProof, publicInputs, wrong);
    }

    function test_assertCompliant_consumesNullifier() public {
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
        assertTrue(gate.isNullifierUsed(NULLIFIER));
    }

    function test_assertCompliant_setsNullifierUsedAt() public {
        uint256 ts = 1_000_000;
        vm.warp(ts);
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
        assertEq(gate.nullifierUsedAt(NULLIFIER), ts);
    }

    function test_assertCompliant_emitsProofVerified() public {
        uint256 expectedValidUntil = block.timestamp + gate.DEFAULT_VALIDITY_WINDOW();
        vm.expectEmit(true, true, false, true);
        emit IComplianceGate.ProofVerified(NULLIFIER, ROOT_A, expectedValidUntil);
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    function test_assertCompliant_emitsNullifierConsumed() public {
        vm.expectEmit(true, true, false, false);
        emit IComplianceGate.NullifierConsumed(NULLIFIER, user);
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    // -------------------------------------------------------------------------
    // assertCompliant — reverts
    // -------------------------------------------------------------------------

    function test_assertCompliant_revertsOnEmptyProof() public {
        vm.prank(user);
        vm.expectRevert(IComplianceGate.EmptyProof.selector);
        gate.assertCompliant(new bytes(0), publicInputs, NULLIFIER);
    }

    function test_assertCompliant_revertsOnUsedNullifier() public {
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IComplianceGate.NullifierAlreadyUsed.selector, NULLIFIER)
        );
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    function test_assertCompliant_revertsOnUnknownRoot() public {
        bytes32[] memory badInputs = new bytes32[](2);
        badInputs[0] = keccak256("unknown_root");
        badInputs[1] = NULLIFIER;

        vm.prank(user);
        vm.expectRevert(IComplianceGate.UnknownRoot.selector);
        gate.assertCompliant(validProof, badInputs, NULLIFIER);
    }

    function test_assertCompliant_revertsOnExpiredRoot() public {
        // Publish ROOT_B replacing ROOT_A
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, 3_424);

        // Warp past validity window
        vm.warp(block.timestamp + gate.DEFAULT_VALIDITY_WINDOW() + 1);

        // Try to submit proof against ROOT_A (now expired)
        vm.prank(user);
        vm.expectRevert(IComplianceGate.ProofExpired.selector);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    function test_assertCompliant_revertsOnInvalidProof() public {
        verifier.setShouldPass(false);
        vm.prank(user);
        vm.expectRevert(IComplianceGate.InvalidProof.selector);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    function test_assertCompliant_revertsWhenPaused() public {
        vm.prank(owner);
        gate.setSubmissionPaused(true);

        vm.prank(user);
        vm.expectRevert(IComplianceGate.SubmissionPaused.selector);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    // -------------------------------------------------------------------------
    // Proof still valid within window after root update
    // -------------------------------------------------------------------------

    function test_assertCompliant_acceptsOldRootWithinWindow() public {
        // Publish ROOT_B replacing ROOT_A
        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT_B, 3_424);

        // Still within validity window — ROOT_A proof should pass
        vm.warp(block.timestamp + gate.DEFAULT_VALIDITY_WINDOW() - 1);

        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    function test_assertCompliant_currentRootNeverExpires() public {
        // Warp way into the future — ROOT_A is still current
        vm.warp(block.timestamp + 365 days);

        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
    }

    // -------------------------------------------------------------------------
    // checkCompliant
    // -------------------------------------------------------------------------

    function test_checkCompliant_returnsTrueForValidProof() public view {
        bool result = gate.checkCompliant(validProof, publicInputs, NULLIFIER);
        assertTrue(result);
    }

    function test_checkCompliant_returnsFalseForUsedNullifier() public {
        vm.prank(user);
        gate.assertCompliant(validProof, publicInputs, NULLIFIER);
        assertFalse(gate.checkCompliant(validProof, publicInputs, NULLIFIER));
    }

    function test_checkCompliant_returnsFalseWhenPaused() public {
        vm.prank(owner);
        gate.setSubmissionPaused(true);
        assertFalse(gate.checkCompliant(validProof, publicInputs, NULLIFIER));
    }

    function test_checkCompliant_returnsFalseForInvalidProof() public {
        verifier.setShouldPass(false);
        assertFalse(gate.checkCompliant(validProof, publicInputs, NULLIFIER));
    }

    function test_checkCompliant_returnsFalseForUnknownRoot() public view {
        bytes32[] memory badInputs = new bytes32[](1);
        badInputs[0] = keccak256("unknown_root");
        assertFalse(gate.checkCompliant(validProof, badInputs, NULLIFIER));
    }

    // -------------------------------------------------------------------------
    // setValidityWindow
    // -------------------------------------------------------------------------

    function test_setValidityWindow_updatesWindow() public {
        uint256 newWindow = 2 * 86_400;
        vm.prank(owner);
        gate.setValidityWindow(newWindow);
        assertEq(gate.validityWindow(), newWindow);
    }

    function test_setValidityWindow_emitsEvent() public {
        uint256 newWindow = 2 * 86_400;
        vm.expectEmit(false, false, false, true);
        emit IComplianceGate.ValidityWindowUpdated(gate.DEFAULT_VALIDITY_WINDOW(), newWindow);
        vm.prank(owner);
        gate.setValidityWindow(newWindow);
    }

    function test_setValidityWindow_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert();
        gate.setValidityWindow(2 * 86_400);
    }

    function test_setValidityWindow_revertsIfTooShort() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceGate: window too short");
        gate.setValidityWindow(3599);
    }

    function test_setValidityWindow_revertsIfTooLong() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceGate: window too long");
        gate.setValidityWindow(604801);
    }

    // -------------------------------------------------------------------------
    // setVerifier
    // -------------------------------------------------------------------------

    function test_setVerifier_updatesVerifier() public {
        MockVerifier newVerifier = new MockVerifier(true);
        vm.prank(owner);
        gate.setVerifier(address(newVerifier));
        assertEq(gate.verifier(), address(newVerifier));
    }

    function test_setVerifier_emitsEvent() public {
        MockVerifier newVerifier = new MockVerifier(true);
        vm.expectEmit(true, true, false, false);
        emit IComplianceGate.VerifierUpdated(address(verifier), address(newVerifier));
        vm.prank(owner);
        gate.setVerifier(address(newVerifier));
    }

    function test_setVerifier_revertsForZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceGate: zero verifier");
        gate.setVerifier(address(0));
    }

    function test_setVerifier_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert();
        gate.setVerifier(address(verifier));
    }

    // -------------------------------------------------------------------------
    // setSubmissionPaused
    // -------------------------------------------------------------------------

    function test_setSubmissionPaused_pausesSubmission() public {
        vm.prank(owner);
        gate.setSubmissionPaused(true);
        assertTrue(gate.submissionPaused());
    }

    function test_setSubmissionPaused_unpausesSubmission() public {
        vm.prank(owner);
        gate.setSubmissionPaused(true);
        vm.prank(owner);
        gate.setSubmissionPaused(false);
        assertFalse(gate.submissionPaused());
    }

    function test_setSubmissionPaused_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit IComplianceGate.SubmissionPauseToggled(true);
        vm.prank(owner);
        gate.setSubmissionPaused(true);
    }

    function test_setSubmissionPaused_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert();
        gate.setSubmissionPaused(true);
    }

    // -------------------------------------------------------------------------
    // Fuzz tests
    // -------------------------------------------------------------------------

    function testFuzz_assertCompliant_uniqueNullifiersAlwaysPass(bytes32 nullifier) public {
        vm.assume(nullifier != bytes32(0));
        bytes32[] memory inputs = new bytes32[](2);
        inputs[0] = ROOT_A;
        inputs[1] = nullifier;
        vm.prank(user);
        gate.assertCompliant(validProof, inputs, nullifier);
        assertTrue(gate.isNullifierUsed(nullifier));
    }

    function testFuzz_assertCompliant_replayAlwaysReverts(bytes32 nullifier) public {
        vm.assume(nullifier != bytes32(0));
        bytes32[] memory inputs = new bytes32[](2);
        inputs[0] = ROOT_A;
        inputs[1] = nullifier;
        vm.prank(user);
        gate.assertCompliant(validProof, inputs, nullifier);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IComplianceGate.NullifierAlreadyUsed.selector, nullifier)
        );
        gate.assertCompliant(validProof, inputs, nullifier);
    }
}