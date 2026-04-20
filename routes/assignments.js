// routes/assignments.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireDispatcher } = require('./auth');
const { dispatchAssignment } = require('../services/notify');

const router = express.Router();

router.post('/assignments', requireAuth, requireDispatcher, async (req, res) => {
  const {
    task_id, title_en, title_zh, notes_en, notes_zh,
    site_access, safety_notes, start_date, due_date,
    require_ack, recipients
  } = req.body;

  if (!task_id || !title_en || !start_date || !due_date || !Array.isArray(recipients)) {
    return res.status(400).json({ error: 'task_id, title_en, dates and recipients[] required' });
  }
  if (recipients.length === 0) {
    return res.status(400).json({ error: 'at least one recipient required' });
  }

  const result = db.prepare(`
    INSERT INTO assignments
      (task_id, title_en, title_zh, notes_en, notes_zh, site_access, safety_notes,
       start_date, due_date, require_ack, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task_id, title_en, title_zh || null, notes_en || null, notes_zh || null,
    site_access || null, safety_notes || null, start_date, due_date,
    require_ack ? 1 : 0, req.session.userId);

  const assignmentId = Number(result.lastInsertRowid);

  const recipInsert = db.prepare(`
    INSERT INTO assignment_recipients
      (assignment_id, user_id, sub_company_id, delivery_email, delivery_sms, delivery_wechat)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const r of recipients) {
    recipInsert.run(
      assignmentId,
      r.user_id || null,
      r.sub_company_id || null,
      r.email !== false ? 1 : 0,
      r.sms !== false ? 1 : 0,
      r.wechat ? 1 : 0
    );
  }

  const dispatchResults = await dispatchAssignment(assignmentId);
  res.json({ id: assignmentId, dispatched: dispatchResults });
});

router.get('/assignments/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, ar.id AS recipient_id, ar.response, ar.responded_at,
           p.name_en AS project_name_en, p.name_zh AS project_name_zh,
           u.name_en AS assigner_name
    FROM assignments a
    JOIN assignment_recipients ar ON ar.assignment_id = a.id
    JOIN tasks t ON t.id = a.task_id
    JOIN projects p ON p.id = t.project_id
    JOIN users u ON u.id = a.created_by
    WHERE ar.user_id = ?
       OR ar.sub_company_id = (SELECT sub_company_id FROM users WHERE id = ?)
    ORDER BY a.created_at DESC
  `).all(req.session.userId, req.session.userId);
  res.json(rows);
});

router.get('/assignments', requireAuth, requireDispatcher, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, p.name_en AS project_name_en,
      (SELECT COUNT(*) FROM assignment_recipients ar WHERE ar.assignment_id = a.id) AS recipient_count,
      (SELECT COUNT(*) FROM assignment_recipients ar WHERE ar.assignment_id = a.id AND ar.response='accepted') AS accepted_count,
      (SELECT COUNT(*) FROM assignment_recipients ar WHERE ar.assignment_id = a.id AND ar.response='declined') AS declined_count
    FROM assignments a
    JOIN tasks t ON t.id = a.task_id
    JOIN projects p ON p.id = t.project_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();
  res.json(rows);
});

router.post('/assignments/:id/respond', requireAuth, (req, res) => {
  const { id } = req.params;
  const { response } = req.body;
  if (!['accepted', 'declined'].includes(response)) {
    return res.status(400).json({ error: 'response must be accepted or declined' });
  }
  const result = db.prepare(`
    UPDATE assignment_recipients
    SET response = ?, responded_at = CURRENT_TIMESTAMP
    WHERE assignment_id = ? AND user_id = ?
  `).run(response, Number(id), req.session.userId);

  if (result.changes === 0) return res.status(404).json({ error: 'not a recipient of this assignment' });
  res.json({ ok: true });
});

module.exports = router;
