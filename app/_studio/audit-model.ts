import { ADVERSARIAL_PRESETS } from '../../lib/presets.ts';
import type { StudioViewModel, SvgChartBar } from '../../lib/studio-model.ts';
import type {
  AdversarialPreset,
  AdversarialPresetId,
  ChartTruthRunResponse,
  ClefDecisionCard,
  ContainmentEvent,
  ContainmentEventType,
  DiscrepancyReason,
  PipelineRunAttempt,
  PipelineStageId,
  PipelineStageStatus,
  PlottedPoint,
  SafetyScanFinding,
  SandboxReceipt,
} from '../../lib/types.ts';

export type ReconciliationRow = StudioViewModel['reconciliationRows'][number];
export type StageItem = StudioViewModel['stages'][number];
export type ClefMeter = StudioViewModel['clefMeters'][number];

/* ───────── stable keys ───────── */

export type WithKey<T> = T & { key: string; occurrence: number };

// Untrusted scripts can emit the same category twice; the occurrence suffix keeps React keys unique
// without falling back to array positions.
export function withKeys<T extends object>(
  items: readonly T[],
  base: (item: T) => string
): WithKey<T>[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const root = base(item);
    const occurrence = seen.get(root) ?? 0;
    seen.set(root, occurrence + 1);
    return {
      ...item,
      key: occurrence === 0 ? root : `${root}~${occurrence}`,
      occurrence,
    };
  });
}

/* ───────── formatting ───────── */

function currencyPrefix(currency: string): string {
  return currency === 'USD' ? '$' : `${currency} `;
}

