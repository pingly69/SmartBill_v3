# SmartBill Approve v3 — Integration & Handoff Specification from SmartBill v3

> **Document Type**: Cross-Project Handoff & Edge Architecture Specification  
> **Target Project**: `c:\Antigravity_Data\SmartBill_Approve_v3`  
> **Source Project**: `c:\Antigravity_Data\SmartBill_v3`  
> **Author**: Lead System Architect & Principal DBA (Cloudflare Edge Stack)  
> **Status**: Production-Ready / Authoritative Source of Truth  
> **Target Stack**: Cloudflare Workers (TypeScript / Hono) + Cloudflare D1 (SQLite) + LINE LIFF  

---

## 📌 1. บริบทและสถาปัตยกรรมร่วม (Shared Ecosystem Context)

ระบบ SmartBill ประกอบด้วย 3 บริการหลักที่ทำงานเชื่อมโยงกันบน Cloudflare Edge Network:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│          SmartBill v3           │       │      SmartBill Approve v3       │
│    (LIFF บันทึกบิลขอเบิกเงินสด)    │       │     (LIFF อนุมัติจ่ายเงินสดย่อย)    │
│  - พนักงานบันทึกบิลขอเบิก          │       │  - ผู้ถือวงเงินสดตรวจสอบรายการรอจ่าย │
│  - บันทึกลง tax_data (status:pending)│       │  - กดอนุมัติ (Paided) / ปฏิเสธ   │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
                 │      ┌───────────────────────────┐      │
                 └─────▶│   Cloudflare D1: IMG_DB   │◀─────┘
                        │    (ตารางหลัก: tax_data)   │
                        └─────────────▲─────────────┘
                                      │
                        ┌─────────────┴─────────────┐
                        │   Central IAM Gateway     │
                        │  (smartbill-usersadmin)   │
                        │  - จัดการสิทธิ์ Approver    │
                        │  - ข้อมูลผู้ใช้ & PC Limit  │
                        └───────────────────────────┘
