// db/init.js — creates the SQLite schema for De Lux Construction.
// Safe to require() from start.js: skips if DB already exists.
// Safe to run as `npm run init-db`: same behavior.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'delux.db');

if (fs.existsSync(dbPath)) {
  console.log('Database already exists at', dbPath, '— skipping init.');
} else {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE sub_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trade TEXT NOT NULL
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      wechat_id TEXT,
      password_hash TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_zh TEXT,
      role TEXT NOT NULL CHECK (role IN ('dispatcher', 'crew_lead', 'worker', 'sub_contact')),
      preferred_lang TEXT NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en', 'zh')),
      trade TEXT,
      sub_company_id INTEGER REFERENCES sub_companies(id),
      reports_to_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_en TEXT NOT NULL,
      name_zh TEXT,
      address TEXT,
      type TEXT,
      start_date TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title_en TEXT NOT NULL,
      title_zh TEXT,
      trade TEXT,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'done', 'behind')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title_en TEXT NOT NULL,
      title_zh TEXT,
      notes_en TEXT,
      notes_zh TEXT,
      site_access TEXT,
      safety_notes TEXT,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      require_ack INTEGER DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE assignment_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      sub_company_id INTEGER REFERENCES sub_companies(id),
      delivery_email INTEGER DEFAULT 1,
      delivery_sms INTEGER DEFAULT 1,
      delivery_wechat INTEGER DEFAULT 0,
      sent_at TEXT,
      delivery_status TEXT,
      response TEXT CHECK (response IN ('accepted', 'declined', NULL)),
      responded_at TEXT
    );

    CREATE TABLE message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id),
      recipient_id INTEGER NOT NULL REFERENCES assignment_recipients(id),
      channel TEXT NOT NULL,
      lang TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      sent_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_tasks_project ON tasks(project_id);
    CREATE INDEX idx_recipients_assignment ON assignment_recipients(assignment_id);
    CREATE INDEX idx_recipients_user ON assignment_recipients(user_id);
  `);

  console.log('Database schema initialized at', dbPath);
  db.close();
}