function trimFixed(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export function formatMoney(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const body = Math.abs(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? '−' : ''}${currencyPrefix(currency)}${body}`;
}

export function formatSignedMoney(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) {
    return '±0';
  }
  const body = Math.abs(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return `${value > 0 ? '+' : '−'}${currencyPrefix(currency)}${body}`;
}

function compactBody(abs: number): string {
  if (abs >= 1e9) {
    return `${trimFixed(abs / 1e9, 2)}B`;
  }
  if (abs >= 1e6) {
    return `${trimFixed(abs / 1e6, 2)}M`;
  }
  if (abs >= 1e3) {
    return `${trimFixed(abs / 1e3, 1)}k`;
  }
  return trimFixed(abs, 0);
}

export function formatCompactMoney(value: number, currency = 'USD'): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const sign = value < 0 ? '−' : '';
  return `${sign}${currencyPrefix(currency)}${compactBody(Math.abs(value))}`;
}

export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${trimFixed(bytes / 1024, 1)} KB`;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

export function sumSeries(series: readonly PlottedPoint[]): number {
  return series.reduce(
    (total, point) => total + (Number.isFinite(point.value) ? point.value : 0),
    0
  );
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ───────── exhibits ───────── */

export const EXHIBIT_LETTERS: Readonly<Record<AdversarialPresetId, string>> = {
  'preset-1-subtotal-exfil': 'A',
  'preset-2-hardcoded-currency': 'B',
  'preset-3-loop-bomb': 'C',
};

export const CUSTOM_LETTER = 'D';

export function isExhibitId(id: string | undefined): id is AdversarialPresetId {
  return ADVERSARIAL_PRESETS.some((preset) => preset.id === id);
}

export function exhibitTitle(preset: AdversarialPreset): string {
  return preset.name.replace(/^Preset\s+\d+:\s*/, '');
}

export interface ExhibitIdentity {
  letter: string;
  title: string;
  trap: string;
  isCustom: boolean;
}

export function exhibitIdentity(scenarioId: string | undefined): ExhibitIdentity {
  const preset = ADVERSARIAL_PRESETS.find((candidate) => candidate.id === scenarioId);
  if (!preset) {
    return {
      letter: CUSTOM_LETTER,
      title: 'Your CSV',
      trap: 'Custom data · same sandbox, probe and oracle',
      isCustom: true,
    };
  }
  return {
    letter: EXHIBIT_LETTERS[preset.id],
    title: exhibitTitle(preset),
    trap: preset.subtitle,
    isCustom: false,
  };
}

export interface CsvStats {
  rows: number;
  bytes: number;
  header: string;
}

export function csvStats(csvText: string): CsvStats {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return {
    rows: Math.max(0, lines.length - 1),
    bytes: new TextEncoder().encode(csvText).length,
    header: lines[0]?.trim() ?? '',
  };
}

export function runKey(response: ChartTruthRunResponse): string {
  const ids = [response.initialRun, response.repairedRun].map(
    (run) => run?.sandboxResult.sandboxReceipt.containerId ?? '-'
  );
  return `${response.scenarioId ?? 'custom'}:${ids.join('/')}`;
}

/* ───────── shared-scale chart ───────── */

// Mirrors the frame buildSvgChartBars draws into (lib/studio-model.ts). Bars keep that function's
// x, width and label truncation; only their heights are re-scaled here, so if the frame there
// moves, these numbers must move with it.
export const CHART_FRAME = {
  width: 520,
  height: 240,
  left: 44,
  right: 496,
  baseline: 196,
  plotHeight: 148,
} as const;

export interface ChartAxis {
  max: number;
  ticks: number[];
}

const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

export function niceAxis(maxValue: number, targetTicks = 5): ChartAxis {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 1, ticks: [0] };
  }
  const rawStep = maxValue / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const nice = NICE_STEPS.find((step) => step >= rawStep / magnitude) ?? 10;
  const step = nice * magnitude;
  const count = Math.max(1, Math.ceil(maxValue / step - 1e-9));
  const ticks = Array.from({ length: count + 1 }, (_, slot) =>
    Number((slot * step).toPrecision(12))
  );
  return { max: ticks[ticks.length - 1] ?? maxValue, ticks };
}

export function yFor(value: number, axis: ChartAxis): number {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const share = axis.max > 0 ? Math.min(1, safe / axis.max) : 0;
  return round1(CHART_FRAME.baseline - share * CHART_FRAME.plotHeight);
}

export function wrapLabel(label: string, maxChars: number, maxLines = 2): string[] {
  const clean = label.trim();
  if (maxChars < 3 || clean.length === 0) {
    return [];
  }
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < words.length && lines.length < maxLines) {
    let line = words[cursor] ?? '';
    cursor += 1;
    while (cursor < words.length && `${line} ${words[cursor]}`.length <= maxChars) {
      line = `${line} ${words[cursor]}`;
      cursor += 1;
    }
    lines.push(line);
  }
  const overflow = cursor < words.length;
  const lastLine = lines.length - 1;
  return lines.map((line, lineNo) =>
    line.length > maxChars || (lineNo === lastLine && overflow)
      ? `${line.slice(0, maxChars - 1).trimEnd()}…`
      : line
  );
}

function barValueText(value: number, currency: string, slot: number): string | null {
  if (slot >= 86) {
    return formatMoney(value, currency);
  }
  if (slot >= 40) {
    return formatCompactMoney(value, currency);
  }
  return null;
}

export interface PlotBar extends WithKey<SvgChartBar> {
  plotTop: number;
  plotHeight: number;
  plotValueY: number;
  lines: string[];
  valueText: string | null;
  ledgerValue: number | null;
  ledgerY: number | null;
  ledgerText: string | null;
  ledgerTextY: number | null;
}

export function ledgerMap(attempt: PipelineRunAttempt | null): Map<string, number> {
  return new Map(
    (attempt?.oracleVerdict.expectedSeries ?? []).map((point) => [point.category, point.value])
  );
}

