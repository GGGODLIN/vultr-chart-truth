import type { ReactNode } from 'react';
import { runChartTruthPipeline } from '../lib/pipeline.ts';
import { ADVERSARIAL_PRESETS } from '../lib/presets.ts';
import { createInitialStudioState } from '../lib/studio-model.ts';
import type { ChartTruthRunResponse } from '../lib/types.ts';
import { AuditDesk } from './_studio/audit-desk.tsx';
import { type BootMode, Hero, SiteFooter, TopRail } from './_studio/masthead.tsx';

async function runBootSnapshots(): Promise<{
  boot: ChartTruthRunResponse | null;
  presetSnapshots: Record<string, ChartTruthRunResponse>;
}> {
  const seed = createInitialStudioState();
  const presetSnapshots: Record<string, ChartTruthRunResponse> = {};
  try {
    for (const preset of ADVERSARIAL_PRESETS) {
      const res = await runChartTruthPipeline({
        scenarioId: preset.id,
        csvText: preset.csvText,
        prompt: preset.prompt,
      });
      if (res.ok) {
        presetSnapshots[preset.id] = res;
      }
    }
    const boot = presetSnapshots[seed.selectedPresetId] ?? null;
    return { boot, presetSnapshots };
  } catch {
    // The boot frame is only a head start; without it the desk still audits on demand through
    // the API route, so a failed boot run must not take the page down with it.
    return { boot: null, presetSnapshots };
  }
}

function bootModeOf(response: ChartTruthRunResponse | null): BootMode {
  if (!response) {
    return 'unavailable';
  }
  const finalRun = response.repairedRun ?? response.initialRun;
  const live = response.safetyScan.mode === 'vultr' || finalRun?.clefDecision.usedFallback === false;
  return live ? 'live' : 'fallback';
}

export default async function ChartTruthPage(): Promise<ReactNode> {
  const { boot, presetSnapshots } = await runBootSnapshots();
  return (
    <>
      <TopRail />
      <main id="top" className="page">
        <Hero bootMode={bootModeOf(boot)} />
        <AuditDesk initialResponse={boot} presetSnapshots={presetSnapshots} />
      </main>
      <SiteFooter />
    </>
  );
}
