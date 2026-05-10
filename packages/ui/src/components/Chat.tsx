import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Send } from 'lucide-react';

import { useSessionStore } from '../store.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { api } from '../api.js';

export function Chat() {
  const selectedId = useSessionStore((s) => s.selectedSessionId);
  const messages = useSessionStore((s) => s.messages);
  const sessionState = useSessionStore((s) => s.sessionState);
  const addMessage = useSessionStore((s) => s.addMessage);
  const { send } = useWebSocket(selectedId);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const isAwaitingApproval = sessionState?.phase === 'awaiting_approval';
  const isActive = sessionState?.phase && !['done', 'cleaned', 'killed'].includes(sessionState.phase);

  // Auto-scroll when pinned to bottom
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Detect manual scroll to unpin
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || !selectedId) return;
    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    });
    send({ type: 'input', text });
    setInput('');
    setAutoScroll(true);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-zinc-950">
      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 h-full items-center justify-center">
            {isActive ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                Captain is working...
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No messages yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
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
                  <div className="prose prose-invert prose-sm max-w-none text-zinc-300 prose-headings:text-zinc-200 prose-code:text-cyan-300 prose-pre:bg-zinc-800/50 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-lg">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/50 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message captain..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-600/50 focus:ring-1 focus:ring-blue-600/20 transition-colors"
          />
          {isAwaitingApproval && (
            <button
              onClick={handleApprove}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors"
            >
              Approve
            </button>
          )}
          <button
            onClick={handleSend}
            className="rounded-lg bg-zinc-700 p-2 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
