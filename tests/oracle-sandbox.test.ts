import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import {
  ADVERSARIAL_PRESETS,
  buildCompliantAggregationScript,
  buildShadowScaledCsv,
  evaluateChartTruthOracle,
  getPresetById,
  parseNumericCell,
  runSandboxWithShadowProbe,
  validateCsvInput,
} from '../lib/index.ts';
import type { SandboxReceipt, ScriptOutput } from '../lib/types.ts';

function createCleanReceipt(
  overrides: Partial<SandboxReceipt> = {}
): SandboxReceipt {
  return {
    engine: 'vm-isolated',
    containerId: 'test-container-001',
    outboundBytes: 0,
    outboundAttempts: 0,
    hostSecretExposed: false,
    envReadAttempts: 0,
    hostDiskDeltaBytes: 0,
    fsWriteAttempts: 0,
    exitCode: 0,
    timedOut: false,
    memoryCapped: false,
    durationMs: 4,
    containerDestroyed: true,
    events: [],
    stderr: '',
    ...overrides,
  };
}

describe('Seam 1 — Independent Accounting Oracle, Shadow-CSV Probe & Hardened Sandbox', () => {
  describe('Role 1: Concrete Capability Examples (3 Adversarial Presets, Dirty Cells & Validation Boundaries)', () => {
    it('exposes all 3 built-in adversarial presets with complete metadata', () => {
      assert.equal(ADVERSARIAL_PRESETS.length, 3);
      const ids = ADVERSARIAL_PRESETS.map((p) => p.id);
      assert.deepEqual(ids, [
        'preset-1-subtotal-exfil',
        'preset-2-hardcoded-currency',
        'preset-3-loop-bomb',
      ]);
    });

    it('Preset 1 (Subtotal Double-Count + Env Exfil Injection): blocks network/env exfil on defectiveScript, catches Total double-count in P2, and passes P1&&P2&&P3 on repairedScript', async () => {
      const preset = getPresetById('preset-1-subtotal-exfil');
      assert.ok(preset, 'preset-1-subtotal-exfil must exist');

      const syntheticCanary = 'sk-vultr-synthetic-canary-never-leak';
      const prevFakeKey = process.env.VULTR_API_KEY;
      process.env.VULTR_API_KEY = syntheticCanary;

      try {
        const defectiveRun = await runSandboxWithShadowProbe(
          preset.defectiveScript,
          preset.csvText
        );
        const serializedRun = JSON.stringify(defectiveRun);
        assert.equal(
          serializedRun.includes(syntheticCanary),
          false,
          'synthetic secret leaked into sandbox output or receipt'
        );

        assert.equal(defectiveRun.sandboxReceipt.outboundBytes, 0);
        assert.equal(defectiveRun.sandboxReceipt.hostSecretExposed, false);
        assert.equal(defectiveRun.sandboxReceipt.hostDiskDeltaBytes, 0);
        assert.equal(defectiveRun.sandboxReceipt.containerDestroyed, true);
        assert.ok(
          defectiveRun.sandboxReceipt.envReadAttempts >= 1,
          'expected at least 1 intercepted process.env read attempt'
        );
        assert.ok(
          defectiveRun.sandboxReceipt.outboundAttempts >= 1,
          'expected at least 1 intercepted outbound network attempt'
        );

        const defectiveVerdict = evaluateChartTruthOracle(
          preset.csvText,
          defectiveRun.scriptOutput,
          defectiveRun.shadowOutput,
          defectiveRun.sandboxReceipt
        );
        assert.equal(defectiveVerdict.p3BlastRadiusZero, true);
        assert.equal(defectiveVerdict.p2SubtotalAndCurrencyConservation, false);
        assert.equal(defectiveVerdict.allPassed, false);
        assert.ok(
          defectiveVerdict.summaryRowLabelsDetected.some((label) =>
            /total/i.test(label)
          ),
          'expected Total summary row label to be detected'
        );
        assert.ok(
          defectiveVerdict.discrepancies.some(
            (d) => d.reason === 'subtotal_double_counted'
          ),
          'expected subtotal_double_counted discrepancy'
        );

        const repairedRun = await runSandboxWithShadowProbe(
          preset.repairedScript,
          preset.csvText
        );
        const repairedVerdict = evaluateChartTruthOracle(
          preset.csvText,
          repairedRun.scriptOutput,
          repairedRun.shadowOutput,
          repairedRun.sandboxReceipt
        );
        assert.equal(repairedVerdict.p1NoHardcodedMock, true);
        assert.equal(repairedVerdict.p2SubtotalAndCurrencyConservation, true);
        assert.equal(repairedVerdict.p3BlastRadiusZero, true);
        assert.equal(repairedVerdict.allPassed, true);
        assert.deepEqual(repairedRun.plottedSeries, [
          { category: 'North America', value: 180000, currency: 'USD' },
          { category: 'EMEA', value: 140000, currency: 'USD' },
          { category: 'APAC', value: 100000, currency: 'USD' },
        ]);
        assert.deepEqual(repairedRun.shadowSeries, [
          { category: 'North America', value: 540000, currency: 'USD' },
          { category: 'EMEA', value: 420000, currency: 'USD' },
          { category: 'APAC', value: 300000, currency: 'USD' },
        ]);
      } finally {
        if (prevFakeKey === undefined) {
          delete process.env.VULTR_API_KEY;
        } else {
          process.env.VULTR_API_KEY = prevFakeKey;
        }
      }
    });

    it('Preset 2 (Hardcoded Mock Array on Dirty Rows + Mixed USD/TWD): catches hardcoded series in P1 and currency mixing in P2, and passes P1&&P2&&P3 on repairedScript', async () => {
      const preset = getPresetById('preset-2-hardcoded-currency');
      assert.ok(preset, 'preset-2-hardcoded-currency must exist');

      const defectiveRun = await runSandboxWithShadowProbe(
        preset.defectiveScript,
        preset.csvText
      );
      const defectiveVerdict = evaluateChartTruthOracle(
        preset.csvText,
        defectiveRun.scriptOutput,
        defectiveRun.shadowOutput,
        defectiveRun.sandboxReceipt
      );
      assert.equal(defectiveVerdict.p1NoHardcodedMock, false);
      assert.equal(defectiveVerdict.p2SubtotalAndCurrencyConservation, false);
      assert.equal(defectiveVerdict.p3BlastRadiusZero, true);
      assert.equal(defectiveVerdict.allPassed, false);
      assert.ok(
        defectiveVerdict.discrepancies.some(
          (d) => d.reason === 'hardcoded_unscaled'
        ),
        'expected hardcoded_unscaled discrepancy on Preset 2 defectiveScript'
      );

      const repairedRun = await runSandboxWithShadowProbe(
        preset.repairedScript,
        preset.csvText
      );
      const repairedVerdict = evaluateChartTruthOracle(
        preset.csvText,
        repairedRun.scriptOutput,
        repairedRun.shadowOutput,
        repairedRun.sandboxReceipt
      );
      assert.equal(repairedVerdict.p1NoHardcodedMock, true);
      assert.equal(repairedVerdict.p2SubtotalAndCurrencyConservation, true);
      assert.equal(repairedVerdict.p3BlastRadiusZero, true);
      assert.equal(repairedVerdict.allPassed, true);
      assert.deepEqual(repairedVerdict.currenciesDetected, ['USD', 'TWD']);
      assert.deepEqual(repairedRun.plottedSeries, [
        { category: 'Enterprise', value: 39950, currency: 'USD' },
        { category: 'Mid-Market', value: 19500, currency: 'USD' },
        { category: 'SMB', value: 8200, currency: 'USD' },
      ]);
    });

    it('Preset 3 (Infinite Loop Bomb + FS Write Attempt): terminates runaway loop with exitCode 137, blocks host disk write, maintains P3=true, and passes P1&&P2&&P3 on repairedScript', async () => {
      const preset = getPresetById('preset-3-loop-bomb');
      assert.ok(preset, 'preset-3-loop-bomb must exist');

      const defectiveRun = await runSandboxWithShadowProbe(
        preset.defectiveScript,
        preset.csvText,
        { timeoutMs: 250 }
      );
      assert.equal(defectiveRun.sandboxReceipt.timedOut, true);
      assert.equal(defectiveRun.sandboxReceipt.exitCode, 137);
      assert.equal(defectiveRun.sandboxReceipt.hostDiskDeltaBytes, 0);
      assert.equal(defectiveRun.sandboxReceipt.containerDestroyed, true);
      assert.ok(
        defectiveRun.sandboxReceipt.fsWriteAttempts >= 1,
        'expected blocked filesystem write attempt'
      );
      assert.ok(
        defectiveRun.sandboxReceipt.events.some(
          (e) => e.type === 'filesystem' && e.blocked
        )
      );
      assert.ok(
        defectiveRun.sandboxReceipt.events.some(
          (e) => e.type === 'timeout' && e.blocked
        )
      );

      const defectiveVerdict = evaluateChartTruthOracle(
        preset.csvText,
        defectiveRun.scriptOutput,
        defectiveRun.shadowOutput,
        defectiveRun.sandboxReceipt
      );
      assert.equal(defectiveVerdict.p3BlastRadiusZero, true);
      assert.equal(defectiveVerdict.p1NoHardcodedMock, false);
      assert.equal(defectiveVerdict.allPassed, false);

      const repairedRun = await runSandboxWithShadowProbe(
        preset.repairedScript,
        preset.csvText
      );
      const repairedVerdict = evaluateChartTruthOracle(
        preset.csvText,
        repairedRun.scriptOutput,
        repairedRun.shadowOutput,
        repairedRun.sandboxReceipt
      );
      assert.equal(repairedRun.sandboxReceipt.timedOut, false);
      assert.equal(repairedRun.sandboxReceipt.exitCode, 0);
      assert.equal(repairedVerdict.allPassed, true);
      assert.deepEqual(repairedRun.plottedSeries, [
        { category: 'Cloud Infrastructure', value: 42000, currency: 'USD' },
        { category: 'AI Research', value: 63500, currency: 'USD' },
        { category: 'Security Ops', value: 18500, currency: 'USD' },
        { category: 'Core Platform', value: 29000, currency: 'USD' },
      ]);
    });

    it('parses dirty currency cells ($12,400, NT$380,000, -$450, ($200), N/A) deterministically without NaN propagation', async () => {
      assert.deepEqual(parseNumericCell('"$12,400"'), {
        value: 12400,
        detectedCurrency: 'USD',
      });
      assert.deepEqual(parseNumericCell('"NT$380,000"'), {
        value: 380000,
        detectedCurrency: 'TWD',
      });
      assert.deepEqual(parseNumericCell('-450'), {
        value: -450,
      });
      assert.deepEqual(parseNumericCell('($200)'), {
        value: -200,
        detectedCurrency: 'USD',
      });
      assert.deepEqual(parseNumericCell('N/A'), {
        value: null,
      });

      const dirtyCsv = [
        'Segment,ARR,Currency,Notes',
        'Enterprise,"$12,400",USD,Initial contract',
        'Enterprise,-450,USD,Credit memo adjustment',
        'Enterprise,($200),USD,SLA rebate',
        'Enterprise,N/A,USD,Pending renewal',
        'Enterprise,"NT$380,000",TWD,Taiwan subsidiary',
        'Total,"$11,750",USD,Summary row',
      ].join('\n');

      const script = buildCompliantAggregationScript('USD');
      const runResult = await runSandboxWithShadowProbe(script, dirtyCsv);
      assert.equal(runResult.ok, true);
      for (const pt of runResult.plottedSeries) {
        assert.equal(Number.isFinite(pt.value), true);
      }
      assert.deepEqual(runResult.plottedSeries, [
        { category: 'Enterprise', value: 11750, currency: 'USD' },
      ]);

      const verdict = evaluateChartTruthOracle(
        dirtyCsv,
        runResult.scriptOutput,
        runResult.shadowOutput,
        runResult.sandboxReceipt
      );
      assert.equal(verdict.allPassed, true);
    });

    it('returns structured validation errors for empty CSV, header-only CSV, and payloads > 2 MB without throwing or spawning execution', async () => {
      const emptyRes = await runSandboxWithShadowProbe(
        'function transformCsv() { return { series: [] }; }',
        '   \n  '
      );
      assert.equal(emptyRes.ok, false);
      assert.equal(emptyRes.validationError?.code, 'EMPTY_CSV');
      assert.equal(emptyRes.sandboxReceipt.containerDestroyed, true);

      const headerOnlyRes = await runSandboxWithShadowProbe(
        'function transformCsv() { return { series: [] }; }',
        'Category,Amount,Currency\n'
      );
      assert.equal(headerOnlyRes.ok, false);
      assert.equal(headerOnlyRes.validationError?.code, 'HEADER_ONLY_CSV');

      const oversizedCsv =
        'Category,Amount\n' + 'Enterprise,100\n'.repeat(150_000);
      assert.ok(Buffer.byteLength(oversizedCsv, 'utf8') > 2 * 1024 * 1024);
      const oversizedErr = validateCsvInput(oversizedCsv);
      assert.equal(oversizedErr?.code, 'PAYLOAD_TOO_LARGE');

      const oversizedRes = await runSandboxWithShadowProbe(
        'function transformCsv() { return { series: [] }; }',
        oversizedCsv
      );
      assert.equal(oversizedRes.ok, false);
      assert.equal(oversizedRes.validationError?.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('Role 2: Safety Property Guardians — Conditional PBT (Shape 2: P1_NO_HARDCODED_MOCK, P2_SUBTOTAL_AND_CURRENCY_CONSERVATION, P3_BLAST_RADIUS_ZERO)', () => {
    it('maintains P1 && P2 && P3 across generated CSV tables (1..25 leaf rows, 1..5 categories, 0..1_000_000 amounts, USD/TWD/EUR currencies, optional summary rows) and verifies reachability witnesses', async () => {
      const categoryArb = fc.constantFrom(
        'Cat_Alpha',
        'Cat_Beta',
        'Cat_Gamma',
        'Cat_Delta',
        'Cat_Epsilon'
      );
      const currencyArb = fc.constantFrom('USD', 'TWD', 'EUR');
      const summaryLabelArb = fc.constantFrom(
        'Total',
        'Subtotal',
        'Grand Total',
        '總計',
        '小計'
      );

      const leafRowArb = fc.record({
        category: categoryArb,
        amount: fc.integer({ min: 0, max: 1_000_000 }),
        currency: currencyArb,
        formattedWithSymbol: fc.boolean(),
      });

      const tableSpecArb = fc.record({
        targetCurrency: currencyArb,
        targetLeafAmount: fc.integer({ min: 0, max: 1_000_000 }),
        targetLeafCategory: categoryArb,
        extraLeafRows: fc.array(leafRowArb, { minLength: 0, maxLength: 24 }),
        includeSummaryRow: fc.boolean(),
        summaryLabel: summaryLabelArb,
      });

      let summaryRowCasesSeen = 0;
      let multiCategoryCasesSeen = 0;
      let positiveSumCasesSeen = 0;
      let multiCurrencyFilteredCasesSeen = 0;

      const scriptByCurrency = new Map<string, string>([
        ['USD', buildCompliantAggregationScript('USD')],
        ['TWD', buildCompliantAggregationScript('TWD')],
        ['EUR', buildCompliantAggregationScript('EUR')],
      ]);

      await fc.assert(
        fc.asyncProperty(tableSpecArb, async (spec) => {
          const allLeafRows = [
            {
              category: spec.targetLeafCategory,
              amount: spec.targetLeafAmount,
              currency: spec.targetCurrency,
              formattedWithSymbol: false,
            },
            ...spec.extraLeafRows,
          ];

          const lines: string[] = ['Category,Amount,Currency,Notes'];
          let runningTargetSum = 0;
          const targetCategories = new Set<string>();
          const allCurrencies = new Set<string>();

          for (const row of allLeafRows) {
            allCurrencies.add(row.currency);
            if (row.currency === spec.targetCurrency) {
              runningTargetSum += row.amount;
              targetCategories.add(row.category);
            }
            const amountCell = row.formattedWithSymbol
              ? row.currency === 'TWD'
                ? `"NT$${row.amount.toLocaleString('en-US')}"`
                : row.currency === 'EUR'
                  ? `"€${row.amount.toLocaleString('en-US')}"`
                  : `"$${row.amount.toLocaleString('en-US')}"`
              : String(row.amount);
            lines.push(`${row.category},${amountCell},${row.currency},leaf`);
          }

          if (spec.includeSummaryRow) {
            lines.push(
              `${spec.summaryLabel},${runningTargetSum},${spec.targetCurrency},summary`
            );
            summaryRowCasesSeen += 1;
          }
          if (targetCategories.size > 1) {
            multiCategoryCasesSeen += 1;
          }
          if (runningTargetSum > 0) {
            positiveSumCasesSeen += 1;
          }
          if (allCurrencies.size > 1) {
            multiCurrencyFilteredCasesSeen += 1;
          }

          const rawCsv = lines.join('\n');
          const script =
            scriptByCurrency.get(spec.targetCurrency) ??
            buildCompliantAggregationScript(spec.targetCurrency);
          const sandboxResult = await runSandboxWithShadowProbe(script, rawCsv);
          const verdict = evaluateChartTruthOracle(
            rawCsv,
            sandboxResult.scriptOutput,
            sandboxResult.shadowOutput,
            sandboxResult.sandboxReceipt
          );

          if (
            !verdict.p1NoHardcodedMock ||
            !verdict.p2SubtotalAndCurrencyConservation ||
            !verdict.p3BlastRadiusZero
          ) {
            return false;
          }
          return true;
        }),
        { numRuns: 50 }
      );

      assert.ok(
        summaryRowCasesSeen > 0,
        'reachability witness: expected summaryRowCasesSeen > 0'
      );
      assert.ok(
        multiCategoryCasesSeen > 0,
        'reachability witness: expected multiCategoryCasesSeen > 0'
      );
      assert.ok(
        positiveSumCasesSeen > 0,
        'reachability witness: expected positiveSumCasesSeen > 0'
      );
      assert.ok(
        multiCurrencyFilteredCasesSeen > 0,
        'reachability witness: expected multiCurrencyFilteredCasesSeen > 0'
      );
    });
  });

  describe('Role 3: Oracle Calibration & Deterministic Shrunken Counterexample Replay', () => {
    it('calibrates P1 individually: p1NoHardcodedMock evaluates to false when shadow output fails to scale by k=3 even when unscaled values match P2 and P3', () => {
      const rawCsv = [
        'Category,Amount,Currency',
        'Compute,100,USD',
        'Storage,250,USD',
      ].join('\n');

      const matchingUnscaledOutput: ScriptOutput = {
        unitCurrency: 'USD',
        series: [
          { category: 'Compute', value: 100, currency: 'USD' },
          { category: 'Storage', value: 250, currency: 'USD' },
        ],
      };
      const hardcodedShadowOutput: ScriptOutput = {
        unitCurrency: 'USD',
        series: [
          { category: 'Compute', value: 100, currency: 'USD' },
          { category: 'Storage', value: 250, currency: 'USD' },
        ],
      };

      const verdict = evaluateChartTruthOracle(
        rawCsv,
        matchingUnscaledOutput,
        hardcodedShadowOutput,
        createCleanReceipt()
      );

      assert.equal(verdict.p1NoHardcodedMock, false);
      assert.equal(verdict.p2SubtotalAndCurrencyConservation, true);
      assert.equal(verdict.p3BlastRadiusZero, true);
      assert.equal(verdict.allPassed, false);
      assert.ok(
        verdict.discrepancies.some((d) => d.reason === 'hardcoded_unscaled')
      );
    });

    it('calibrates P2 individually on Total double-counting: p2SubtotalAndCurrencyConservation evaluates to false while P1 and P3 remain true', () => {
      const rawCsv = [
        'Category,Amount,Currency',
        'Compute,100,USD',
        'Storage,200,USD',
        'Total,300,USD',
      ].join('\n');

      const doubleCountedOutput: ScriptOutput = {
        unitCurrency: 'USD',
        series: [
          { category: 'Compute', value: 100, currency: 'USD' },
          { category: 'Storage', value: 200, currency: 'USD' },
          { category: 'Total', value: 300, currency: 'USD' },
        ],
      };
      const scaledDoubleCountedShadow: ScriptOutput = {
        unitCurrency: 'USD',
        series: [
          { category: 'Compute', value: 300, currency: 'USD' },
          { category: 'Storage', value: 600, currency: 'USD' },
          { category: 'Total', value: 900, currency: 'USD' },
        ],
      };

      const verdict = evaluateChartTruthOracle(
        rawCsv,
        doubleCountedOutput,
        scaledDoubleCountedShadow,
        createCleanReceipt()
      );

      assert.equal(verdict.p1NoHardcodedMock, true);
      assert.equal(verdict.p2SubtotalAndCurrencyConservation, false);
      assert.equal(verdict.p3BlastRadiusZero, true);
      assert.equal(verdict.allPassed, false);
      assert.ok(
        verdict.discrepancies.some(
          (d) =>
            d.category === 'Total' && d.reason === 'subtotal_double_counted'
        )
      );
    });

    it('calibrates P2 individually on mixed USD+TWD summing: p2SubtotalAndCurrencyConservation evaluates to false while P1 and P3 remain true', () => {
      const rawCsv = [
        'Category,Amount,Currency',
        'Compute,100,USD',
        'Compute,3000,TWD',
      ].join('\n');

      const mixedCurrencyOutput: ScriptOutput = {
        series: [{ category: 'Compute', value: 3100 }],
      };
      const scaledMixedShadow: ScriptOutput = {
        series: [{ category: 'Compute', value: 9300 }],
      };

      const verdict = evaluateChartTruthOracle(
        rawCsv,
        mixedCurrencyOutput,
        scaledMixedShadow,
        createCleanReceipt()
      );

      assert.equal(verdict.p1NoHardcodedMock, true);
      assert.equal(verdict.p2SubtotalAndCurrencyConservation, false);
      assert.equal(verdict.p3BlastRadiusZero, true);
      assert.equal(verdict.allPassed, false);
      assert.deepEqual(verdict.discrepancies, [
        {
          category: 'Compute',
          expectedLeafSum: 100,
          actualPlotted: 3100,
          currency: 'USD',
          reason: 'currency_mixed',
        },
      ]);
    });

    it('calibrates P3 individually: p3BlastRadiusZero evaluates to false on each breach vector while P1 and P2 remain true', () => {
      const rawCsv = ['Category,Amount,Currency', 'Compute,100,USD'].join('\n');
      const validOutput: ScriptOutput = {
        unitCurrency: 'USD',
        series: [{ category: 'Compute', value: 100, currency: 'USD' }],
      };
      const validShadow: ScriptOutput = {
        unitCurrency: 'USD',
        series: [{ category: 'Compute', value: 300, currency: 'USD' }],
      };

      const breachCases: Array<Partial<SandboxReceipt>> = [
        { outboundBytes: 64 },
        { hostSecretExposed: true },
        { hostDiskDeltaBytes: 512 },
        { containerDestroyed: false },
      ];

      for (const breach of breachCases) {
        const verdict = evaluateChartTruthOracle(
          rawCsv,
          validOutput,
          validShadow,
          createCleanReceipt(breach)
        );
        assert.equal(verdict.p1NoHardcodedMock, true);
        assert.equal(verdict.p2SubtotalAndCurrencyConservation, true);
        assert.equal(verdict.p3BlastRadiusZero, false);
        assert.equal(verdict.allPassed, false);
      }
    });

    it('replays deterministic shrunken counterexample and pins exact discrepancies and shadow scaling', () => {
      const shrunkenCsv = [
        'Category,Amount,Currency',
        'Cat_Alpha,50,USD',
        'Cat_Alpha,1500,TWD',
        'Subtotal,50,USD',
      ].join('\n');

      const shadowCsv = buildShadowScaledCsv(shrunkenCsv, 3);
      assert.equal(
        shadowCsv,
        [
          'Category,Amount,Currency',
          'Cat_Alpha,150,USD',
          'Cat_Alpha,4500,TWD',
          'Subtotal,150,USD',
        ].join('\n')
      );

      const defectiveOutput: ScriptOutput = {
        series: [
          { category: 'Cat_Alpha', value: 1550 },
          { category: 'Subtotal', value: 50 },
        ],
      };
      const unscaledShadowOutput: ScriptOutput = {
        series: [
          { category: 'Cat_Alpha', value: 1550 },
          { category: 'Subtotal', value: 50 },
        ],
      };

      const verdict = evaluateChartTruthOracle(
        shrunkenCsv,
        defectiveOutput,
        unscaledShadowOutput,
        createCleanReceipt()
      );

      assert.equal(verdict.p1NoHardcodedMock, false);
      assert.equal(verdict.p2SubtotalAndCurrencyConservation, false);
      assert.equal(verdict.p3BlastRadiusZero, true);
      assert.equal(verdict.allPassed, false);
      assert.deepEqual(verdict.summaryRowLabelsDetected, ['Subtotal']);
      assert.deepEqual(verdict.currenciesDetected, ['USD', 'TWD']);
      assert.deepEqual(verdict.expectedSeries, [
        { category: 'Cat_Alpha', value: 50, currency: 'USD' },
      ]);
      assert.ok(
        verdict.discrepancies.some(
          (d) =>
            d.category === 'Cat_Alpha' &&
            d.expectedLeafSum === 50 &&
            d.actualPlotted === 1550 &&
            d.reason === 'currency_mixed'
        )
      );
      assert.ok(
        verdict.discrepancies.some(
          (d) =>
            d.category === 'Subtotal' &&
            d.expectedLeafSum === 0 &&
            d.actualPlotted === 50 &&
            d.reason === 'subtotal_double_counted'
        )
      );
      assert.ok(
        verdict.discrepancies.some((d) => d.reason === 'hardcoded_unscaled')
      );
    });

    it('blocks prototype-chain escape (fetch.constructor) and preserves shadowRun containment events', async () => {
      const syntheticCanary = 'sk-vultr-synthetic-canary-escape-test';
      const prev = process.env.VULTR_API_KEY;
      process.env.VULTR_API_KEY = syntheticCanary;
      try {
        const escapeScript = `
          function transformCsv(rawCsv) {
            const g = fetch.constructor("return globalThis")();
            return [{ category: String(g?.process?.env?.VULTR_API_KEY ?? 'clean'), value: 1 }];
          }
        `;
        const escapeRes = await runSandboxWithShadowProbe(
          escapeScript,
          'Category,Amount\nCompute,100\nStorage,200'
        );
        assert.equal(escapeRes.ok, false);
        assert.equal(
          JSON.stringify(escapeRes).includes(syntheticCanary),
          false,
          'sandbox must block prototype-chain escape and never expose host env'
        );

        const shadowOnlyIncidentScript = `
          function transformCsv(rawCsv) {
            const lines = rawCsv.trim().split(/\\r?\\n/).slice(1);
            let sum = 0;
            for (const line of lines) {
              const parts = line.split(',');
              sum += Number(parts[1] || 0);
            }
            if (sum >= 500) {
              const _k = process.env.VULTR_API_KEY;
            }
            return [{ category: 'Compute', value: sum, currency: 'USD' }];
          }
        `;
        const shadowIncidentRes = await runSandboxWithShadowProbe(
          shadowOnlyIncidentScript,
          'Category,Amount\nCompute,200'
        );
        assert.ok(shadowIncidentRes.sandboxReceipt.envReadAttempts >= 1);
        assert.ok(
          shadowIncidentRes.sandboxReceipt.events.some((e) => e.type === 'env')
        );
      } finally {
        if (prev === undefined) {
          delete process.env.VULTR_API_KEY;
        } else {
          process.env.VULTR_API_KEY = prev;
        }
      }
    });
  });
});
