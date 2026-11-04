'use client';

import type { RefObject } from 'react';
import { useReducer, useRef } from 'react';
import { ADVERSARIAL_PRESETS } from '../lib/presets.ts';
import {
  createInitialStudioState,
  reduceStudioState,
  type StudioAction,
  type StudioState,
  type StudioViewModel,
  type SvgChartBar,
} from '../lib/studio-model.ts';
import type {
  AdversarialPresetId,
  ChartTruthRunResponse,
  SafetyScanVerdict,
} from '../lib/types.ts';

function formatAmount(value: number, currency = 'USD'): string {
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${value.toLocaleString('en-US')}`;
}

function StudioHeader() {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-emerald-300">
              Challenge 01: Blast Radius Zero
            </span>
            <span className="text-xs font-mono text-slate-400">
              Vultr Cloud Compute + Serverless Inference
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
            ChartTruth — AI Chart Accounting &amp; Containment Studio
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="rounded border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-sky-300">
            nemotron-3.5-content-safety
          </span>
          <span className="rounded border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-amber-300">
            glm-5.3-flash
          </span>
          <span className="rounded border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-emerald-300">
            clef (decisions)
          </span>
        </div>
      </div>
    </header>
  );
}

interface PresetSelectorBarProps {
  selectedPresetId: StudioState['selectedPresetId'];
  onSelectPreset: (presetId: AdversarialPresetId) => void;
}

function PresetSelectorBar({
  selectedPresetId,
  onSelectPreset,
}: PresetSelectorBarProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {ADVERSARIAL_PRESETS.map((preset) => {
        const active = selectedPresetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelectPreset(preset.id)}
            className={`rounded-xl border p-3.5 text-left transition ${
              active
                ? 'border-emerald-500 bg-emerald-950/30 shadow-sm'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">
                {preset.name}
              </span>
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-mono text-rose-300">
                {preset.badge}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-emerald-300">
              {preset.subtitle}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              {preset.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

interface PresetAndEditorProps {
  state: StudioState;
  onSelectPreset: (presetId: AdversarialPresetId) => void;
  onUpdateCsv: (csvText: string) => void;
  onUpdatePrompt: (prompt: string) => void;
  onRunAudit: () => void;
}

function CsvAndPromptForm({
  state,
  onUpdateCsv,
  onUpdatePrompt,
  onRunAudit,
}: Omit<PresetAndEditorProps, 'onSelectPreset'>) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <label
          htmlFor="csv-editor"
          className="block text-xs font-mono uppercase tracking-wider text-slate-400"
        >
          Untrusted CSV Input ({state.selectedPresetId})
        </label>
        <textarea
          id="csv-editor"
          rows={5}
          value={state.csvText}
          onChange={(e) => onUpdateCsv(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-col justify-between gap-3">
        <div>
          <label
            htmlFor="prompt-editor"
            className="block text-xs font-mono uppercase tracking-wider text-slate-400"
          >
            Chart Transformation Prompt
          </label>
          <textarea
            id="prompt-editor"
            rows={3}
            value={state.prompt}
            onChange={(e) => onUpdatePrompt(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onRunAudit}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-950 transition hover:bg-emerald-400"
        >
          {state.isRunning
            ? 'Running Sandbox & Oracle Audit...'
            : 'Run Containment & Oracle Audit'}
        </button>
      </div>
    </div>
  );
}

function PresetAndEditorPanel(props: PresetAndEditorProps) {
  const { state, onSelectPreset } = props;
  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <PresetSelectorBar
        selectedPresetId={state.selectedPresetId}
        onSelectPreset={onSelectPreset}
      />
      <CsvAndPromptForm {...props} />
      {state.errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-4 py-2.5 text-xs text-rose-200"
        >
          {state.errorMessage}
        </div>
      ) : null}
    </section>
  );
}

interface PipelineStagesBarProps {
  stages: StudioViewModel['stages'];
  repairRetries: number;
}

function stageBadgeTone(status: 'completed' | 'triggered' | 'skipped'): string {
  if (status === 'triggered') {
    return 'border-amber-500/40 bg-amber-950/30 text-amber-300';
  }
  if (status === 'completed') {
    return 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300';
  }
  return 'border-slate-700 bg-slate-900 text-slate-400';
}

function PipelineStagesBar({ stages, repairRetries }: PipelineStagesBarProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
          5-Stage Containment &amp; Self-Healing Pipeline
        </span>
        <span className="text-xs font-mono text-emerald-300">
          Bounded Self-Heal Retries: {repairRetries} / 1
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={`rounded-lg border px-3 py-2.5 ${stageBadgeTone(stage.status)}`}
          >
            <div className="text-xs font-semibold">{stage.label}</div>
            <div className="mt-1 text-[11px] font-mono uppercase">
              Status: {stage.status}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface SvgBarGroupProps {
  bar: SvgChartBar;
  variant: 'before' | 'after';
}

function SvgBarGroup({ bar, variant }: SvgBarGroupProps) {
  const fill = bar.flagged
    ? '#f43f5e'
    : variant === 'after'
      ? '#10b981'
      : '#64748b';
  return (
    <g>
      <rect
        x={bar.x}
        y={bar.y}
        width={bar.width}
        height={bar.height}
        rx={4}
        fill={fill}
      />
      <text
        x={bar.labelX}
        y={bar.valueY}
        textAnchor="middle"
        fill={bar.flagged ? '#fda4af' : '#e2e8f0'}
        fontSize={10}
        fontFamily="monospace"
      >
        {formatAmount(bar.value, bar.currency)}
      </text>
      <text
        x={bar.labelX}
        y={bar.labelY}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={10}
      >
        {bar.displayLabel}
      </text>
    </g>
  );
}

interface SvgChartCardProps {
  title: string;
  subtitle: string;
  bars: SvgChartBar[];
  variant: 'before' | 'after';
}

function SvgChartCard({ title, subtitle, bars, variant }: SvgChartCardProps) {
  const borderClass =
    variant === 'before'
      ? 'border-rose-500/40 bg-rose-950/10'
      : 'border-emerald-500/40 bg-emerald-950/10';
  return (
    <div className={`rounded-2xl border p-4 ${borderClass}`}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-white">
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-300">{subtitle}</p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
        {bars.length === 0 ? (
          <div className="flex h-52 items-center justify-center text-center text-xs font-mono text-rose-300">
            Container #1 terminated by watchdog resource cap (exitCode = 137 / 0 series emitted)
          </div>
        ) : (
          <svg
            viewBox="0 0 520 240"
            className="h-56 w-full"
            role="img"
            aria-label={title}
          >
            <line
              x1={36}
              y1={196}
              x2={504}
              y2={196}
              stroke="#334155"
              strokeWidth={1.5}
            />
            {bars.map((bar) => (
              <SvgBarGroup key={bar.category} bar={bar} variant={variant} />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}

interface BlastRadiusTelemetryProps {
  card: StudioViewModel['blastRadiusCard'];
  safetyScan: SafetyScanVerdict;
}

function BlastRadiusMetrics({
  card,
}: {
  card: StudioViewModel['blastRadiusCard'];
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-sm font-bold text-emerald-400">
          {card.outboundBytesLabel}
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          --network=none enforced
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-sm font-bold text-emerald-400">
          {card.secretsExposedLabel}
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Zero-secret child container
        </div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-sm font-bold text-emerald-400">
          {card.hostDiskDeltaLabel}
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          --read-only rootfs + --cap-drop=ALL
        </div>
      </div>
    </div>
  );
}

function BlastRadiusTelemetryCard({
  card,
  safetyScan,
}: BlastRadiusTelemetryProps) {
  return (
    <section className="rounded-2xl border border-emerald-500/40 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300">
          Blast Radius = 0 Containment Telemetry Ledger
        </h2>
        <span className="rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-mono text-emerald-300">
          Containers Destroyed: {card.containersDestroyed}
        </span>
      </div>
      <BlastRadiusMetrics card={card} />
      <div className="mt-3 space-y-1.5 text-xs font-mono">
        {safetyScan.findings.map((finding) => (
          <div
            key={`${finding.location}-${finding.pattern}`}
            className="rounded border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-amber-200"
          >
            [nemotron-3.5-content-safety] Flagged {finding.pattern} in CSV {finding.location}
          </div>
        ))}
        {card.events.map((ev) => (
          <div
            key={`${ev.type}-${ev.detail}`}
            className="rounded border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-rose-200"
          >
            [Intercepted {ev.type.toUpperCase()}] {ev.detail}
          </div>
        ))}
      </div>
    </section>
  );
}

function OracleReconciliationTable({
  rows,
}: {
  rows: StudioViewModel['reconciliationRows'];
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-white">
        Independent Oracle Category Reconciliation (P1 Shadow k=3 &amp; P2 Conservation)
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 font-mono text-slate-400">
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Oracle Leaf Sum</th>
              <th className="py-2 pr-3">Container #1</th>
              <th className="py-2 pr-3">Verified Output</th>
              <th className="py-2">Audit Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-mono">
            {rows.map((row) => (
              <tr key={row.category}>
                <td className="py-2 pr-3 font-sans font-medium text-white">
                  {row.category}
                </td>
                <td className="py-2 pr-3 text-slate-300">
                  {formatAmount(row.expectedLeafSum, row.currency)}
                </td>
                <td className="py-2 pr-3 text-rose-300">
                  {formatAmount(row.beforePlotted, row.currency)}
                </td>
                <td className="py-2 pr-3 text-emerald-300">
                  {formatAmount(row.afterPlotted, row.currency)}
                </td>
                <td className="py-2">
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                    {row.discrepancyReason === 'matched'
                      ? 'VERIFIED'
                      : `HEALED (${row.discrepancyReason})`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClefProbabilitiesCard({ viewModel }: { viewModel: StudioViewModel }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-white">
        Vultr clef Calibrated Probabilities
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Decision: {viewModel.clefDecision?.overallDecision ?? 'verified'}
      </p>
      <div className="mt-4 space-y-3">
        {viewModel.clefMeters.map((meter) => (
          <div key={meter.id} className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">{meter.label}</span>
              <span className="text-emerald-300">
                {Math.round(meter.beforeProbability * 100)}% → {meter.percentageText}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500"
                style={{ width: meter.percentageText }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-300">
        {viewModel.clefDecision?.rationale}
      </p>
    </div>
  );
}

function StudioAuditResults({
  viewModel,
  response,
}: {
  viewModel: StudioViewModel;
  response: ChartTruthRunResponse;
}) {
  const beforeSub =
    response.initialRun?.oracleVerdict.counterexampleSummary ?? '';
  const afterSub =
    (response.repairedRun ?? response.initialRun)?.oracleVerdict
      .counterexampleSummary ?? '';
  return (
    <>
      <PipelineStagesBar
        stages={viewModel.stages}
        repairRetries={viewModel.repairRetries}
      />
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SvgChartCard
          title={viewModel.beforeTitle}
          subtitle={beforeSub}
          bars={viewModel.beforeBars}
          variant="before"
        />
        <SvgChartCard
          title={viewModel.afterTitle}
          subtitle={afterSub}
          bars={viewModel.afterBars}
          variant="after"
        />
      </section>
      <BlastRadiusTelemetryCard
        card={viewModel.blastRadiusCard}
        safetyScan={response.safetyScan}
      />
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <OracleReconciliationTable rows={viewModel.reconciliationRows} />
        <ClefProbabilitiesCard viewModel={viewModel} />
      </section>
    </>
  );
}

async function executeAuditFetch(
  payload: { scenarioId?: string; csvText: string; prompt: string },
  requestId: number,
  signal: AbortSignal,
  dispatch: (action: StudioAction) => void
): Promise<void> {
  try {
    const res = await fetch('/api/chart-truth/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as
        | ChartTruthRunResponse
        | null;
      dispatch({
        type: 'FAIL_AUDIT',
        requestId,
        errorMessage:
          errBody?.error?.message ?? `Audit request failed (HTTP ${res.status}).`,
      });
      return;
    }
    const data = (await res.json()) as ChartTruthRunResponse;
    dispatch({ type: 'RESOLVE_AUDIT', requestId, response: data });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    dispatch({
      type: 'FAIL_AUDIT',
      requestId,
      errorMessage:
        err instanceof Error ? err.message : 'Network error during audit.',
    });
  }
}

function nextAbortableRequest(
  abortRef: RefObject<AbortController | null>,
  seqRef: RefObject<number>
): { requestId: number; signal: AbortSignal } {
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;
  seqRef.current += 1;
  return { requestId: seqRef.current, signal: controller.signal };
}

export default function ChartTruthStudioPage() {
  const [state, dispatch] = useReducer(
    reduceStudioState,
    undefined,
    createInitialStudioState
  );
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleRunAudit = () => {
    const { requestId, signal } = nextAbortableRequest(abortRef, requestSeqRef);
    const scenarioId =
      state.selectedPresetId === 'custom' ? undefined : state.selectedPresetId;
    dispatch({ type: 'START_AUDIT', requestId });
    void executeAuditFetch(
      { scenarioId, csvText: state.csvText, prompt: state.prompt },
      requestId,
      signal,
      dispatch
    );
  };

  const handleSelectPreset = (presetId: AdversarialPresetId) => {
    const preset =
      ADVERSARIAL_PRESETS.find((p) => p.id === presetId) ??
      ADVERSARIAL_PRESETS[0];
    const { requestId, signal } = nextAbortableRequest(abortRef, requestSeqRef);
    dispatch({ type: 'SELECT_PRESET', presetId, requestId });
    void executeAuditFetch(
      { scenarioId: preset.id, csvText: preset.csvText, prompt: preset.prompt },
      requestId,
      signal,
      dispatch
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 pb-16 text-slate-100">
      <StudioHeader />
      <div className="mx-auto max-w-7xl space-y-6 px-6 pt-6">
        <PresetAndEditorPanel
          state={state}
          onSelectPreset={handleSelectPreset}
          onUpdateCsv={(csvText) => dispatch({ type: 'UPDATE_CSV', csvText })}
          onUpdatePrompt={(prompt) =>
            dispatch({ type: 'UPDATE_PROMPT', prompt })
          }
          onRunAudit={handleRunAudit}
        />
        {state.viewModel && state.lastResponse ? (
          <StudioAuditResults
            viewModel={state.viewModel}
            response={state.lastResponse}
          />
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-xs font-mono text-slate-400">
            Select an adversarial preset above or click &quot;Run Containment &amp; Oracle Audit&quot; to execute inside an isolated zero-secret sandbox.
          </div>
        )}
      </div>
    </main>
  );
}
