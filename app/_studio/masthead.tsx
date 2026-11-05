import type { ReactNode } from 'react';

export type BootMode = 'live' | 'fallback' | 'unavailable';

const MODELS = [
  { id: 'nemotron-3.5-content-safety', role: 'scan', job: 'pre-scan' },
  { id: 'glm-5.3-flash', role: 'write', job: 'script + repair' },
  { id: 'clef', role: 'decide', job: 'decisions' },
] as const;

interface DocketRow {
  label: string;
  flags?: readonly string[];
  text?: string;
}

const DOCKET: readonly DocketRow[] = [
  { label: 'Isolation', flags: ['--network=none', '--read-only', '--cap-drop=ALL'] },
  { label: 'Limits', flags: ['--memory=256m', '--cpus=0.5', '--pids-limit=64'] },
  { label: 'Secrets inside', text: '0 — the API key never enters the sandbox' },
  { label: 'Shadow probe', text: 'every leaf cell × 3, same script, sealed rerun' },
  { label: 'Oracle', text: 'P1 no mock · P2 conservation · P3 blast radius' },
  { label: 'Self-heal', text: '1 bounded repair pass, fresh container' },
];

function BrandMark(): ReactNode {
  return (
    <svg className="brand-mark" viewBox="0 0 30 30" aria-hidden="true">
      <rect className="bm-frame" x={1.5} y={1.5} width={27} height={27} rx={3} />
      <path className="bm-bars" d="M7.5 22.5v-6M12.5 22.5v-10M17.5 22.5v-7.5" />
      <path className="bm-lie" d="M22.5 22.5V6.5" />
      <path className="bm-strike" d="M19.5 9.5 25.5 15" />
      <path className="bm-rule" d="M5 24.5h20M5 26.5h20" />
    </svg>
  );
}

export function TopRail(): ReactNode {
  return (
    <header className="rail">
      <div className="shell rail-inner">
        <a className="brand" href="#top" aria-label="ChartTruth — back to top">
          <BrandMark />
          <span className="brand-name">ChartTruth</span>
          <span className="brand-tag">Forensic chart audit</span>
        </a>
        <p className="rail-event">
          <span className="caps">Vultr Agent Rush</span>
          <span>Challenge 01 · Blast Radius Zero</span>
        </p>
        <ul className="rail-models" aria-label="Vultr Serverless Inference models">
          {MODELS.map((model) => (
            <li key={model.id} data-role={model.role}>
              <span className="model-name">{model.id}</span>
              <span className="model-job">{model.job}</span>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

const BOOT_NOTE: Readonly<Record<BootMode, string>> = {
  live: 'inference: Vultr Serverless, live',
  fallback: 'inference: deterministic local fallback (no API key at render)',
  unavailable: 'boot run unavailable — press Run audit',
};

export function Hero({ bootMode }: { bootMode: BootMode }): ReactNode {
  return (
    <section className="hero shell" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="hero-eyebrow">Forensic audit for AI-generated charts</p>
        <h1 id="hero-title" className="hero-title">
          <span className="hero-line">
            The chart is a <span className="red-pencil">claim</span>.
          </span>
          <span className="hero-line">
            <em>The ledger is the proof.</em>
          </span>
        </h1>
        <p className="hero-lede">
          AI-written charting code fails quietly: it hardcodes numbers when a parser chokes, sums a
          Total row twice, or obeys a note in the CSV that asks for your API key. ChartTruth runs
          that code in a zero-secret, network-less container, replays it on a ×3 shadow copy of the
          data, and re-adds every leaf row with an independent oracle before any chart gets out.
        </p>
        <p className="hero-boot">
          <span className="boot-tag">Boot audit</span>
          <span>
            Exhibit A ran through the real five-stage pipeline on the server before this page
            loaded. Pick another exhibit, or edit the CSV, to audit it live.
            <span className="boot-mode">{BOOT_NOTE[bootMode]}</span>
          </span>
        </p>
      </div>
      <aside className="docket" aria-label="Audit docket">
        <header className="docket-head">
          <span className="caps">Audit docket</span>
          <span className="docket-no">BRZ-01</span>
        </header>
        <dl className="docket-rows">
          {DOCKET.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.flags
                  ? row.flags.map((flag) => (
                      <code key={flag} className="docket-flag">
                        {flag}
                      </code>
                    ))
                  : row.text}
              </dd>
            </div>
          ))}
        </dl>
        <p className="docket-sign">Countersigned by the independent accounting oracle</p>
        <p className="docket-stamp" aria-hidden="true">
          <span>Blast</span>
          <strong>Radius 0</strong>
          <span>sealed</span>
        </p>
      </aside>
    </section>
  );
}

export function SiteFooter(): ReactNode {
  return (
    <footer className="foot">
      <div className="shell foot-inner">
        <p className="foot-brand">
          <span className="brand-name">ChartTruth</span>
          <span className="caps">Vultr Agent Rush · Challenge 01 · Blast Radius Zero</span>
        </p>
        <p className="foot-meta">
          MIT · inference via <code>api.vultrinference.com/v1</code> · the API key stays in the
          control plane; every sandbox starts with zero secrets and is destroyed after one run.
        </p>
      </div>
    </footer>
  );
}
