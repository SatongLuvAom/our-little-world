import type {
  D1Database,
  Fetcher,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    BETTER_AUTH_SECRET: string;
    APP_URL: string;
    PUSH_VAPID_JWK?: string;
    APP_VERSION?: { id: string };
    ASSETS?: Fetcher;
    ACCOUNT_BACKEND: DurableObjectNamespace;
  }
}
export {};
