import { randomInt } from 'node:crypto';

const ADJECTIVES = [
  'bold', 'brave', 'bright', 'calm', 'clear', 'cool', 'crisp', 'dark',
  'deep', 'dry', 'fair', 'fast', 'firm', 'flat', 'fond', 'free', 'fresh',
  'glad', 'gold', 'grand', 'green', 'grey', 'grim', 'keen', 'kind',
  'last', 'late', 'lean', 'light', 'live', 'long', 'loud', 'mild',
  'neat', 'nice', 'odd', 'pale', 'plain', 'proud', 'pure', 'quick',
  'quiet', 'rare', 'raw', 'red', 'rich', 'ripe', 'rough', 'safe',
  'sharp', 'slim', 'slow', 'soft', 'stark', 'still', 'swift', 'tall',
  'thin', 'true', 'vast', 'warm', 'weak', 'wet', 'wide', 'wild',
] as const;

const NOUNS = [
  'ash', 'bay', 'bear', 'bird', 'bloom', 'brook', 'cliff', 'cloud',
  'coast', 'coral', 'crane', 'creek', 'crow', 'dawn', 'deer', 'dew',
  'dove', 'drake', 'drift', 'dusk', 'elm', 'ember', 'fawn', 'fern',
  'field', 'finch', 'flame', 'flint', 'fog', 'ford', 'forge', 'fox',
  'frost', 'glen', 'grove', 'hawk', 'haze', 'heath', 'heron', 'hill',
  'ivy', 'jade', 'lake', 'lark', 'leaf', 'marsh', 'mist', 'moon',
  'moss', 'oak', 'owl', 'peak', 'pine', 'pond', 'rain', 'reed',
  'ridge', 'river', 'rock', 'sage', 'shade', 'shore', 'sky', 'slate',
  'snow', 'spark', 'stone', 'storm', 'stream', 'sun', 'thorn', 'tide',
  'trail', 'vale', 'vine', 'wave', 'willow', 'wind', 'wolf', 'wren',
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)] as T;
}

export function generateSessionId(existing: Set<string> = new Set()): string {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const id = `${pick(ADJECTIVES)}-${pick(NOUNS)}-${randomInt(10, 100)}`;
    if (!existing.has(id)) {
      return id;
    }
  }
  // Fallback: append extra digits
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${randomInt(100, 1000)}`;
}
