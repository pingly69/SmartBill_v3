import { Env } from './config';
import { handleCorsPreflight, jsonResponse, errorResponse } from './utils/response';
import { getApproversFromIAM, getUserProfileFromIAM } from './services/iam.service';
import { getActiveSites } from './services/sites.service';
import { analyzeInvoice } from './services/ocr.service';
import { submitBill } from './services/bill.service';
import { getMyBills } from './services/status.service';
import { runDailyMaintenance } from './services/maintenance.service';
import { SubmitBillRequest } from './types/api';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    try {
      // 2. Runtime Configuration
      if (request.method === 'GET' && url.pathname === '/api/config') {
        return jsonResponse({
          success: true,
          data: {
            liffId: env.LIFF_ID || '2009016720-6dg4Pumx',
            allowDevMock: env.ALLOW_DEV_MOCK === 'true',
            environment: env.ENVIRONMENT || 'production',
            geminiModel: env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
          },
        });
      }

      // 3. Initial Data (Combined User Profile & Approvers)
      if (request.method === 'GET' && url.pathname === '/api/initial-data') {
        const lineUid = url.searchParams.get('lineUid') || '';
        const [profile, approvers] = await Promise.all([
          getUserProfileFromIAM(env, lineUid),
          getApproversFromIAM(env),
        ]);

        return jsonResponse({
          success: true,
          data: {
            profile,
            approvers,
          },
        });
      }

      // 4. Project Sites List (From D1 master_site)
      if (request.method === 'GET' && url.pathname === '/api/sites') {
        const sites = await getActiveSites(env);
        return jsonResponse(
          {
            success: true,
            data: sites,
          },
          200,
          {
            'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
          }
        );
      }

      // 5. AI OCR Invoice Analysis (Gemini Flash)
      if (request.method === 'POST' && url.pathname === '/api/analyze') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return errorResponse('Invalid JSON body');
        }

        const base64 = body.base64 || '';
        const mimeType = body.type || body.mimeType || 'image/jpeg';

        if (!base64) {
          return errorResponse('Missing base64 image data');
        }

        const result = await analyzeInvoice(env, base64, mimeType);
        return jsonResponse({
          success: true,
          data: result,
        });
      }

      // 6. Submit Bill
      if (request.method === 'POST' && url.pathname === '/api/bills') {
        let payload: SubmitBillRequest;
        try {
          const body: any = await request.json();
          // Support both direct payload and legacy wrapped { action: 'submit', formData: { ... } }
          payload = body.formData || body;
        } catch {
          return errorResponse('Invalid JSON request');
        }

        if (!payload.taxId && !payload.sellerName) {
          return errorResponse('กรุณาระบุเลขผู้เสียภาษีหรือชื่อผู้ขาย');
        }

        const result = await submitBill(env, payload);
        return jsonResponse(
          {
            success: true,
            message: result.message,
            record_id: result.record_id,
            status: result.status,
            fileUrl: result.fileUrl,
          },
          201
        );
      }

      // 7. My Bills & Analytics Summary (For checkstatus.html)
      if (request.method === 'GET' && url.pathname === '/api/bills/my') {
        const lineUid = url.searchParams.get('lineUid') || '';
        if (!lineUid) {
          return errorResponse('Missing lineUid query parameter');
        }

        const data = await getMyBills(env, lineUid);
        return jsonResponse({
          success: true,
          data,
        });
      }

      // 8. Serve Receipt Images from R2 Bucket (if bound)
      if (request.method === 'GET' && url.pathname.startsWith('/api/images/')) {
        const recordId = url.pathname.replace('/api/images/', '');
        if (env.RECEIPTS_BUCKET) {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const key = `bills/${yyyy}/${mm}/${recordId}.jpg`;
          const object = await env.RECEIPTS_BUCKET.get(key);
          if (object) {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);
            headers.set('Cache-Control', 'public, max-age=31536000, immutable');
            return new Response(object.body, { headers });
          }
        }
        return new Response('Image Not Found', { status: 404 });
      }

      // 9. Manual Maintenance Trigger
      if (request.method === 'POST' && url.pathname === '/api/maintenance') {
        const result = await runDailyMaintenance(env);
        return jsonResponse({
          success: true,
          message: 'Maintenance completed successfully',
          data: result,
        });
      }

      // 10. Fallback: Static Assets
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err: any) {
      console.error('[Worker Error]', err);
      return errorResponse(err.message || 'Internal Server Error', 500);
    }
  },

  // Nightly Cron Trigger
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyMaintenance(env));
  },
};
