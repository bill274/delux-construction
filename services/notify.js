// services/notify.js — dispatches assignment notifications via email, SMS, WeChat
//
// Dev mode: senders log to console so you can see exactly what each
// recipient would receive in their preferred language.
// Production: replace the stub bodies with Nodemailer / Twilio / WeChat Work.

const db = require('../db');
const tpl = require('./templates');

async function sendEmail({ to, subject, body }) {
  console.log(`\n[EMAIL → ${to}]`);
  console.log(`Subject: ${subject}`);
  console.log(body);
  console.log('---');
  return { ok: true, channel: 'email' };
}

async function sendSms({ to, body }) {
  console.log(`\n[SMS → ${to}]`);
  console.log(body);
  console.log('---');
  return { ok: true, channel: 'sms' };
}

async function sendWechat({ to, body }) {
  console.log(`\n[WECHAT → ${to}]`);
  console.log(body);
  console.log('---');
  return { ok: true, channel: 'wechat' };
}

function resolveTargets(recipientRow) {
  if (recipientRow.user_id) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(recipientRow.user_id);
    return user ? [user] : [];
  }
  if (recipientRow.sub_company_id) {
    return db.prepare(
      "SELECT * FROM users WHERE sub_company_id = ? AND role = 'sub_contact'"
    ).all(recipientRow.sub_company_id);
  }
  return [];
}

async function dispatchAssignment(assignmentId) {
  const assignment = db.prepare(`
    SELECT a.*, t.project_id,
           p.name_en AS project_name_en, p.name_zh AS project_name_zh,
           u.name_en AS assigner_name
    FROM assignments a
    JOIN tasks t ON t.id = a.task_id
    JOIN projects p ON p.id = t.project_id
    JOIN users u ON u.id = a.created_by
    WHERE a.id = ?
  `).get(assignmentId);

  if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

  const recipients = db.prepare(
    'SELECT * FROM assignment_recipients WHERE assignment_id = ?'
  ).all(assignmentId);

  const logInsert = db.prepare(`
    INSERT INTO message_log (assignment_id, recipient_id, channel, lang, status, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const markSent = db.prepare(
    'UPDATE assignment_recipients SET sent_at = CURRENT_TIMESTAMP, delivery_status = ? WHERE id = ?'
  );

  const results = [];

  for (const r of recipients) {
    const targets = resolveTargets(r);
    for (const user of targets) {
      const lang = user.preferred_lang || 'en';
      const channels = [];
      if (r.delivery_email && user.email) channels.push('email');
      if (r.delivery_sms && user.phone) channels.push('sms');
      if (r.delivery_wechat && user.wechat_id) channels.push('wechat');

      let allOk = true;
      for (const ch of channels) {
        try {
          if (ch === 'email') {
            await sendEmail({
              to: user.email,
              subject: tpl.emailSubject(assignment, lang),
              body: tpl.emailBody(assignment, user, lang)
            });
          } else if (ch === 'sms') {
            await sendSms({ to: user.phone, body: tpl.smsBody(assignment, lang) });
          } else if (ch === 'wechat') {
            await sendWechat({ to: user.wechat_id, body: tpl.wechatBody(assignment, lang) });
          }
          logInsert.run(assignmentId, r.id, ch, lang, 'sent', null);
          results.push({ user: user.name_en, channel: ch, lang, ok: true });
        } catch (err) {
          allOk = false;
          logInsert.run(assignmentId, r.id, ch, lang, 'failed', String(err));
          results.push({ user: user.name_en, channel: ch, lang, ok: false, error: String(err) });
        }
      }
      markSent.run(allOk ? 'sent' : 'partial', r.id);
    }
  }

  return results;
}

async function dispatchCancellation(assignmentId, cancellerId) {
  const assignment = db.prepare(`
    SELECT a.*, t.project_id,
           p.name_en AS project_name_en, p.name_zh AS project_name_zh,
           u.name_en AS assigner_name,
           c.name_en AS canceller_name
    FROM assignments a
    JOIN tasks t ON t.id = a.task_id
    JOIN projects p ON p.id = t.project_id
    JOIN users u ON u.id = a.created_by
    LEFT JOIN users c ON c.id = ?
    WHERE a.id = ?
  `).get(cancellerId, assignmentId);

  if (!assignment) throw new Error(`Assignment ${assignmentId} not found`);

  const recipients = db.prepare(
    'SELECT * FROM assignment_recipients WHERE assignment_id = ?'
  ).all(assignmentId);

  const logInsert = db.prepare(`
    INSERT INTO message_log (assignment_id, recipient_id, channel, lang, status, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const results = [];

  for (const r of recipients) {
    const targets = resolveTargets(r);
    for (const user of targets) {
      const lang = user.preferred_lang || 'en';
      const channels = [];
      if (r.delivery_email && user.email) channels.push('email');
      if (r.delivery_sms && user.phone) channels.push('sms');
      if (r.delivery_wechat && user.wechat_id) channels.push('wechat');

      for (const ch of channels) {
        try {
          if (ch === 'email') {
            await sendEmail({
              to: user.email,
              subject: tpl.cancelEmailSubject(assignment, lang),
              body: tpl.cancelEmailBody(assignment, user, lang)
            });
          } else if (ch === 'sms') {
            await sendSms({ to: user.phone, body: tpl.cancelSmsBody(assignment, lang) });
          } else if (ch === 'wechat') {
            await sendWechat({ to: user.wechat_id, body: tpl.cancelWechatBody(assignment, lang) });
          }
          logInsert.run(assignmentId, r.id, ch, lang, 'cancel_sent', null);
          results.push({ user: user.name_en, channel: ch, lang, ok: true });
        } catch (err) {
          logInsert.run(assignmentId, r.id, ch, lang, 'cancel_failed', String(err));
          results.push({ user: user.name_en, channel: ch, lang, ok: false, error: String(err) });
        }
      }
    }
  }

  return results;
}

module.exports = { dispatchAssignment, dispatchCancellation };
