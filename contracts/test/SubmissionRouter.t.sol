// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SubmissionRouter} from "../src/SubmissionRouter.sol";
import {IComplianceGate} from "../src/interfaces/IComplianceGate.sol";

// -------------------------------------------------------------------------
// Mock gate — records calls from the router
// -------------------------------------------------------------------------

contract MockComplianceGate is IComplianceGate {
    bytes public lastProof;
    bytes32 public lastNullifier;
    address public lastCaller;
    uint256 public callCount;

    function assertCompliant(
        bytes calldata proof,
        bytes32[] calldata,
        bytes32 nullifier
    ) external override {
        lastProof = proof;
        lastNullifier = nullifier;
        lastCaller = msg.sender;
        callCount++;
    }

  // Unused interface stubs
  function checkCompliant(bytes calldata, bytes32[] calldata, bytes32) external pure returns (bool) { return true; }
  function isNullifierUsed(bytes32) external pure returns (bool) { return false; }
  function nullifierUsedAt(bytes32) external pure returns (uint256) { return 0; }
  function sanctionsList() external pure returns (address) { return address(0); }
  function verifier() external pure returns (address) { return address(0); }
  function validityWindow() external pure returns (uint256) { return 0; }
  function submissionPaused() external pure returns (bool) { return false; }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

contract SubmissionRouterTest is Test {
    SubmissionRouter public router;
    MockComplianceGate public gate;

    address public relayer = makeAddr("relayer");
    address public stranger = makeAddr("stranger");

    bytes public proof = abi.encodePacked(bytes32("proof"));
    bytes32[] public publicInputs;
    bytes32 public constant NULLIFIER = keccak256("nullifier");

    function setUp() public {
        gate = new MockComplianceGate();
        router = new SubmissionRouter(relayer, address(gate));

        publicInputs = new bytes32[](1);
        publicInputs[0] = keccak256("root");
    }

    function test_constructor_setsImmutables() public view {
        assertEq(router.relayer(), relayer);
        assertEq(address(router.gate()), address(gate));
    }

    function test_constructor_revertsOnZeroRelayer() public {
        vm.expectRevert(SubmissionRouter.ZeroAddress.selector);
        new SubmissionRouter(address(0), address(gate));
    }

    function test_constructor_revertsOnZeroGate() public {
        vm.expectRevert(SubmissionRouter.ZeroAddress.selector);
        new SubmissionRouter(relayer, address(0));
    }

    function test_submitCompliant_forwardsToGate() public {
        vm.prank(relayer);
        router.submitCompliant(proof, publicInputs, NULLIFIER);

        assertEq(gate.callCount(), 1);
        assertEq(gate.lastNullifier(), NULLIFIER);
        assertEq(gate.lastCaller(), address(router));
        assertEq(gate.lastProof(), proof);
    }

    function test_submitCompliant_revertsForNonRelayer() public {
        vm.prank(stranger);
        vm.expectRevert(SubmissionRouter.OnlyRelayer.selector);
        router.submitCompliant(proof, publicInputs, NULLIFIER);
    }
}
