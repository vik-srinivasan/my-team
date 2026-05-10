import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../api-client.js';

export function notificationsCommand(): Command {
  const cmd = new Command('notifications')
    .description('List pending notifications for blocked sessions')
    .option('--clear', 'Clear all notifications')
    .action(async (opts: { clear?: boolean }) => {
      try {
        if (opts.clear) {
          const result = await api.clearNotifications();
          console.log(chalk.green(`Cleared ${result.cleared} notification(s).`));
          return;
        }

        const notifications = await api.getNotifications();
        if (notifications.length === 0) {
          console.log(chalk.dim('No pending notifications.'));
          return;
        }

        console.log(chalk.bold(`${notifications.length} notification(s):\n`));
        for (const n of notifications) {
          console.log(
            chalk.yellow('!') +
            ' ' +
            chalk.bold(n.title) +
            chalk.dim(` (${n.session_id})`),
          );
          console.log(`  ${n.reason}`);
          console.log(chalk.dim(`  ${n.timestamp}`));
          console.log();
        }
      } catch (err) {
        if (err instanceof ApiError) {
          console.error(chalk.red(err.message));
        } else {
          throw err;
        }
      }
    });

  return cmd;
}
