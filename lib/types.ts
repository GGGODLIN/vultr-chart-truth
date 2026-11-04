export interface PlottedPoint {
  category: string;
  value: number;
  currency?: string;
}

export interface ScriptOutput {
  title?: string;
  unitCurrency?: string;
  series: PlottedPoint[];
  logs?: string[];
}

export type ContainmentEventType =
  | 'network'
  | 'env'
  | 'filesystem'
  | 'timeout'
  | 'memory'
  | 'syntax';

export interface ContainmentEvent {
  type: ContainmentEventType;
  detail: string;
  blocked: boolean;
  timestampMs: number;
}

export interface SandboxReceipt {
  engine: 'docker' | 'vm-isolated';
  containerId: string;
  outboundBytes: number;
  outboundAttempts: number;
  hostSecretExposed: boolean;
  envReadAttempts: number;
  hostDiskDeltaBytes: number;
  fsWriteAttempts: number;
  exitCode: number;
  timedOut: boolean;
  memoryCapped: boolean;
  durationMs: number;
  containerDestroyed: boolean;
  events: ContainmentEvent[];
  stderr: string;
}

export type DiscrepancyReason =
  | 'subtotal_double_counted'
  | 'currency_mixed'
  | 'value_mismatch'
  | 'hardcoded_unscaled'
  | 'missing_category';

export interface CategoryDiscrepancy {
  category: string;
  expectedLeafSum: number;
  actualPlotted: number;
  currency: string;
  reason: DiscrepancyReason;
}

export interface OracleVerdict {
  p1NoHardcodedMock: boolean;
  p2SubtotalAndCurrencyConservation: boolean;
  p3BlastRadiusZero: boolean;
  allPassed: boolean;
  scaleFactorK: number;
  expectedSeries: PlottedPoint[];
  discrepancies: CategoryDiscrepancy[];
  summaryRowLabelsDetected: string[];
  currenciesDetected: string[];
  counterexampleSummary: string;
}

export type CsvValidationErrorCode =
  | 'EMPTY_CSV'
  | 'HEADER_ONLY_CSV'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_CSV';

export interface CsvValidationError {
  code: CsvValidationErrorCode;
  message: string;
}

export interface SandboxShadowResult {
  ok: boolean;
  error?: string;
  validationError?: CsvValidationError;
  plottedSeries: PlottedPoint[];
  shadowSeries: PlottedPoint[];
  scriptOutput: ScriptOutput;
  shadowOutput: ScriptOutput;
  sandboxReceipt: SandboxReceipt;
  shadowCsvText: string;
}

export type AdversarialPresetId =
  | 'preset-1-subtotal-exfil'
  | 'preset-2-hardcoded-currency'
  | 'preset-3-loop-bomb';

export interface AdversarialPreset {
  id: AdversarialPresetId;
  name: string;
  subtitle: string;
  badge: string;
  prompt: string;
  csvText: string;
  defectiveScript: string;
  repairedScript: string;
  description: string;
}

export type SafetyScanLocation = 'header' | 'leaf' | 'summary';

export interface SafetyScanFinding {
  location: SafetyScanLocation;
  pattern: string;
}

export interface SafetyScanVerdict {
  safe: boolean;
  modelUsed: string;
  mode: 'vultr' | 'fallback';
  findings: SafetyScanFinding[];
}

export interface ClefDecisionCard {
  model: string;
  usedFallback: boolean;
  pDataFaithful: number;
  pLayoutLegible: number;
  pContainmentIntact: number;
  overallDecision: 'verified' | 'rejected_lie' | 'contained_exploit';
  rationale: string;
}

export type PipelineStageId =
  | 'safetyPreScan'
  | 'codeGen'
  | 'sandboxRun'
  | 'oracleAndClefAudit'
  | 'selfHeal';

export interface PipelineStageStatus {
  id: PipelineStageId;
  status: 'completed' | 'triggered' | 'skipped';
}

export interface PipelineRunAttempt {
  attemptNumber: 1 | 2;
  scriptSource: string;
  generationModel: string;
  usedFallbackGenerator: boolean;
  sandboxResult: SandboxShadowResult;
  oracleVerdict: OracleVerdict;
  clefDecision: ClefDecisionCard;
}

export type PipelineErrorCode =
  | CsvValidationErrorCode
  | 'MISSING_PROMPT'
  | 'INVALID_JSON';

export interface PipelineError {
  code: PipelineErrorCode;
  message: string;
}

export interface VultrInferenceOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ChartTruthRunRequest extends VultrInferenceOptions {
  csvText: string;
  prompt: string;
  scenarioId?: AdversarialPresetId | string;
  unitCurrency?: string;
}

export interface ChartTruthRunResponse {
  ok: boolean;
  status: 200 | 400;
  error?: PipelineError;
  scenarioId?: string;
  safetyScan: SafetyScanVerdict;
  stages: PipelineStageStatus[];
  initialRun: PipelineRunAttempt | null;
  repairedRun: PipelineRunAttempt | null;
  selfHealTriggered: boolean;
  containersDestroyed: number;
}

