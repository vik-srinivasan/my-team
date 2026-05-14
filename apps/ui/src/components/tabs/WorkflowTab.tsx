import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  KNOWN_CONDITIONAL_SPECIALISTS,
  type AgentPrompt,
  type AgentSource,
  type ConditionalSpecialistName,
  type EffortLevel,
  type WorkflowConfig,
} from '@my-team/shared/types';

import { useUiStore } from '../../store.js';
import { useAgentList } from '../../hooks/useAgentList.js';
import {
  useAgentPrompt,
  useAgentPromptMutation,
} from '../../hooks/useAgentPrompt.js';
import {
  DEFAULT_WORKFLOW_CONFIG,
  useWorkflowConfig,
  useWorkflowConfigMutation,
} from '../../hooks/useWorkflowConfig.js';
import { PromptEditor } from '../PromptEditor.js';

// ── Helpers ────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<AgentSource, string> = {
  session: 'session',
  repo: 'repo',
  user: 'user',
  default: 'default',
};

const SOURCE_CHIP_CLASS: Record<AgentSource, string> = {
  session: 'bg-emerald-500/15 text-emerald-300 border-emerald-700',
  repo: 'bg-sky-500/15 text-sky-300 border-sky-700',
  user: 'bg-violet-500/15 text-violet-300 border-violet-700',
  default: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

const EFFORT_OPTIONS: { value: EffortLevel | null; label: string }[] = [
  { value: null, label: 'Use plan default' },
  { value: 'light', label: 'Light' },
  { value: 'standard', label: 'Standard' },
  { value: 'thorough', label: 'Thorough' },
];

type TriState = 'default' | 'disabled' | 'forced';

function triStateFor(
  name: ConditionalSpecialistName,
  config: WorkflowConfig,
): TriState {
  if (config.disabled_specialists.includes(name)) return 'disabled';
  if (config.forced_specialists.includes(name)) return 'forced';
  return 'default';
}

function applyTriState(
  name: ConditionalSpecialistName,
  next: TriState,
  config: WorkflowConfig,
): WorkflowConfig {
  const disabled = config.disabled_specialists.filter((n) => n !== name);
  const forced = config.forced_specialists.filter((n) => n !== name);
  if (next === 'disabled') disabled.push(name);
  if (next === 'forced') forced.push(name);
  return {
    ...config,
    disabled_specialists: disabled,
    forced_specialists: forced,
  };
}

// ── Components ─────────────────────────────────────────────────────────

interface SpecialistRowProps {
  agent: AgentPrompt;
  selected: boolean;
  onSelect(name: string): void;
}

function SpecialistRow({ agent, selected, onSelect }: SpecialistRowProps): ReactElement {
  const isOverride = agent.source === 'session';
  return (
    <button
      type="button"
      data-testid={`specialist-row-${agent.name}`}
      onClick={() => onSelect(agent.name)}
      aria-pressed={selected}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm border-l-2 transition-colors ${
        selected
          ? 'bg-neutral-900 border-neutral-100 text-neutral-100'
          : 'border-transparent text-neutral-300 hover:bg-neutral-900/60'
      }`}
    >
      <span
        data-testid={`override-dot-${agent.name}`}
        title={isOverride ? 'Session override' : 'Default'}
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
          isOverride ? 'bg-emerald-400' : 'bg-neutral-700'
        }`}
      />
      <span className="flex-1 min-w-0 truncate font-medium">{agent.name}</span>
      {agent.source !== null ? (
        <span
          data-testid={`source-chip-${agent.name}`}
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
            SOURCE_CHIP_CLASS[agent.source]
          }`}
        >
          {SOURCE_LABEL[agent.source]}
        </span>
      ) : null}
    </button>
  );
}

interface TriStateToggleProps {
  name: ConditionalSpecialistName;
  state: TriState;
  onChange(next: TriState): void;
}

function TriStateToggle({ name, state, onChange }: TriStateToggleProps): ReactElement {
  const segments: { value: TriState; label: string }[] = [
    { value: 'disabled', label: 'Off' },
    { value: 'default', label: 'Default' },
    { value: 'forced', label: 'On' },
  ];
  return (
    <div
      data-testid={`tristate-${name}`}
      role="group"
      aria-label={`Toggle ${name}`}
      className="flex flex-col gap-1"
    >
      <span className="text-xs text-neutral-400">{name}</span>
      <div className="inline-flex rounded-sm border border-neutral-800 overflow-hidden">
        {segments.map((seg) => {
          const active = seg.value === state;
          return (
            <button
              key={seg.value}
              type="button"
              data-testid={`tristate-${name}-${seg.value}`}
              aria-pressed={active}
              onClick={() => onChange(seg.value)}
              className={`px-2 py-1 text-[11px] uppercase tracking-wider transition-colors border-r border-neutral-800 last:border-r-0 ${
                active
                  ? seg.value === 'disabled'
                    ? 'bg-red-500/20 text-red-200'
                    : seg.value === 'forced'
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              {seg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────

/**
 * Workflow tab. Three regions:
 *
 *  - **Left (280px):** the specialist list. Click a row to load its prompt
 *    into the editor on the right. Rows carry a source-chip (`session` /
 *    `repo` / `user` / `default`) and an "override" dot when the session
 *    has its own copy on disk.
 *  - **Right (flex):** `PromptEditor` for the selected specialist plus a
 *    Save button. Save is enabled only when the body is dirty; on success
 *    the agent list refetches so the source chip flips to `session`.
 *  - **Bottom strip:** effort-override segmented control + a tri-state
 *    toggle per optional specialist (Off / Default / On). The whole strip
 *    is committed via `Save Workflow` (explicit-button save chosen over
 *    debounced auto-save — see decisions.md for the rationale).
 *
 * "Reset to default" is intentionally hidden: the wrapper does not expose
 * a DELETE endpoint for agent prompts in v1. Adding one is out of scope
 * for Engineer C; flagged in the journal entry for follow-up.
 */
export function WorkflowTab(): ReactElement {
  const sessionId = useUiStore((s) => s.selectedSessionId);

  // ── Agent list + selected specialist + dirty editor body ────────────
  const agentList = useAgentList(sessionId);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const agentPrompt = useAgentPrompt(sessionId, selectedName);
  const agentMutation = useAgentPromptMutation(sessionId, selectedName);
  const [editorValue, setEditorValue] = useState<string>('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Reset editor body whenever the loaded prompt changes.
  useEffect(() => {
    if (agentPrompt.data) {
      setEditorValue(agentPrompt.data.content);
      setSavedAt(null);
    }
  }, [agentPrompt.data]);

  const isDirty = useMemo(() => {
    if (agentPrompt.data === undefined) return false;
    return editorValue !== agentPrompt.data.content;
  }, [editorValue, agentPrompt.data]);

  // ── Workflow config + local-edit buffer ────────────────────────────
  const workflowQuery = useWorkflowConfig(sessionId);
  const workflowMutation = useWorkflowConfigMutation(sessionId);
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowConfig>(
    DEFAULT_WORKFLOW_CONFIG,
  );

  useEffect(() => {
    if (workflowQuery.data) {
      setWorkflowDraft(workflowQuery.data);
    }
  }, [workflowQuery.data]);

  const workflowDirty = useMemo(() => {
    const base = workflowQuery.data ?? DEFAULT_WORKFLOW_CONFIG;
    if (base.effort_override !== workflowDraft.effort_override) return true;
    if (
      base.disabled_specialists.length !== workflowDraft.disabled_specialists.length ||
      base.forced_specialists.length !== workflowDraft.forced_specialists.length
    ) {
      return true;
    }
    const setA = new Set(base.disabled_specialists);
    const setB = new Set(base.forced_specialists);
    return (
      workflowDraft.disabled_specialists.some((n) => !setA.has(n)) ||
      workflowDraft.forced_specialists.some((n) => !setB.has(n))
    );
  }, [workflowDraft, workflowQuery.data]);

  // ── No session selected ────────────────────────────────────────────
  if (sessionId === null) {
    return (
      <div className="p-6 text-sm text-neutral-500">
        Select a session from the sidebar to edit its workflow.
      </div>
    );
  }

  const agents = agentList.data?.agents ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        {/* Specialist list */}
        <aside
          data-testid="specialist-list"
          className="w-[260px] shrink-0 border-r border-neutral-800 overflow-y-auto bg-neutral-950"
        >
          <header className="px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
            Specialists
          </header>
          {agentList.isLoading ? (
            <p className="p-3 text-sm text-neutral-500">Loading specialists…</p>
          ) : agentList.isError ? (
            <p className="p-3 text-sm text-red-400">
              Failed to load specialists.
            </p>
          ) : (
            <ul>
              {agents.map((agent) => (
                <li key={agent.name}>
                  <SpecialistRow
                    agent={agent}
                    selected={agent.name === selectedName}
                    onSelect={setSelectedName}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor + Save */}
        <section className="flex-1 min-w-0 flex flex-col">
          {selectedName === null ? (
            <div
              data-testid="workflow-editor-empty"
              className="flex-1 flex items-center justify-center text-neutral-500 text-sm p-6 text-center"
            >
              Select a specialist on the left to view or edit its prompt.
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-semibold text-neutral-100 truncate">
                    {selectedName}
                  </h2>
                  {agentPrompt.data ? (
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                        SOURCE_CHIP_CLASS[agentPrompt.data.source]
                      }`}
                    >
                      from {SOURCE_LABEL[agentPrompt.data.source]}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {agentMutation.isError ? (
                    <span
                      data-testid="agent-save-error"
                      className="text-xs text-red-400"
                    >
                      Save failed
                    </span>
                  ) : null}
                  {savedAt !== null && !agentMutation.isError && !isDirty ? (
                    <span
                      data-testid="agent-save-ok"
                      className="text-xs text-emerald-400"
                    >
                      Saved
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="agent-save-button"
                    disabled={!isDirty || agentMutation.isPending}
                    onClick={() => {
                      agentMutation.mutate(editorValue, {
                        onSuccess: () => setSavedAt(Date.now()),
                      });
                    }}
                    className="px-3 py-1 text-xs font-medium rounded-sm bg-neutral-100 text-neutral-900 disabled:bg-neutral-800 disabled:text-neutral-500 hover:bg-white"
                  >
                    {agentMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </header>

              <div className="flex-1 min-h-0 p-3 overflow-auto">
                {agentPrompt.isLoading ? (
                  <p className="text-sm text-neutral-500">Loading prompt…</p>
                ) : agentPrompt.isError ? (
                  <p className="text-sm text-red-400">Failed to load prompt.</p>
                ) : (
                  <PromptEditor
                    value={editorValue}
                    onChange={setEditorValue}
                    heightClassName="h-[60vh]"
                  />
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Workflow toggles */}
      <div
        data-testid="workflow-toggles"
        className="border-t border-neutral-800 bg-neutral-950 px-4 py-3 flex flex-wrap items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Effort override</span>
          <div
            role="group"
            aria-label="Effort override"
            data-testid="effort-segmented"
            className="inline-flex rounded-sm border border-neutral-800 overflow-hidden"
          >
            {EFFORT_OPTIONS.map((opt) => {
              const active =
                (opt.value ?? null) === (workflowDraft.effort_override ?? null);
              return (
                <button
                  key={opt.label}
                  type="button"
                  data-testid={`effort-${opt.value ?? 'default'}`}
                  aria-pressed={active}
                  onClick={() => {
                    setWorkflowDraft((prev) => {
                      const next = { ...prev };
                      if (opt.value === null) {
                        delete next.effort_override;
                      } else {
                        next.effort_override = opt.value;
                      }
                      return next;
                    });
                  }}
                  className={`px-2 py-1 text-[11px] uppercase tracking-wider border-r border-neutral-800 last:border-r-0 ${
                    active
                      ? 'bg-neutral-100 text-neutral-900'
                      : 'text-neutral-500 hover:text-neutral-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {KNOWN_CONDITIONAL_SPECIALISTS.map((name) => (
          <TriStateToggle
            key={name}
            name={name}
            state={triStateFor(name, workflowDraft)}
            onChange={(next) =>
              setWorkflowDraft((prev) => applyTriState(name, next, prev))
            }
          />
        ))}

        <div className="ml-auto flex items-center gap-2">
          {workflowMutation.isError ? (
            <span
              data-testid="workflow-save-error"
              className="text-xs text-red-400"
            >
              Save failed
            </span>
          ) : null}
          {workflowMutation.isSuccess && !workflowDirty ? (
            <span
              data-testid="workflow-save-ok"
              className="text-xs text-emerald-400"
            >
              Saved
            </span>
          ) : null}
          <button
            type="button"
            data-testid="workflow-save-button"
            disabled={!workflowDirty || workflowMutation.isPending}
            onClick={() => workflowMutation.mutate(workflowDraft)}
            className="px-3 py-1 text-xs font-medium rounded-sm bg-neutral-100 text-neutral-900 disabled:bg-neutral-800 disabled:text-neutral-500 hover:bg-white"
          >
            {workflowMutation.isPending ? 'Saving…' : 'Save Workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}
