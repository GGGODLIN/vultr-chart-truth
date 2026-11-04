import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { POST } from '../app/api/chart-truth/run/route.ts';
import {
  ADVERSARIAL_PRESETS,
  getPresetById,
  runChartTruthPipeline,
} from '../lib/index.ts';
import {
  buildStudioViewModel,
  buildSvgChartBars,
  createInitialStudioState,
  reduceStudioState,
} from '../lib/studio-model.ts';
import type { ChartTruthRunResponse } from '../lib/types.ts';

describe('Ticket 03 — Interactive ChartTruth Studio UI, Blast Radius Visualizer & Vultr VM Deployment Pack', () => {
  it('Acceptance 1 (Stories 1, 4, 5, 6): selecting any of the 3 adversarial presets or submitting a custom CSV renders the 5-stage pipeline status, Before/After SVG bars, Oracle reconciliation table, clef probability meters, and Blast Radius = 0 card', async () => {
    const initialState = createInitialStudioState();
    assert.equal(initialState.selectedPresetId, 'preset-1-subtotal-exfil');
    assert.equal(initialState.lastResponse, null);
    assert.equal(initialState.viewModel, null);

    for (const preset of ADVERSARIAL_PRESETS) {
      const res = await POST(
        new Request('http://localhost:3000/api/chart-truth/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioId: preset.id,
            csvText: preset.csvText,
            prompt: preset.prompt,
          }),
        })
      );
      assert.equal(res.status, 200);
      const payload = (await res.json()) as ChartTruthRunResponse;
      const vm = buildStudioViewModel(payload);

      assert.equal(vm.stages.length, 5, `expected 5 stages for ${preset.id}`);
      assert.deepEqual(
        vm.stages.map((s) => s.stepNumber),
        [1, 2, 3, 4, 5]
      );
      assert.equal(vm.stages[4].status, 'triggered');
      assert.equal(vm.repairRetries, 1);

      if (preset.id !== 'preset-3-loop-bomb') {
        assert.ok(
          vm.beforeBars.length >= 3,
          `expected beforeBars for ${preset.id}`
        );
        assert.ok(
          vm.beforeBars.some((b) => b.flagged),
          `expected at least one flagged bar in beforeBars for ${preset.id}`
        );
      }

      assert.ok(
        vm.afterBars.length >= 3,
        `expected verified afterBars for ${preset.id}`
      );
      assert.ok(
        vm.afterBars.every((b) => !b.flagged && b.height > 0),
        `expected all afterBars to be verified with positive height for ${preset.id}`
      );

      assert.ok(
        vm.reconciliationRows.length >= 3,
        `expected reconciliationRows for ${preset.id}`
      );
      assert.ok(
        vm.reconciliationRows.every((r) => r.verified),
        `expected all reconciliationRows to be verified after self-heal for ${preset.id}`
      );

      assert.equal(vm.clefMeters.length, 3);
      assert.deepEqual(
        vm.clefMeters.map((m) => m.label),
        ['P(Data_Faithful)', 'P(Layout_Legible)', 'P(Containment_Intact)']
      );
      for (const meter of vm.clefMeters) {
        assert.ok(meter.afterProbability >= 0.85);
        assert.ok(meter.percentageText.endsWith('%'));
      }

      assert.equal(vm.blastRadiusCard.blastRadiusZero, true);
      assert.equal(vm.blastRadiusCard.outboundBytesLabel, '0 Outbound Bytes');
      assert.equal(vm.blastRadiusCard.secretsExposedLabel, '0 Secrets Exposed');
      assert.equal(vm.blastRadiusCard.hostDiskDeltaLabel, '0 B Host Disk Δ');
      assert.equal(vm.blastRadiusCard.outboundBytes, 0);
      assert.equal(vm.blastRadiusCard.hostSecretExposed, false);
      assert.equal(vm.blastRadiusCard.hostDiskDeltaBytes, 0);
      assert.ok(vm.blastRadiusCard.containersDestroyed >= 2);
    }
  });

  it('Acceptance 2 (Story 7 — Failure F1): switching presets or clicking Run Audit again while a previous request is in flight ignores stale responses so older errors or chart series never overwrite the newer preset', async () => {
    const preset1 = getPresetById('preset-1-subtotal-exfil');
    const preset2 = getPresetById('preset-2-hardcoded-currency');
    assert.ok(preset1);
    assert.ok(preset2);

    const p1Response = await runChartTruthPipeline({
      scenarioId: preset1.id,
      csvText: preset1.csvText,
      prompt: preset1.prompt,
    });
    const p2Response = await runChartTruthPipeline({
      scenarioId: preset2.id,
      csvText: preset2.csvText,
      prompt: preset2.prompt,
    });

    let state = createInitialStudioState();

    state = reduceStudioState(state, {
      type: 'START_AUDIT',
      requestId: 1,
    });
    assert.equal(state.activeRequestId, 1);
    assert.equal(state.isRunning, true);

    state = reduceStudioState(state, {
      type: 'SELECT_PRESET',
      presetId: 'preset-2-hardcoded-currency',
      requestId: 2,
    });
    assert.equal(state.selectedPresetId, 'preset-2-hardcoded-currency');
    assert.equal(state.activeRequestId, 2);
    assert.equal(state.isRunning, true);
    assert.equal(state.csvText, preset2.csvText);

    const afterStaleResolve = reduceStudioState(state, {
      type: 'RESOLVE_AUDIT',
      requestId: 1,
      response: p1Response,
    });
    assert.equal(afterStaleResolve.activeRequestId, 2);
    assert.equal(afterStaleResolve.isRunning, true);
    assert.equal(afterStaleResolve.viewModel, null);
    assert.equal(
      afterStaleResolve.selectedPresetId,
      'preset-2-hardcoded-currency'
    );

    const afterStaleFail = reduceStudioState(afterStaleResolve, {
      type: 'FAIL_AUDIT',
      requestId: 1,
      errorMessage: 'Stale network error from request #1',
    });
    assert.equal(afterStaleFail.errorMessage, null);
    assert.equal(afterStaleFail.isRunning, true);

    const afterFreshResolve = reduceStudioState(afterStaleFail, {
      type: 'RESOLVE_AUDIT',
      requestId: 2,
      response: p2Response,
    });
    assert.equal(afterFreshResolve.isRunning, false);
    assert.equal(afterFreshResolve.errorMessage, null);
    assert.equal(afterFreshResolve.lastResponse?.scenarioId, preset2.id);
    assert.ok(afterFreshResolve.viewModel);
    assert.deepEqual(
      afterFreshResolve.viewModel.afterBars.map((b) => b.category),
      ['Enterprise', 'Mid-Market', 'SMB']
    );
  });

  it('Acceptance 3 (Story 7 — Failure F2): long category labels (> 30 chars), zero-value bars, or a clean CSV that passes on initialRun (0 repair retries) render cleanly without SVG text overlap or NaN coordinates', async () => {
    const longLabel =
      'Global Enterprise Sovereign Cloud & Autonomous AI Infrastructure Division North';
    assert.ok(longLabel.length > 30);

    const edgeBars = buildSvgChartBars([
      { category: longLabel, value: 0, currency: 'USD' },
      { category: 'Zero Bucket B', value: 0, currency: 'USD' },
      { category: 'Negative Credit Adjustment', value: -250, currency: 'USD' },
    ]);

    assert.equal(edgeBars.length, 3);
    assert.ok(
      edgeBars[0].displayLabel.length <= 30,
      `expected truncated label <= 30 chars, got ${edgeBars[0].displayLabel.length}`
    );
    assert.ok(edgeBars[0].displayLabel.endsWith('…'));

    for (const bar of edgeBars) {
      assert.equal(Number.isFinite(bar.x), true);
      assert.equal(Number.isFinite(bar.y), true);
      assert.equal(Number.isFinite(bar.width), true);
      assert.equal(Number.isFinite(bar.height), true);
      assert.equal(Number.isFinite(bar.labelX), true);
      assert.equal(Number.isFinite(bar.labelY), true);
      assert.equal(Number.isFinite(bar.valueY), true);
      assert.equal(bar.height, 0);
    }

    assert.ok(
      edgeBars[1].x > edgeBars[0].x + edgeBars[0].width,
      'adjacent bars must have non-overlapping horizontal coordinates'
    );

    const cleanCsv = [
      'Category,Revenue,Currency',
      `${longLabel},48000,USD`,
      'Zero Revenue Tier,0,USD',
    ].join('\n');

    const cleanResponse = await runChartTruthPipeline({
      csvText: cleanCsv,
      prompt: 'Plot category revenue in USD.',
    });
    assert.equal(cleanResponse.ok, true);
    assert.equal(cleanResponse.repairedRun, null);
    assert.equal(cleanResponse.selfHealTriggered, false);

    const cleanVm = buildStudioViewModel(cleanResponse);
    assert.equal(cleanVm.repairRetries, 0);
    assert.equal(cleanVm.stages[4].status, 'skipped');
    assert.equal(cleanVm.afterBars.length, 2);
    assert.ok(cleanVm.afterBars[0].displayLabel.length <= 30);
    assert.ok(cleanVm.afterBars[0].height > 0);
    assert.equal(cleanVm.afterBars[1].height, 0);
  });

  it('Acceptance 4 (Story 4): repository includes Dockerfile, docker-compose.yml, and README.md documenting Vultr Cloud Compute VM, Vultr Serverless Inference, and Docker sandbox containment architecture', () => {
    const rootDir = path.resolve(import.meta.dirname, '..');
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    const dockerignorePath = path.join(rootDir, '.dockerignore');
    const composePath = path.join(rootDir, 'docker-compose.yml');
    const readmePath = path.join(rootDir, 'README.md');

    assert.equal(fs.existsSync(dockerfilePath), true, 'Dockerfile must exist');
    assert.equal(
      fs.existsSync(dockerignorePath),
      true,
      '.dockerignore must exist'
    );
    assert.ok(
      fs.readFileSync(dockerignorePath, 'utf8').includes('.env'),
      '.dockerignore must exclude .env'
    );
    assert.equal(
      fs.existsSync(composePath),
      true,
      'docker-compose.yml must exist'
    );
    assert.equal(fs.existsSync(readmePath), true, 'README.md must exist');

    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    const compose = fs.readFileSync(composePath, 'utf8');
    const readme = fs.readFileSync(readmePath, 'utf8');

    assert.ok(dockerfile.includes('FROM node:22'));
    assert.ok(dockerfile.includes('EXPOSE 3000'));

    assert.ok(compose.includes('3000:3000'));
    assert.ok(compose.includes('VULTR_API_KEY'));

    assert.ok(readme.includes('https://api.vultrinference.com/v1'));
    assert.ok(readme.includes('nemotron-3.5-content-safety'));
    assert.ok(readme.includes('glm-5.3-flash'));
    assert.ok(readme.includes('clef'));
    assert.ok(readme.includes('Vultr Cloud Compute'));
    assert.ok(
      readme.includes(
        '--network=none --memory=256m --cpus=0.5 --read-only --pids-limit=64 --cap-drop=ALL'
      )
    );
  });
});
