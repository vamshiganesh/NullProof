// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompliantVault} from "../src/CompliantVault.sol";
import {ComplianceGate} from "../src/ComplianceGate.sol";
import {SanctionsList} from "../src/SanctionsList.sol";
import {IComplianceGate} from "../src/interfaces/IComplianceGate.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

contract MockVerifier is IVerifier {
    bool private _pass;
    constructor(bool pass) { _pass = pass; }
    function setPass(bool v) external { _pass = v; }
    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return _pass;
    }
}

contract CompliantVaultTest is Test {
    CompliantVault public vault;
    ComplianceGate public gate;
    SanctionsList public sanctionsList;
    MockVerifier public verifier;

    address public owner  = makeAddr("owner");
    address public oracle = makeAddr("oracle");
    address public user   = makeAddr("user");

    bytes32 public constant ROOT    = keccak256("root");
    bytes32 public constant NULL    = keccak256("nullifier");
    bytes   public proof = abi.encodePacked(bytes32("proof"));
    bytes32[] public inputs;

    function setUp() public {
        vm.prank(owner);
        sanctionsList = new SanctionsList(owner, oracle);
        verifier = new MockVerifier(true);
        vm.prank(owner);
        gate = new ComplianceGate(owner, address(sanctionsList), address(verifier));
        vault = new CompliantVault(address(gate));

        vm.prank(oracle);
        sanctionsList.updateRoot(ROOT, 100);

        inputs = new bytes32[](2);
        inputs[0] = ROOT;
        inputs[1] = NULL;
    }

    function test_deposit_creditsBalance() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        vault.deposit{value: 0.5 ether}(proof, inputs, NULL);
        assertEq(vault.balanceOf(user), 0.5 ether);
    }

    function test_deposit_consumesNullifier() public {
        vm.deal(user, 2 ether);
        vm.prank(user);
        vault.deposit{value: 1 ether}(proof, inputs, NULL);
        assertTrue(gate.isNullifierUsed(NULL));
    }

    function test_deposit_revertsOnReplay() public {
        vm.deal(user, 2 ether);
        vm.prank(user);
        vault.deposit{value: 1 ether}(proof, inputs, NULL);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(IComplianceGate.NullifierAlreadyUsed.selector, NULL)
        );
        vault.deposit{value: 1 ether}(proof, inputs, NULL);
    }

    function test_withdraw_returnsEth() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        vault.deposit{value: 1 ether}(proof, inputs, NULL);

        uint256 before = user.balance;
        vm.prank(user);
        vault.withdraw(0.4 ether);
        assertEq(user.balance, before + 0.4 ether);
        assertEq(vault.balanceOf(user), 0.6 ether);
    }

    function test_deposit_revertsOnInvalidProof() public {
        verifier.setPass(false);
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(IComplianceGate.InvalidProof.selector);
        vault.deposit{value: 1 ether}(proof, inputs, NULL);
    }
}
