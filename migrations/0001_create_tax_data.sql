-- Migration 0001: Create tax_data and tax_data_archive for SmartBill
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tax_data (
    record_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
    tax_id TEXT NOT NULL DEFAULT '',
    vend_name TEXT NOT NULL DEFAULT '',
    branch_no TEXT NOT NULL DEFAULT '00000',
    tax_docno TEXT DEFAULT '',
    doc_date TEXT NOT NULL,
    amt REAL NOT NULL DEFAULT 0.00,
    vat REAL NOT NULL DEFAULT 0.00,
    net REAL NOT NULL DEFAULT 0.00,
    project TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    pic_bill TEXT DEFAULT '',
    users_name TEXT NOT NULL DEFAULT 'LIFF User',
    request_name TEXT NOT NULL DEFAULT '',
    line_uid TEXT NOT NULL,
    approve_request TEXT NOT NULL DEFAULT '',
    approve_userid TEXT DEFAULT NULL,
    approve_datetime TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    req_type TEXT NOT NULL DEFAULT '2',
    pettycash_batch_id TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS tax_data_archive (
    record_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    tax_id TEXT,
    vend_name TEXT,
    branch_no TEXT,
    tax_docno TEXT,
    doc_date TEXT,
    amt REAL,
    vat REAL,
    net REAL,
    project TEXT,
    remark TEXT,
    pic_bill TEXT,
    users_name TEXT,
    request_name TEXT,
    line_uid TEXT,
    approve_request TEXT,
    approve_userid TEXT,
    approve_datetime TEXT,
    status TEXT,
    req_type TEXT,
    pettycash_batch_id TEXT,
    archived_at TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

CREATE INDEX IF NOT EXISTS idx_tax_data_line_uid_created ON tax_data (line_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_data_user_status ON tax_data (line_uid, status);
CREATE INDEX IF NOT EXISTS idx_tax_data_maintenance ON tax_data (status, approve_datetime);