```

### ⚠️ กฎเหล็กข้อที่ 1 (CRITICAL RULE #1): ใช้ D1 Database ก้อนเดียวกัน
- **ห้ามสร้าง D1 Database ใหม่เด็ดขาด** (ไม่ต้องรัน `npx wrangler d1 create`)
- ทั้ง **SmartBill v3** และ **SmartBill Approve v3** เชื่อมต่อและทำงานบน **Cloudflare D1 Database เดียวกัน**
- ข้อมูลการตั้งค่า D1 Binding สำหรับ `wrangler.toml` ของ SmartBill Approve v3:
  ```toml
  account_id = "f9bc011eeec351846c11f6aefacded76"

  [[d1_databases]]
  binding = "DB"
  database_name = "IMG_DB"
  database_id = "4db03e65-cc9d-458e-81f7-b8119669dd17"

  [[d1_databases]]
  binding = "IMG_DB"
  database_name = "IMG_DB"
  database_id = "4db03e65-cc9d-458e-81f7-b8119669dd17"
  ```

---

## 📊 2. โครงสร้างตารางจริงใน Production D1 (`IMG_DB`)

ตารางที่ SmartBill Approve v3 ต้องอ่านและอัปเดตคือตาราง **`tax_data`** ซึ่งถูกสร้างและใช้งานอยู่จริงบน Production โดยมี DDL ดังนี้:

```sql
CREATE TABLE IF NOT EXISTS tax_data (
    record_id TEXT PRIMARY KEY,                       -- รหัสบิลอ้างอิงหลัก (เช่น '1790417593762' สร้างจาก timestamp string)
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')), -- เวลาที่บันทึกคำขอ (Bangkok Time)
    tax_id TEXT NOT NULL DEFAULT '',                  -- เลขประจำตัวผู้เสียภาษีผู้ขาย (13 หลัก)
    vend_name TEXT NOT NULL DEFAULT '',               -- ชื่อร้านค้า / ผู้ขาย
    branch_no TEXT NOT NULL DEFAULT '00000',          -- เลขที่สาขา
    tax_docno TEXT DEFAULT '',                        -- เลขที่ใบกำกับภาษี / เลขที่บิล
    doc_date TEXT NOT NULL,                           -- วันที่ในเอกสาร รูปแบบ 'YYYY-MM-DD' (เช่น '2026-09-26')
    amt REAL NOT NULL DEFAULT 0.00,                   -- มูลค่าสินค้าก่อนภาษี (REAL)
    vat REAL NOT NULL DEFAULT 0.00,                   -- ภาษีมูลค่าเพิ่ม (REAL)
    net REAL NOT NULL DEFAULT 0.00,                   -- ยอดเงินสุทธิที่ขอเบิก (REAL)
    project TEXT DEFAULT '',                          -- รหัสโครงการ / ชื่อโครงการ
    remark TEXT DEFAULT '',                           -- รายละเอียดค่าใช้จ่าย / หมายเหตุ
    pic_bill TEXT DEFAULT '',                         -- หลักฐานใบเสร็จ (Base64 Data URL, R2 URL หรือ Google Drive)
    users_name TEXT NOT NULL DEFAULT 'LIFF User',     -- ชื่อผู้ใช้งาน LINE หรืออีเมลผู้บันทึก
    request_name TEXT NOT NULL DEFAULT '',            -- ชื่อพนักงานผู้ขอเบิกเงิน (Requester Name)
    line_uid TEXT NOT NULL,                           -- LINE User ID ของผู้ขอเบิก
    approve_request TEXT NOT NULL DEFAULT '',         -- ชื่อผู้ถือวงเงินสดย่อย / ผู้อนุมัติ (Key หลักในการดึง Pending)
    approve_userid TEXT DEFAULT NULL,                 -- LINE User ID ของผู้อนุมัติ/ผู้จ่ายเงิน (เซ็ตเมื่อกด Paid/Reject)
    approve_datetime TEXT DEFAULT NULL,               -- วันเวลาที่อนุมัติ/จ่ายเงิน (Bangkok Time หรือ ISO string)
    status TEXT NOT NULL DEFAULT 'pending',           -- สถานะ: 'pending' (รอจ่าย), 'paided' (จ่ายแล้ว), 'rejected' (ปฏิเสธ)
    req_type TEXT NOT NULL DEFAULT '2',               -- ประเภทคำขอ: '2' = เงินสดย่อย (Petty Cash)
    pettycash_batch_id TEXT DEFAULT NULL              -- รหัสชุดเบิกเงินสดย่อย (สำหรับการรวมชุดเคลียร์เงินสด)
);
```

---

## ⚡ 3. ตารางจับคู่ฟิลด์สำคัญ (Field Mapping Corrections)

> **คำเตือน (WARNING)**: ห้ามใช้ชื่อฟิลด์จากสเปกร่างเดิมที่ไม่มีอยู่จริงในฐานข้อมูล มิฉะนั้น SQLite จะเกิดข้อผิดพลาด `no such column`

| ข้อมูลที่ต้องการ | ชื่อฟิลด์จริงใน D1 `tax_data` | ชื่อใน Spec ร่างเดิม (❌ ห้ามใช้) | ฟิลด์ที่ UI เก่าคาดหวัง (`OLD_UI`) | รายละเอียด |
|---|---|---|---|---|
| **รหัสบิล** | **`record_id`** | `id` | `item.recordId` | Primary Key เป็นสตริง |
| **ชื่อผู้อนุมัติ** | **`approve_request`** | `req_by` | `approveRequestName` | ชื่อผู้คุมเงินสด เช่น *"สุภาพร บุญมา (ผู้ถือเงินสดย่อย)"* |
| **ชื่อผู้ขอเบิก** | **`request_name`** | `req_name` | `item.reqName` | ชื่อพนักงาน เช่น *"กฤษดา แผ้วฉ่ำ (แผ้ว)"* |
| **รูปถ่ายบิล** | **`pic_bill`** | `pic_key` / `pic_url` | `item.pic` | สตริงรูปภาพ (ดูหัวข้อที่ 4) |
| **ยอดเงินสุทธิ** | **`net`** | `net` | `item.net` | ตัวเลขทศนิยม (REAL) |
| **วันที่เอกสาร** | **`doc_date`** | `doc_date` | `item.docDate` | เก็บเป็น `YYYY-MM-DD` (แปลงเป็น `DD/MM/YYYY` ใน UI) |
| **โครงการ** | **`project`** | `project` | `item.project` | สตริงชื่อโครงการ |
| **หมายเหตุ** | **`remark`** | `remark` | `item.remark` | บันทึกช่วยจำ |
| **สถานะบิล** | **`status`** | `status` | `status` | แนะนำบันทึกเป็นตัวพิมพ์เล็ก `'paided'` หรือ `'rejected'` |
| **LINE ผู้อนุมัติ** | **`approve_userid`** | `approver_uid` | `line_uid` | เก็บ LINE UID ของคนที่กดยืนยันจ่ายเงิน |
| **เวลาที่อนุมัติ** | **`approve_datetime`** | `approved_at` | - | วันเวลาที่กดยืนยันจ่ายเงิน |

---

## 🖼️ 4. การจัดการรูปภาพใบเสร็จ (`pic_bill`)

ในระบบเดิมของ Google Apps Script รูปภาพจะเก็บอยู่บน Google Drive เสมอ แต่ในสถาปัตยกรรมใหม่ของ **SmartBill v3**:
1. **Base64 Data URL**: หากไม่มี R2 Binding รูปจะถูกเก็บเป็น Base64 Data URL ตรงๆ เช่น `data:image/jpeg;base64,/9j/4AAQSkZJRg...`
2. **Cloudflare R2 Public URL**: หากต่อ R2 จะเป็น CDN URL ตรง เช่น `https://assets.smartbill.../bills/...jpg`
3. **Google Drive URL (ข้อมูลเดิม)**: เช่น `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`

