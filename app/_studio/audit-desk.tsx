'use client';

import type { ReactNode, RefObject } from 'react';
import { useReducer, useRef, useState } from 'react';
import { ADVERSARIAL_PRESETS } from '../../lib/presets.ts';
import {
  createInitialStudioState,
  reduceStudioState,
  type StudioAction,
  type StudioState,
} from '../../lib/studio-model.ts';
import type { AdversarialPresetId, ChartTruthRunResponse } from '../../lib/types.ts';
import { ExhibitRack, RunConsole, SourceLedger } from './exhibits.tsx';
import { AuditReport, EmptyReport } from './report.tsx';

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
      const errBody = (await res.json().catch(() => null)) as ChartTruthRunResponse | null;
      dispatch({
        type: 'FAIL_AUDIT',
        requestId,
        errorMessage: errBody?.error?.message ?? `Audit request failed (HTTP ${res.status}).`,
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
      errorMessage: err instanceof Error ? err.message : 'Network error during audit.',
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

function seedState(initialResponse: ChartTruthRunResponse | null): StudioState {
  const fresh = createInitialStudioState();
  if (!initialResponse) {
    return fresh;
  }
  // The boot frame enters state through RESOLVE_AUDIT, the same transition every live audit uses,
  // so the page never carries a second, hand-built copy of a resolved state.
  return reduceStudioState(fresh, {
    type: 'RESOLVE_AUDIT',
    requestId: fresh.activeRequestId,
    response: initialResponse,
  });
}

export interface AuditDeskProps {
  initialResponse: ChartTruthRunResponse | null;
}

export function AuditDesk({ initialResponse }: AuditDeskProps): ReactNode {
  const [state, dispatch] = useReducer(reduceStudioState, initialResponse, seedState);
  const [sourceOpen, setSourceOpen] = useState(false);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleRunAudit = () => {
    const { requestId, signal } = nextAbortableRequest(abortRef, requestSeqRef);
    const scenarioId = state.selectedPresetId === 'custom' ? undefined : state.selectedPresetId;
    dispatch({ type: 'START_AUDIT', requestId });
    void executeAuditFetch(
      { scenarioId, csvText: state.csvText, prompt: state.prompt },
      requestId,
      signal,
      dispatch
    );
  };

  const handleSelectPreset = (presetId: AdversarialPresetId) => {
    const preset = ADVERSARIAL_PRESETS.find((p) => p.id === presetId) ?? ADVERSARIAL_PRESETS[0];
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
    <>
      <section className="desk shell" aria-labelledby="desk-title">
        <header className="desk-head">
          <div className="desk-intro">
            <p className="caps">Evidence intake</p>
            <h2 id="desk-title" className="section-title">
              Three poisoned exhibits. <em>One sealed audit.</em>
            </h2>
            <p className="section-lede">
              Each exhibit carries a real trap. Picking one sends it through{' '}
              <code>POST /api/chart-truth/run</code> again — sandbox, shadow probe, oracle and
              self-heal, in that order.
            </p>
          </div>
          <RunConsole state={state} onRun={handleRunAudit} />
        </header>
        <ExhibitRack
          state={state}
          sourceOpen={sourceOpen}
          onPick={handleSelectPreset}
          onOpenSource={() => setSourceOpen(true)}
        />
        <SourceLedger
          state={state}
          open={sourceOpen}
          onToggle={() => setSourceOpen((open) => !open)}
          onCsvChange={(csvText) => dispatch({ type: 'UPDATE_CSV', csvText })}
          onPromptChange={(prompt) => dispatch({ type: 'UPDATE_PROMPT', prompt })}
          onRun={handleRunAudit}
        />
        {state.errorMessage ? (
          <p role="alert" className="slip">
            <span className="caps">Rejected at intake</span>
            {state.errorMessage}
          </p>
        ) : null}
      </section>
      {state.viewModel && state.lastResponse ? (
        <AuditReport
          viewModel={state.viewModel}
          response={state.lastResponse}
          busy={state.isRunning}
        />
      ) : (
        <EmptyReport busy={state.isRunning} />
      )}
    </>
  );
}
