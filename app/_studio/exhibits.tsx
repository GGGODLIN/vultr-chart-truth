import type { ReactNode } from 'react';
import { ADVERSARIAL_PRESETS } from '../../lib/presets.ts';
import type { StudioState } from '../../lib/studio-model.ts';
import type { AdversarialPreset, AdversarialPresetId } from '../../lib/types.ts';
import {
  CUSTOM_LETTER,
  csvStats,
  EXHIBIT_LETTERS,
  exhibitIdentity,
  exhibitTitle,
  formatBytes,
  isExhibitId,
  pad4,
} from './audit-model.ts';

type ExhibitStatus = 'standby' | 'selected' | 'auditing' | 'on-file';

const STATUS_LABEL: Readonly<Record<ExhibitStatus, string>> = {
  standby: 'Standby',
  selected: 'Selected',
  auditing: 'Auditing…',
  'on-file': 'On file',
};

function loadedExhibit(state: StudioState): string | null {
  const scenarioId = state.lastResponse?.scenarioId;
  if (!state.lastResponse) {
    return null;
  }
  return isExhibitId(scenarioId) ? scenarioId : 'custom';
}

function exhibitStatus(id: string, state: StudioState): ExhibitStatus {
  if (state.selectedPresetId !== id) {
    return 'standby';
  }
  if (state.isRunning) {
    return 'auditing';
  }
  return loadedExhibit(state) === id ? 'on-file' : 'selected';
}

interface ExhibitCardProps {
  preset: AdversarialPreset;
  status: ExhibitStatus;
  onPick: (presetId: AdversarialPresetId) => void;
}

function ExhibitCard({ preset, status, onPick }: ExhibitCardProps): ReactNode {
  const stats = csvStats(preset.csvText);
  return (
    <button
      type="button"
      className="exhibit"
      data-status={status}
      aria-pressed={status !== 'standby'}
      onClick={() => onPick(preset.id)}
    >
      <span className="exhibit-tab">
        Exhibit <b>{EXHIBIT_LETTERS[preset.id]}</b>
      </span>
      <span className="exhibit-badge">{preset.badge}</span>
      <span className="exhibit-title">{exhibitTitle(preset)}</span>
      <span className="exhibit-trap">{preset.subtitle}</span>
      <span className="exhibit-hook">{preset.description}</span>
      <span className="exhibit-foot">
        <span>{`${stats.rows} rows · ${formatBytes(stats.bytes)}`}</span>
        <span className="exhibit-status">{STATUS_LABEL[status]}</span>
      </span>
    </button>
  );
}

interface CustomCardProps {
  status: ExhibitStatus;
  expanded: boolean;
  onOpen: () => void;
}

function CustomCard({ status, expanded, onOpen }: CustomCardProps): ReactNode {
  return (
    <button
      type="button"
      className="exhibit exhibit-custom"
      data-status={status}
      aria-expanded={expanded}
      aria-controls="source-panel"
      onClick={onOpen}
    >
      <span className="exhibit-tab">
        Exhibit <b>{CUSTOM_LETTER}</b>
      </span>
      <span className="exhibit-badge">Your data</span>
      <span className="exhibit-title">Bring your own CSV</span>
      <span className="exhibit-trap">Same sandbox · same probe · same oracle</span>
      <span className="exhibit-hook">
        Paste any table with a category column and an amount column, then run the audit. Nothing
        you paste can reach the API key.
      </span>
      <span className="exhibit-foot">
        <span>opens the source ledger</span>
        <span className="exhibit-status">{STATUS_LABEL[status]}</span>
      </span>
    </button>
  );
}

export interface ExhibitRackProps {
  state: StudioState;
  sourceOpen: boolean;
  onPick: (presetId: AdversarialPresetId) => void;
  onOpenSource: () => void;
}

