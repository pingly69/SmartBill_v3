# SmartBill v3.0 — Cloudflare Modernized Bill Processing Web App

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1_SQLite-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Google Gemini AI](https://img.shields.io/badge/Google-Gemini_AI_OCR-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![LINE LIFF](https://img.shields.io/badge/LINE-LIFF_v2-00C300?logo=line&logoColor=white)](https://developers.line.biz/en/docs/liff/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

ระบบบันทึกและส่งเบิกบิลเงินสด (SmartBill v3) สถาปัตยกรรม Edge Computing ทำงานบน **Cloudflare Workers** ร่วมกับ **Cloudflare D1 (SQLite Database)**, **Google Gemini Vision AI** สำหรับทำ OCR สลิป/ใบเสร็จอัตโนมัติ และเชื่อมต่อกับระบบกลาง **Central Identity & Access Management (IAM)** ผ่าน **LINE LIFF**

---

## 🏗️ Architecture & Ecosystem Overview

SmartBill Ecosystem ประกอบด้วย 3 ระบบหลักที่ทำงานประสานกันบน Cloudflare Edge Network:

```
┌──────────────────────────────────────────────┐
│                SmartBill v3                  │
│       (LIFF บันทึกบิลขอเบิกเงินสด + OCR)         │
│  - พนักงานสแกน/แนบบิลขอเบิก                    │
│  - Gemini Vision AI สกัดข้อมูลบิลอัตโนมัติ     │
│  - ดึงรายชื่อผู้อนุมัติจาก Central IAM Gateway  │
│  - บันทึกลงตาราง tax_data (status: pending)    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────┐
        │    Cloudflare D1: IMG_DB    │
        │    (ตารางหลัก: tax_data)     │
        └──────────────▲──────────────┘
                       │
       ┌───────────────┴───────────────┐
       │                               │
┌──────┴──────────────────────┐ ┌──────┴──────────────────────┐
│    SmartBill Approve v3     │ │  SmartBill ApprovePC v3     │
│ (LIFF อนุมัติเบิกจ่ายเงินสดย่อย) │ │ (LIFF จัดการใบขอเบิกชดเชย)    │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## ✨ Features

- **🚀 Serverless Edge Performance**: ทำงานบน Cloudflare Workers ตอบสนองรวดเร็วระดับ Sub-second ทั่วโลก
- **🤖 Gemini Vision AI OCR**: ถอดรหัสข้อมูลใบเสร็จอัตโนมัติ (เลขที่ใบเสร็จ, วันที่, ยอดรวม, ภาษีมูลค่าเพิ่ม, เลขประจำตัวผู้เสียภาษี) ด้วยโมเดล `gemini-3.1-flash-lite`
- **🔒 Central IAM Integration**: ตรวจสอบสิทธิ์ผู้ใช้งานและดึงรายชื่อผู้อนุมัติ (Approvers) จากระบบ Central IAM (`smartbill-usersadmin`) แบบ Dynamic
- **📱 LINE LIFF Integration**: ใช้งานผ่าน LINE ได้อย่างราบรื่น ไม่ต้องล็อกอินซ้ำซ้อน
- **📂 Cloudflare D1 Native Storage**: บันทึกและจัดเก็บข้อมูลบิลในตาราง `tax_data` บน Edge SQLite
- **⏰ Scheduled Cron Maintenance**: รันระบบตรวจสอบและดูแลข้อมูลอัตโนมัติทุกวันเวลา 02:00 น. (เวลาไทย / 19:00 UTC)
- **📊 Real-time Bill Tracking**: มีหน้าระบบตรวจสอบสถานะบิล (`/checkstatus.html`) สำหรับพนักงาน

---

## 📁 Project Structure

```text
SmartBill_v3/
├── .dev.vars                  # Local environment secret variables (git-ignored)
├── .env.example               # Example environment variable template
├── .gitignore                 # Git ignore rules
├── migrations/
│   └── 0001_create_tax_data.sql # D1 database schema migration
├── public/                    # Frontend Static Assets (Served via Workers ASSETS)
│   ├── checkstatus.html       # Web App: ติดตามสถานะบิลที่ส่งเบิก
│   ├── index.html             # Web App: ฟอร์มบันทึกบิลขอเบิกเงินสด (LIFF)
│   └── css/
│       └── style.css          # Design system & styles
├── skills/                    # Architecture & Integration specifications
│   ├── CLOUDFLARE_MIGRATION_SPEC.md
│   ├── SMARTBILL_IAM_INTEGRATION_SPEC.md
│   └── SMARTBILL_V3_HANDOFF_SPEC.md
├── src/                       # Backend Cloudflare Worker (TypeScript)
│   ├── config.ts              # Worker environment types & config
│   ├── index.ts               # Core HTTP router & cron handler
│   ├── services/
│   │   ├── bill.service.ts    # Service สำหรับบันทึกบิลลง D1 (tax_data)
│   │   ├── iam.service.ts     # Service เชื่อมต่อ SmartBill Central IAM
│   │   ├── maintenance.service.ts # Service จัดการงานระบบ Maintenance
│   │   ├── ocr.service.ts     # Service วิเคราะห์ภาพใบเสร็จด้วย Gemini AI
│   │   ├── sites.service.ts   # Service ดึงรายชื่อไซต์งาน/โครงการ
│   │   └── status.service.ts  # Service ดึงประวัติและสถานะบิลตาม LINE UID
│   ├── types/
│   │   └── api.ts             # API request/response TypeScript interfaces
│   └── utils/
│       └── response.ts        # Standardized JSON response & CORS helpers
├── package.json
├── tsconfig.json
└── wrangler.toml              # Cloudflare Workers configuration & D1 bindings
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/config` | ข้อมูลการตั้งค่าระบบ (LIFF ID, สภาพแวดล้อม, โมเดล AI) |
| `GET` | `/api/initial-data?lineUid={uid}` | ดึงข้อมูลโปรไฟล์ผู้ใช้และรายชื่อผู้อนุมัติจาก Central IAM |
| `GET` | `/api/sites` | รายชื่อไซต์งาน / โครงการที่เปิดใช้งาน |
| `POST` | `/api/ocr` | ส่งภาพใบเสร็จ (Base64) ให้ Gemini AI วิเคราะห์ข้อมูล |
| `POST` | `/api/bills` | บันทึกข้อมูลบิลขอเบิกลงตาราง `tax_data` (สถานะ `pending`) |
| `GET` | `/api/my-bills?lineUid={uid}` | ดึงรายการบิลและสถานะล่าสุดของผู้ใช้งาน |
| `POST` | `/api/maintenance/run` | ทริกเกอร์ระบบ Maintenance ทำงานทันทีแบบ Manual |

---

## 🚀 Getting Started

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. กำหนดค่าคอนฟิกสำหรับ Local Development
สร้างไฟล์ `.dev.vars` (หรือคัดลอกจาก `.env.example`):
```ini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
IAM_API_URL=https://smartbill-usersadmin-api.pingly69.workers.dev/api
LIFF_ID=2009016720-6dg4Pumx
ENVIRONMENT=development
ALLOW_DEV_MOCK=true
```

### 3. รันเซิร์ฟเวอร์ Local Development
```bash
# รันแบบเชื่อมต่อ Remote D1 Database
npm run dev

# หรือรันแบบ Local D1 SQLite
npm run dev:local
```
เปิดบราวเซอร์ที่: `http://localhost:8788`

### 4. ตรวจสอบ Typecheck
```bash
npm run typecheck
```

### 5. Deploy สู่ Cloudflare Workers
```bash
npm run deploy
```

---

## 🗄️ Database Schema (`tax_data`)

ระบบใช้ Cloudflare D1 Database เดียวกันกับ SmartBill Approve v3 และ SmartBill ApprovePC v3:

- **Database Name**: `IMG_DB`
- **Database ID**: `4db03e65-cc9d-458e-81f7-b8119669dd17`
- **ตารางหลัก**: `tax_data` (เก็บข้อมูลรายละเอียดบิล, เลขที่เอกสาร, ผู้ขอเบิก, ผู้อนุมัติ, ยอดรวม และสถานะการเบิกจ่าย)

---

## 📄 License

Internal Proprietary — All rights reserved.
