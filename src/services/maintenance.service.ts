import { Env } from '../config';

/**
 * Daily maintenance task to archive approved bills older than 14 days
 */
export async function runDailyMaintenance(env: Env): Promise<{ archived: number }> {
  const db = env.IMG_DB || env.DB;
  if (!db) {
    throw new Error('D1 Database binding is not configured');
  }

  // 1. Copy records to tax_data_archive
  const insertResult = await db.prepare(`
    INSERT INTO tax_data_archive 
    SELECT 
      record_id, created_at, tax_id, vend_name, branch_no,
      tax_docno, doc_date, amt, vat, net, project, remark,
      pic_bill, users_name, request_name, line_uid, approve_request,
      approve_userid, approve_datetime, status, req_type, pettycash_batch_id,
      datetime('now', '+7 hours') AS archived_at 
    FROM tax_data 
    WHERE approve_datetime IS NOT NULL 
      AND approve_datetime != '' 
      AND julianday('now', '+7 hours') - julianday(approve_datetime) > 14
  `).run();

  const archivedCount = insertResult.meta?.changes || 0;

  // 2. Remove archived records from active tax_data
  if (archivedCount > 0) {
    await db.prepare(`
      DELETE FROM tax_data 
      WHERE approve_datetime IS NOT NULL 
        AND approve_datetime != '' 
        AND julianday('now', '+7 hours') - julianday(approve_datetime) > 14
    `).run();
  }

  return { archived: archivedCount };
}
