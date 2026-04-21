// routes/projects.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireDispatcher } = require('./auth');

const router = express.Router();

router.get('/projects', requireAuth, (req, res) => {
  const { status } = req.query;
  const userId = req.session.userId;
  const role = req.session.role;

  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'behind') AS tasks_behind
    FROM projects p
  `;
  const params = [];
  const conds = [];

  if (role !== 'dispatcher') {
    // Non-dispatchers only see projects they're assigned to
    sql += ` JOIN project_assignees pa ON pa.project_id = p.id `;
    conds.push(`pa.user_id = ?`);
    params.push(userId);
  }
  if (status && ['pending', 'active', 'completed'].includes(status)) {
    conds.push(`p.status = ?`);
    params.push(status);
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ` ORDER BY
    CASE p.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
    p.due_date ASC
  `;
  const projects = db.prepare(sql).all(...params);
  res.json(projects);
});

router.post('/projects', requireAuth, requireDispatcher, (req, res) => {
  const { name_en, name_zh, address, type, start_date, due_date, status } = req.body;
  if (!name_en || !start_date || !due_date) {
    return res.status(400).json({ error: 'name_en, start_date, due_date required' });
  }
  const validStatus = ['pending', 'active', 'completed'].includes(status) ? status : 'pending';
  try {
    const result = db.prepare(`
      INSERT INTO projects (name_en, name_zh, address, type, start_date, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name_en, name_zh || null, address || null, type || null, start_date, due_date, validStatus);
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put('/projects/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const { name_en, name_zh, address, type, start_date, due_date, status } = req.body;

  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'project not found' });

  try {
    db.prepare(`
      UPDATE projects SET
        name_en = COALESCE(?, name_en),
        name_zh = COALESCE(?, name_zh),
        address = COALESCE(?, address),
        type = COALESCE(?, type),
        start_date = COALESCE(?, start_date),
        due_date = COALESCE(?, due_date),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      name_en ?? null, name_zh ?? null, address ?? null, type ?? null,
      start_date ?? null, due_date ?? null, status ?? null, Number(id)
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete('/projects/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(Number(id));
  if (result.changes === 0) return res.status(404).json({ error: 'project not found' });
  res.json({ ok: true });
});

router.get('/tasks', requireAuth, (req, res) => {
  const { project_id } = req.query;
  if (project_id) {
    res.json(db.prepare(`
      SELECT t.*, p.name_en AS project_name_en, p.name_zh AS project_name_zh
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.project_id = ? ORDER BY t.start_date
    `).all(Number(project_id)));
  } else {
    res.json(db.prepare(`
      SELECT t.*, p.name_en AS project_name_en, p.name_zh AS project_name_zh
      FROM tasks t JOIN projects p ON p.id = t.project_id
      ORDER BY t.start_date
    `).all());
  }
});

router.post('/tasks', requireAuth, requireDispatcher, (req, res) => {
  const { project_id, title_en, title_zh, trade, start_date, due_date, status } = req.body;
  if (!project_id || !title_en || !start_date || !due_date) {
    return res.status(400).json({ error: 'project_id, title_en, start_date, due_date required' });
  }
  const result = db.prepare(`
    INSERT INTO tasks (project_id, title_en, title_zh, trade, start_date, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(project_id, title_en, title_zh || null, trade || null, start_date, due_date, status || 'scheduled');
  res.json({ id: Number(result.lastInsertRowid) });
});

router.put('/tasks/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const { title_en, title_zh, trade, start_date, due_date, status } = req.body;

  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'task not found' });

  try {
    db.prepare(`
      UPDATE tasks SET
        title_en = COALESCE(?, title_en),
        title_zh = COALESCE(?, title_zh),
        trade = COALESCE(?, trade),
        start_date = COALESCE(?, start_date),
        due_date = COALESCE(?, due_date),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      title_en ?? null, title_zh ?? null, trade ?? null,
      start_date ?? null, due_date ?? null, status ?? null, Number(id)
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete('/tasks/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(id));
  if (result.changes === 0) return res.status(404).json({ error: 'task not found' });
  res.json({ ok: true });
});

router.get('/people', requireAuth, (req, res) => {
  const role = req.session.role;
  const userId = req.session.userId;

  // External users get only themselves — no company directory access
  if (role === 'external') {
    const self = db.prepare(`
      SELECT id, name_en, name_zh, role, trade, profession, preferred_lang, phone, email
      FROM users WHERE id = ?
    `).get(userId);
    return res.json({ subs: [], workers: self ? [self] : [] });
  }

  const subs = db.prepare(`
    SELECT s.id, s.name, s.trade,
      (SELECT name_en FROM users WHERE sub_company_id = s.id AND role='sub_contact' LIMIT 1) AS contact_name,
      (SELECT email FROM users WHERE sub_company_id = s.id AND role='sub_contact' LIMIT 1) AS contact_email
    FROM sub_companies s
  `).all();

  const workers = db.prepare(`
    SELECT id, name_en, name_zh, role, trade, profession, preferred_lang, phone, email
    FROM users
    ORDER BY
      CASE role WHEN 'dispatcher' THEN 0 WHEN 'crew_lead' THEN 1 WHEN 'worker' THEN 2 WHEN 'external' THEN 3 ELSE 4 END,
      name_en
  `).all();

  res.json({ subs, workers });
});

module.exports = router;
