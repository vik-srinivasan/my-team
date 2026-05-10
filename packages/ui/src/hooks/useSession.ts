import { useEffect } from 'react';

import { api } from '../api.js';
import { useSessionStore } from '../store.js';

/**
 * Fetches session list on mount and loads detail when a session is selected.
 */
export function useSession() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setTeamFiles = useSessionStore((s) => s.setTeamFiles);
  const setDiff = useSessionStore((s) => s.setDiff);

  // Fetch session list on mount and poll every 5s
  useEffect(() => {
    const load = () => {
      api.sessions.list().then(setSessions).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [setSessions]);

  // Load session detail when selected
  useEffect(() => {
    if (!selectedId) return;

    api.sessions.get(selectedId).then((detail) => {
      setSessionState(detail.state);
      setTeamFiles({
        'plan.md': detail.team.plan,
        'context.md': detail.team.context,
        'tasks.md': detail.team.tasks,
        'journal.md': detail.team.journal,
        'review.md': detail.team.review,
        'decisions.md': detail.team.decisions,
      });
    }).catch(() => {});

    api.sessions.diff(selectedId).then((d) => setDiff(d.diff)).catch(() => {});
  }, [selectedId, setSessionState, setTeamFiles, setDiff]);
}
