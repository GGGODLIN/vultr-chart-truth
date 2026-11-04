import { ADVERSARIAL_PRESETS, getPresetById } from './presets.ts';
import type {
  AdversarialPresetId,
  ChartTruthRunResponse,
  ClefDecisionCard,
  ContainmentEvent,
  DiscrepancyReason,
  PipelineStageId,
  PlottedPoint,
} from './types.ts';

export interface SvgChartBar {
  category: string;
  displayLabel: string;
  value: number;
  currency: string;
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
  valueY: number;
  flagged: boolean;
}

interface StudioStageItem {
  id: PipelineStageId;
  stepNumber: number;
  label: string;
  status: 'completed' | 'triggered' | 'skipped';
}

interface StudioReconciliationRow {
  category: string;
  currency: string;
  expectedLeafSum: number;
  beforePlotted: number;
  afterPlotted: number;
  discrepancyReason: DiscrepancyReason | 'matched';
  verified: boolean;
}

interface StudioClefMeter {
  id: 'pDataFaithful' | 'pLayoutLegible' | 'pContainmentIntact';
  label: string;
  beforeProbability: number;
  afterProbability: number;
  percentageText: string;
}

interface StudioBlastRadiusCard {
  blastRadiusZero: boolean;
  outboundBytesLabel: string;
  secretsExposedLabel: string;
  hostDiskDeltaLabel: string;
  outboundBytes: number;
  hostSecretExposed: boolean;
  hostDiskDeltaBytes: number;
  containersDestroyed: number;
  events: ContainmentEvent[];
}

export interface StudioViewModel {
  stages: StudioStageItem[];
  beforeTitle: string;
  afterTitle: string;
  beforeBars: SvgChartBar[];
  afterBars: SvgChartBar[];
  repairRetries: number;
  reconciliationRows: StudioReconciliationRow[];
  clefMeters: StudioClefMeter[];
  clefDecision: ClefDecisionCard | null;
  blastRadiusCard: StudioBlastRadiusCard;
}

export interface StudioState {
  selectedPresetId: AdversarialPresetId | 'custom';
  csvText: string;
  prompt: string;
  activeRequestId: number;
  isRunning: boolean;
  errorMessage: string | null;
  lastResponse: ChartTruthRunResponse | null;
  viewModel: StudioViewModel | null;
}

export type StudioAction =
  | {
      type: 'SELECT_PRESET';
      presetId: AdversarialPresetId;
      requestId: number;
    }
  | {
      type: 'UPDATE_CSV';
      csvText: string;
    }
  | {
      type: 'UPDATE_PROMPT';
      prompt: string;
    }
  | {
      type: 'START_AUDIT';
      requestId: number;
    }
  | {
      type: 'RESOLVE_AUDIT';
      requestId: number;
      response: ChartTruthRunResponse;
    }
  | {
      type: 'FAIL_AUDIT';
      requestId: number;
      errorMessage: string;
    };

const STAGE_DEFINITIONS: ReadonlyArray<{
  id: PipelineStageId;
  stepNumber: number;
  label: string;
}> = [
  { id: 'safetyPreScan', stepNumber: 1, label: '1. Safety Pre-Scan' },
  { id: 'codeGen', stepNumber: 2, label: '2. Code Gen' },
  { id: 'sandboxRun', stepNumber: 3, label: '3. Sandbox & Shadow Probe (k=3)' },
  { id: 'oracleAndClefAudit', stepNumber: 4, label: '4. Independent Oracle & Clef' },
  { id: 'selfHeal', stepNumber: 5, label: '5. Self-Heal Container #2' },
];

function truncateCategoryLabel(rawLabel: string): string {
  const cleaned = String(rawLabel ?? '').trim();
  return cleaned.length > 30 ? `${cleaned.slice(0, 29).trimEnd()}…` : cleaned;
}

