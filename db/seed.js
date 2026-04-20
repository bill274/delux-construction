// db/seed.js — populates the database with real De Lux Construction data.
// Skips if data already present (safe to require from start.js).
const db = require('./index');
const { hash } = require('../services/password');

const existingUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (existingUsers.n > 0) {
  console.log(`Database already seeded (${existingUsers.n} users) — skipping.`);
} else {

db.exec(`
  DELETE FROM message_log;
  DELETE FROM assignment_recipients;
  DELETE FROM assignments;
  DELETE FROM tasks;
  DELETE FROM projects;
  DELETE FROM users;
  DELETE FROM sub_companies;
`);

// --- Subcontractor companies ---
const subInsert = db.prepare('INSERT INTO sub_companies (name, trade) VALUES (?, ?)');
const subs = {
  bestone:  Number(subInsert.run('Best One', 'Electrical').lastInsertRowid),
  newphase: Number(subInsert.run('New Phase', 'Plumbing').lastInsertRowid),
  supreme:  Number(subInsert.run('Supreme', 'Framing').lastInsertRowid),
  topjm:    Number(subInsert.run('Top J & M', 'Concrete').lastInsertRowid),
};

// --- Users ---
const userInsert = db.prepare(`
  INSERT INTO users (email, phone, wechat_id, password_hash, name_en, name_zh,
                     role, preferred_lang, trade, sub_company_id, reports_to_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Dispatchers / Managers
const billId = Number(userInsert.run(
  'bill@delux-construction.com', '917-770-0399', null, hash('777Kingss@'),
  'Bill Zeng', '彪', 'dispatcher', 'en', null, null, null
).lastInsertRowid);

const samId = Number(userInsert.run(
  'sam@delux-construction.com', '347-612-9155', null, hash('delux2026'),
  'Sam Hoong', '翔', 'dispatcher', 'zh', null, null, null
).lastInsertRowid);

const rubenId = Number(userInsert.run(
  'ruben@delux-construction.com', '917-889-0251', null, hash('delux2027'),
  'Ruben Zhang', null, 'dispatcher', 'zh', null, null, null
).lastInsertRowid);

const joyceId = Number(userInsert.run(
  'joyce@delux-construction.com', '929-381-8069', null, hash('delux2028'),
  'Joyce Hoong', null, 'dispatcher', 'en', null, null, null
).lastInsertRowid);

// Crew leads
const alexId = Number(userInsert.run(
  'alex@delux-construction.com', '917-704-3183', null, hash('delux2029'),
  'Alex Cheng', '龙', 'crew_lead', 'en', null, null, billId
).lastInsertRowid);

const wendellId = Number(userInsert.run(
  'wendell@delux-construction.com', '917-583-0977', null, hash('delux2030'),
  'Wendell Zeng', '豪', 'crew_lead', 'en', null, null, billId
).lastInsertRowid);

// Workers
userInsert.run('kenny@delux-construction.com', '646-338-6485', null, hash('delux2031'),
  'Kenny', null, 'worker', 'zh', null, null, alexId);

userInsert.run('ping@delux-construction.com', '718-559-9205', null, hash('delux2032'),
  'Ping', '平', 'worker', 'zh', null, null, alexId);

userInsert.run('wang@delux-construction.com', '646-270-6636', null, hash('delux2033'),
  'Wang', '小王', 'worker', 'zh', null, null, wendellId);

userInsert.run('cong@delux-construction.com', '347-453-5312', null, hash('delux2034'),
  'Cong', null, 'worker', 'zh', null, null, wendellId);

// Subcontractor primary contacts
userInsert.run('fee@bestone.com', '917-828-6333', null, hash('delux20'),
  'Fee', null, 'sub_contact', 'en', 'Electrical', subs.bestone, null);
userInsert.run('joe@newphase.com', '646-812-1938', null, hash('delux21'),
  'Joe', null, 'sub_contact', 'en', 'Plumbing', subs.newphase, null);
userInsert.run('jeff@supreme.com', '551-327-1475', null, hash('delux22'),
  'Jeff', null, 'sub_contact', 'en', 'Framing', subs.supreme, null);
userInsert.run('mark@topjm.com', '917-660-8715', null, hash('delux23'),
  'Mark', null, 'sub_contact', 'zh', 'Concrete', subs.topjm, null);

// --- Projects (empty for now — dispatcher will add real ones via the UI) ---
// No default projects. The dispatcher can create projects after login.

console.log('Seed complete.');
console.log('Total users:      ', db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
console.log('Dispatchers:       Bill, Sam, Ruben, Joyce');
console.log('Crew leads:        Alex, Wendell');
console.log('Workers:           Kenny, Ping, Wang, Cong');
console.log('Subcontractors:    Best One, New Phase, Supreme, Top J & M');

}