### 💡 โค้ด Helper สำหรับ Frontend ในการแสดงผลรูปภาพทุกรูปแบบ:
```javascript
function resolveBillImageUrl(picUrl) {
    if (!picUrl || picUrl.trim() === '') {
        return 'https://placehold.co/400x400/e2e8f0/64748b?text=NO+RECEIPT';
    }
    // 1. รองรับ Base64 Data URL ตรงๆ
    if (picUrl.startsWith('data:image/')) {
        return picUrl;
    }
    // 2. รองรับ Google Drive Legacy URL
    if (picUrl.includes('drive.google.com')) {
        let fileId = '';
        if (picUrl.includes('id=')) {
            fileId = picUrl.split('id=')[1].split('&')[0];
        } else if (picUrl.includes('/d/')) {
            fileId = picUrl.split('/d/')[1].split('/')[0];
        }
        return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w400` : picUrl;
    }
    // 3. Cloudflare R2 / Custom CDN URL
    return picUrl;
}
```

---

## 🔐 5. การตรวจสอบสิทธิ์ผู้อนุมัติ (Approver Authentication & Central IAM)

SmartBill เชื่อมต่อกับระบบยืนยันตัวตนกลาง (**Central IAM Gateway**):
- **IAM API Endpoint**: `https://smartbill-usersadmin-api.pingly69.workers.dev/api`

### ขั้นตอนการระบุตัวตน (Approver Auth Flow)
1. เมื่อเปิดแอป LIFF ให้ดึง Profile ของผู้ใช้:
   `const profile = await liff.getProfile(); // profile.userId (line_uid)`
