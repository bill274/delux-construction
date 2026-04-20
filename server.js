// server.js — De Lux Construction project management backend
const express = require('express');
const session = require('express-session');
const path = require('path');

const { router: authRouter } = require('./routes/auth');
const projectsRouter = require('./routes/projects');
const assignmentsRouter = require('./routes/assignments');
const usersRouter = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use('/api/auth', authRouter);
app.use('/api', projectsRouter);
app.use('/api', assignmentsRouter);
app.use('/api', usersRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Fallback: serve the SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`De Lux backend listening on port ${PORT}`);
});
