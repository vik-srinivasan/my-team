import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import { api } from '../api.js';
import { useSessionStore } from '../store.js';

interface Notification {
  session_id: string;
  title: string;
  reason: string;
  timestamp: string;
}

const POLL_INTERVAL = 10_000;

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const selectSession = useSessionStore((s) => s.selectSession);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = (await res.json()) as Notification[];
        setNotifications(data);
      }
    } catch {
      // Wrapper may not be running
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const dismiss = async (sessionId: string) => {
    try {
      await fetch(`/api/notifications/${sessionId}`, { method: 'DELETE' });
      setNotifications((prev) => prev.filter((n) => n.session_id !== sessionId));
    } catch {
      // Ignore
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 p-2">
      {notifications.map((n) => (
        <div
          key={n.session_id}
          className="flex items-center gap-3 rounded-md bg-amber-900/40 border border-amber-700/50 px-3 py-2 text-sm text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="flex-1 truncate">
            <strong>{n.title}</strong>: {n.reason}
          </span>
          <button
            onClick={() => selectSession(n.session_id)}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-xs"
          >
            Go to session <ArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={() => dismiss(n.session_id)}
            className="text-amber-500 hover:text-amber-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
