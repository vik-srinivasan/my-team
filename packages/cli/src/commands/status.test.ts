import { describe, it, expect } from 'vitest';
import { countTasks, summarizeReview, latestJournalEntry } from './status.js';

describe('countTasks', () => {
  it('counts checked vs total tasks', () => {
    const md = `
# Tasks

- [x] @engineer first
- [ ] @engineer second
- [X] @engineer third (caps)
* [ ] alt-bullet style
`;
    expect(countTasks(md)).toEqual({ done: 2, total: 4 });
  });

  it('ignores non-task lines', () => {
    const md = `
## Heading
some prose
- not a checkbox
- [x] real
`;
    expect(countTasks(md)).toEqual({ done: 1, total: 1 });
  });

  it('returns zero counts for null or empty input', () => {
    expect(countTasks(null)).toEqual({ done: 0, total: 0 });
    expect(countTasks('')).toEqual({ done: 0, total: 0 });
  });
});

describe('summarizeReview', () => {
  it('marks missing or empty review as absent', () => {
    expect(summarizeReview(null)).toEqual({ present: false, status: 'unknown', blockers: 0 });
    expect(summarizeReview('   ')).toEqual({ present: false, status: 'unknown', blockers: 0 });
  });

  it('detects approved with zero blockers', () => {
    const r = summarizeReview('## Review\n\nApproved — looks good.\n');
    expect(r.present).toBe(true);
    expect(r.status).toBe('approved');
    expect(r.blockers).toBe(0);
  });

  it('detects blocking sections', () => {
    const r = summarizeReview('## Blocking — reviewer\n\nThing is broken.\n');
    expect(r.present).toBe(true);
    expect(r.status).toBe('changes_requested');
    expect(r.blockers).toBeGreaterThanOrEqual(1);
  });

  it('marks pending when no blockers and no approval', () => {
    const r = summarizeReview('## Notes\n\nReview in progress.\n');
    expect(r.present).toBe(true);
    expect(r.status).toBe('pending');
  });
});

describe('latestJournalEntry', () => {
  it('returns the last entry', () => {
    const md = `## 2026-05-12T09:17:00Z — captain
First entry body.

## 2026-05-12T09:19:00Z — scout
Second entry body line 1
Second entry body line 2`;
    const e = latestJournalEntry(md);
    expect(e).not.toBeNull();
    expect(e?.timestamp).toBe('2026-05-12T09:19:00Z');
    expect(e?.author).toBe('scout');
    expect(e?.body).toContain('Second entry body line 1');
    expect(e?.body).toContain('Second entry body line 2');
  });

  it('returns null for empty or missing input', () => {
    expect(latestJournalEntry(null)).toBeNull();
    expect(latestJournalEntry('')).toBeNull();
    expect(latestJournalEntry('no entries here')).toBeNull();
  });

  it('handles a single entry', () => {
    const md = `## 2026-05-12T09:17:00Z — captain
Only entry.
`;
    const e = latestJournalEntry(md);
    expect(e?.author).toBe('captain');
    expect(e?.body.trim()).toBe('Only entry.');
  });
});
