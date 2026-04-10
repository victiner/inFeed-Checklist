// src/server.js
// Standalone Express server for the inFeed team checklist.
// Backed by Airtable, deployed on Railway.

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const teamRouter = require('./routes/team');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- MIDDLEWARE ----
app.use(helmet());

// CORS: built-in allow-list + any extra origins from CORS_ALLOWED_ORIGINS env.
// Any *.vercel.app preview deploy is also allowed via the regex below.
const staticAllowed = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];
const envAllowed = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allowedOrigins = [...staticAllowed, ...envAllowed];

app.use(
  cors({
    origin(origin, cb) {
      // Non-browser requests (curl, server-to-server) have no origin.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      try {
        if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);
      } catch (_) {}
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
  })
);

app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// ---- HEALTH ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'infeed-checklist',
    timestamp: new Date().toISOString(),
    airtableConfigured: !!process.env.AIRTABLE_API_KEY && !!(process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_TEAM_BASE_ID),
    masterTokenConfigured: !!process.env.TEAM_VIEWER_SECRET,
  });
});

// ---- ROUTES ----
app.use('/team', teamRouter);

// ---- ERROR HANDLER ----
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ---- STARTUP ----
const required = ['AIRTABLE_API_KEY', 'TEAM_VIEWER_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.warn(`[Server] Missing env vars: ${missing.join(', ')} — set them before going live`);
}
if (!process.env.AIRTABLE_BASE_ID && !process.env.AIRTABLE_TEAM_BASE_ID) {
  console.warn('[Server] Missing AIRTABLE_BASE_ID (or AIRTABLE_TEAM_BASE_ID)');
}

app.listen(PORT, () => {
  console.log(`\n[Server] inFeed Checklist running on port ${PORT}`);
  console.log(`[Server] Health: http://localhost:${PORT}/health`);
  console.log(`[Server] Team API: http://localhost:${PORT}/team/users\n`);
});

module.exports = app;
