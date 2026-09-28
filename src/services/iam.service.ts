import { Env } from '../config';
import { ApproverDTO, UserProfileDTO } from '../types/api';

const DEFAULT_IAM_URL = 'https://smartbill-usersadmin-api.pingly69.workers.dev/api';

interface IAMUserRecord {
  users_id?: string;
  requester_name?: string;
  request_name?: string;
  Request_Name?: string;
  users_name?: string;
  emp_no?: string;
  pc_limit?: number;
  line_uid: string;
  display_name?: string;
  displayName?: string;
  email?: string;
  active?: string;
  approve_tags?: string[];
  pettycash_control?: string;
  pettycash_approve?: string;
}

/**
 * Fetch Petty Cash Custodians / Approvers from Central IAM Gateway
 */
export async function getApproversFromIAM(env: Env): Promise<ApproverDTO[]> {
  const apiUrl = env.IAM_API_URL || DEFAULT_IAM_URL;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getApprovers',
        tag: 'คุมวงเงินสด',
      }),
    });

    if (res.ok) {
      const json: any = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data.map((u: IAMUserRecord) => {
          const name = u.requester_name || u.request_name || u.Request_Name || u.users_name || '';
          return {
            approve_request: name,
            line_profile: u.display_name || u.displayName || '',
            line_uid: u.line_uid,
            pettycash_approve: u.pettycash_approve || 'NO',
            emp_no: u.emp_no || '',
            pc_limit: Number(u.pc_limit) || 0,
          };
        }).filter((a: ApproverDTO) => Boolean(a.approve_request && a.line_uid));
      }
    }
    console.warn('[IAMService] getApprovers HTTP call failed or returned unsuccess, falling back to D1');
  } catch (err) {
    console.warn('[IAMService] Error calling IAM API getApprovers:', err);
  }

  // Fallback: Query directly from D1 users_profile table if bound
  try {
    const db = env.IMG_DB || env.DB;
    if (db) {
      const rows = await db.prepare(`
        SELECT line_uid, requester_name, emp_no, pc_limit, display_name
        FROM users_profile
        WHERE active = 'Y' AND approve_tags LIKE '%คุมวงเงินสด%'
        ORDER BY requester_name ASC
      `).all<any>();

      if (rows.results && rows.results.length > 0) {
        return rows.results.map((r: any) => ({
          approve_request: r.requester_name || '',
          line_profile: r.display_name || '',
          line_uid: r.line_uid || '',
          pettycash_approve: 'NO',
          emp_no: r.emp_no || '',
          pc_limit: Number(r.pc_limit) || 0,
        }));
      }
    }
  } catch (dbErr) {
    console.error('[IAMService] Fallback D1 query failed:', dbErr);
  }

  return [];
}

/**
 * Fetch User Profile by LINE User ID from Central IAM Gateway
 */
export async function getUserProfileFromIAM(env: Env, lineUid: string): Promise<UserProfileDTO> {
  if (!lineUid) {
    return { found: false };
  }

  const apiUrl = env.IAM_API_URL || DEFAULT_IAM_URL;

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listUsers' }),
    });

    if (res.ok) {
      const json: any = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const matched = json.data.find(
          (u: IAMUserRecord) => u.line_uid && u.line_uid.trim() === lineUid.trim()
        );
        if (matched) {
          const name = matched.requester_name || matched.request_name || matched.Request_Name || matched.users_name || '';
          return {
            found: true,
            request_name: name,
            emp_no: matched.emp_no || '',
            pc_limit: Number(matched.pc_limit) || 0,
            line_uid: matched.line_uid,
          };
        }
      }
    }
  } catch (err) {
    console.warn('[IAMService] Error calling IAM API listUsers:', err);
  }

  // Fallback: Query D1 users_profile table directly
  try {
    const db = env.IMG_DB || env.DB;
    if (db) {
      const row = await db.prepare(`
        SELECT line_uid, requester_name, emp_no, pc_limit
        FROM users_profile
        WHERE line_uid = ? AND active = 'Y'
      `).bind(lineUid.trim()).first<any>();

      if (row) {
        return {
          found: true,
          request_name: row.requester_name || '',
          emp_no: row.emp_no || '',
          pc_limit: Number(row.pc_limit) || 0,
          line_uid: row.line_uid,
        };
      }
    }
  } catch (dbErr) {
    console.error('[IAMService] Fallback D1 user profile query failed:', dbErr);
  }

  return { found: false };
}
