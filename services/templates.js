// services/templates.js — bilingual message templates
// Generates email subject/body and SMS/WeChat text in EN or ZH.

function fmtDate(iso, lang) {
  const d = new Date(iso + 'T00:00:00');
  if (lang === 'zh') {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 ${days[d.getDay()]}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function emailSubject(assignment, lang) {
  if (lang === 'zh') return `【德乐】新任务:${assignment.title_zh || assignment.title_en}`;
  return `[De Lux] New assignment: ${assignment.title_en}`;
}

function emailBody(assignment, recipient, lang) {
  const name = lang === 'zh'
    ? (recipient.name_zh || recipient.name_en)
    : recipient.name_en;
  const title = lang === 'zh' ? (assignment.title_zh || assignment.title_en) : assignment.title_en;
  const notes = lang === 'zh' ? (assignment.notes_zh || assignment.notes_en) : assignment.notes_en;

  if (lang === 'zh') {
    return [
      `${name}你好,`,
      ``,
      `德乐建筑给你派发了一项新任务。`,
      ``,
      `— 项目:${assignment.project_name_zh || assignment.project_name_en}`,
      `— 任务:${title}`,
      `— 开始:${fmtDate(assignment.start_date, 'zh')}`,
      `— 截止:${fmtDate(assignment.due_date, 'zh')}`,
      assignment.site_access ? `— 现场出入:${assignment.site_access}` : null,
      `— 派发人:${assignment.assigner_name}`,
      ``,
      notes ? `工作范围\n${notes}` : null,
      assignment.safety_notes ? `\n安全注意事项\n${assignment.safety_notes}` : null,
      ``,
      assignment.require_ack ? `请在 24 小时内确认或拒绝:` : `详情查看:`,
      `→ delux.app/a/${assignment.id}`,
      ``,
      `德乐运营部`
    ].filter(Boolean).join('\n');
  }

  return [
    `Hi ${name},`,
    ``,
    `You have a new assignment from De Lux Construction.`,
    ``,
    `— Project: ${assignment.project_name_en}`,
    `— Task: ${title}`,
    `— Start: ${fmtDate(assignment.start_date, 'en')}`,
    `— Due: ${fmtDate(assignment.due_date, 'en')}`,
    assignment.site_access ? `— Site access: ${assignment.site_access}` : null,
    `— Assigned by: ${assignment.assigner_name}`,
    ``,
    notes ? `Scope of work\n${notes}` : null,
    assignment.safety_notes ? `\nSafety notes\n${assignment.safety_notes}` : null,
    ``,
    assignment.require_ack ? `Please confirm or decline within 24 hours:` : `Details:`,
    `→ delux.app/a/${assignment.id}`,
    ``,
    `Thanks,`,
    `De Lux Operations`
  ].filter(Boolean).join('\n');
}

function smsBody(assignment, lang) {
  const title = lang === 'zh' ? (assignment.title_zh || assignment.title_en) : assignment.title_en;
  if (lang === 'zh') {
    return `【德乐】新任务:${title}。${fmtDate(assignment.start_date, 'zh')}开始,${fmtDate(assignment.due_date, 'zh')}截止。打开:delux.app/a/${assignment.id}`;
  }
  return `[De Lux] New assignment: ${title}. Start ${fmtDate(assignment.start_date, 'en')}, due ${fmtDate(assignment.due_date, 'en')}. Open: delux.app/a/${assignment.id}`;
}

function wechatBody(assignment, lang) {
  const title = lang === 'zh' ? (assignment.title_zh || assignment.title_en) : assignment.title_en;
  const project = lang === 'zh' ? (assignment.project_name_zh || assignment.project_name_en) : assignment.project_name_en;
  if (lang === 'zh') {
    return [
      `【德乐建筑 - 新任务】`,
      ``,
      `📋 ${title}`,
      `📍 ${project}`,
      `📅 ${fmtDate(assignment.start_date, 'zh')} → ${fmtDate(assignment.due_date, 'zh')}`,
      `👷 派发人:${assignment.assigner_name}`,
      ``,
      assignment.notes_zh ? `工作范围:${assignment.notes_zh}` : null,
      `\n请确认 👉 delux.app/a/${assignment.id}`
    ].filter(Boolean).join('\n');
  }
  return [
    `[De Lux - New assignment]`,
    ``,
    `📋 ${title}`,
    `📍 ${project}`,
    `📅 ${fmtDate(assignment.start_date, 'en')} → ${fmtDate(assignment.due_date, 'en')}`,
    `👷 From: ${assignment.assigner_name}`,
    ``,
    assignment.notes_en ? `Scope: ${assignment.notes_en}` : null,
    `\nConfirm 👉 delux.app/a/${assignment.id}`
  ].filter(Boolean).join('\n');
}

module.exports = { emailSubject, emailBody, smsBody, wechatBody };
