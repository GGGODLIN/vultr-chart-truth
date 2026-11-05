import type { CSSProperties, ReactNode } from 'react';
import type { StudioViewModel } from '../../lib/studio-model.ts';
import type { ChartTruthRunResponse, PipelineRunAttempt } from '../../lib/types.ts';
import {
  BLAST_CENTER,
  BLAST_WALL,
  type BlastSpoke,
  type BlastTotals,
  blastSpokes,
  blastTotals,
  buildLedgerSheet,
  carbonLines,
  type ClefMeter,
  DECISION_LABEL,
  EVENT_LABEL,
  formatBytes,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type LedgerLine,
  type LedgerSheet,
  plural,
  probeRows,
  REASON_LABEL,
  type ReconciliationRow,
  round1,
} from './audit-model.ts';
import { DetailText } from './containers.tsx';

/* ───────── Schedule A · k×3 shadow probe ───────── */

function RatioGauge({ ratio, k }: { ratio: number | null; k: number }): ReactNode {
  const span = k + 1;
  const target = Math.round((k / span) * 1000) / 10;
  const position =
    ratio === null ? null : Math.round(Math.min(1, Math.max(0, ratio / span)) * 1000) / 10;
  return (
    <span className="ratio">
      <svg className="ratio-track" viewBox="-6 0 112 12" aria-hidden="true">
        <line className="ratio-rail" x1={0} x2={100} y1={6} y2={6} />
        <line className="ratio-target" x1={target} x2={target} y1={1} y2={11} />
        {position !== null ? <circle className="ratio-dot" cx={position} cy={6} r={3.6} /> : null}
      </svg>
      <span className="ratio-value">{ratio === null ? '—' : `×${ratio.toFixed(2)}`}</span>
    </span>
  );
}

interface ProbeBlockProps {
  title: string;
  attempt: PipelineRunAttempt | null;
  k: number;
}

