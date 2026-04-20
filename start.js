// start.js — Render-friendly entry point
// On first boot, creates the database schema and seeds sample data.
// On subsequent boots, just starts the server.
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'delux.db');
const isFirstRun = !fs.existsSync(dbPath);

if (isFirstRun) {
  console.log('First run detected — initializing database...');
  require('./db/init');
  require('./db/seed');
  console.log('Database ready.');
}

require('./server');