2. ส่งคำขอ `action: 'checkUser'` ไปยัง Backend ของ SmartBill Approve v3
3. Backend ตรวจสอบสิทธิ์โดย:
   - **แนวทางที่ 1 (Query ตรงจาก D1 `users_profile` ใน `IMG_DB`)**:
     ```sql
     SELECT line_uid, requester_name, display_name, active, approve_tags, pettycash_approve
     FROM users_profile
     WHERE line_uid = ? AND active = 'Y';
     ```
   - **แนวทางที่ 2 (เรียก Central IAM API)**:
     ```typescript
     const res = await fetch(env.IAM_API_URL, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ action: 'getUserProfile', line_uid: lineUid })
     });
     ```
4. การตัดสินสิทธิ์ (Authorization Rule):
   - ผู้ใช้ต้องมีบทบาทผู้คุมเงินสดย่อย: ตรวจสอบว่า `approve_tags` มีคำว่า `'คุมวงเงินสด'` หรือมีชื่ออยู่ในตาราง `approve_users`
   - ค่า `pettycash_approve`: ในระบบเดิม ค่า `'NO'` หมายถึง **มีสิทธิ์ใช้งาน** (ไม่ได้ติด Block)
   - ส่งผลลัพธ์กลับไปยัง LIFF:
     ```json
     {
       "success": true,
       "data": {
         "status": "authorized",
         "approve_request": user.requester_name,
         "pettycash_approve": "NO",
         "displayName": user.display_name
       }
     }
     ```
5. กรณีผู้ใช้ยังไม่ได้ผูก LINE UID:
   - ส่ง `{ status: 'register' }` ให้แสดงหน้าจอลงทะเบียน
   - เมื่อกรอกรหัสผ่าน ทำการเทียบกับตาราง `users_profile.password` และ Update `line_uid`

---

## 📡 6. ข้อกำหนด API Backend สำหรับ SmartBill Approve v3 (Edge API Contract)

สร้าง Cloudflare Worker (แนะนำใช้ Hono framework) รองรับ Endpoint: `POST /api`

### 1) Action: `checkUser`
- **Request**: `{ "action": "checkUser", "line_uid": "Ufdb8dd9..." }`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "authorized",
      "approve_request": "สุภาพร บุญมา (ผู้ถือเงินสดย่อย)",
      "pettycash_approve": "NO"
    }
  }
  ```

### 2) Action: `getPending`
- **Request**: `{ "action": "getPending", "approve_request": "สุภาพร บุญมา (ผู้ถือเงินสดย่อย)" }`
- **SQL Execution**:
  ```sql
  SELECT 
    record_id, doc_date, amt, vat, net, project, remark, 
    pic_bill, request_name, approve_request, status, created_at
  FROM tax_data
  WHERE approve_request = ? AND LOWER(status) = 'pending'
  ORDER BY created_at ASC;
  ```
- **Response Format (ตรงกับที่ UI คาดหวัง)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "recordId": "1790417593762",
        "docDate": "2026-09-26",
        "net": 1070.00,
        "amt": 1000.00,
        "vat": 70.00,
        "project": "โครงการอาคาร A",
        "remark": "ค่าน้ำมันสำรวจหน้างาน",
        "pic": "data:image/jpeg;base64,...",
        "reqName": "กฤษดา แผ้วฉ่ำ (แผ้ว)",
        "approve_request": "สุภาพร บุญมา (ผู้ถือเงินสดย่อย)"
      }
    ]
  }
  ```

### 3) Action: `updateStatus` (Batch Update)
- **Request**:
  ```json
  {
    "action": "updateStatus",
    "items": ["1790417593762", "1790417593763"],
    "line_uid": "Ufdb8dd9...",
    "status": "Paided"
  }
  ```
- **Business Logic**:
  - Normalize สถานะ: `status.toLowerCase() === 'paided' ? 'paided' : 'rejected'`
  - ทำ Batch SQL Update ใน 1 Statement:
    ```sql
    UPDATE tax_data
    SET 
      status = ?,
      approve_userid = ?,
      approve_datetime = datetime('now', '+7 hours')
    WHERE record_id IN (?, ?)
    ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "updated": 2,
      "status": "paided"
    }
  }
  ```

