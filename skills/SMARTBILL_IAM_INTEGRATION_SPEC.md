# คู่มือมาตรฐานการเชื่อมต่อระบบกลาง (SmartBill IAM & Approver Integration Spec)
## สำหรับโปรเจกต์: `smartbill`, `smartbill_approve`, `smartbill_approvePC`

> **เอกสารนี้จัดทำขึ้นสำหรับ:** ทีมพัฒนาเว็บแอปในกลุ่ม SmartBill Ecosystem ทั้ง 3 ระบบ  
> สามารถนำไฟล์นี้ไปวางเป็น Blueprint ในแต่ละโปรเจกต์ เพื่อเป็นมาตรฐานกลางในการดึงข้อมูลผู้ใช้ วงเงิน และรายชื่อผู้อนุมัติจากฐานข้อมูลกลางชุดเดียวกัน (Single Source of Truth)

---

## 📌 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

ระบบ **SmartBill Users Admin** ทำหน้าที่เป็น **Central Identity & Access Management (IAM)** บน Cloudflare Edge เชื่อมต่อกับฐานข้อมูล Cloudflare D1 (`IMG_DB`) กลางขององค์กร:

```
                      ┌──────────────────────────────────────────────┐
                      │          Cloudflare D1: IMG_DB               │
                      │         ตารางกลาง: users_profile             │
                      │  (PK: line_uid, ชื่อหลัก: requester_name)   │
                      └──────────────────────┬───────────────────────┘
                                             │
                      ┌──────────────────────▼───────────────────────┐
                      │    SmartBill Users Admin (Gateway API)       │
                      │ • Local: http://127.0.0.1:8787/api           │
                      │ • Cloud: https://smartbill-usersadmin-api.pingly69.workers.dev/api│
                      └───────────────┬──────────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │ (HTTP API / D1 Binding)    │ (HTTP API / D1 Binding)    │ (HTTP API / D1 Binding)
         ▼                            ▼                            ▼
┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐
│       1. smartbill       │ │   2. smartbill_approve   │ │  3. smartbill_approvePC  │
│ (บันทึกบิลขอเบิกเงินสด)  │ │   (อนุมัติบิลเงินสดย่อย) │ │  (อนุมัติจ่ายชดเชยวงเงิน)│
│ • ดึงคน "คุมวงเงินสด"    │ │ • ตรวจสิทธิ์ "คุมวงเงินสด│ │ • ดึงคน "อนุมัติวงเงินสด"│
│ • ตรวจสอบวงเงินคงเหลือ   │ │ • ยืนยันตัวตนผ่าน LINE UID│ │ • ยืนยันสิทธิ์ผู้อนุมัติ │
└──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘
```

---

## 🔑 2. ข้อกำหนดฟิลด์ชื่อพนักงาน (Field Naming Standard)

เพื่อให้สอดคล้องกับฐานข้อมูลกลาง `IMG_DB` ที่ใช้งานร่วมกับระบบรถและระบบอื่น:

* **ชื่อคอลัมน์มาตรฐาน (Physical Column):** **`requester_name`**
* **ระบบรองรับชื่อเดิมอัตโนมัติ (Backward Compatibility Aliases):**  
  API จะส่ง Object ผู้ใช้งานที่มี Key ทั้ง 4 ตัวนี้เสมอ:
  ```json
  {
    "requester_name": "ศิริลักษณ์ ตรียัง(ฟ้า)",
    "request_name":   "ศิริลักษณ์ ตรียัง(ฟ้า)",
    "Request_Name":   "ศิริลักษณ์ ตรียัง(ฟ้า)",
    "users_name":     "ศิริลักษณ์ ตรียัง(ฟ้า)"
  }
  ```
  *(คุณสามารถเขียนโค้ดเรียกใช้ฟิลด์ไหนก็ได้ จะไม่มีปัญหา `undefined` หรือพังแน่นอน)*

---

## 🛠️ 3. สองรูปแบบในการเชื่อมต่อ (Integration Choices)

คุณสามารถเลือกเชื่อมต่อได้ 2 รูปแบบตามโครงสร้างของโปรเจกต์ใหม่:

### รูปแบบที่ 1: ผ่าน HTTP API Gateway (แนะนำสำหรับ LIFF Web App, Frontend SPA)
* **ข้อดี:** ไม่ต้องผูก D1 Binding ในโปรเจกต์ใหม่, มีระบบ Cache และ CORS ในตัว, ใช้งานง่ายผ่าน `fetch()`
* **Endpoint URL:**
  * **Local Development:** `http://127.0.0.1:8787/api`
  * **Cloudflare Production:** `https://smartbill-usersadmin-api.pingly69.workers.dev/api`

