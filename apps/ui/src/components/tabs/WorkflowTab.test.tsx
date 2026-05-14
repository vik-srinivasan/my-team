import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode, ReactElement } from 'react';
import type {
  AgentListResponse,
  AgentPromptResponse,
  WorkflowConfig,
} from '@my-team/shared/types';

import { WorkflowTab } from './WorkflowTab.js';
import { useUiStore } from '../../store.js';
import * as api from '../../lib/api.js';

// ── Mock the heavy CodeMirror editor with a controlled textarea ─────────
vi.mock('../PromptEditor.js', () => ({
  PromptEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (next: string) => void;
  }): ReactElement => (
    <textarea
      data-testid="mock-prompt-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

function Providers({ children }: { children: ReactNode }): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeAgents(): AgentListResponse {
  return {
    agents: [
      { name: 'engineer', exists: true, source: 'default' },
      { name: 'tester', exists: true, source: 'session' },
      { name: 'designer', exists: true, source: 'repo' },
      { name: 'auditor', exists: true, source: 'user' },
    ],
  };
}

const SESSION_ID = 'alpha-1';

describe('WorkflowTab', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedSessionId: SESSION_ID, activeTab: 'workflow' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the specialist list with source chips and override indicators', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('specialist-row-engineer');
    expect(screen.getByTestId('source-chip-engineer')).toHaveTextContent(/default/);
    expect(screen.getByTestId('source-chip-tester')).toHaveTextContent(/session/);

    // The override dot is "filled" for session-overridden agents only;
    // we check the className differs vs the unfilled neutral dot.
    const overrideDotTester = screen.getByTestId('override-dot-tester');
    const overrideDotEngineer = screen.getByTestId('override-dot-engineer');
    expect(overrideDotTester.className).toContain('bg-emerald-400');
    expect(overrideDotEngineer.className).toContain('bg-neutral-700');
  });

  it('clicking a specialist loads its body into the editor', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });
    const getAgentSpy = vi.spyOn(api, 'getAgent').mockResolvedValue({
      name: 'engineer',
      content: '# Engineer prompt body\n',
      source: 'default',
    } satisfies AgentPromptResponse);

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('specialist-row-engineer');
    await userEvent.click(screen.getByTestId('specialist-row-engineer'));

    await waitFor(() => {
      expect(getAgentSpy).toHaveBeenCalledWith(SESSION_ID, 'engineer');
    });
    const editor = (await screen.findByTestId(
      'mock-prompt-editor',
    )) as HTMLTextAreaElement;
    expect(editor.value).toBe('# Engineer prompt body\n');
  });

  it('editing + Save calls putAgent with the dirty body', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });
    vi.spyOn(api, 'getAgent').mockResolvedValue({
      name: 'engineer',
      content: '# Engineer\n',
      source: 'default',
    });
    const putSpy = vi.spyOn(api, 'putAgent').mockResolvedValue({
      name: 'engineer',
      content: '# Engineer edited\n',
      source: 'session',
    });

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('specialist-row-engineer');
    await userEvent.click(screen.getByTestId('specialist-row-engineer'));

    const editor = (await screen.findByTestId(
      'mock-prompt-editor',
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe('# Engineer\n'));

    // Save is disabled while pristine.
    const saveBtn = screen.getByTestId('agent-save-button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Edit body.
    await userEvent.clear(editor);
    await userEvent.type(editor, '# Engineer edited');
    await waitFor(() => expect(saveBtn.disabled).toBe(false));

    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        SESSION_ID,
        'engineer',
        '# Engineer edited',
      );
    });
  });

  it('toggling a specialist writes putWorkflow with the right disabled_specialists', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });
    const putWfSpy = vi.spyOn(api, 'putWorkflow').mockImplementation(
      async (_id, body: WorkflowConfig) => body,
    );

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('tristate-designer');
    await userEvent.click(screen.getByTestId('tristate-designer-disabled'));

    const saveBtn = screen.getByTestId('workflow-save-button') as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(putWfSpy).toHaveBeenCalledTimes(1);
    });
    const arg = putWfSpy.mock.calls[0][1];
    expect(arg.disabled_specialists).toContain('designer');
    expect(arg.forced_specialists).not.toContain('designer');
  });

  it('forcing a specialist writes the right forced_specialists', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });
    const putWfSpy = vi.spyOn(api, 'putWorkflow').mockImplementation(
      async (_id, body: WorkflowConfig) => body,
    );

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('tristate-auditor');
    await userEvent.click(screen.getByTestId('tristate-auditor-forced'));
    await userEvent.click(screen.getByTestId('workflow-save-button'));

    await waitFor(() => expect(putWfSpy).toHaveBeenCalledTimes(1));
    const arg = putWfSpy.mock.calls[0][1];
    expect(arg.forced_specialists).toContain('auditor');
    expect(arg.disabled_specialists).not.toContain('auditor');
  });

  it('effort override writes putWorkflow with effort_override set', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });
    const putWfSpy = vi.spyOn(api, 'putWorkflow').mockImplementation(
      async (_id, body: WorkflowConfig) => body,
    );

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('effort-segmented');
    await userEvent.click(screen.getByTestId('effort-thorough'));
    await userEvent.click(screen.getByTestId('workflow-save-button'));

    await waitFor(() => expect(putWfSpy).toHaveBeenCalledTimes(1));
    expect(putWfSpy.mock.calls[0][1].effort_override).toBe('thorough');
  });

  it('clearing the effort override drops effort_override from the payload', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
      effort_override: 'standard',
    });
    const putWfSpy = vi.spyOn(api, 'putWorkflow').mockImplementation(
      async (_id, body: WorkflowConfig) => body,
    );

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('effort-default');
    await userEvent.click(screen.getByTestId('effort-default'));
    await userEvent.click(screen.getByTestId('workflow-save-button'));

    await waitFor(() => expect(putWfSpy).toHaveBeenCalledTimes(1));
    expect(putWfSpy.mock.calls[0][1].effort_override).toBeUndefined();
  });

  it('renders the empty state when no specialist is selected', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    expect(await screen.findByTestId('workflow-editor-empty')).toHaveTextContent(
      /Select a specialist/i,
    );
  });

  it('renders nothing-selected message when no session is selected', () => {
    useUiStore.setState({ selectedSessionId: null, activeTab: 'workflow' });
    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );
    expect(
      screen.getByText(/Select a session from the sidebar/i),
    ).toBeInTheDocument();
  });

  it('lists exactly the four mocked specialists in order', async () => {
    vi.spyOn(api, 'listAgents').mockResolvedValue(makeAgents());
    vi.spyOn(api, 'getWorkflow').mockResolvedValue({
      disabled_specialists: [],
      forced_specialists: [],
    });

    render(
      <Providers>
        <WorkflowTab />
      </Providers>,
    );

    await screen.findByTestId('specialist-row-engineer');
    const list = screen.getByTestId('specialist-list');
    const buttons = within(list).getAllByRole('button');
    const names = buttons.map((b) =>
      b.getAttribute('data-testid')?.replace('specialist-row-', ''),
    );
    expect(names).toEqual(['engineer', 'tester', 'designer', 'auditor']);
  });
});
