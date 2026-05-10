import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdir, readFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Logger } from 'pino';

const NOTIFICATIONS_DIR = join(homedir(), 'team', 'notifications');

interface Notification {
  session_id: string;
  title: string;
  reason: string;
  timestamp: string;
}

export function createNotificationsRouter(log: Logger): Router {
  const router = Router();

  // GET /api/notifications
  router.get('/', async (_req: Request, res: Response) => {
    try {
      if (!existsSync(NOTIFICATIONS_DIR)) {
        res.json([]);
        return;
      }
      const files = await readdir(NOTIFICATIONS_DIR);
      const notifications: Notification[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await readFile(join(NOTIFICATIONS_DIR, file), 'utf-8');
          notifications.push(JSON.parse(content) as Notification);
        } catch {
          log.warn({ file }, 'Failed to parse notification file');
        }
      }

      // Sort newest first
      notifications.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      res.json(notifications);
    } catch (err) {
      log.error({ err }, 'Failed to read notifications');
      res.status(500).json({ error: 'Failed to read notifications', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/notifications/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'];
      const filePath = join(NOTIFICATIONS_DIR, `${id}.json`);
      if (existsSync(filePath)) {
        await unlink(filePath);
        res.json({ ok: true });
      } else {
        res.status(404).json({ error: 'Notification not found', code: 'NOT_FOUND' });
      }
    } catch (err) {
      log.error({ err }, 'Failed to delete notification');
      res.status(500).json({ error: 'Failed to delete notification', code: 'INTERNAL_ERROR' });
    }
  });

  // DELETE /api/notifications (clear all)
  router.delete('/', async (_req: Request, res: Response) => {
    try {
      if (!existsSync(NOTIFICATIONS_DIR)) {
        res.json({ ok: true, cleared: 0 });
        return;
      }
      const files = await readdir(NOTIFICATIONS_DIR);
      let cleared = 0;
      for (const file of files) {
        if (file.endsWith('.json')) {
          await unlink(join(NOTIFICATIONS_DIR, file));
          cleared++;
        }
      }
      res.json({ ok: true, cleared });
    } catch (err) {
      log.error({ err }, 'Failed to clear notifications');
      res.status(500).json({ error: 'Failed to clear notifications', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
