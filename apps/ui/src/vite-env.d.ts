/// <reference types="vite/client" />

/**
 * Bundle-time environment overrides consumed by `lib/api.ts` and `lib/ws.ts`.
 *
 * Both default through to the system wrapper daemon (`127.0.0.1:3001`).
 * Set these at `vite dev` / `vite build` time to retarget the bundle at
 * a session-local wrapper running on a different port. See
 * `apps/ui/README.md` § "Building against a non-default wrapper".
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WS_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
