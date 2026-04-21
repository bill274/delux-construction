// routes/events.js — Calendar events for meetings, inspections, quotes, etc.
const express = require('express');
const db = require('../db');
const { requireAuth, requireDispatcher } = require('./auth');

const router = express.Router();

const VALID_TYPES = ['client_meeting', 'designer_meeting', 'team_meeting', 'quote_request', 'inspection', 'other'];

// List events. Dispatchers see everything. Others see:
//   - events with no participants (public events)
//   - events where they are a participant
router.get('/events', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const role = req.session.role;
  const { from, to } = req.query;

  let sql, params;
  if (role === 'dispatcher') {
    sql = `
      SELECT e.*, p.name_en AS project_name_en, p.name_zh AS project_name_zh,
             u.name_en AS creator_name,
             (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) AS participant_count
      FROM events e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN users u ON u.id = e.created_by
    `;
    params = [];
    const conds = [];
    if (from) { conds.push('e.start_at >= ?'); params.push(from); }
    if (to) { conds.push('e.start_at <= ?'); params.push(to); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY e.start_at ASC';
  } else {
    sql = `
      SELECT DISTINCT e.*, p.name_en AS project_name_en, p.name_zh AS project_name_zh,
             u.name_en AS creator_name,
             (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) AS participant_count
      FROM events e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN users u ON u.id = e.created_by
      LEFT JOIN event_participants ep ON ep.event_id = e.id
      WHERE (ep.user_id = ? OR NOT EXISTS (SELECT 1 FROM event_participants ep2 WHERE ep2.event_id = e.id))
    `;
    params = [userId];
    if (from) { sql += ' AND e.start_at >= ?'; params.push(from); }
    if (to) { sql += ' AND e.start_at <= ?'; params.push(to); }
    sql += ' ORDER BY e.start_at ASC';
  }

  const events = db.prepare(sql).all(...params);

  // Attach participants
  const partStmt = db.prepare(`
    SELECT ep.user_id, u.name_en, u.name_zh
    FROM event_participants ep
    JOIN users u ON u.id = ep.user_id
    WHERE ep.event_id = ?
  `);
  for (const ev of events) {
    ev.participants = partStmt.all(ev.id);
  }
  res.json(events);
});

router.post('/events', requireAuth, requireDispatcher, (req, res) => {
  const {
    type, title_en, title_zh, start_at, end_at, all_day,
    location, notes_en, notes_zh, project_id, participant_ids
  } = req.body;

  if (!type || !title_en || !start_at) {
    return res.status(400).json({ error: 'type, title_en, start_at required' });
  }
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  try {
    db.exec('BEGIN');
    const result = db.prepare(`
      INSERT INTO events (type, title_en, title_zh, start_at, end_at, all_day,
                          location, notes_en, notes_zh, project_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      type, title_en, title_zh || null, start_at, end_at || null,
      all_day ? 1 : 0, location || null, notes_en || null, notes_zh || null,
      project_id || null, req.session.userId
    );
    const eventId = Number(result.lastInsertRowid);

    if (Array.isArray(participant_ids) && participant_ids.length > 0) {
      const partInsert = db.prepare(
        'INSERT OR IGNORE INTO event_participants (event_id, user_id) VALUES (?, ?)'
      );
      for (const uid of participant_ids) {
        partInsert.run(eventId, Number(uid));
      }
    }
    db.exec('COMMIT');
    res.json({ id: eventId });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.put('/events/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  const {
    type, title_en, title_zh, start_at, end_at, all_day,
    location, notes_en, notes_zh, project_id, participant_ids
  } = req.body;

  const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'event not found' });
  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  try {
    db.exec('BEGIN');
    db.prepare(`
      UPDATE events SET
        type = COALESCE(?, type),
        title_en = COALESCE(?, title_en),
        title_zh = COALESCE(?, title_zh),
        start_at = COALESCE(?, start_at),
        end_at = COALESCE(?, end_at),
        all_day = COALESCE(?, all_day),
        location = COALESCE(?, location),
        notes_en = COALESCE(?, notes_en),
        notes_zh = COALESCE(?, notes_zh),
        project_id = COALESCE(?, project_id)
      WHERE id = ?
    `).run(
      type ?? null, title_en ?? null, title_zh ?? null,
      start_at ?? null, end_at ?? null,
      (all_day === undefined ? null : (all_day ? 1 : 0)),
      location ?? null, notes_en ?? null, notes_zh ?? null,
      project_id ?? null, Number(id)
    );

    if (Array.isArray(participant_ids)) {
      db.prepare('DELETE FROM event_participants WHERE event_id = ?').run(Number(id));
      const partInsert = db.prepare(
        'INSERT OR IGNORE INTO event_participants (event_id, user_id) VALUES (?, ?)'
      );
      for (const uid of participant_ids) {
        partInsert.run(Number(id), Number(uid));
      }
    }
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.delete('/events/:id', requireAuth, requireDispatcher, (req, res) => {
  const { id } = req.params;
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM event_participants WHERE event_id = ?').run(Number(id));
    const result = db.prepare('DELETE FROM events WHERE id = ?').run(Number(id));
    db.exec('COMMIT');
    if (result.changes === 0) return res.status(404).json({ error: 'event not found' });
    res.json({ ok: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    res.status(500).json({ error: String(e.message || e) });
  }
});

module.exports = router;
