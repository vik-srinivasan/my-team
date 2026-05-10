## 2026-05-10T19:55:00Z — engineer
Question: How should `getAttention()` treat sessions the user has never selected (no entry in `lastViewed`)?
Options considered:
  - Treat unseen sessions as "fresh" (show update dot) — surfaces new sessions but creates a dot on first load for every session.
  - Treat unseen sessions as "not fresh" — quieter on first load but a brand-new session won't get any signal until its checkpoint advances past an entry that doesn't exist.
Decision: Treat unseen sessions as fresh. The update dot is meant to communicate "moved since you last looked", and "never looked" qualifies. Refreshing the page is rare in practice; the cost of one extra dot per session on cold load is small. Selecting the session clears it.

## 2026-05-10T19:56:00Z — engineer
Question: When multiple critical triggers apply (e.g. `awaiting_approval` AND `must_ask_count > 0`), which reason wins?
Options considered: surface all reasons concatenated; pick a priority order.
Decision: Pick a priority order — `awaiting_approval` > `blocked` > `must_ask`. Tooltips need to stay short; awaiting_approval is the action with the highest leverage (one-click resolves it), so it wins. Rare in practice anyway.