export function plotBars(
  bars: readonly SvgChartBar[],
  axis: ChartAxis,
  ledger: ReadonlyMap<string, number> = new Map()
): PlotBar[] {
  const slot = (CHART_FRAME.right - CHART_FRAME.left) / Math.max(1, bars.length);
  const maxChars = Math.floor((slot - 8) / 5.6);
  return withKeys(bars, (bar) => bar.category).map((bar) => {
    const plotTop = yFor(bar.value, axis);
    const ledgerValue = bar.flagged ? (ledger.get(bar.category) ?? null) : null;
    const ledgerY = ledgerValue !== null && ledgerValue > 0 ? yFor(ledgerValue, axis) : null;
    const gap = ledgerY === null ? null : plotTop - ledgerY;
    // A ledger tick hugging the bar top would sit on the value label, so the label climbs above it;
    // a tick well clear of the bar gets its own figure instead.
    const crowded = gap !== null && gap > 0 && gap < 16;
    const roomy = gap !== null && gap >= 16;
    const ledgerFigure = ledgerValue === null ? null : barValueText(ledgerValue, bar.currency, slot);
    return {
      ...bar,
      plotTop,
      plotHeight: round1(CHART_FRAME.baseline - plotTop),
      plotValueY: Math.max(22, round1((crowded && ledgerY !== null ? ledgerY : plotTop) - 8)),
      lines: wrapLabel(bar.displayLabel, maxChars),
      valueText: barValueText(bar.value, bar.currency, slot),
      ledgerValue,
      ledgerY,
      ledgerText:
        roomy && ledgerFigure !== null ? `${slot >= 120 ? 'ledger ' : ''}${ledgerFigure}` : null,
      ledgerTextY: roomy && ledgerY !== null ? Math.max(14, round1(ledgerY - 6)) : null,
    };
  });
}

// One axis for both containers: a per-chart scale would draw $180,000 shorter beside a
// double-counted Total than it is beside the certified bars, which is the very distortion
// this page exists to expose.
export function splitAxis(
  viewModel: StudioViewModel,
  ledger: ReadonlyMap<string, number>
): ChartAxis {
  const values = [
    ...viewModel.beforeBars.map((bar) => bar.value),
    ...viewModel.afterBars.map((bar) => bar.value),
    ...ledger.values(),
  ];
  return niceAxis(
    values.reduce((max, value) => (Number.isFinite(value) && value > max ? value : max), 0)
  );
}

/* ───────── verdict tally ───────── */

export type TallyDrift = 'over' | 'under' | 'exact' | 'void';

export interface AuditTally {
  claimed: number | null;
  ledger: number;
  certified: number;
  currency: string;
  ratio: number | null;
  drift: TallyDrift;
}

export function buildTally(response: ChartTruthRunResponse): AuditTally {
  const finalRun = response.repairedRun ?? response.initialRun;
  const claimedSeries = response.initialRun?.sandboxResult.plottedSeries ?? [];
  const ledgerSeries = finalRun?.oracleVerdict.expectedSeries ?? [];
  const certifiedSeries = finalRun?.sandboxResult.plottedSeries ?? [];
  const claimed = claimedSeries.length > 0 ? sumSeries(claimedSeries) : null;
  const ledger = sumSeries(ledgerSeries);
  const ratio = claimed !== null && ledger !== 0 ? claimed / ledger : null;
  let drift: TallyDrift = 'void';
  if (claimed !== null) {
    drift = Math.abs(claimed - ledger) < 0.005 ? 'exact' : claimed > ledger ? 'over' : 'under';
  }
  return {
    claimed,
    ledger,
    certified: sumSeries(certifiedSeries),
    currency: ledgerSeries[0]?.currency ?? certifiedSeries[0]?.currency ?? 'USD',
    ratio,
    drift,
  };
}

/* ───────── reconciliation ledger ───────── */

export interface LedgerLine extends WithKey<ReconciliationRow> {
  inLedger: boolean;
}

export interface LedgerSheet {
  lines: LedgerLine[];
  currency: string;
  ledgerTotal: number;
  claimedTotal: number;
  certifiedTotal: number;
  noOutput: boolean;
  conserved: boolean;
  summaries: string[];
  currencies: string[];
}