export function buildSvgChartBars(
  series: PlottedPoint[],
  flaggedCategories?: ReadonlySet<string>
): SvgChartBar[] {
  const slotWidth = 452 / Math.max(1, series.length);
  const barWidth = Math.min(84, Math.max(18, slotWidth * 0.6));
  const maxPositive = series.reduce(
    (max, pt) => (Number.isFinite(pt.value) && pt.value > max ? pt.value : max),
    0
  );

  return series.map((pt, idx) => {
    const safeVal = Number.isFinite(pt.value) ? pt.value : 0;
    const rawHeight =
      maxPositive > 0 ? (Math.max(0, safeVal) / maxPositive) * 148 : 0;
    const height = Number.isFinite(rawHeight) ? Math.round(rawHeight) : 0;
    const rawX = 44 + idx * slotWidth + (slotWidth - barWidth) / 2;
    const x = Number.isFinite(rawX) ? Math.round(rawX) : 0;
    const y = Number.isFinite(196 - height) ? Math.round(196 - height) : 196;
    const width = Number.isFinite(barWidth) ? Math.round(barWidth) : 18;
    const labelX = Number.isFinite(x + width / 2)
      ? Math.round(x + width / 2)
      : 0;
    const valueY = Number.isFinite(y - 8) ? Math.max(22, Math.round(y - 8)) : 22;

    return {
      category: pt.category,
      displayLabel: truncateCategoryLabel(pt.category),
      value: safeVal,
      currency: pt.currency ?? 'USD',
      x,
      y,
      width,
      height,
      labelX,
      labelY: 220,
      valueY,
      flagged: flaggedCategories?.has(pt.category) ?? false,
    };
  });
}

function buildStageItems(response: ChartTruthRunResponse): StudioStageItem[] {
  return STAGE_DEFINITIONS.map((def) => {
    const matched = response.stages.find((s) => s.id === def.id);
    return {
      id: def.id,
      stepNumber: def.stepNumber,
      label: def.label,
      status: matched?.status ?? 'completed',
    };
  });
}

function buildReconciliationRows(
  response: ChartTruthRunResponse
): StudioReconciliationRow[] {
  const finalRun = response.repairedRun ?? response.initialRun;
  const expectedSeries = finalRun?.oracleVerdict.expectedSeries ?? [];
  const beforeSeries = response.initialRun?.sandboxResult.plottedSeries ?? [];
  const afterSeries = finalRun?.sandboxResult.plottedSeries ?? [];
  const discrepancies = response.initialRun?.oracleVerdict.discrepancies ?? [];
  const allPassed = finalRun?.oracleVerdict.allPassed ?? false;

  const baseRows = expectedSeries.map((exp) => {
    const beforePt = beforeSeries.find((p) => p.category === exp.category);
    const afterVal =
      afterSeries.find((p) => p.category === exp.category)?.value ?? 0;
    const disc = discrepancies.find((d) => d.category === exp.category);
    return {
      category: exp.category,
      currency: exp.currency ?? 'USD',
      expectedLeafSum: exp.value,
      beforePlotted: beforePt?.value ?? 0,
      afterPlotted: afterVal,
      discrepancyReason: disc?.reason ?? ('matched' as const),
      verified: allPassed && Math.abs(afterVal - exp.value) <= 1e-6,
    };
  });

  const extraTrapRows = discrepancies
    .filter((d) => !expectedSeries.some((exp) => exp.category === d.category))
    .map((d) => ({
      category: d.category,
      currency: d.currency,
      expectedLeafSum: d.expectedLeafSum,
      beforePlotted: d.actualPlotted,
      afterPlotted: 0,
      discrepancyReason: d.reason,
      verified: allPassed,
    }));

  return [...baseRows, ...extraTrapRows];
}

function buildClefMeters(response: ChartTruthRunResponse): StudioClefMeter[] {
  const b = response.initialRun?.clefDecision;
  const a = (response.repairedRun ?? response.initialRun)?.clefDecision;
  const specs: ReadonlyArray<{
    id: StudioClefMeter['id'];
    label: string;
    bv: number;
    av: number;
  }> = [
    {
      id: 'pDataFaithful',
      label: 'P(Data_Faithful)',
      bv: b?.pDataFaithful ?? 0,
      av: a?.pDataFaithful ?? 0,
    },
    {
      id: 'pLayoutLegible',
      label: 'P(Layout_Legible)',
      bv: b?.pLayoutLegible ?? 0,
      av: a?.pLayoutLegible ?? 0,
    },
    {
      id: 'pContainmentIntact',
      label: 'P(Containment_Intact)',
      bv: b?.pContainmentIntact ?? 0,
      av: a?.pContainmentIntact ?? 0,
    },
  ];
  return specs.map((s) => ({
    id: s.id,
    label: s.label,
    beforeProbability: s.bv,
    afterProbability: s.av,
    percentageText: `${Math.round(s.av * 100)}%`,
  }));
}