function ProbeBlock({ title, attempt, k }: ProbeBlockProps): ReactNode {
  const rows = probeRows(attempt, k);
  const holds = attempt?.oracleVerdict.p1NoHardcodedMock ?? false;
  let verdictText = `P1 holds · every bar moved ×${k}`;
  if (!holds) {
    verdictText = rows.length === 0 ? 'P1 fails · nothing returned' : 'P1 fails · bars did not move';
  }
  return (
    <div className="probe-block">
      <p className="probe-caption">
        <span className="caps">{title}</span>
        <span className="probe-verdict" data-holds={holds}>
          {verdictText}
        </span>
      </p>
      {rows.length === 0 ? (
        <p className="probe-empty">
          No series to compare — the container was killed before it returned anything.
        </p>
      ) : (
        <div className="probe-scroll">
          <table className="probe-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Original</th>
                <th scope="col">{`Shadow ×${k}`}</th>
                <th scope="col">Moved by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-holds={row.holds ?? 'na'}>
                  <th scope="row">{row.category}</th>
                  <td>{formatMoney(row.original, row.currency)}</td>
                  <td className="probe-shadow">
                    {row.shadow === null ? '—' : formatMoney(row.shadow, row.currency)}
                  </td>
                  <td>
                    <RatioGauge ratio={row.ratio} k={k} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProbeSchedule({ response }: { response: ChartTruthRunResponse }): ReactNode {
  const initial = response.initialRun;
  const k = initial?.oracleVerdict.scaleFactorK ?? 3;
  const carbon = carbonLines(initial?.sandboxResult.shadowCsvText ?? '');
  return (
    <section className="schedule probe" aria-labelledby="probe-title">
      <header className="schedule-head">
        <p className="caps">Schedule A · P1 shadow probe</p>
        <h3 id="probe-title" className="schedule-title">
          Carbon copy <em>{`×${k}`}</em>
        </h3>
        <p className="schedule-lede">
          {`Every numeric leaf cell is multiplied by ${k}, and the same script runs again in its own sealed container. Honest aggregation moves by exactly ×${k}. A hardcoded mock stays frozen.`}
        </p>
      </header>
      <ProbeBlock title="Container #1" attempt={initial} k={k} />
      {response.repairedRun ? (
        <ProbeBlock title="Container #2" attempt={response.repairedRun} k={k} />
      ) : null}
      {carbon.lines.length > 0 ? (
        <figure className="carbon">
          <figcaption className="carbon-cap">
            <span>{`Shadow CSV · every leaf × ${k}`}</span>
            <span>{carbon.more > 0 ? `+${plural(carbon.more, 'row')}` : ''}</span>
          </figcaption>
          <pre>
            {carbon.lines.map((line) => (
              <span key={line.key} className="carbon-line">
                {line.text}
              </span>
            ))}
          </pre>
        </figure>
      ) : null}
    </section>
  );
}

/* ───────── Schedule B · blast radius ───────── */

function BlastMap({ spokes, totals }: { spokes: readonly BlastSpoke[]; totals: BlastTotals }): ReactNode {
  return (
    <svg
      className="blast-map"
      viewBox="0 0 300 300"
      role="img"
      aria-label={`Containment map: ${plural(spokes.length, 'escape attempt')} stopped at the wall of Container #1; ${formatBytes(totals.outboundBytes)} left the sandbox.`}
    >
      <circle className="blast-ring" cx={BLAST_CENTER} cy={BLAST_CENTER} r={140} />
      <circle className="blast-ring" cx={BLAST_CENTER} cy={BLAST_CENTER} r={106} />
      <text className="blast-ring-label" x={BLAST_CENTER} y={31}>
        {`NETWORK · ${formatBytes(totals.outboundBytes)} OUT`}
      </text>
      <text className="blast-ring-label" x={BLAST_CENTER} y={245}>
        {`HOST · ${formatBytes(totals.hostDiskDeltaBytes)} Δ`}
      </text>
      {spokes.map((spoke, order) =>
        spoke.ghostFrom && spoke.ghostTo ? (
          <g key={`ghost-${spoke.key}`} className="blast-ghost" style={{ '--i': order } as CSSProperties}>
            <line x1={spoke.ghostFrom.x} y1={spoke.ghostFrom.y} x2={spoke.ghostTo.x} y2={spoke.ghostTo.y} />
            <circle cx={spoke.ghostTo.x} cy={spoke.ghostTo.y} r={4} />
          </g>
        ) : null
      )}
      <circle className="blast-wall" cx={BLAST_CENTER} cy={BLAST_CENTER} r={BLAST_WALL} />
      <circle className="blast-tape" cx={BLAST_CENTER} cy={BLAST_CENTER} r={BLAST_WALL} />
      <text className="blast-core" x={BLAST_CENTER} y={BLAST_CENTER - 1}>
        #1
      </text>
      <text className="blast-core-sub" x={BLAST_CENTER} y={BLAST_CENTER + 12}>
        SEALED
      </text>
      {spokes.map((spoke, order) => (
        <g key={spoke.key} className="blast-spoke" style={{ '--i': order } as CSSProperties}>
          <line
            className="blast-path"
            x1={spoke.from.x}
            y1={spoke.from.y}
            x2={spoke.to.x}
            y2={spoke.to.y}
          />
          <line
            className="blast-stop"
            x1={spoke.stopA.x}
            y1={spoke.stopA.y}
            x2={spoke.stopB.x}
            y2={spoke.stopB.y}
          />
          <circle className="blast-badge" cx={spoke.badge.x} cy={spoke.badge.y} r={8.5} />
          <text className="blast-badge-n" x={spoke.badge.x} y={round1(spoke.badge.y + 3.4)}>
            {spoke.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function BlastSchedule({ response }: { response: ChartTruthRunResponse }): ReactNode {
  const totals = blastTotals(response);
  const spokes = blastSpokes(response.initialRun?.sandboxResult.sandboxReceipt.events ?? []);
  return (
    <section className="schedule blast" aria-labelledby="blast-title">
      <span className="vault-tape" aria-hidden="true" />
      <header className="schedule-head">
        <p className="caps">Schedule B · P3 containment</p>
        <h3 id="blast-title" className="schedule-title">
          {totals.breached ? (
            <>
              Blast radius <em>breached</em>
            </>
          ) : (
            <>
              Blast radius <em>= 0</em>
            </>
          )}
        </h3>
        <p className="schedule-lede">
          Where each escape attempt from Container #1 stopped. The API key lives in the control
          plane; the sandbox never had one to leak.
        </p>
      </header>
      <div className="blast-body">
        <BlastMap spokes={spokes} totals={totals} />
        {spokes.length > 0 ? (
          <ol className="blast-legend">
            {spokes.map((spoke) => (
              <li key={spoke.key}>
                <span className="blast-n" aria-hidden="true">
                  {spoke.n}
                </span>
                <span className="blast-kind">{EVENT_LABEL[spoke.type]}</span>
                <span className="blast-detail">
                  <DetailText detail={spoke.detail} />
                  {spoke.count > 1 ? ` ×${spoke.count}` : ''}
                </span>
                <span className="blast-at">{`t+${spoke.atMs} ms`}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="blast-quiet">
            No escape attempts recorded in Container #1. This exhibit lies with arithmetic, not
            with an exploit.
          </p>
        )}
      </div>
      <dl className="blast-readouts">
        <div>
          <dt>Outbound</dt>
          <dd className="blast-zero">{formatBytes(totals.outboundBytes)}</dd>
          <dd className="blast-sub">{`${plural(totals.outboundAttempts, 'attempt')} blocked`}</dd>
        </div>
        <div>
          <dt>Secrets exposed</dt>
          <dd className="blast-zero">{totals.secretsExposed}</dd>
          <dd className="blast-sub">{`${plural(totals.envReadAttempts, 'env read')} → undefined`}</dd>
        </div>
        <div>
          <dt>Host disk Δ</dt>
          <dd className="blast-zero">{formatBytes(totals.hostDiskDeltaBytes)}</dd>
          <dd className="blast-sub">{`${plural(totals.fsWriteAttempts, 'write')} refused`}</dd>
        </div>
      </dl>
      <p className="blast-foot">
        {`${plural(totals.containersDestroyed, 'container')} destroyed · ${totals.killed ? 'watchdog SIGKILL fired' : 'no watchdog kill needed'}`}
      </p>
    </section>
  );
}

/* ───────── Schedule C · reconciliation ledger ───────── */

interface LedgerRowProps {
  line: LedgerLine;
  noOutput: boolean;
}

function LedgerRow({ line, noOutput }: LedgerRowProps): ReactNode {
  const variance = line.beforePlotted - (line.inLedger ? line.expectedLeafSum : 0);
  const matched = line.discrepancyReason === 'matched';
  let finding = REASON_LABEL[line.discrepancyReason];
  if (noOutput) {
    finding = 'No output — container killed';
  } else if (!line.inLedger && line.discrepancyReason === 'subtotal_double_counted') {
    finding = 'Summary row plotted as a category';
  }
  return (
    <tr data-matched={matched}>
      <th scope="row">{line.category}</th>
      <td>
        {line.inLedger ? (
          formatMoney(line.expectedLeafSum, line.currency)
        ) : (
          <span className="cell-void">not a leaf row</span>
        )}
      </td>
      <td data-tone={matched ? undefined : 'red'}>
        {noOutput ? <span className="cell-void">—</span> : formatMoney(line.beforePlotted, line.currency)}
      </td>
      <td className="variance" data-tone={!noOutput && Math.abs(variance) >= 0.005 ? 'red' : undefined}>
        {noOutput ? <span className="cell-void">—</span> : formatSignedMoney(variance, line.currency)}
      </td>
      <td data-tone="green">
        {line.inLedger ? (
          formatMoney(line.afterPlotted, line.currency)
        ) : (
          <span className="cell-void">removed</span>
        )}
        {line.verified ? (
          <>
            <span className="cert-tick" aria-hidden="true">
              ✓
            </span>
            <span className="sr-only"> verified</span>
          </>
        ) : null}
      </td>
      <td className="finding" data-ok={matched}>
        {finding}
      </td>
    </tr>
  );
}

interface ReconciliationScheduleProps {
  rows: readonly ReconciliationRow[];
  response: ChartTruthRunResponse;
}

function LedgerTotals({ sheet }: { sheet: LedgerSheet }): ReactNode {
  const drifted = !sheet.noOutput && Math.abs(sheet.claimedTotal - sheet.ledgerTotal) >= 0.005;
  const tone = drifted ? 'red' : undefined;
  return (
    <tr>
      <th scope="row">Σ Total</th>
      <td>{formatMoney(sheet.ledgerTotal, sheet.currency)}</td>
      <td data-tone={tone}>
        {sheet.noOutput ? (
          <span className="cell-void">—</span>
        ) : (
          formatMoney(sheet.claimedTotal, sheet.currency)
        )}
      </td>
      <td className="variance" data-tone={tone}>
        {sheet.noOutput ? (
          <span className="cell-void">—</span>
        ) : (
          formatSignedMoney(sheet.claimedTotal - sheet.ledgerTotal, sheet.currency)
        )}
      </td>
      <td data-tone="green">{formatMoney(sheet.certifiedTotal, sheet.currency)}</td>
      <td className="finding" data-ok={sheet.conserved}>
        {sheet.conserved ? 'Conserved' : 'Not conserved'}
      </td>
    </tr>
  );
}

function listOrNone(items: readonly string[], none: string): string {
  return items.length > 0 ? items.join(', ') : none;
}

export function ReconciliationSchedule({ rows, response }: ReconciliationScheduleProps): ReactNode {
  const sheet = buildLedgerSheet(rows, response);
  return (
    <section className="schedule recon" aria-labelledby="recon-title">
      <header className="schedule-head">
        <p className="caps">Schedule C · P2 conservation</p>
        <h3 id="recon-title" className="schedule-title">
          Reconciliation <em>ledger</em>
        </h3>
        <p className="schedule-lede">
          The oracle parses the CSV on its own, sets Total and Subtotal rows aside, keeps one
          currency, and re-adds every leaf row. Each bar has to agree with it to the cent.
        </p>
      </header>
      <div className="recon-scroll">
        <table className="recon-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Ledger Σ</th>
              <th scope="col">Container #1</th>
              <th scope="col">Variance</th>
              <th scope="col">Certified</th>
              <th scope="col">Finding on #1</th>
            </tr>
          </thead>
          <tbody>
            {sheet.lines.map((line) => (
              <LedgerRow key={line.key} line={line} noOutput={sheet.noOutput} />
            ))}
          </tbody>
          <tfoot>
            <LedgerTotals sheet={sheet} />
          </tfoot>
        </table>
      </div>
      <p className="recon-meta">
        <span>{`Summary rows set aside: ${listOrNone(sheet.summaries, 'none')}`}</span>
        <span>{`Currencies in the CSV: ${listOrNone(sheet.currencies, '—')}`}</span>
        <span>{`Ledger currency: ${sheet.currency}`}</span>
      </p>
    </section>
  );
}

/* ───────── Schedule D · clef calibration ───────── */

function percentWidth(probability: number): string {
  return `${Math.round(Math.min(1, Math.max(0, probability)) * 1000) / 10}%`;
}

function ClefMeterRow({ meter, showBefore }: { meter: ClefMeter; showBefore: boolean }): ReactNode {
  return (
    <li className="clef-meter">
      <span className="clef-head">
        <span className="clef-label">{meter.label}</span>
        <span className="clef-values">
          {showBefore ? <s>{formatPercent(meter.beforeProbability)}</s> : null}
          {showBefore ? <span aria-hidden="true"> → </span> : null}
          <b>{meter.percentageText}</b>
        </span>
      </span>
      <span className="clef-track" aria-hidden="true">
        <span className="clef-fill" style={{ width: percentWidth(meter.afterProbability) }} />
        {showBefore ? (
          <span className="clef-mark" style={{ left: percentWidth(meter.beforeProbability) }} />
        ) : null}
      </span>
    </li>
  );
}

interface ClefScheduleProps {
  viewModel: StudioViewModel;
  response: ChartTruthRunResponse;
}

export function ClefSchedule({ viewModel, response }: ClefScheduleProps): ReactNode {
  const before = response.initialRun?.clefDecision ?? null;
  const after = viewModel.clefDecision;
  const repaired = response.repairedRun !== null;
  const live = after !== null && !after.usedFallback;
  return (
    <section className="schedule clef" aria-labelledby="clef-title">
      <header className="schedule-head">
        <p className="caps">Schedule D · Vultr clef</p>
        <h3 id="clef-title" className="schedule-title">
          Calibrated <em>decision</em>
        </h3>
        <p className="schedule-lede">
          {live
            ? 'clef scored each container’s audit telemetry live on Vultr Serverless Inference.'
            : 'No inference key was present for this run, so clef’s calibrated local fallback scored each container.'}
        </p>
      </header>
      <p className="clef-decision">
        {repaired && before ? (
          <>
            <span className="decision" data-verified={before.overallDecision === 'verified'}>
              {DECISION_LABEL[before.overallDecision]}
            </span>
            <span className="decision-arrow" aria-hidden="true">
              →
            </span>
          </>
        ) : null}
        {after ? (
          <span className="decision" data-verified={after.overallDecision === 'verified'}>
            {DECISION_LABEL[after.overallDecision]}
          </span>
        ) : null}
      </p>
      <ul className="clef-meters">
        {viewModel.clefMeters.map((meter) => (
          <ClefMeterRow key={meter.id} meter={meter} showBefore={repaired} />
        ))}
      </ul>
      {after ? <p className="clef-rationale">{after.rationale}</p> : null}
    </section>
  );
}
