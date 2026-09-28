import { Env } from '../config';
import { SubmitBillRequest, SubmitBillResponse, BillStatus } from '../types/api';
import { getApproversFromIAM } from './iam.service';

/**
 * Handle bill submission with backend recalculations and Self-Approval detection
 */
export async function submitBill(
  env: Env,
  payload: SubmitBillRequest
): Promise<SubmitBillResponse> {
  const db = env.IMG_DB || env.DB;
  if (!db) {
    throw new Error('D1 Database binding (DB / IMG_DB) is not configured');
  }

  // 1. Recalculate amounts on backend (Rule 4: never trust client total)
  const amt = Math.round((Number(payload.preVat) || 0.0) * 100) / 100;
  const vat = Math.round((Number(payload.vatAmount) || 0.0) * 100) / 100;
  const net = Math.round((amt + vat) * 100) / 100;

  // 2. Validate Document Date (Rule 5: doc_date <= today in Asia/Bangkok)
  if (!payload.billDate) {
    throw new Error('กรุณาระบุวันที่บนบิล');
  }
  const todayBangkok = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  if (payload.billDate > todayBangkok) {
    throw new Error('วันที่บนบิลต้องไม่เกินวันที่ปัจจุบันครับ');
  }

  // 3. Generate Record ID
  const recordId = Date.now().toString();

  // 4. Handle Image Storage (R2 Bucket with fallback)
  let picUrl = '';
  if (payload.base64Image) {
    if (env.RECEIPTS_BUCKET) {
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const key = `bills/${yyyy}/${mm}/${recordId}.jpg`;
        const buffer = Uint8Array.from(atob(payload.base64Image), c => c.charCodeAt(0));
        
        await env.RECEIPTS_BUCKET.put(key, buffer, {
          httpMetadata: {
            contentType: payload.mimeType || 'image/jpeg',
          },
          customMetadata: {
            recordId,
            lineUid: payload.lineUserId || '',
          },
        });
        picUrl = `/api/images/${recordId}`;
      } catch (r2Err) {
        console.warn('[BillService] Failed uploading to R2 bucket:', r2Err);
        // Fallback: save data URI
        picUrl = `data:${payload.mimeType || 'image/jpeg'};base64,${payload.base64Image}`;
      }
    } else {
      // If R2 is not bound, save as data URL so receipt image is preserved
      picUrl = `data:${payload.mimeType || 'image/jpeg'};base64,${payload.base64Image}`;
    }
  }

  // 5. Self-Approval Resolution (Rule 3)
  const requesterUid = (payload.lineUserId || '').trim();
  let approverUid = (payload.approve_line_uid || '').trim();

  // If approver line_uid is not passed from client, resolve from IAM approvers list
  if (!approverUid && payload.approve_request) {
    const approvers = await getApproversFromIAM(env);
    const matched = approvers.find(a => a.approve_request === payload.approve_request);
    if (matched) {
      approverUid = matched.line_uid.trim();
    }
  }

  const isSelfApproval = Boolean(
    requesterUid && approverUid && requesterUid.toLowerCase() === approverUid.toLowerCase()
  );

  const status: BillStatus = isSelfApproval ? 'paided' : 'pending';
  const approveUserId = isSelfApproval ? requesterUid : null;
  const approveDateTime = isSelfApproval ? new Date().toISOString() : null;

  // 6. SQL Insert into tax_data table
  await db.prepare(`
    INSERT INTO tax_data (
      record_id, created_at, tax_id, vend_name, branch_no, tax_docno,
      doc_date, amt, vat, net, project, remark, pic_bill, users_name,
      request_name, line_uid, approve_request, approve_userid,
      approve_datetime, status, req_type, pettycash_batch_id
    ) VALUES (
      ?, datetime('now', '+7 hours'), ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, '2', NULL
    )
  `).bind(
    recordId,
    (payload.taxId || '').trim(),
    (payload.sellerName || '').trim(),
    (payload.branchCode || '00000').trim(),
    (payload.billNumber || '').trim(),
    payload.billDate,
    amt,
    vat,
    net,
    (payload.projectCode || '').trim(),
    (payload.expenseNote || '').trim(),
    picUrl,
    payload.lineEmail || 'LIFF User',
    (payload.requesterName || '').trim(),
    requesterUid,
    (payload.approve_request || '').trim(),
    approveUserId,
    approveDateTime,
    status
  ).run();

  return {
    success: true,
    message: isSelfApproval ? 'บันทึกสำเร็จ (อนุมัติอัตโนมัติ Self-Approval)' : 'บันทึกสำเร็จ',
    record_id: recordId,
    status,
    fileUrl: picUrl,
  };
}
