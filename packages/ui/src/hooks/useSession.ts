import { useEffect } from 'react';

import { api } from '../api.js';
import { useSessionStore } from '../store.js';

/**
 * Fetches the session list on mount (poll every 5s), loads detail when
 * a session is selected, and marks selection as "viewed" so the sidebar's
 * unread dot clears.
 */
export function useSession() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setRemoteUrl = useSessionStore((s) => s.setRemoteUrl);
  const markViewed = useSessionStore((s) => s.markViewed);

  // Fetch session list on mount and poll every 5s
  useEffect(() => {
    const load = () => {
      api.sessions.list().then(setSessions).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [setSessions]);

  // Load session detail when selected, and clear the "unread" dot.
  useEffect(() => {
    if (!selectedId) return;

    markViewed(selectedId);

    api.sessions.get(selectedId).then((detail) => {
      setSessionState(detail.state);
      if (detail.remote_url) {
        setRemoteUrl(detail.remote_url);
      }
    }).catch(() => {});
  }, [selectedId, setSessionState, setRemoteUrl, markViewed]);

  // Poll detail every 5s so the selected session's state stays fresh.
  useEffect(() => {
    if (!selectedId) return;

    const poll = () => {
      api.sessions.get(selectedId).then((detail) => {
        setSessionState(detail.state);
        if (detail.remote_url) {
          setRemoteUrl(detail.remote_url);
        }
      }).catch(() => {});
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [selectedId, setSessionState, setRemoteUrl]);
}
