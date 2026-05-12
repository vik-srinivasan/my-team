import { Github, FileText, ExternalLink } from 'lucide-react';

const GITHUB_URL = 'https://github.com/vik-srinivasan/my-team';
const SPEC_URL = 'https://github.com/vik-srinivasan/my-team/blob/main/SPEC.md';
const PERSONAL_URL = 'https://vik-srinivasan.github.io/personal-website/#/';

export default function Footer() {
  return (
    <footer className="relative border-t border-[color:var(--color-border)] py-12">
      <div className="mx-auto max-w-[1100px] px-6">
        <p className="mb-8 font-mono text-xs text-[color:var(--color-dim)]">
          Coming soon: remote droplet hosts so the team runs while your laptop sleeps.
        </p>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="font-mono text-sm text-[color:var(--color-text)]">my-team</div>
            <p className="mt-1 text-xs text-[color:var(--color-dim)]">
              Local-only multi-agent orchestrator for Claude Code.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-text)]"
            >
              <Github size={14} aria-hidden="true" />
              GitHub
            </a>
            <a
              href={SPEC_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-text)]"
            >
              <FileText size={14} aria-hidden="true" />
              SPEC.md
            </a>
            <a
              href={PERSONAL_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-text)]"
            >
              by Vik
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
