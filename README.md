# De Lux Construction — Project Operations

A working bilingual (English / 中文) project management web app for De Lux Construction. Schedules across multiple projects, a directory of subcontractors and workers, and an assignment dispatcher that pushes notifications via email, SMS, and WeChat in each recipient's preferred language.

Single Node.js process serves both the backend API and the frontend SPA. Zero native dependencies — uses Node 22's built-in SQLite.

## Requirements

- **Node.js 22.5 or newer** (uses the built-in `node:sqlite` module)

## Setup

```bash
npm install
npm run init-db    # creates db/delux.db with the schema
npm run seed       # populates 4 projects, 6 subs, 9 workers
npm start          # http://localhost:3000
```

Then open `http://localhost:3000` and sign in with one of the demo accounts.

## Demo accounts (password is `demo` for all)

| Email                              | Role                                        | Lang |
|------------------------------------|---------------------------------------------|------|
| pm@deluxconstruction.com           | Dispatcher — full dashboard                 | EN   |
| wei@deluxconstruction.com          | Crew lead 刘伟 (drywall & paint)             | ZH   |
| chen@deluxconstruction.com         | Worker 张晨 (drywall installer)              | ZH   |
| derek@deluxconstruction.com        | Crew lead Derek Kowalski (finish)           | EN   |
| sofia@deluxconstruction.com        | Crew lead Sofia Okafor (framing)            | EN   |
| m.chen@voltelec.com                | Sub contact — Volt Electric                 | EN   |
| raj@northwindhvac.com              | Sub contact — Northwind HVAC                | EN   |

## What it does

**As the dispatcher (`pm@deluxconstruction.com`)** you see four tabs: Projects (portfolio overview with progress bars), Schedule (Gantt across all 4 projects), Workers & subs (full directory), and New assignment (compose + send). When you send an assignment, the backend looks up each recipient's `preferred_lang` and dispatches the email/SMS/WeChat in their language automatically. You can mix recipients freely — a single assignment can go to a subcontractor company, an in-house crew lead, and a couple of individual workers in one shot.

**As a crew lead or worker (e.g. `wei@deluxconstruction.com`)** you see only the My Assignments tab, with each item displayed in your preferred language. Pending assignments have Accept and Decline buttons; your response flows back to the dispatcher's view in real time.

**Language toggle** in the top right switches the entire UI between English and 中文 — independent of the language each notification is sent in (which follows the recipient's stored preference).

## End-to-end test

```bash
npm run test-flow
```

Boots the server in-process, logs in as the dispatcher, sends a bilingual assignment to two Chinese-speaking workers and one English-speaking sub, then logs in as one of the workers and accepts it. Every dispatched message is printed to the console so you can see exactly what each recipient receives.

## API

```
POST   /api/auth/login              { email, password }
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/projects                List active projects with progress
GET    /api/tasks?project_id=N      Schedule rows (omit param for all projects)
POST   /api/tasks                   Add a task
GET    /api/people                  Subs + workers for the composer

POST   /api/assignments             Create + dispatch (dispatcher only)
GET    /api/assignments             All assignments with delivery stats
GET    /api/assignments/mine        Inbox for the logged-in worker
POST   /api/assignments/:id/respond { response: "accepted" | "declined" }
```

## File layout

```
delux-backend/
├── server.js                Express app entry point
├── package.json
├── public/
│   └── index.html           The full SPA — login, dispatcher, worker views
├── db/
│   ├── init.js              Creates the SQLite schema
│   ├── seed.js              Loads sample De Lux data
│   ├── index.js             Shared connection
│   └── delux.db             (created by init-db)
├── routes/
│   ├── auth.js              Login / logout / session
│   ├── projects.js          Projects, tasks, people directory
│   └── assignments.js       Create + dispatch + respond
├── services/
│   ├── password.js          scrypt password hashing
│   ├── templates.js         Bilingual EN/ZH message templates
│   └── notify.js            Channel dispatcher (email/SMS/WeChat)
└── test-flow.js             End-to-end smoke test
```

## Going to production

The notification senders in `services/notify.js` currently log every dispatched message to the console so you can see the bilingual templates in action. To send for real, swap each stub with the production client:

- **Email** — Nodemailer with SMTP (SendGrid, AWS SES, Mailgun)
- **SMS** — Twilio for US numbers; Aliyun SMS or Tencent Cloud SMS for China
- **WeChat** — WeChat Work (企业微信) requires an enterprise account. API docs at https://developer.work.weixin.qq.com/

Other production hardening:

- Move the session secret out of `server.js` into a real environment variable
- Switch SQLite to Postgres if you'll have more than ~50 concurrent users
- Put the whole thing behind HTTPS (Caddy or nginx)
- Add rate limiting on `/api/auth/login`
- Set up a backup job for `db/delux.db`

## Verified working

The end-to-end test passes against a freshly-seeded database. As an example, sending one assignment to Wei Liu (Chinese), Chen Zhang (Chinese), and Northwind HVAC (English contact) dispatches:

- 3 messages to Wei: Chinese email + Chinese SMS + Chinese WeChat
- 3 messages to Chen: Chinese email + Chinese SMS + Chinese WeChat
- 2 messages to Raj at Northwind: English email + English SMS

All in a single API call, with the language for each message determined by the recipient's stored `preferred_lang`.
