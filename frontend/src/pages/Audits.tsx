// frontend/src/pages/Audits.tsx
import { ComingSoon } from "@/components/ComingSoon";

const FEATURES = [
  { icon: "", label: "Full proof history", detail: "Every proof hash, timestamped on-chain" },
  { icon: "", label: "Address timeline",   detail: "See all checks run per wallet" },
  { icon: "", label: "CSV / JSON export",  detail: "One-click compliance report download" },
  { icon: "", label: "Tamper-proof log",   detail: "Anchored to Sepolia via ComplianceGate" },
];

export function Audits() {
  return <ComingSoon route="audits" title="Audit Log" subtitle="Immutable, on-chain record of every compliance check run through your account." features={FEATURES} />;
}

export default Audits;