export function ExhibitRack({ state, sourceOpen, onPick, onOpenSource }: ExhibitRackProps): ReactNode {
  return (
    <div className="rack" role="group" aria-label="Exhibits">
      {ADVERSARIAL_PRESETS.map((preset) => (
        <ExhibitCard
          key={preset.id}
          preset={preset}
          status={exhibitStatus(preset.id, state)}
          onPick={onPick}
        />
      ))}
      <CustomCard
        status={exhibitStatus('custom', state)}
        expanded={sourceOpen}
        onOpen={onOpenSource}
      />
    </div>
  );
}

type DeskPhase = 'standby' | 'ready' | 'auditing' | 'fault';

const PHASE_LABEL: Readonly<Record<DeskPhase, string>> = {
  standby: 'Standby',
  ready: 'Sealed · ready',
  auditing: 'Auditing',
  fault: 'Rejected at intake',
};

function deskPhase(state: StudioState): DeskPhase {
  if (state.isRunning) {
    return 'auditing';
  }
  if (state.errorMessage) {
    return 'fault';
  }
  return state.lastResponse ? 'ready' : 'standby';
}

export function RunConsole({ state, onRun }: { state: StudioState; onRun: () => void }): ReactNode {
  const phase = deskPhase(state);
  return (
    <div className="console" data-phase={phase}>
      <p className="console-status">
        <span className="console-lamp" aria-hidden="true" />
        <span className="caps">Audit desk</span>
        <span className="console-phase">{PHASE_LABEL[phase]}</span>
      </p>
      <p className="console-reg">
        <span className="caps">Request</span>
        <span className="console-id">
          {state.activeRequestId === 0 ? 'boot frame' : `#${pad4(state.activeRequestId)}`}
        </span>
      </p>
      <button type="button" className="run-button" onClick={onRun}>
        <span className="run-glyph" aria-hidden="true" />
        {state.isRunning ? 'Auditing…' : 'Run audit'}
      </button>
    </div>
  );
}

export interface SourceLedgerProps {
  state: StudioState;
  open: boolean;
  onToggle: () => void;
  onCsvChange: (csvText: string) => void;
  onPromptChange: (prompt: string) => void;
  onRun: () => void;
}

export function SourceLedger({
  state,
  open,
  onToggle,
  onCsvChange,
  onPromptChange,
  onRun,
}: SourceLedgerProps): ReactNode {
  const stats = csvStats(state.csvText);
  const identity = exhibitIdentity(
    state.selectedPresetId === 'custom' ? undefined : state.selectedPresetId
  );
  return (
    <div className="source" data-open={open}>
      <button
        type="button"
        className="source-toggle"
        aria-expanded={open}
        aria-controls="source-panel"
        onClick={onToggle}
      >
        <span className="caps">Source ledger</span>
        <span className="source-exhibit">{`Exhibit ${identity.letter}`}</span>
        <span className="source-header">{stats.header || 'empty'}</span>
        <span className="source-stats">{`${stats.rows} rows · ${formatBytes(stats.bytes)}`}</span>
        <span className="source-cta">{open ? 'Close' : 'Edit CSV & prompt'}</span>
      </button>
      <div id="source-panel" className="source-panel" hidden={!open}>
        <div className="source-csv">
          <label htmlFor="csv-editor" className="caps">
            {`Untrusted CSV · Exhibit ${identity.letter}`}
          </label>
          <textarea
            id="csv-editor"
            className="ledger-input"
            rows={9}
            wrap="off"
            spellCheck={false}
            value={state.csvText}
            onChange={(event) => onCsvChange(event.target.value)}
          />
        </div>
        <div className="source-side">
          <label htmlFor="prompt-editor" className="caps">
            Chart prompt
          </label>
          <textarea
            id="prompt-editor"
            className="prompt-input"
            rows={4}
            value={state.prompt}
            onChange={(event) => onPromptChange(event.target.value)}
          />
          <button type="button" className="run-button run-button-wide" onClick={onRun}>
            <span className="run-glyph" aria-hidden="true" />
            {state.isRunning ? 'Auditing…' : 'Run audit on this CSV'}
          </button>
          <p className="source-note">
            Editing switches the desk to Exhibit D. The CSV enters the sandbox as plain text; the
            API key stays in the control plane.
          </p>
        </div>
      </div>
    </div>
  );
}
