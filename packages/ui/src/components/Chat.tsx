import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

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

  const isAwaitingApproval = sessionState?.phase === 'awaiting_approval';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
    <div className="flex flex-1 flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Waiting for captain output...
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.role === 'user'
                    ? 'flex justify-end'
                    : msg.role === 'system'
                      ? ''
                      : ''
                }
              >
                {msg.role === 'system' ? (
                  <div className="text-xs italic text-zinc-500">{msg.text}</div>
                ) : msg.role === 'user' ? (
                  <div className="max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
                    {msg.text}
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-zinc-200">
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
      <div className="border-t border-zinc-800 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message captain..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-600"
          />
          {isAwaitingApproval && (
            <button
              onClick={handleApprove}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
            >
              Approve
            </button>
          )}
          <button
            onClick={handleSend}
            className="rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-600"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
