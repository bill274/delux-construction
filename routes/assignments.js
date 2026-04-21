// routes/assignments.js
const express = require('express');
const db = require('../db');
const { requireAuth, requireDispatcher } = require('./auth');
const { dispatchAssignment, dispatchCancellation } = require('../services/notify');

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

// Edit an assignment (only while still active — changes don't notify anyone by default)
router.put('/assignments/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const { title_en, title_zh, notes_en, notes_zh, site_access, safety_notes, start_date, due_date } = req.body;

  const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'assignment not found' });
  if (existing.status === 'cancelled') return res.status(400).json({ error: 'cannot edit cancelled assignment' });

  try {
    db.prepare(`
      UPDATE assignments SET
        title_en = COALESCE(?, title_en),
        title_zh = COALESCE(?, title_zh),
        notes_en = COALESCE(?, notes_en),
        notes_zh = COALESCE(?, notes_zh),
        site_access = COALESCE(?, site_access),
        safety_notes = COALESCE(?, safety_notes),
        start_date = COALESCE(?, start_date),
        due_date = COALESCE(?, due_date)
      WHERE id = ?
    `).run(
      title_en ?? null, title_zh ?? null, notes_en ?? null, notes_zh ?? null,
      site_access ?? null, safety_notes ?? null, start_date ?? null, due_date ?? null,
      Number(id)
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Hard delete an assignment (removes it completely — for mistakes)
router.delete('/assignments/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const aid = Number(id);
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM message_log WHERE assignment_id = ?').run(aid);
    db.prepare('DELETE FROM assignment_recipients WHERE assignment_id = ?').run(aid);
    const result = db.prepare('DELETE FROM assignments WHERE id = ?').run(aid);
    db.exec('COMMIT');
    if (result.changes === 0) return res.status(404).json({ error: 'assignment not found' });
    res.json({ ok: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Cancel an assignment (soft — marks cancelled and sends cancellation notice to recipients)
router.post('/assignments/:id/cancel', requireAuth, requireDispatcher, async (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'assignment not found' });
  if (existing.status === 'cancelled') return res.status(400).json({ error: 'already cancelled' });

  db.prepare("UPDATE assignments SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(Number(id));

  // Dispatch cancellation notifications
  try {
    const results = await dispatchCancellation(Number(id), req.session.userId);
    res.json({ ok: true, notified: results });
  } catch (e) {
    res.json({ ok: true, notified: [], notify_error: String(e.message || e) });
  }
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
