import { Env } from '../config';

/**
 * Fetch active project / site names from D1 master_site table
 */
export async function getActiveSites(env: Env): Promise<string[]> {
  const db = env.IMG_DB || env.DB;
  if (!db) {
    throw new Error('D1 Database binding (DB / IMG_DB) is not configured');
  }

  const rows = await db.prepare(`
    SELECT site_name 
    FROM master_site 
    WHERE active = 1 
    ORDER BY site_name ASC
  `).all<{ site_name: string }>();

  const results = rows.results || [];
  return results
    .map(r => (r.site_name || '').trim())
    .filter(name => name.length > 0);
}
