// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SanctionsList} from "../src/SanctionsList.sol";
import {ComplianceGate} from "../src/ComplianceGate.sol";

/// @title Deploy
/// @notice Foundry deployment script for the NullProof contract suite.
/// @dev Run on Sepolia with:
///
///      forge script script/Deploy.s.sol \
///        --rpc-url $SEPOLIA_RPC_URL \
///        --broadcast \
///        --verify \
///        --etherscan-api-key $ETHERSCAN_API_KEY \
///        -vvvv
///
///      Required environment variables (set in contracts/.env):
///        DEPLOYER_PRIVATE_KEY   — private key of the deployer wallet
///        ORACLE_ADDRESS         — address authorised to call updateRoot()
///        VERIFIER_ADDRESS       — address of the pre-deployed nargo Verifier contract
///        SEPOLIA_RPC_URL        — Alchemy/Infura Sepolia RPC endpoint
///        ETHERSCAN_API_KEY      — for automatic contract verification
///
///      Deployment order:
///        1. SanctionsList  (owner=deployer, updater=oracle)
///        2. ComplianceGate (owner=deployer, sanctionsList=above, verifier=env)
///
///      The Verifier contract is deployed separately via:
///        bb write_vk --scheme ultra_honk -b circuit/target/nullproof.json -o circuit/target/vk
///        bb contract --scheme ultra_honk -k circuit/target/vk -o contracts/src/Verifier.sol
///        forge script script/Deploy.s.sol --sig "deployVerifier()" ...
contract Deploy is Script {
    // -------------------------------------------------------------------------
    // State (populated during run, logged at end)
    // -------------------------------------------------------------------------

    SanctionsList public sanctionsListContract;
    ComplianceGate public complianceGateContract;

    // -------------------------------------------------------------------------
    // Main deployment entry point
    // -------------------------------------------------------------------------

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        address verifierAddr = vm.envAddress("VERIFIER_ADDRESS");

        console2.log("=== NullProof Deployment ===");
        console2.log("Deployer:         ", deployer);
        console2.log("Oracle:           ", oracle);
        console2.log("Verifier:         ", verifierAddr);
        console2.log("Chain ID:         ", block.chainid);
        console2.log("Block:            ", block.number);

        _validateInputs(deployer, oracle, verifierAddr);

        vm.startBroadcast(deployerKey);

        // Step 1: Deploy SanctionsList
        sanctionsListContract = new SanctionsList(deployer, oracle);
        console2.log("SanctionsList:    ", address(sanctionsListContract));

        // Step 2: Deploy ComplianceGate
        complianceGateContract = new ComplianceGate(
            deployer,
            address(sanctionsListContract),
            verifierAddr
        );
        console2.log("ComplianceGate:   ", address(complianceGateContract));

        vm.stopBroadcast();

        _logDeployment(deployer, oracle, verifierAddr);
        _verifiyInvariants();
    }

    // -------------------------------------------------------------------------
    // Separate entry point: deploy Verifier only
    // -------------------------------------------------------------------------

    /// @notice Deploy only the auto-generated Verifier contract.
    /// @dev Called before run() on first deploy, or after circuit changes.
    ///      Import the generated Verifier.sol before calling this:
    ///        forge script script/Deploy.s.sol --sig "deployVerifier()" ...
    function deployVerifier() external pure {
        console2.log("Verifier deployment must be run after generating Verifier.sol via bb contract.");
        console2.log("Steps:");
        console2.log("  1. nargo compile");
        console2.log("  2. bb write_vk --scheme ultra_honk -b circuit/target/nullproof_non_membership.json -o circuit/target/vk");
        console2.log("  3. bb contract --scheme ultra_honk -k circuit/target/vk -o contracts/src/Verifier.sol");
        console2.log("  4. forge script script/Deploy.s.sol --sig deployVerifier() --broadcast ...");
        console2.log("  5. Set VERIFIER_ADDRESS in .env to the deployed address");
        console2.log("  6. Run forge script script/Deploy.s.sol --broadcast ...");
    }

    // -------------------------------------------------------------------------
    // Upgrade entry points
    // -------------------------------------------------------------------------

    /// @notice Point an existing ComplianceGate at a new Verifier after circuit update.
    /// @dev Run after regenerating and deploying a new Verifier.sol:
    ///      forge script script/Deploy.s.sol \
    ///        --sig "upgradeVerifier(address,address)" \
    ///        <complianceGateAddress> <newVerifierAddress> \
    ///        --broadcast ...
    function upgradeVerifier(address complianceGateAddr, address newVerifierAddr) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        require(complianceGateAddr != address(0), "Deploy: zero compliance gate");
        require(newVerifierAddr != address(0), "Deploy: zero verifier");

        console2.log("=== Upgrading Verifier ===");
        console2.log("ComplianceGate:   ", complianceGateAddr);
        console2.log("New Verifier:     ", newVerifierAddr);

        vm.startBroadcast(deployerKey);
        ComplianceGate(complianceGateAddr).setVerifier(newVerifierAddr);
        vm.stopBroadcast();

        console2.log("Verifier upgraded successfully.");
    }

    /// @notice Authorise a new oracle address on an existing SanctionsList.
    function authoriseOracle(address sanctionsListAddr, address newOracle) external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        require(sanctionsListAddr != address(0), "Deploy: zero sanctions list");
        require(newOracle != address(0), "Deploy: zero oracle");

        console2.log("=== Authorising Oracle ===");
        console2.log("SanctionsList:    ", sanctionsListAddr);
        console2.log("New Oracle:       ", newOracle);

        vm.startBroadcast(deployerKey);
        SanctionsList(sanctionsListAddr).authoriseUpdater(newOracle);
        vm.stopBroadcast();

        console2.log("Oracle authorised.");
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _validateInputs(
        address deployer,
        address oracle,
        address verifierAddr
    ) internal pure {
        require(deployer != address(0), "Deploy: zero deployer");
        require(oracle != address(0), "Deploy: zero oracle");
        require(verifierAddr != address(0), "Deploy: zero verifier - deploy Verifier.sol first");
    }

    function _logDeployment(
        address deployer,
        address oracle,
        address verifierAddr
    ) internal view {
        console2.log("");
        console2.log("=== Deployment Complete ===");
        console2.log("Network:          Sepolia");
        console2.log("Chain ID:         ", block.chainid);
        console2.log("Deployer:         ", deployer);
        console2.log("Oracle:           ", oracle);
        console2.log("");
        console2.log("Contract Addresses:");
        console2.log("  SanctionsList:  ", address(sanctionsListContract));
        console2.log("  ComplianceGate: ", address(complianceGateContract));
        console2.log("  Verifier:       ", verifierAddr);
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Copy addresses above into frontend/.env.local");
        console2.log("  2. Copy addresses into backend/.env");
        console2.log("  3. Run backend oracle to publish first root");
        console2.log("  4. Verify contracts on Sepolia Etherscan");
    }

    function _verifiyInvariants() internal view {
        require(
            address(sanctionsListContract) != address(0),
            "Deploy: SanctionsList not deployed"
        );
        require(
            address(complianceGateContract) != address(0),
            "Deploy: ComplianceGate not deployed"
        );
        require(
            complianceGateContract.sanctionsList() == address(sanctionsListContract),
            "Deploy: ComplianceGate points to wrong SanctionsList"
        );
        console2.log("Invariants passed.");
    }
}