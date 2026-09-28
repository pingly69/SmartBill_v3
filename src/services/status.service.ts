import { Env } from '../config';
import { MyBillsResponse, BillItemDTO, BillStatus } from '../types/api';

/**
 * Fetch bills submitted by the user and calculate KPI summary cards
 */
export async function getMyBills(env: Env, lineUid: string): Promise<MyBillsResponse> {
  const db = env.IMG_DB || env.DB;
  if (!db) {
    throw new Error('D1 Database binding (DB / IMG_DB) is not configured');
  }

  if (!lineUid) {
    throw new Error('Missing lineUid parameter');
  }

  const rows = await db.prepare(`
    SELECT 
      record_id, created_at, tax_id, vend_name, branch_no,
      tax_docno, doc_date, amt, vat, net, project, remark,
      pic_bill, approve_request, status, pettycash_batch_id
    FROM tax_data
    WHERE line_uid = ?
    ORDER BY created_at DESC
  `).bind(lineUid.trim()).all<any>();

  const rawBills = rows.results || [];

  let pendingCount = 0;
  let paidedCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let totalNet = 0;
  let pendingNet = 0;
  let paidedNet = 0;
  let approvedNet = 0;

  const bills: BillItemDTO[] = rawBills.map(row => {
    const netVal = Number(row.net) || 0.0;
    const amtVal = Number(row.amt) || 0.0;
    const vatVal = Number(row.vat) || 0.0;
    const statusVal = (row.status || 'pending').toLowerCase();

    let mappedStatus: BillStatus = 'pending';
    if (statusVal === 'paided' || statusVal === 'paid') {
      mappedStatus = 'paided';
      paidedCount++;
      paidedNet += netVal;
    } else if (statusVal === 'approved') {
      mappedStatus = 'approved';
      approvedCount++;
      approvedNet += netVal;
    } else if (statusVal === 'rejected') {
      mappedStatus = 'rejected';
      rejectedCount++;
    } else {
      mappedStatus = 'pending';
      pendingCount++;
      pendingNet += netVal;
    }

    totalNet += netVal;

    // Format doc_date to DD/MM/YYYY for UI display
    let docDateFormatted = row.doc_date || '';
    if (docDateFormatted.includes('-')) {
      const parts = docDateFormatted.split('-');
      if (parts.length === 3) {
        docDateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    return {
      record_id: String(row.record_id || ''),
      created_at: String(row.created_at || ''),
      tax_id: String(row.tax_id || ''),
      Vend_name: String(row.vend_name || ''),
      Tax_docno: String(row.tax_docno || ''),
      doc_date: docDateFormatted,
      Net: netVal,
      amt: amtVal,
      vat: vatVal,
      project: String(row.project || ''),
      Remark: String(row.remark || ''),
      approve_request: String(row.approve_request || ''),
      status: mappedStatus,
      pettycash_batch_id: String(row.pettycash_batch_id || ''),
      pic_bill: String(row.pic_bill || ''),
    };
  });

  return {
    summary: {
      totalBills: bills.length,
      pendingCount,
      paidedCount,
      approvedCount,
      rejectedCount,
      totalNet: Math.round(totalNet * 100) / 100,
      pendingNet: Math.round(pendingNet * 100) / 100,
      paidedNet: Math.round(paidedNet * 100) / 100,
      approvedNet: Math.round(approvedNet * 100) / 100,
    },
    bills,
  };
}
