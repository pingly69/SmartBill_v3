export interface Env {
  // Database bindings
  DB: D1Database;
  IMG_DB?: D1Database;

  // R2 Bucket binding (optional)
  RECEIPTS_BUCKET?: R2Bucket;

  // Cloudflare Workers Static Assets binding
  ASSETS: Fetcher;

  // Environment variables
  ENVIRONMENT?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  IAM_API_URL?: string;
  LIFF_ID?: string;
  ALLOW_DEV_MOCK?: string;
}
