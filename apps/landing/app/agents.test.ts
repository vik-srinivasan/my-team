import { describe, it, expect } from 'vitest';
import {
  AGENTS,
  SPECIALISTS,
  CORE_SPECIALISTS,
  OPTIONAL_SPECIALISTS,
} from './agents';

describe('agents roster', () => {
  it('has captain plus nine specialists (10 entries total)', () => {
    expect(AGENTS).toHaveLength(10);
    expect(SPECIALISTS).toHaveLength(9);
  });

  it('has exactly four core specialists (scout, engineer, tester, reviewer)', () => {
    expect(CORE_SPECIALISTS).toHaveLength(4);
    expect(CORE_SPECIALISTS.map((a) => a.id)).toEqual([
      'scout',
      'engineer',
      'tester',
      'reviewer',
    ]);
  });

  it('has exactly five optional specialists (debugger, designer, runner, auditor, documenter)', () => {
    expect(OPTIONAL_SPECIALISTS).toHaveLength(5);
    expect(OPTIONAL_SPECIALISTS.map((a) => a.id)).toEqual([
      'debugger',
      'designer',
      'runner',
      'auditor',
      'documenter',
    ]);
  });

  it('marks the captain as not core (it is the orchestrator, not a specialist)', () => {
    const captain = AGENTS.find((a) => a.id === 'captain');
    expect(captain).toBeDefined();
    expect(captain?.core).toBe(false);
  });

  it('marks every agent with an explicit core flag (no missing fields)', () => {
    for (const agent of AGENTS) {
      expect(typeof agent.core, `${agent.id} is missing core flag`).toBe('boolean');
    }
  });

  it('partitions specialists exactly: core + optional = SPECIALISTS', () => {
    expect(CORE_SPECIALISTS.length + OPTIONAL_SPECIALISTS.length).toBe(
      SPECIALISTS.length,
    );
  });
});
