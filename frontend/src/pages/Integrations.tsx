// frontend/src/pages/Integrations.tsx
import { ComingSoon } from "@/components/ComingSoon";

const FEATURES = [
  { icon: "", label: "One-line SDK",       detail: "npm install @nullproof/sdk" },
  { icon: "", label: "Webhook callbacks",  detail: "Push proof events to your backend" },
  { icon: "", label: "CI/CD gate",         detail: "Block deploys if signer is flagged" },
  { icon: "", label: "Hardhat / Foundry",  detail: "Native test-suite plugin" },
];

export function Integrations() {
  return <ComingSoon route="integrations" title="Integrations" subtitle="Connect NullProof directly to your dApp, SDK, or CI pipeline." features={FEATURES} />;
}

export default Integrations;