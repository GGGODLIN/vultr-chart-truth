import type { ReactNode } from 'react';
import type { StudioViewModel } from '../../lib/studio-model.ts';
import type { ChartTruthRunResponse } from '../../lib/types.ts';
import {
  type AuditTally,
  buildTally,
  type ExhibitIdentity,
  exhibitIdentity,
  formatMoney,
  runKey,
  STAGE_NAMES,
  type StageItem,
  stageProvenance,
  stageVerdict,
} from './audit-model.ts';
import { ContainerSplit } from './containers.tsx';
import {
  BlastSchedule,
  ClefSchedule,
  ProbeSchedule,
  ReconciliationSchedule,
} from './schedules.tsx';

function claimNote(tally: AuditTally): string {
  const ratio = tally.ratio === null ? '' : `${tally.ratio.toFixed(2)}×`;
  switch (tally.drift) {
    case 'void':
      return 'Container #1 was killed before it plotted a bar';
    case 'over':
      return `${ratio} the ledger — overstated`;
    case 'under':
      return `${ratio} the ledger — understated`;
    case 'exact':
      return 'agrees with the ledger';
  }
}

interface VerdictHeaderProps {
  identity: ExhibitIdentity;
  response: ChartTruthRunResponse;
}

function VerdictHeader({ identity, response }: VerdictHeaderProps): ReactNode {
  const tally = buildTally(response);
  const finalRun = response.repairedRun ?? response.initialRun;
  const passed = finalRun?.oracleVerdict.allPassed ?? false;
  const contained = [response.initialRun, response.repairedRun].every(
    (run) => run === null || run.oracleVerdict.p3BlastRadiusZero
  );
  return (
    <header className="verdict">
      <div className="verdict-id">
        <p className="caps">{`Exhibit ${identity.letter} · audit on file`}</p>
        <h2 id="report-title" className="verdict-title">
          {identity.title}
        </h2>
        <p className="verdict-trap">{identity.trap}</p>
      </div>
      <dl className="tally">
        <div data-tone="claim">
          <dt>Chart claimed</dt>
          <dd>
            {tally.claimed === null ? (
              <span className="tally-figure tally-void">no chart</span>
            ) : (
              <span className="tally-figure" data-struck={tally.drift !== 'exact'}>
                {formatMoney(tally.claimed, tally.currency)}
              </span>
            )}
            <span className="tally-note">{claimNote(tally)}</span>
          </dd>
        </div>
        <div data-tone="ledger">
          <dt>Ledger says</dt>
          <dd>
            <span className="tally-figure">{formatMoney(tally.ledger, tally.currency)}</span>
            <span className="tally-note">Σ of leaf rows, re-added by the oracle</span>
          </dd>
        </div>
        <div data-tone="certified">
          <dt>Certified</dt>
          <dd>
            <span className="tally-figure">{formatMoney(tally.certified, tally.currency)}</span>
            <span className="tally-note">
              {passed ? 'plotted by the verified container' : 'final container still failing'}
            </span>
          </dd>
        </div>
      </dl>
      <p className="stamp verdict-stamp" data-pass={passed}>
        {passed ? 'Verified' : 'Rejected'}
        <small>{contained ? 'Blast radius 0' : 'Blast radius breached'}</small>
      </p>
    </header>
  );
}

interface PipelineStampsProps {
  stages: readonly StageItem[];
  response: ChartTruthRunResponse;
}

function PipelineStamps({ stages, response }: PipelineStampsProps): ReactNode {
  return (
    <ol className="stages" aria-label="Five-stage audit pipeline">
      {stages.map((stage) => {
        const verdict = stageVerdict(stage.id, stage.status);
        return (
          <li key={stage.id} className="stage" data-tone={verdict.tone}>
            <span className="stage-no" aria-hidden="true">
              {stage.stepNumber}
            </span>
            <span className="stage-name">{STAGE_NAMES[stage.id]}</span>
            <span className="stage-verdict">{verdict.text}</span>
            <span className="stage-prov">{stageProvenance(stage.id, response)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export interface AuditReportProps {
  viewModel: StudioViewModel;
  response: ChartTruthRunResponse;
  busy: boolean;
}

export function AuditReport({ viewModel, response, busy }: AuditReportProps): ReactNode {
  const identity = exhibitIdentity(response.scenarioId);
  return (
    <section className="report shell" aria-labelledby="report-title" aria-busy={busy} data-busy={busy}>
      <div key={runKey(response)} className="report-body">
        <VerdictHeader identity={identity} response={response} />
        <PipelineStamps stages={viewModel.stages} response={response} />
        <ContainerSplit viewModel={viewModel} response={response} identity={identity} />
        <div className="schedules">
          <ProbeSchedule response={response} />
          <BlastSchedule response={response} />
        </div>
        <div className="schedules schedules-ledger">
          <ReconciliationSchedule rows={viewModel.reconciliationRows} response={response} />
          <ClefSchedule viewModel={viewModel} response={response} />
        </div>
      </div>
    </section>
  );
}

export function EmptyReport({ busy }: { busy: boolean }): ReactNode {
  return (
    <section className="report report-empty shell" aria-busy={busy} data-busy={busy}>
      <p className="caps">No audit on file</p>
      <p className="report-empty-title">
        {busy ? 'Auditing…' : 'Pick an exhibit above, or run the audit on your own CSV.'}
      </p>
    </section>
  );
}