export function buildLedgerSheet(
  rows: readonly ReconciliationRow[],
  response: ChartTruthRunResponse
): LedgerSheet {
  const finalRun = response.repairedRun ?? response.initialRun;
  const verdict = finalRun?.oracleVerdict;
  const ledgerCategories = new Set((verdict?.expectedSeries ?? []).map((point) => point.category));
  const lines = withKeys(rows, (row) => `${row.category}:${row.discrepancyReason}`).map((row) => ({
    ...row,
    inLedger: ledgerCategories.has(row.category),
  }));
  return {
    lines,
    currency: lines[0]?.currency ?? 'USD',
    ledgerTotal: lines.reduce((total, line) => total + (line.inLedger ? line.expectedLeafSum : 0), 0),
    claimedTotal: lines.reduce((total, line) => total + line.beforePlotted, 0),
    certifiedTotal: sumSeries(finalRun?.sandboxResult.plottedSeries ?? []),
    noOutput: (response.initialRun?.sandboxResult.plottedSeries.length ?? 0) === 0,
    conserved: verdict?.allPassed ?? false,
    summaries: verdict?.summaryRowLabelsDetected ?? [],
    currencies: verdict?.currenciesDetected ?? [],
  };
}

/* ───────── k×3 shadow probe ───────── */

export interface ProbeRow {
  key: string;
  category: string;
  currency: string;
  original: number;
  shadow: number | null;
  ratio: number | null;
  holds: boolean | null;
}

export function probeRows(attempt: PipelineRunAttempt | null, k: number): ProbeRow[] {
  if (!attempt) {
    return [];
  }
  const shadowByCategory = new Map<string, number[]>();
  for (const point of attempt.sandboxResult.shadowSeries) {
    shadowByCategory.set(point.category, [
      ...(shadowByCategory.get(point.category) ?? []),
      point.value,
    ]);
  }
  return withKeys(attempt.sandboxResult.plottedSeries, (point) => point.category).map(
    (point) => {
      const shadow = shadowByCategory.get(point.category)?.[point.occurrence] ?? null;
      const rawRatio = shadow !== null && point.value !== 0 ? shadow / point.value : null;
      const ratio = rawRatio !== null && Number.isFinite(rawRatio) ? rawRatio : null;
      let holds: boolean | null = false;
      if (ratio !== null) {
        holds = Math.abs(ratio - k) < 1e-6;
      } else if (shadow === 0 && point.value === 0) {
        holds = null;
      }
      return {
        key: point.key,
        category: point.category,
        currency: point.currency ?? 'USD',
        original: point.value,
        shadow,
        ratio,
        holds,
      };
    }
  );
}

export interface CarbonCopy {
  lines: WithKey<{ text: string }>[];
  more: number;
}

export function carbonLines(shadowCsv: string, limit = 5): CarbonCopy {
  const all = shadowCsv.split(/\r?\n/).filter((line) => line.length > 0);
  return {
    lines: withKeys(
      all.slice(0, limit).map((text) => ({ text })),
      (line) => line.text
    ),
    more: Math.max(0, all.length - limit),
  };
}

/* ───────── seizure log ───────── */

export interface CountedFinding {
  key: string;
  location: SafetyScanFinding['location'];
  pattern: string;
  count: number;
}

export function countFindings(findings: readonly SafetyScanFinding[]): CountedFinding[] {
  const counted = new Map<string, CountedFinding>();
  for (const finding of findings) {
    const key = `${finding.location}:${finding.pattern}`;
    const previous = counted.get(key);
    counted.set(
      key,
      previous
        ? { ...previous, count: previous.count + 1 }
        : { key, location: finding.location, pattern: finding.pattern, count: 1 }
    );
  }
  return [...counted.values()];
}

export interface CountedEvent {
  key: string;
  type: ContainmentEventType;
  detail: string;
  atMs: number;
  count: number;
}

export function countEvents(events: readonly ContainmentEvent[]): CountedEvent[] {
  const counted = new Map<string, CountedEvent>();
  for (const event of events) {
    const key = `${event.type}:${event.detail}`;
    const previous = counted.get(key);
    counted.set(
      key,
      previous
        ? { ...previous, count: previous.count + 1 }
        : { key, type: event.type, detail: event.detail, atMs: event.timestampMs, count: 1 }
    );
  }
  return [...counted.values()];
}

// Sandbox details end in the docker flag that stopped them, e.g. "(--network=none)"; pulling that
// out lets the flag render as one unbreakable chip instead of splitting at its hyphens.
export function splitDetail(detail: string): { text: string; flag: string | null } {
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(detail);
  return match ? { text: match[1] ?? detail, flag: match[2] ?? null } : { text: detail, flag: null };
}

