#!/usr/bin/env node

import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { newCommand } from './commands/new.js';
import { listCommand } from './commands/list.js';
import { listPastCommand } from './commands/list-past.js';
import { statusCommand } from './commands/status.js';
import { attachCommand } from './commands/attach.js';
import { killCommand } from './commands/kill.js';
import { cleanCommand } from './commands/clean.js';
import { purgeCommand } from './commands/purge.js';
import { archiveCommand } from './commands/archive.js';
import { logsCommand } from './commands/logs.js';
import { journalCommand } from './commands/journal.js';
import { tasksCommand } from './commands/tasks.js';
import { planCommand } from './commands/plan.js';
import { notificationsCommand } from './commands/notifications.js';
import { helpInfoCommand } from './commands/help-info.js';
import { uiCommand } from './commands/ui.js';
import { openCommand } from './commands/open.js';

const program = new Command();

program
  .name('team')
  .description('my-team — Multi-agent orchestrator for Claude Code')
  .version('0.1.0');

program.addCommand(startCommand());
program.addCommand(newCommand());
program.addCommand(listCommand());
program.addCommand(listPastCommand());
program.addCommand(statusCommand());
program.addCommand(attachCommand());
program.addCommand(killCommand());
program.addCommand(cleanCommand());
program.addCommand(purgeCommand());
program.addCommand(archiveCommand());
program.addCommand(logsCommand());
program.addCommand(journalCommand());
program.addCommand(tasksCommand());
program.addCommand(planCommand());
program.addCommand(notificationsCommand());
program.addCommand(helpInfoCommand());
program.addCommand(uiCommand());
program.addCommand(openCommand());

program.parse();
