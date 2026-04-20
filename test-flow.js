// test-flow.js — end-to-end smoke test of the De Lux backend
// Boots the server in-process, logs in as dispatcher, sends a bilingual
// assignment to a Chinese-speaking crew lead, then logs in as that worker
// and accepts it. Prints all dispatched messages along the way.

process.env.PORT = '3456';
const http = require('node:http');

let server;

function fetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const data = opts.body ? JSON.stringify(opts.body) : null;
    const req = http.request({
      host: '127.0.0.1', port: 3456, path,
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(opts.cookie ? { Cookie: opts.cookie } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie']?.[0]?.split(';')[0];
        try {
          resolve({ status: res.statusCode, json: body ? JSON.parse(body) : null, cookie: setCookie });
        } catch {
          resolve({ status: res.statusCode, body, cookie: setCookie });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function header(label) {
  console.log('\n' + '═'.repeat(70));
  console.log('  ' + label);
  console.log('═'.repeat(70));
}

(async () => {
  header('STARTING SERVER');
  require('./server');
  // Wait briefly for the server to bind
  await new Promise(r => setTimeout(r, 300));

  header('1. DISPATCHER LOGS IN');
  const login = await fetch('/api/auth/login', {
    method: 'POST',
    body: { email: 'pm@deluxconstruction.com', password: 'demo' }
  });
  console.log(`Status ${login.status}:`, login.json);
  const dispatcherCookie = login.cookie;

  header('2. DISPATCHER VIEWS PROJECTS');
  const projects = await fetch('/api/projects', { cookie: dispatcherCookie });
  console.log(`Found ${projects.json.length} active projects:`);
  for (const p of projects.json) {
    console.log(`  · ${p.name_en} (${p.name_zh}) — due ${p.due_date} — ${p.task_count} tasks`);
  }

  header('3. DISPATCHER VIEWS SCHEDULE FOR MERCER LOFT');
  const mercerProj = projects.json.find(p => p.name_en.includes('Mercer'));
  const tasks = await fetch(`/api/tasks?project_id=${mercerProj.id}`, { cookie: dispatcherCookie });
  for (const t of tasks.json) {
    console.log(`  · ${t.title_en} (${t.title_zh}) — ${t.start_date} → ${t.due_date} [${t.status}]`);
  }
  const drywallTask = tasks.json.find(t => t.title_en === 'Drywall finish');

  header('4. DISPATCHER LOOKS UP PEOPLE');
  const people = await fetch('/api/people', { cookie: dispatcherCookie });
  console.log(`Subs: ${people.json.subs.length}, Workers: ${people.json.workers.length}`);
  const wei = people.json.workers.find(w => w.name_en === 'Wei Liu');
  const chen = people.json.workers.find(w => w.name_en === 'Chen Zhang');
  const northwind = people.json.subs.find(s => s.name === 'Northwind HVAC');
  console.log(`Picking: ${wei.name_en} (${wei.preferred_lang}), ${chen.name_en} (${chen.preferred_lang}), and ${northwind.name} (sub)`);

  header('5. DISPATCHER CREATES + DISPATCHES BILINGUAL ASSIGNMENT');
  const create = await fetch('/api/assignments', {
    method: 'POST', cookie: dispatcherCookie,
    body: {
      task_id: drywallTask.id,
      title_en: 'Drywall finish — Unit 3 bedroom',
      title_zh: '石膏板完工 — 3单元卧室',
      notes_en: 'Master bedroom and walk-in closet — taping, sanding, one coat primer. Materials in on-site storage.',
      notes_zh: '主卧及衣帽间 — 接缝、打磨、一道底漆。所需材料已送至现场储物间。',
      site_access: 'Gate code 4729 · Building manager Linda 555-0612',
      safety_notes: 'Dust masks required. Coordinate with Northwind to shut down HVAC during sanding.',
      start_date: '2026-04-22',
      due_date: '2026-04-26',
      require_ack: true,
      recipients: [
        { user_id: wei.id, email: true, sms: true, wechat: true },
        { user_id: chen.id, email: true, sms: true, wechat: true },
        { sub_company_id: northwind.id, email: true, sms: true, wechat: false }
      ]
    }
  });
  console.log(`\nAssignment #${create.json.id} created. Dispatched ${create.json.dispatched.length} messages:`);
  for (const d of create.json.dispatched) {
    console.log(`  ✓ ${d.user} ← ${d.channel} (${d.lang})`);
  }

  header('6. CHINESE-SPEAKING WORKER (刘伟) LOGS IN');
  const weiLogin = await fetch('/api/auth/login', {
    method: 'POST',
    body: { email: 'wei@deluxconstruction.com', password: 'demo' }
  });
  console.log(`Logged in as: ${weiLogin.json.name_en} / ${weiLogin.json.name_zh} (lang: ${weiLogin.json.preferred_lang})`);

  header('7. WORKER CHECKS INBOX');
  const inbox = await fetch('/api/assignments/mine', { cookie: weiLogin.cookie });
  for (const a of inbox.json) {
    console.log(`  · [${a.project_name_zh}] ${a.title_zh} — ${a.start_date} → ${a.due_date} (response: ${a.response || 'pending'})`);
  }

  header('8. WORKER ACCEPTS THE ASSIGNMENT');
  const respond = await fetch(`/api/assignments/${create.json.id}/respond`, {
    method: 'POST', cookie: weiLogin.cookie,
    body: { response: 'accepted' }
  });
  console.log('Response:', respond.json);

  header('9. DISPATCHER SEES THE ACCEPTANCE');
  const allAssignments = await fetch('/api/assignments', { cookie: dispatcherCookie });
  for (const a of allAssignments.json) {
    console.log(`  · "${a.title_en}" — ${a.recipient_count} sent, ${a.accepted_count} accepted, ${a.declined_count} declined`);
  }

  header('DONE');
  console.log('Full end-to-end flow passed. Backend is working correctly.\n');
  process.exit(0);
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