---

## ⚙️ 7. ฟีเจอร์เบื้องหลังของ SmartBill v3 ที่ต้องทราบ (System Behaviors)

### 1. Self-Approval (การอนุมัติอัตโนมัติ)
ในระบบ SmartBill v3 หากผู้ถือวงเงินสดย่อยทำการบันทึกบิลของตนเอง (`requesterUid === approverUid`):
- ระบบจะบันทึกสถานะเป็น `'paided'` พร้อมใส่ `approve_userid` และ `approve_datetime` ให้ทันที
- **ผลลัพธ์**: รายการนี้จะ**ไม่**ปรากฏใน `getPending` ของ SmartBill Approve v3 (เพราะไม่ใช่สถานะ `pending`)

### 2. Daily Maintenance Cron Job (การ Archive ข้อมูลอัตโนมัติ)
- SmartBill v3 มี Cron วิ่งทุกวันตอน 02:00 น. (เวลาไทย / 19:00 UTC)
- รายการบิลใน `tax_data` ที่ผ่านการอนุมัติ (`approve_datetime IS NOT NULL`) เกิน **14 วัน** จะถูกย้ายไปยังตาราง **`tax_data_archive`** อัตโนมัติ เพื่อรักษาขนาดตาราง `tax_data` ให้เบาและประหยัด D1 Query Quota
- ตาราง `tax_data` จะมีเฉพาะบิลที่รออนุมัติ (`pending`) และบิลที่เพิ่งอนุมัติภายใน 14 วันล่าสุดเท่านั้น

### 3. แจ้งเตือนยอดเงินผ่าน LINE Chat
- ใน `OLD_UI/app.js` มีฟังก์ชัน `sendPaidSummaryToChat(items)` ซึ่งใช้ `liff.sendMessages()` ส่งข้อความสรุปยอดเงินเข้าห้องแชต LINE ทันทีที่กด Paid สำเร็จ
- ใน SmartBill Approve v3 แนะนำให้รักษาฟังก์ชันนี้ไว้ และสามารถยกระดับเป็น LINE Flex Message เพื่อความสวยงามพรีเมียม

---

## 🚀 8. แนะนำการสร้าง Index เสริมความเร็วสูงสุด (Partial Index)

เพื่อรองรับการคิวรี `getPending` ได้เร็วระดับ < 10ms และเสียโควต้า Rows Read น้อยที่สุด ให้รันคำสั่ง Index นี้บน D1:

```sql
CREATE INDEX IF NOT EXISTS idx_tax_data_approve_pending 
ON tax_data (approve_request, created_at ASC) 
WHERE status = 'pending';
```

---

## 📁 9. แม่แบบการตั้งค่าไฟล์ Config สำหรับ SmartBill Approve v3

### `wrangler.toml`
```toml
name = "smartbill-approve-app"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
account_id = "f9bc011eeec351846c11f6aefacded76"

# Static Assets สำหรับ UI (Frontend)
assets = { directory = "./public", binding = "ASSETS" }

# Shared Cloudflare D1 Database
[[d1_databases]]
binding = "DB"
database_name = "IMG_DB"
database_id = "4db03e65-cc9d-458e-81f7-b8119669dd17"

[[d1_databases]]
binding = "IMG_DB"
database_name = "IMG_DB"
database_id = "4db03e65-cc9d-458e-81f7-b8119669dd17"

[vars]
ENVIRONMENT = "production"
IAM_API_URL = "https://smartbill-usersadmin-api.pingly69.workers.dev/api"
LIFF_ID = "YOUR_APPROVE_LIFF_ID"
```

### `.dev.vars` (สำหรับ Local Development)
```ini
ENVIRONMENT=development
IAM_API_URL=https://smartbill-usersadmin-api.pingly69.workers.dev/api
LIFF_ID=YOUR_APPROVE_LIFF_ID
ALLOW_DEV_MOCK=true
```
