import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check } from 'lucide-react';

import { useSessionStore } from '../store.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { api } from '../api.js';

/**
 * Read-only captain output log. The terminal owns conversational input;
 * the dashboard surfaces the most recent ~100 lines of captain output and
 * exposes a one-click approve button when the session is awaiting approval.
 */
export function OutputLog() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const messages = useSessionStore((s) => s.messages);
  const sessionState = useSessionStore((s) => s.sessionState);
  const addMessage = useSessionStore((s) => s.addMessage);
  // Establish the WS subscription for this session.
  useWebSocket(selectedId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const isAwaitingApproval = sessionState?.phase === 'awaiting_approval';
  const isActive =
    !!sessionState?.phase &&
    !['done', 'cleaned', 'killed'].includes(sessionState.phase);

  // Auto-scroll when pinned to bottom — instant to keep up with rapid updates.
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages, autoScroll]);

  // Detect manual scroll to unpin
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      await api.sessions.approve(selectedId);
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        text: 'Approved',
        timestamp: new Date().toISOString(),
      });
    } catch {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        text: 'Failed to send approval — captain process may not be running.',
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      {/* Inline approve banner — only when needed */}
      {isAwaitingApproval && (
        <div className="flex shrink-0 items-center justify-between border-b border-amber-600/40 bg-amber-900/20 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Captain is awaiting approval to begin execution.
          </div>
          <button
            onClick={handleApprove}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 transition-colors"
          >
            <Check size={14} />
            Approve
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-1 items-center justify-center px-6 text-center">
            {isActive ? (
              <div className="flex items-center gap-2 text-base text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                Captain is working...
              </div>
            ) : (
              <p className="text-base text-zinc-400">
                Waiting for the captain to start working…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => {
              const next = messages[idx + 1];
              const showCaptainSeparator =
                msg.role === 'captain' && next?.role === 'captain';
              return (
                <div key={msg.id}>
                  {msg.role === 'system' ? (
                    <div className="flex items-center gap-2 py-1">
                      <div className="h-px flex-1 bg-zinc-800" />
                      <span className="text-xs text-zinc-500">{msg.text}</span>
                      <div className="h-px flex-1 bg-zinc-800" />
                    </div>
                  ) : msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-xl bg-blue-600 px-3 py-2 text-sm text-white">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`prose prose-invert prose-sm max-w-none text-zinc-300 prose-headings:text-zinc-200 prose-p:leading-relaxed prose-code:text-cyan-300 prose-pre:bg-zinc-800/50 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-lg prose-pre:px-4 prose-pre:py-3 ${
                        showCaptainSeparator
                          ? 'border-b border-zinc-800/70 pb-3'
                          : ''
                      }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
