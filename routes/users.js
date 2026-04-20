const express = require('express');
const db = require('../db');
const { hash, verify } = require('../services/password');
const { requireAuth, requireDispatcher } = require('./auth');

const router = express.Router();

router.post('/users', requireAuth, requireDispatcher, (req, res) => {
  const {
    name_en, name_zh, email, phone, wechat_id,
    role, preferred_lang, trade, sub_company_id, reports_to_id,
    initial_password
  } = req.body;

  if (!name_en || !email || !role || !initial_password) {
    return res.status(400).json({ error: 'name_en, email, role, initial_password required' });
  }
  if (!['dispatcher', 'crew_lead', 'worker', 'sub_contact'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  if (!['en', 'zh'].includes(preferred_lang || 'en')) {
    return res.status(400).json({ error: 'preferred_lang must be en or zh' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'email already exists' });

  try {
    const result = db.prepare(`
      INSERT INTO users (
        email, phone, wechat_id, password_hash, name_en, name_zh,
        role, preferred_lang, trade, sub_company_id, reports_to_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      email, phone || null, wechat_id || null, hash(initial_password),
      name_en, name_zh || null, role, preferred_lang || 'en',
      trade || null, sub_company_id || null, reports_to_id || null
    );
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put('/users/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const {
    name_en, name_zh, email, phone, wechat_id,
    role, preferred_lang, trade
  } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'user not found' });

  try {
    db.prepare(`
      UPDATE users SET
        name_en = COALESCE(?, name_en),
        name_zh = COALESCE(?, name_zh),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        wechat_id = COALESCE(?, wechat_id),
        role = COALESCE(?, role),
        preferred_lang = COALESCE(?, preferred_lang),
        trade = COALESCE(?, trade)
      WHERE id = ?
    `).run(
      name_en ?? null, name_zh ?? null, email ?? null,
      phone ?? null, wechat_id ?? null, role ?? null,
      preferred_lang ?? null, trade ?? null, Number(id)
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete('/users/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const userId = Number(id);

  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'cannot delete yourself' });
  }

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (result.changes === 0) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

router.post('/users/:id/reset-password', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;
  if (!new_password || new_password.length < 4) {
    return res.status(400).json({ error: 'new_password required, at least 4 characters' });
  }

  const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hash(new_password), Number(id));
  if (result.changes === 0) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

router.post('/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ error: 'old_password and new_password required' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'new password must be at least 4 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !verify(old_password, user.password_hash)) {
    return res.status(401).json({ error: 'old password incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hash(new_password), req.session.userId);
  res.json({ ok: true });
});

router.post('/sub-companies', requireAuth, requireDispatcher, (req, res) => {
  const { name, trade } = req.body;
  if (!name || !trade) return res.status(400).json({ error: 'name and trade required' });

  const result = db.prepare('INSERT INTO sub_companies (name, trade) VALUES (?, ?)').run(name, trade);
  res.json({ id: Number(result.lastInsertRowid) });
});

router.delete('/sub-companies/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const subId = Number(id);

  const contacts = db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE sub_company_id = ?"
  ).get(subId);
  if (contacts.n > 0) {
    return res.status(400).json({
      error: `cannot delete: ${contacts.n} contact(s) belong to this sub. Delete them first.`
    });
  }
  const result = db.prepare('DELETE FROM sub_companies WHERE id = ?').run(subId);
  if (result.changes === 0) return res.status(404).json({ error: 'sub not found' });
  res.json({ ok: true });
});

module.exports = router;