### รูปแบบที่ 2: ผูกตรงกับ Cloudflare D1 (แนะนำหากทำเป็น Cloudflare Worker/Pages Function)
* **ข้อดี:** ความเร็วสูงสุดระดับ Low-latency บน Cloudflare Edge เดียวกัน
* **การตั้งค่าใน `wrangler.toml` ของโปรเจกต์ใหม่:**
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "IMG_DB"
  database_id = "4db03e65-cc9d-458e-81f7-b8119669dd17"
  ```

---

## 🚀 4. ตัวอย่างโค้ดสำหรับแต่ละ Web App

---

### กรณีที่ 1: สำหรับแอป `smartbill` (บันทึกบิลขอเบิกเงินสด)
* **โจทย์:** ต้องการ Dropdown แสดงรายชื่อ **"ผู้ถือ/คุมวงเงินสดย่อย"** เพื่อให้ผู้ขอเบิกเลือกว่าจะขอเบิกจากวงเงินของใคร

#### ตัวเลือก A: เรียกผ่าน HTTP API (JavaScript Frontend)
```javascript
// config.js
const API_URL = "http://127.0.0.1:8787/api"; // สลับเป็น Cloud URL เมื่อขึ้นจริง

/**
 * ดึงรายชื่อผู้ถือวงเงินสดย่อยทั้งหมดที่เปิดใช้งานอยู่
 */
async function loadPettyCashHolders() {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "getApprovers",
                tag: "คุมวงเงินสด"
            })
        });

        const res = await response.json();
        if (!res.success) throw new Error(res.message);

        const holders = res.data;
        const select = document.getElementById("holder-select");
        select.innerHTML = '<option value="">-- เลือกผู้ถือวงเงินสดย่อย --</option>';

        holders.forEach(h => {
            const opt = document.createElement("option");
            opt.value = h.line_uid;
            // ใช้ requester_name หรือ users_name ได้เลย
            const name = h.requester_name || h.users_name;
            opt.innerText = `${name} (วงเงิน ฿${Number(h.pc_limit).toLocaleString()})`;
            opt.dataset.limit = h.pc_limit;
            opt.dataset.empNo = h.emp_no;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("โหลดรายชื่อผู้ถือวงเงินล้มเหลว:", err);
    }
}
```

#### ตัวเลือก B: เขียน SQL ตรงผ่าน D1 Binding (Cloudflare Worker)
```typescript
// ใน Worker ของ smartbill
const holders = await env.DB.prepare(`
    SELECT line_uid, requester_name, emp_no, pc_limit, display_name
    FROM users_profile
    WHERE active = 'Y' 
      AND approve_tags LIKE '%คุมวงเงินสด%'
    ORDER BY requester_name ASC
`).all();
```

---

### กรณีที่ 2: สำหรับแอป `smartbill_approve` (ผู้อนุมัติบิลของผู้คุมเงินสด)
* **โจทย์:** เมื่อเปิดผ่าน LINE LIFF ได้ `userId` ต้องการตรวจสอบว่าคนนี้คือ **"ผู้คุมวงเงินสด"** จริงหรือไม่ และมีวงเงินเท่าไหร่

#### ตัวอย่างฟังก์ชัน JavaScript:
```javascript
/**
 * ตรวจสอบสิทธิ์ผู้คุมวงเงินสดจาก LINE User ID
 */
async function checkCustodianPermission(currentLineUid) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "getApprovers",
                tag: "คุมวงเงินสด"
            })
        });

        const res = await response.json();
        if (!res.success) return false;

        // ค้นหาว่าคนล็อกอินอยู่ในกลุ่มผู้คุมเงินสดหรือไม่
        const matched = res.data.find(u => u.line_uid === currentLineUid);

        if (matched) {
            const custodianName = matched.requester_name || matched.users_name;
            console.log("อนุมัติให้เข้าใช้งาน:", custodianName);
            console.log("วงเงินที่รับผิดชอบ:", matched.pc_limit);
            
            document.getElementById("custodian-name").innerText = custodianName;
            document.getElementById("custodian-limit").innerText = `฿${Number(matched.pc_limit).toLocaleString()}`;
            return true;
        } else {
            alert("ท่านไม่มีสิทธิ์เข้าใช้งานหน้าจออนุมัติบิลเงินสดย่อย");
            return false;
        }
    } catch (err) {
        console.error("ตรวจสอบสิทธิ์ล้มเหลว:", err);
        return false;
    }
}
```

---

### กรณีที่ 3: สำหรับแอป `smartbill_approvePC` (ผู้อนุมัติจ่ายชดเชยวงเงินสดย่อย)
* **โจทย์:** ต้องการ Dropdown แสดงรายชื่อ **"ผู้อนุมัติจ่ายชดเชยวงเงิน"** (เช่น ผู้จัดการ หรือผู้มีอำนาจสั่งจ่ายเช็ค/โอนเงินชดเชย)

#### ตัวอย่างฟังก์ชัน JavaScript:
```javascript
/**
 * ดึงรายชื่อผู้อนุมัติการจ่ายชดเชยวงเงินสดย่อย
 */
