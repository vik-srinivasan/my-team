import { useEffect } from 'react';

import { api } from '../api.js';
import { useSessionStore } from '../store.js';

/**
 * Fetches session list on mount, loads detail when selected,
 * and polls team files + diff every 5s so the right panel stays fresh.
 */
export function useSession() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setTeamFiles = useSessionStore((s) => s.setTeamFiles);
  const setDiff = useSessionStore((s) => s.setDiff);
  const setRightTab = useSessionStore((s) => s.setRightTab);
  const setRemoteUrl = useSessionStore((s) => s.setRemoteUrl);

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
      // Load remote URL if available
      if (detail.remote_url) {
        setRemoteUrl(detail.remote_url);
      }
      // Auto-switch right tab based on phase
      const phase = detail.state.phase;
      if (phase === 'planning' || phase === 'awaiting_approval') {
        setRightTab('plan');
      } else {
        setRightTab('diff');
      }
    }).catch(() => {});

    api.sessions.diff(selectedId).then((d) => setDiff(d.diff)).catch(() => {});
  }, [selectedId, setSessionState, setTeamFiles, setDiff, setRemoteUrl]);

  // Poll team files + diff every 5s so right panel stays fresh
  useEffect(() => {
    if (!selectedId) return;

    const poll = () => {
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
        if (detail.remote_url) {
          setRemoteUrl(detail.remote_url);
        }
      }).catch(() => {});

      api.sessions.diff(selectedId).then((d) => setDiff(d.diff)).catch(() => {});
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [selectedId, setSessionState, setTeamFiles, setDiff, setRemoteUrl]);
}
