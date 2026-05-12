#!/usr/bin/env node

import { Command } from 'commander';
import { archiveCommand } from './commands/archive.js';
import { attachCommand } from './commands/attach.js';
import { cleanCommand } from './commands/clean.js';
import { diffCommand } from './commands/diff.js';
import { helpInfoCommand } from './commands/help-info.js';
import { journalCommand } from './commands/journal.js';
import { killCommand } from './commands/kill.js';
import { listCommand } from './commands/list.js';
import { listPastCommand } from './commands/list-past.js';
import { logsCommand } from './commands/logs.js';
import { newCommand } from './commands/new.js';
import { notificationsCommand } from './commands/notifications.js';
import { openCommand } from './commands/open.js';
import { planCommand } from './commands/plan.js';
import { purgeCommand } from './commands/purge.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { tasksCommand } from './commands/tasks.js';
import { uiCommand } from './commands/ui.js';
import { watchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('team')
  .description('my-team — Multi-agent orchestrator for Claude Code')
  .version('0.1.0');

// Commands are registered alphabetically so `team --help` reads top-to-bottom.
program.addCommand(archiveCommand());
program.addCommand(attachCommand());
program.addCommand(cleanCommand());
program.addCommand(diffCommand());
program.addCommand(helpInfoCommand());
program.addCommand(journalCommand());
program.addCommand(killCommand());
program.addCommand(listCommand());
program.addCommand(listPastCommand());
program.addCommand(logsCommand());
program.addCommand(newCommand());
program.addCommand(notificationsCommand());
program.addCommand(openCommand());
program.addCommand(planCommand());
program.addCommand(purgeCommand());
program.addCommand(startCommand());
program.addCommand(statusCommand());
program.addCommand(tasksCommand());
program.addCommand(uiCommand());
program.addCommand(watchCommand());

program.parse();
