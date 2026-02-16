// frontend/src/components/ComingSoon.tsx

interface ComingSoonFeature {
    icon:   string;
    label:  string;
    detail: string;
  }
  
  export function ComingSoon({
    title,
    subtitle,
    features,
  }: {
    route:    string;
    title:    string;
    subtitle: string;
    features: ComingSoonFeature[];
  }) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-8 p-8 text-center">
        <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Coming in v2
        </span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
          <p className="max-w-sm text-sm text-zinc-600">{subtitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {features.map(({ icon, label, detail }) => (
            <div key={label} className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-left">
              <span className="text-lg" aria-hidden="true">{icon}</span>
              <p className="text-[11px] font-semibold text-zinc-400">{label}</p>
              <p className="text-[10px] leading-relaxed text-zinc-600">{detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-700">
          This page will be live in the v2 release. Star the repo to get notified.
        </p>
      </div>
    );
  }