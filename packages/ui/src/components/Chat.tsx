import { useSessionStore } from '../store.js';

export function Chat() {
  const messages = useSessionStore((s) => s.messages);

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
                className={`text-sm ${
                  msg.role === 'user'
                    ? 'ml-auto max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-white'
                    : msg.role === 'system'
                      ? 'italic text-zinc-500'
                      : 'max-w-[80%] text-zinc-200'
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Message captain..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-600"
            disabled
          />
          <button
            className="rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-300"
            disabled
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
