// routes/auth.js
const express = require('express');
const db = require('../db');
const { verify } = require('../services/password');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verify(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({
    id: user.id,
    name_en: user.name_en,
    name_zh: user.name_zh,
    role: user.role,
    preferred_lang: user.preferred_lang
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'not logged in' });
  const user = db.prepare(
    'SELECT id, email, name_en, name_zh, role, preferred_lang, trade FROM users WHERE id = ?'
  ).get(req.session.userId);
  res.json(user);
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not logged in' });
  next();
}
function requireDispatcher(req, res, next) {
  if (req.session.role !== 'dispatcher') return res.status(403).json({ error: 'dispatcher only' });
  next();
}

module.exports = { router, requireAuth, requireDispatcher };