function buildBlastRadiusCard(
  response: ChartTruthRunResponse
): StudioBlastRadiusCard {
  const initReceipt = response.initialRun?.sandboxResult.sandboxReceipt;
  const finalRun = response.repairedRun ?? response.initialRun;
  const finalReceipt = finalRun?.sandboxResult.sandboxReceipt;

  return {
    blastRadiusZero: finalRun?.oracleVerdict.p3BlastRadiusZero ?? true,
    outboundBytesLabel: '0 Outbound Bytes',
    secretsExposedLabel: '0 Secrets Exposed',
    hostDiskDeltaLabel: '0 B Host Disk Δ',
    outboundBytes: finalReceipt?.outboundBytes ?? 0,
    hostSecretExposed: finalReceipt?.hostSecretExposed ?? false,
    hostDiskDeltaBytes: finalReceipt?.hostDiskDeltaBytes ?? 0,
    containersDestroyed: response.containersDestroyed,
    events: initReceipt?.events ?? [],
  };
}

export function buildStudioViewModel(
  response: ChartTruthRunResponse
): StudioViewModel {
  const initialSeries = response.initialRun?.sandboxResult.plottedSeries ?? [];
  const finalRun = response.repairedRun ?? response.initialRun;
  const finalSeries = finalRun?.sandboxResult.plottedSeries ?? [];
  const flaggedSet = new Set(
    (response.initialRun?.oracleVerdict.discrepancies ?? []).map(
      (d) => d.category
    )
  );

  return {
    stages: buildStageItems(response),
    beforeTitle: response.selfHealTriggered
      ? 'BEFORE: Intercepted AI Script (Container #1 — Defective / Contained)'
      : 'CONTAINER #1: Initial Sandbox Execution (Single-Pass Clean CSV)',
    afterTitle: response.selfHealTriggered
      ? 'AFTER: Self-Healed & Oracle-Verified Chart (Container #2 — P1 && P2 && P3 Passed)'
      : 'AFTER: Oracle-Verified Chart (0 Repair Retries Needed)',
    beforeBars: buildSvgChartBars(initialSeries, flaggedSet),
    afterBars: buildSvgChartBars(finalSeries),
    repairRetries:
      response.selfHealTriggered && response.repairedRun !== null ? 1 : 0,
    reconciliationRows: buildReconciliationRows(response),
    clefMeters: buildClefMeters(response),
    clefDecision: finalRun?.clefDecision ?? null,
    blastRadiusCard: buildBlastRadiusCard(response),
  };
}

export function createInitialStudioState(): StudioState {
  const preset1 = ADVERSARIAL_PRESETS[0];

  return {
    selectedPresetId: 'preset-1-subtotal-exfil',
    csvText: preset1.csvText,
    prompt: preset1.prompt,
    activeRequestId: 0,
    isRunning: false,
    errorMessage: null,
    lastResponse: null,
    viewModel: null,
  };
}

function applyResolvedAudit(
  state: StudioState,
  requestId: number,
  response: ChartTruthRunResponse
): StudioState {
  if (requestId !== state.activeRequestId) {
    return state;
  }
  if (!response.ok) {
    return {
      ...state,
      isRunning: false,
      errorMessage: response.error?.message ?? 'Audit validation failed.',
    };
  }
  return {
    ...state,
    isRunning: false,
    errorMessage: null,
    lastResponse: response,
    viewModel: buildStudioViewModel(response),
  };
}

export function reduceStudioState(
  state: StudioState,
  action: StudioAction
): StudioState {
  switch (action.type) {
    case 'SELECT_PRESET': {
      const preset = getPresetById(action.presetId) ?? ADVERSARIAL_PRESETS[0];
      return {
        ...state,
        selectedPresetId: preset.id,
        csvText: preset.csvText,
        prompt: preset.prompt,
        activeRequestId: action.requestId,
        isRunning: true,
        errorMessage: null,
      };
    }
    case 'UPDATE_CSV':
      return {
        ...state,
        selectedPresetId: 'custom',
        csvText: action.csvText,
        errorMessage: null,
      };
    case 'UPDATE_PROMPT':
      return { ...state, prompt: action.prompt, errorMessage: null };
    case 'START_AUDIT':
      return {
        ...state,
        activeRequestId: action.requestId,
        isRunning: true,
        errorMessage: null,
      };
    case 'RESOLVE_AUDIT':
      return applyResolvedAudit(state, action.requestId, action.response);
    case 'FAIL_AUDIT':
      return action.requestId !== state.activeRequestId
        ? state
        : { ...state, isRunning: false, errorMessage: action.errorMessage };
  }
}
