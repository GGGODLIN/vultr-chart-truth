import type { ReactNode } from 'react';
import { runChartTruthPipeline } from '../lib/pipeline.ts';
import { createInitialStudioState } from '../lib/studio-model.ts';
import type { ChartTruthRunResponse } from '../lib/types.ts';
import { AuditDesk } from './_studio/audit-desk.tsx';
import { type BootMode, Hero, SiteFooter, TopRail } from './_studio/masthead.tsx';

async function runBootAudit(): Promise<ChartTruthRunResponse | null> {
  const seed = createInitialStudioState();
  try {
    const response = await runChartTruthPipeline({
      scenarioId: seed.selectedPresetId,
      csvText: seed.csvText,
      prompt: seed.prompt,
    });
    return response.ok ? response : null;
  } catch {
    // The boot frame is only a head start; without it the desk still audits on demand through
    // the API route, so a failed boot run must not take the page down with it.
    return null;
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
  const boot = await runBootAudit();
  return (
    <>
      <TopRail />
      <main id="top" className="page">
        <Hero bootMode={bootModeOf(boot)} />
        <AuditDesk initialResponse={boot} />
      </main>
      <SiteFooter />
    </>
  );
}
