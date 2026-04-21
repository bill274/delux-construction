// routes/documents.js — Project documents (Dropbox links) with role-based access.
const express = require('express');
const db = require('../db');
const { requireAuth, requireDispatcher } = require('./auth');

const router = express.Router();

const VALID_CATEGORIES = [
  'design_set', 'construction_set', 'designer_sketch',
  'dob_approved', 'permits', 'inspection', 'tpp', 'other'
];

function canUserSeeProject(userId, role, projectId) {
  if (role === 'dispatcher') return true;
  const assigned = db.prepare(
    'SELECT 1 FROM project_assignees WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
  return !!assigned;
}

function filterDocsForUser(projectId, userId, role, userTrade, userSubCompanyId) {
  let sql = `
    SELECT d.*, u.name_en AS added_by_name
    FROM project_documents d
    JOIN users u ON u.id = d.added_by
    WHERE d.project_id = ?
  `;
  const params = [projectId];

  if (role === 'sub_contact') {
    // Subcontractors only see docs matching their trade, or category='other'
    sql += ` AND (LOWER(d.trade) = LOWER(?) OR d.category = 'other')`;
    params.push(userTrade || '');
  }
  sql += ' ORDER BY d.added_at DESC';
  return db.prepare(sql).all(...params);
}

// List documents across all projects the user can see
router.get('/documents', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const role = req.session.role;
  const user = db.prepare('SELECT trade, sub_company_id FROM users WHERE id = ?').get(userId);

  let projects;
  if (role === 'dispatcher') {
    projects = db.prepare('SELECT id FROM projects').all();
  } else {
    projects = db.prepare(`
      SELECT p.id FROM projects p
      JOIN project_assignees pa ON pa.project_id = p.id
      WHERE pa.user_id = ?
    `).all(userId);
  }

  const all = [];
  for (const p of projects) {
    const docs = filterDocsForUser(p.id, userId, role, user.trade, user.sub_company_id);
    all.push(...docs);
  }
  res.json(all);
});

// Get docs for one project
router.get('/projects/:id/documents', requireAuth, (req, res) => {
  const projectId = Number(req.params.id);
  const userId = req.session.userId;
  const role = req.session.role;

  if (!canUserSeeProject(userId, role, projectId)) {
    return res.status(403).json({ error: 'not assigned to this project' });
  }

  const user = db.prepare('SELECT trade, sub_company_id FROM users WHERE id = ?').get(userId);
  const docs = filterDocsForUser(projectId, userId, role, user.trade, user.sub_company_id);
  res.json(docs);
});

// Add a document (Dropbox link) to a project
router.post('/projects/:id/documents', requireAuth, requireDispatcher, (req, res) => {
  const projectId = Number(req.params.id);
  const { category, trade, title_en, title_zh, dropbox_url, notes } = req.body;

  if (!category || !title_en || !dropbox_url) {
    return res.status(400).json({ error: 'category, title_en, dropbox_url required' });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }
  // Basic URL validation
  if (!/^https?:\/\//i.test(dropbox_url)) {
    return res.status(400).json({ error: 'dropbox_url must start with http:// or https://' });
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });

  try {
    const result = db.prepare(`
      INSERT INTO project_documents
        (project_id, category, trade, title_en, title_zh, dropbox_url, notes, added_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId, category, trade || null, title_en,
      title_zh || null, dropbox_url, notes || null, req.session.userId
    );
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put('/documents/:id', requireAuth, requireDispatcher, (req, res) => {
  const id = Number(req.params.id);
  const { category, trade, title_en, title_zh, dropbox_url, notes } = req.body;
  const existing = db.prepare('SELECT id FROM project_documents WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'document not found' });

  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'invalid category' });
  }
  if (dropbox_url && !/^https?:\/\//i.test(dropbox_url)) {
    return res.status(400).json({ error: 'dropbox_url must start with http:// or https://' });
  }

  try {
    db.prepare(`
      UPDATE project_documents SET
        category = COALESCE(?, category),
        trade = COALESCE(?, trade),
        title_en = COALESCE(?, title_en),
        title_zh = COALESCE(?, title_zh),
        dropbox_url = COALESCE(?, dropbox_url),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      category ?? null, trade ?? null, title_en ?? null,
      title_zh ?? null, dropbox_url ?? null, notes ?? null, id
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete('/documents/:id', requireAuth, requireDispatcher, (req, res) => {
  const result = db.prepare('DELETE FROM project_documents WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// --- Project assignees (who is assigned to a project) ---

router.get('/projects/:id/assignees', requireAuth, (req, res) => {
  const projectId = Number(req.params.id);
  const role = req.session.role;

  if (!canUserSeeProject(req.session.userId, role, projectId)) {
    return res.status(403).json({ error: 'not assigned to this project' });
  }

  const rows = db.prepare(`
    SELECT u.id, u.name_en, u.name_zh, u.role, u.trade, u.email
    FROM project_assignees pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.project_id = ?
    ORDER BY u.role, u.name_en
  `).all(projectId);
  res.json(rows);
});

router.put('/projects/:id/assignees', requireAuth, requireDispatcher, (req, res) => {
  const projectId = Number(req.params.id);
  const { user_ids } = req.body;
  if (!Array.isArray(user_ids)) return res.status(400).json({ error: 'user_ids[] required' });

  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM project_assignees WHERE project_id = ?').run(projectId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO project_assignees (project_id, user_id) VALUES (?, ?)'
    );
    for (const uid of user_ids) ins.run(projectId, Number(uid));
    db.exec('COMMIT');
    res.json({ ok: true, count: user_ids.length });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
