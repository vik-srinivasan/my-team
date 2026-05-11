import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Hero component', () => {
  it('renders personal-story paragraph in correct position', () => {
    const heroPath = join(__dirname, 'Hero.tsx');
    const heroContent = readFileSync(heroPath, 'utf-8');

    // Verify the personal-story paragraph has the correct content
    expect(heroContent).toContain('I built this because');
    expect(heroContent).toContain('structured way');
    expect(heroContent).toContain('95% of the time');
    expect(heroContent).toContain('coworker engineer');
    expect(heroContent).toContain('hand a team a task');
    expect(heroContent).toContain('approve the plan');
    expect(heroContent).toContain('walk away to a PR');

    // Verify it's wrapped in motion.p with proper styling
    expect(heroContent).toContain('motion.p');
    expect(heroContent).toContain('text-[color:var(--color-muted)]');
    expect(heroContent).toContain('leading-relaxed');

    // Verify position: the story paragraph comes after the main tagline
    const taglineIndex = heroContent.indexOf('Spin up a team of AI specialists');
    const storyIndex = heroContent.indexOf('I built this because');
    expect(storyIndex).toBeGreaterThan(taglineIndex);

    // Verify it comes before the CTA buttons
    const githubButtonIndex = heroContent.indexOf('View on GitHub');
    expect(githubButtonIndex).toBeGreaterThan(storyIndex);
  });
});
