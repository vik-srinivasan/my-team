import { Command } from 'commander';
import { api, ApiError } from '../api-client.js';

export function helpInfoCommand(): Command {
  return new Command('help')
    .description('Show helpful info about my-team commands and workflow')
    .action(async () => {
      console.log(`
\x1b[1mmy-team — Multi-agent orchestrator for Claude Code\x1b[0m

\x1b[36m── Workflow ──\x1b[0m

  1. \x1b[1mteam start\x1b[0m            Start the wrapper daemon (keep running)
  2. \x1b[1mcd /your/repo\x1b[0m         Navigate to any git repo
  3. \x1b[1mteam new "title"\x1b[0m      Create a session — spawns a captain agent
  4. Chat with the captain, approve the plan, then walk away
  5. Check progress with \x1b[1mteam list\x1b[0m / \x1b[1mteam status <id>\x1b[0m

\x1b[36m── Commands ──\x1b[0m

  \x1b[33mSession lifecycle:\x1b[0m
    team new <title>          Create a new session in the current repo
    team list                 List all active sessions
    team status <id>          Show detailed session status
    team attach <id>          Re-attach to a session's captain chat
    team logs <id>            View the session journal

  \x1b[33mSession management:\x1b[0m
    team kill <id>            Stop a running session (preserves worktree)
    team archive <id>         Archive .team/ files to ~/team/archives/
    team clean <id>           Remove worktree entirely (archives first)

  \x1b[33mOther:\x1b[0m
    team notifications        Check for blocked sessions needing attention
    team notifications --clear  Clear all notifications
    team ui                   Open the web dashboard in your browser
    team help                 Show this help
    team start                Start the wrapper daemon

\x1b[36m── Agent Team ──\x1b[0m

  Captain    Orchestrates the session — plans, dispatches, decides
  Scout      Read-only codebase exploration (fast, cheap)
  Engineer   Implements features, writes code + unit tests
  Tester     Writes integration tests, runs test suite
  Reviewer   Code review with severity-bucketed findings
  Git        Pushes branch and opens a pull request

\x1b[36m── Session Phases ──\x1b[0m

  created → scouting → planning → awaiting_approval → executing → reviewing → done

\x1b[36m── Key Paths ──\x1b[0m

  ~/team/sessions/       Active session worktrees
  ~/team/archives/       Archived .team/ directories
  ~/team/notifications/  Blocked session alerts
  http://localhost:3001   Web dashboard (when daemon is running)
`);

      // Show daemon status
      try {
        const sessions = await api.listSessions();
        const active = sessions.filter(s => s.phase !== 'done' && s.phase !== 'cleaned' && s.phase !== 'killed');
        console.log(`\x1b[36m── Daemon Status ──\x1b[0m\n`);
        console.log(`  \x1b[32mDaemon is running\x1b[0m`);
        console.log(`  ${sessions.length} total session(s), ${active.length} active\n`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          console.log(`\x1b[36m── Daemon Status ──\x1b[0m\n`);
          console.log(`  \x1b[31mDaemon is not running.\x1b[0m Start it with: team start\n`);
        }
      }
    });
}
