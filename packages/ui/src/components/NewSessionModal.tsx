import { useState } from 'react';

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (sourceRepo: string, title: string) => void;
}

export function NewSessionModal({ open, onClose, onSubmit }: NewSessionModalProps) {
  const [sourceRepo, setSourceRepo] = useState('');
  const [title, setTitle] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceRepo.trim() && title.trim()) {
      onSubmit(sourceRepo.trim(), title.trim());
      setSourceRepo('');
      setTitle('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">New Session</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Source repo path</label>
            <input
              type="text"
              value={sourceRepo}
              onChange={(e) => setSourceRepo(e.target.value)}
              placeholder="/path/to/your/repo"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Session title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add fog of war to map rendering"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-zinc-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