export const PATTERN_LABEL: Readonly<Record<string, string>> = {
  prompt_injection_override: 'Prompt-injection override',
  env_secret_exfil: 'Secret-exfiltration bait',
  outbound_network_exfil: 'Outbound URL',
  infinite_loop_bomb: 'Loop bomb',
  filesystem_escape_attempt: 'Filesystem escape',
  nemotron_content_safety_flag: 'Content-safety flag',
};

export const EVENT_LABEL: Readonly<Record<ContainmentEventType, string>> = {
  network: 'NET',
  env: 'ENV',
  filesystem: 'FS',
  timeout: 'CPU',
  memory: 'MEM',
  syntax: 'SYN',
};

export const REASON_LABEL: Readonly<Record<DiscrepancyReason | 'matched', string>> = {
  matched: 'Matches the ledger',
  subtotal_double_counted: 'Summary row double-counted',
  currency_mixed: 'Currencies summed together',
  value_mismatch: 'Value mismatch',
  hardcoded_unscaled: 'Hardcoded — ignored the ×3 probe',
  missing_category: 'Missing from the chart',
};

export const DECISION_LABEL: Readonly<Record<ClefDecisionCard['overallDecision'], string>> = {
  verified: 'Verified',
  rejected_lie: 'Rejected lie',
  contained_exploit: 'Contained exploit',
};

/* ───────── pipeline stamps ───────── */

export const STAGE_NAMES: Readonly<Record<PipelineStageId, string>> = {
  safetyPreScan: 'Safety pre-scan',
  codeGen: 'Code generation',
  sandboxRun: 'Sandbox + shadow probe',
  oracleAndClefAudit: 'Oracle + clef audit',
  selfHeal: 'Self-heal',
};

export type StageTone = 'flag' | 'clear' | 'heal' | 'idle';
type StageStatus = PipelineStageStatus['status'];

const STAGE_VERDICTS: Readonly<
  Record<PipelineStageId, Partial<Record<StageStatus, readonly [string, StageTone]>>>
> = {
  safetyPreScan: {
    triggered: ['Injection flagged', 'flag'],
    completed: ['Clean', 'clear'],
  },
  codeGen: { completed: ['Script drafted', 'clear'] },
  sandboxRun: {
    triggered: ['Escape contained', 'flag'],
    completed: ['No incident', 'clear'],
  },
  oracleAndClefAudit: {
    triggered: ['Invariant broken', 'flag'],
    completed: ['All invariants hold', 'clear'],
  },
  selfHeal: {
    triggered: ['Repaired in #2', 'heal'],
    skipped: ['Not needed', 'idle'],
  },
};

export function stageVerdict(
  id: PipelineStageId,
  status: StageStatus
): { text: string; tone: StageTone } {
  const match = STAGE_VERDICTS[id][status];
  if (match) {
    return { text: match[0], tone: match[1] };
  }
  const tone: StageTone =
    status === 'skipped' ? 'idle' : status === 'triggered' ? 'flag' : 'clear';
  return { text: status, tone };
}

function scriptSource(
  attempt: PipelineRunAttempt,
  exhibit: boolean,
  role: 'draft' | 'repair'
): string {
  if (!attempt.usedFallbackGenerator) {
    return attempt.generationModel;
  }
  if (exhibit) {
    return role === 'draft'
      ? 'exhibit script · deterministic replay'
      : 'exhibit repair · deterministic replay';
  }
  return 'local compliant generator';
}

export function stageProvenance(id: PipelineStageId, response: ChartTruthRunResponse): string {
  const exhibit = isExhibitId(response.scenarioId);
  const initial = response.initialRun;
  switch (id) {
    case 'safetyPreScan': {
      const scan = response.safetyScan;
      const mode = scan.mode === 'vultr' ? 'live' : 'local rules';
      return `${scan.modelUsed} · ${mode} · ${plural(scan.findings.length, 'flag')}`;
    }
    case 'codeGen':
      return initial ? scriptSource(initial, exhibit, 'draft') : '—';
    case 'sandboxRun': {
      const receipt = initial?.sandboxResult.sandboxReceipt;
      return receipt
        ? `${receipt.engine} · ${receipt.durationMs} ms · exit ${receipt.exitCode}`
        : '—';
    }
    case 'oracleAndClefAudit': {
      const clef = initial?.clefDecision;
      return clef ? `oracle P1·P2·P3 · clef ${clef.usedFallback ? 'fallback' : 'live'}` : '—';
    }
    case 'selfHeal':
      return response.repairedRun
        ? scriptSource(response.repairedRun, exhibit, 'repair')
        : 'repair budget unused';
  }
}