async function loadReplenishmentApprovers() {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "getApprovers",
                tag: "อนุมัติวงเงินสด"
            })
        });

        const res = await response.json();
        if (!res.success) throw new Error(res.message);

        const approvers = res.data;
        const select = document.getElementById("approver-select");
        select.innerHTML = '<option value="">-- เลือกผู้อนุมัติการจ่ายชดเชย --</option>';

        approvers.forEach(app => {
            const opt = document.createElement("option");
            opt.value = app.line_uid;
            const appName = app.requester_name || app.users_name;
            opt.innerText = `${appName} (${app.display_name || 'LINE'})`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("โหลดรายชื่อผู้อนุมัติชดเชยล้มเหลว:", err);
    }
}
```

---

## 📡 5. สรุป API Action Reference ทั้งหมด

| Action Name | Method | Parameters | คำอธิบาย |
|---|:---:|---|---|
| `getApprovers` | POST / GET | `{ tag: "คุมวงเงินสด" }` | ดึงรายชื่อผู้ถือเงินสดย่อยทั้งหมด (Active) |
| `getApprovers` | POST / GET | `{ tag: "อนุมัติวงเงินสด" }` | ดึงรายชื่อผู้อนุมัติเงินชดเชยทั้งหมด (Active) |
| `listUsers` | POST / GET | - | ดึงรายชื่อพนักงานทั้งหมดในระบบพร้อมวงเงินและสิทธิ์ |
| `verifyPin` | POST | `{ pin: "123456" }` | ตรวจสอบรหัส PIN 6 หลัก (Admin หรือ User ลงทะเบียน) |
| `registerUser` | POST | `{ pin, lineUid, displayName }` | ผู้ใช้ลงทะเบียนผูก LINE Account ครั้งแรก |

* **CORS Support:** รองรับการเรียกข้ามโดเมน (`Access-Control-Allow-Origin: *`) อัตโนมัติ สามารถเรียกจาก Localhost, GitHub Pages, หรือ Cloudflare Pages ได้ทันที
* **Content-Type:** รองรับทั้ง `application/json` และ `text/plain`

---

## 💡 6. โครงสร้างตารางฐานข้อมูลจริงบน Cloud (`users_profile`)

```sql
CREATE TABLE users_profile (
    line_uid        TEXT PRIMARY KEY,                  -- รหัส LINE UID (หรือ 'PENDING:USR-XXXX')
    requester_name  TEXT NOT NULL,                     -- ชื่อพนักงาน (Standard Field)
    car_no          TEXT NOT NULL DEFAULT '',          -- ทะเบียนรถ (ของระบบ Fleet เดิม)
    group_car       INTEGER NOT NULL DEFAULT 1,        -- กลุ่มรถ (ของระบบ Fleet เดิม)
    emp_no          TEXT NOT NULL DEFAULT '',          -- รหัสพนักงาน
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    -- ฟิลด์เสริมของระบบ SmartBill
    users_id        TEXT NOT NULL DEFAULT '',          -- รหัสผู้ใช้ระบบ SmartBill (เช่น USR-MIG-0001)
    password        TEXT NOT NULL DEFAULT '',          -- รหัส PIN 6 หลักสำหรับลงทะเบียน
    display_name    TEXT NOT NULL DEFAULT '',          -- ชื่อโปรไฟล์ LINE
    email           TEXT NOT NULL DEFAULT '',          -- อีเมลพนักงาน
    pc_limit        REAL NOT NULL DEFAULT 0.00,        -- วงเงินสดย่อยที่ได้รับมอบหมาย
    avatar_url      TEXT NOT NULL DEFAULT '',          -- ลิงก์รูปโปรไฟล์
    active          TEXT NOT NULL DEFAULT 'Y',         -- สถานะเปิดใช้งาน (Y/N)
    screen_tags     TEXT NOT NULL DEFAULT '["PC01"]',  -- สิทธิ์หน้าจอ
    approve_tags    TEXT NOT NULL DEFAULT '[]'         -- สิทธิ์การอนุมัติ (["คุมวงเงินสด"], ["อนุมัติวงเงินสด"])
);
```

---

**จัดทำโดย:** Full Stack Development Team (Central Architecture Spec)  
**เวอร์ชันเอกสาร:** 2.0.0 (Unified Requester Name & Production Ready)
