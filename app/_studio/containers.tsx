import type { CSSProperties, ReactNode } from 'react';
import type { StudioViewModel } from '../../lib/studio-model.ts';
import type {
  ChartTruthRunResponse,
  ContainmentEvent,
  OracleVerdict,
  PipelineRunAttempt,
  SafetyScanFinding,
  SandboxReceipt,
} from '../../lib/types.ts';
import {
  type ChartAxis,
  countEvents,
  countFindings,
  EVENT_LABEL,
  type ExhibitIdentity,
  formatMoney,
  ledgerMap,
  PATTERN_LABEL,
  type PlotBar,
  plotBars,
  plural,
  probeRows,
  splitAxis,
  splitDetail,
  sumSeries,
} from './audit-model.ts';
import { AuditChart, type ChartMaterial } from './chart.tsx';

const INVARIANTS = [
  { code: 'P1', field: 'p1NoHardcodedMock', name: 'No hardcoded mock' },
  { code: 'P2', field: 'p2SubtotalAndCurrencyConservation', name: 'Leaf rows, one currency' },
  { code: 'P3', field: 'p3BlastRadiusZero', name: 'Blast radius 0' },
] as const;

interface InvariantLampsProps {
  verdict: OracleVerdict;
  material: ChartMaterial;
}

export function InvariantLamps({ verdict, material }: InvariantLampsProps): ReactNode {
  return (
    <ul className="lamps" data-material={material} aria-label="Oracle invariants">
      {INVARIANTS.map((invariant) => {
        const held = verdict[invariant.field];
        return (
          <li key={invariant.code} data-pass={held}>
            <b>{invariant.code}</b>
            {invariant.name}
            <span className="sr-only">{held ? ' — holds' : ' — violated'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ReceiptFlags({ receipt }: { receipt: SandboxReceipt }): ReactNode {
  return (
    <ul className="panel-flags" aria-label="Sandbox receipt">
      <li>{receipt.engine}</li>
      <li data-tone={receipt.exitCode === 0 ? 'ok' : 'alarm'}>{`exit ${receipt.exitCode}`}</li>
      <li>{`${receipt.durationMs} ms`}</li>
      <li data-tone="sealed">{receipt.containerDestroyed ? 'destroyed' : 'still running'}</li>
    </ul>
  );
}

interface ChartKeyProps {
  material: ChartMaterial;
  hasFlags?: boolean;
  hasTicks?: boolean;
}

function ChartKey({ material, hasFlags = false, hasTicks = false }: ChartKeyProps): ReactNode {
  if (material === 'paper') {
    return (
      <ul className="chart-key" data-material="paper" aria-hidden="true">
        <li>
          <i className="key-bar" /> certified bar
        </li>
        <li>
          <i className="key-axis" /> same axis as Container #1
        </li>
      </ul>
    );
  }
  return (
    <ul className="chart-key" data-material="vault" aria-hidden="true">
      <li>
        <i className="key-bar" /> plotted
      </li>
      {hasFlags ? (
        <li>
          <i className="key-hatch" /> rejected by the oracle
        </li>
      ) : null}
      {hasTicks ? (
        <li>
          <i className="key-tick" /> what the ledger says
        </li>
      ) : null}
    </ul>
  );
}

export function DetailText({ detail }: { detail: string }): ReactNode {
  const { text, flag } = splitDetail(detail);
  return (
    <>
      {text}
      {flag ? <span className="detail-flag">{flag}</span> : null}
    </>
  );
}

interface KillReadoutProps {
  receipt: SandboxReceipt | undefined;
  error: string | undefined;
}

function KillReadout({ receipt, error }: KillReadoutProps): ReactNode {
  let signal = 'NO OUTPUT';
  if (receipt?.memoryCapped) {
    signal = 'OOM KILL';
  } else if (receipt?.timedOut) {
    signal = 'SIGKILL';
  }
  return (
    <div className="kill">
      <p className="kill-signal">{signal}</p>
      <p className="kill-meta">
        {receipt
          ? `exit ${receipt.exitCode} · watchdog at ${receipt.durationMs} ms · 0 series emitted`
          : '0 series emitted'}
      </p>
      {error ? <p className="kill-stderr">{error}</p> : null}
    </div>
  );
}

interface SeizureLogProps {
  findings: readonly SafetyScanFinding[];
  events: readonly ContainmentEvent[];
}

function SeizureLog({ findings, events }: SeizureLogProps): ReactNode {
  const flags = countFindings(findings);
  const intercepts = countEvents(events);
  const total = flags.length + intercepts.length;
  return (
    <section className="seizure" aria-label="Seizure log">
      <p className="seizure-head">
        <span className="caps">Seizure log</span>
        <span className="seizure-count">{`${total} ${total === 1 ? 'entry' : 'entries'}`}</span>
      </p>
      {total === 0 ? (
        <p className="seizure-empty">No pre-scan flags. No escape attempts.</p>
      ) : (
        <ol>
          {flags.map((flag, order) => (
            <li key={flag.key} data-kind="scan" style={{ '--i': order } as CSSProperties}>
              <span className="seize-when">pre-scan</span>
              <span className="seize-type">SCAN</span>
              <span className="seize-what">
                {PATTERN_LABEL[flag.pattern] ?? flag.pattern}
                <em>{` in a ${flag.location} ${flag.location === 'header' ? 'cell' : 'row'}`}</em>
                {flag.count > 1 ? <em>{` ×${flag.count}`}</em> : null}
              </span>
            </li>
          ))}
          {intercepts.map((event, order) => (
            <li
              key={event.key}
              data-kind="intercept"
              style={{ '--i': flags.length + order } as CSSProperties}
            >
              <span className="seize-when">{`t+${event.atMs} ms`}</span>
              <span className="seize-type">{EVENT_LABEL[event.type]}</span>
              <span className="seize-what">
                <DetailText detail={event.detail} />
                {event.count > 1 ? <em>{` ×${event.count}`}</em> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface PanelProps {
  attempt: PipelineRunAttempt | null;
  bars: readonly PlotBar[];
  axis: ChartAxis;
  currency: string;
  identity: ExhibitIdentity;
}

interface VaultPanelProps extends PanelProps {
  response: ChartTruthRunResponse;
}

function VaultPanel({ attempt, bars, axis, currency, identity, response }: VaultPanelProps): ReactNode {
  const receipt = attempt?.sandboxResult.sandboxReceipt;
  const verdict = attempt?.oracleVerdict;
  const healed = response.selfHealTriggered;
  return (
    <article className="vault panel" aria-labelledby="vault-title">
      <span className="vault-tape" aria-hidden="true" />
      <header className="panel-head">
        <p className="panel-code">
          <span className="caps">Container #1</span>
          <span className="panel-id">{receipt?.containerId ?? 'not spawned'}</span>
        </p>
        {receipt ? <ReceiptFlags receipt={receipt} /> : null}
      </header>
      <h3 id="vault-title" className="panel-title">
        {healed ? 'Intercepted chart' : 'First-pass chart'}
        <span className="panel-exhibit">{`Exhibit ${identity.letter}-1`}</span>
      </h3>
      <p className="panel-sub">
        {healed
          ? 'What the AI-written script plotted, held behind glass until the oracle signed off.'
          : 'The first container already satisfied every invariant.'}
      </p>
      <div className="vault-glass">
        {bars.length > 0 ? (
          <AuditChart
            bars={bars}
            axis={axis}
            currency={currency}
            material="vault"
            label={`Container #1 chart: ${bars
              .map((bar) => `${bar.category} ${formatMoney(bar.value, bar.currency)}${bar.flagged ? ' (rejected)' : ''}`)
              .join(', ')}`}
          />
        ) : (
          <KillReadout receipt={receipt} error={attempt?.sandboxResult.error} />
        )}
      </div>
      {bars.length > 0 ? (
        <ChartKey
          material="vault"
          hasFlags={bars.some((bar) => bar.flagged)}
          hasTicks={bars.some((bar) => bar.ledgerY !== null)}
        />
      ) : null}
      <SeizureLog findings={response.safetyScan.findings} events={receipt?.events ?? []} />
      {verdict ? <InvariantLamps verdict={verdict} material="vault" /> : null}
      {verdict && !verdict.allPassed ? (
        <p className="counter">
          <b>Counterexample fed to the repair pass</b>
          {verdict.counterexampleSummary}
        </p>
      ) : null}
    </article>
  );
}

function RepairSeam({ repaired, retries }: { repaired: boolean; retries: number }): ReactNode {
  return (
    <div className="seam" data-repaired={repaired}>
      <span className="seam-label">{repaired ? 'Self-heal · glm-5.3-flash' : 'No repair needed'}</span>
      <span className="seam-node" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4.5 12h13.5M12.5 6.5 18 12l-5.5 5.5" />
        </svg>
      </span>
      <span className="seam-label">{`${retries} of 1 repair pass`}</span>
    </div>
  );
}

interface ClearanceEntry {
  key: string;
  code: string;
  text: string;
  ok: boolean;
}

function clearanceEntries(attempt: PipelineRunAttempt, currency: string): ClearanceEntry[] {
  const receipt = attempt.sandboxResult.sandboxReceipt;
  const verdict = attempt.oracleVerdict;
  const k = verdict.scaleFactorK;
  const moved = probeRows(attempt, k).every((row) => row.holds !== false);
  const plotted = sumSeries(attempt.sandboxResult.plottedSeries);
  const ledger = sumSeries(verdict.expectedSeries);
  const reachedOut = receipt.outboundAttempts + receipt.envReadAttempts + receipt.fsWriteAttempts;
  return [
    {
      key: 'run',
      code: 'RUN',
      text: `exit ${receipt.exitCode} after ${receipt.durationMs} ms · container ${receipt.containerDestroyed ? 'destroyed' : 'still running'}`,
      ok: receipt.exitCode === 0 && receipt.containerDestroyed,
    },
    {
      key: 'p1',
      code: 'P1',
      text: moved
        ? `every bar moved ×${k.toFixed(2)} on the shadow CSV`
        : 'some bars ignored the shadow CSV',
      ok: verdict.p1NoHardcodedMock,
    },
    {
      key: 'p2',
      code: 'P2',
      text: `Σ bars ${formatMoney(plotted, currency)} ${Math.abs(plotted - ledger) < 0.005 ? '=' : '≠'} Σ leaf rows ${formatMoney(ledger, currency)}`,
      ok: verdict.p2SubtotalAndCurrencyConservation,
    },
    {
      key: 'p3',
      code: 'P3',
      text: `${plural(receipt.outboundAttempts, 'network call')} · ${plural(receipt.envReadAttempts, 'env read')} · ${plural(receipt.fsWriteAttempts, 'file write')}`,
      ok: verdict.p3BlastRadiusZero && reachedOut === 0,
    },
  ];
}

function ClearanceLog({ attempt, currency }: { attempt: PipelineRunAttempt; currency: string }): ReactNode {
  const entries = clearanceEntries(attempt, currency);
  const cleared = entries.filter((entry) => entry.ok).length;
  return (
    <section className="clearance" aria-label="Clearance log">
      <p className="clearance-head">
        <span className="caps">Clearance log</span>
        <span className="clearance-count">{`${cleared} of ${entries.length} cleared`}</span>
      </p>
      <ol>
        {entries.map((entry, order) => (
          <li key={entry.key} data-ok={entry.ok} style={{ '--i': order } as CSSProperties}>
            <span className="clear-mark" aria-hidden="true">
              {entry.ok ? '✓' : '✗'}
            </span>
            <span className="clear-code">{entry.code}</span>
            <span className="clear-what">{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface SheetPanelProps extends PanelProps {
  repaired: boolean;
}

function SheetPanel({ attempt, bars, axis, currency, identity, repaired }: SheetPanelProps): ReactNode {
  const receipt = attempt?.sandboxResult.sandboxReceipt;
  const verdict = attempt?.oracleVerdict;
  const passed = verdict?.allPassed ?? false;
  const total = sumSeries(attempt?.sandboxResult.plottedSeries ?? []);
  return (
    <article className="sheet panel" aria-labelledby="sheet-title">
      <header className="panel-head">
        <p className="panel-code">
          <span className="caps">{repaired ? 'Container #2' : 'Container #1'}</span>
          <span className="panel-id">{receipt?.containerId ?? 'not spawned'}</span>
        </p>
        {receipt ? <ReceiptFlags receipt={receipt} /> : null}
      </header>
      <h3 id="sheet-title" className="panel-title">
        {passed ? 'Certified chart' : 'Repair still failing'}
        <span className="panel-exhibit">{`Exhibit ${identity.letter}-2`}</span>
      </h3>
      <p className="panel-sub">
        {repaired
          ? 'Rewritten from the counterexample, run in a fresh container, audited again.'
          : 'Passed on the first run — the repair budget was never touched.'}
      </p>
      <div className="sheet-plot">
        <AuditChart
          bars={bars}
          axis={axis}
          currency={currency}
          material="paper"
          label={`Certified chart: ${bars
            .map((bar) => `${bar.category} ${formatMoney(bar.value, bar.currency)}`)
            .join(', ')}`}
        />
      </div>
      <ChartKey material="paper" />
      {attempt ? <ClearanceLog attempt={attempt} currency={currency} /> : null}
      <footer className="certificate">
        {verdict ? <InvariantLamps verdict={verdict} material="paper" /> : null}
        <div className="certificate-row">
          <p className="certificate-total">
            <span className="caps">Conserved total</span>
            <strong>{formatMoney(total, currency)}</strong>
          </p>
          <p className="stamp" data-pass={passed}>
            {passed ? 'Verified' : 'Rejected'}
            <small>P1 · P2 · P3</small>
          </p>
        </div>
      </footer>
    </article>
  );
}

export interface ContainerSplitProps {
  viewModel: StudioViewModel;
  response: ChartTruthRunResponse;
  identity: ExhibitIdentity;
}

export function ContainerSplit({ viewModel, response, identity }: ContainerSplitProps): ReactNode {
  const finalRun = response.repairedRun ?? response.initialRun;
  const ledger = ledgerMap(finalRun);
  const axis = splitAxis(viewModel, ledger);
  const currency =
    finalRun?.oracleVerdict.expectedSeries[0]?.currency ??
    viewModel.afterBars[0]?.currency ??
    'USD';
  return (
    <div className="split">
      <VaultPanel
        attempt={response.initialRun}
        bars={plotBars(viewModel.beforeBars, axis, ledger)}
        axis={axis}
        currency={currency}
        identity={identity}
        response={response}
      />
      <RepairSeam repaired={response.repairedRun !== null} retries={viewModel.repairRetries} />
      <SheetPanel
        attempt={finalRun}
        bars={plotBars(viewModel.afterBars, axis)}
        axis={axis}
        currency={currency}
        identity={identity}
        repaired={response.repairedRun !== null}
      />
    </div>
  );
}