/* ───────── blast radius ───────── */

export interface BlastTotals {
  outboundBytes: number;
  hostDiskDeltaBytes: number;
  secretsExposed: number;
  outboundAttempts: number;
  envReadAttempts: number;
  fsWriteAttempts: number;
  killed: boolean;
  containersDestroyed: number;
  breached: boolean;
}

export function blastTotals(response: ChartTruthRunResponse): BlastTotals {
  const receipts = [response.initialRun, response.repairedRun].flatMap((run) =>
    run ? [run.sandboxResult.sandboxReceipt] : []
  );
  const sum = (pick: (receipt: SandboxReceipt) => number): number =>
    receipts.reduce((total, receipt) => total + pick(receipt), 0);
  const outboundBytes = sum((receipt) => receipt.outboundBytes);
  const hostDiskDeltaBytes = sum((receipt) => receipt.hostDiskDeltaBytes);
  const secretsExposed = receipts.filter((receipt) => receipt.hostSecretExposed).length;
  return {
    outboundBytes,
    hostDiskDeltaBytes,
    secretsExposed,
    outboundAttempts: sum((receipt) => receipt.outboundAttempts),
    envReadAttempts: sum((receipt) => receipt.envReadAttempts),
    fsWriteAttempts: sum((receipt) => receipt.fsWriteAttempts),
    killed: receipts.some((receipt) => receipt.timedOut || receipt.memoryCapped),
    containersDestroyed: response.containersDestroyed,
    breached: outboundBytes > 0 || hostDiskDeltaBytes > 0 || secretsExposed > 0,
  };
}

export const BLAST_CENTER = 150;
export const BLAST_WALL = 72;

const SPOKE_ANGLE: Readonly<Record<ContainmentEventType, number>> = {
  env: -135,
  network: -45,
  timeout: 45,
  memory: 90,
  filesystem: 135,
  syntax: -90,
};

interface Point {
  x: number;
  y: number;
}

function polar(radius: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: round1(BLAST_CENTER + radius * Math.cos(rad)),
    y: round1(BLAST_CENTER + radius * Math.sin(rad)),
  };
}

// The ring each kind of escape was reaching for: the network ring for egress, the host ring for
// secrets, disk and CPU. The map draws that unreached leg as a ghost beyond the wall.
const SPOKE_TARGET: Readonly<Record<ContainmentEventType, number | null>> = {
  network: 140,
  env: 106,
  filesystem: 106,
  timeout: 106,
  memory: 106,
  syntax: null,
};

export interface BlastSpoke extends CountedEvent {
  n: number;
  badge: Point;
  from: Point;
  to: Point;
  stopA: Point;
  stopB: Point;
  ghostFrom: Point | null;
  ghostTo: Point | null;
}

export function blastSpokes(events: readonly ContainmentEvent[]): BlastSpoke[] {
  const counted = withKeys(countEvents(events), (event) => event.type);
  return counted.map((event, order) => {
    const angle = SPOKE_ANGLE[event.type] + event.occurrence * 16;
    const target = SPOKE_TARGET[event.type];
    return {
      key: event.key,
      type: event.type,
      detail: event.detail,
      atMs: event.atMs,
      count: event.count,
      n: order + 1,
      badge: polar(34, angle),
      from: polar(44, angle),
      to: polar(BLAST_WALL - 5, angle),
      stopA: polar(BLAST_WALL - 2, angle - 8),
      stopB: polar(BLAST_WALL - 2, angle + 8),
      ghostFrom: target === null ? null : polar(BLAST_WALL + 9, angle),
      ghostTo: target === null ? null : polar(target, angle),
    };
  });
}
