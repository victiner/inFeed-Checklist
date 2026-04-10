// src/routes/team.js
// Shared team checklist API backed by Airtable.
// Auth: per-user token stored in Airtable Users table.
// A request must include ?token= matching the user's token,
// or the master TEAM_VIEWER_SECRET from the environment.

const express = require('express');
const router = express.Router();
const team = require('../services/airtableTeam');

// ---- auth middleware ---------------------------------------

async function requireUserToken(req, res, next) {
  try {
    const { userId } = req.params;
    const provided = req.query.token || req.get('x-team-token');
    if (!provided) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const master = process.env.TEAM_VIEWER_SECRET;
    if (master && provided === master) return next();

    const userToken = await team.getUserToken(userId);
    if (!userToken) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (provided !== userToken) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    next();
  } catch (err) {
    console.error('[team] auth error:', err);
    res.status(500).json({ error: 'Auth check failed', message: err.message });
  }
}

function wrap(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch(err => {
      console.error('[team] handler error:', err);
      res.status(500).json({ error: 'Internal error', message: err.message });
    });
  };
}

// ---- Users (public list, authenticated create) ------------

router.get(
  '/users',
  wrap(async (req, res) => {
    const users = await team.listUsers();
    res.json({ users });
  })
);

router.post(
  '/users',
  wrap(async (req, res) => {
    // Creating a new user requires the master secret, so random
    // callers cannot add themselves to the team.
    const master = process.env.TEAM_VIEWER_SECRET;
    const provided = req.query.token || req.get('x-team-token');
    if (!master || provided !== master) {
      return res.status(403).json({ error: 'Admin token required' });
    }
    const { userId, name, role, color } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const existing = await team.getUserRecord(userId);
    if (existing) return res.status(409).json({ error: 'User already exists' });
    const user = await team.createUser({ userId, name, role, color });
    res.status(201).json({ user });
  })
);

// ---- Checklist --------------------------------------------

router.get(
  '/:userId/checklist',
  requireUserToken,
  wrap(async (req, res) => {
    const items = await team.getChecklist(req.params.userId);
    res.json({ items });
  })
);

router.post(
  '/:userId/checklist',
  requireUserToken,
  wrap(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array required' });
    }
    const count = await team.replaceChecklist(req.params.userId, items);
    res.json({ ok: true, count });
  })
);

// ---- Schedule ---------------------------------------------

router.get(
  '/:userId/schedule',
  requireUserToken,
  wrap(async (req, res) => {
    const blocks = await team.getSchedule(req.params.userId);
    res.json({ blocks });
  })
);

router.post(
  '/:userId/schedule',
  requireUserToken,
  wrap(async (req, res) => {
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : req.body;
    if (!Array.isArray(blocks)) {
      return res.status(400).json({ error: 'blocks array required' });
    }
    const count = await team.replaceSchedule(req.params.userId, blocks);
    res.json({ ok: true, count });
  })
);

// ---- Field edits ------------------------------------------

router.get(
  '/:userId/fields',
  requireUserToken,
  wrap(async (req, res) => {
    const fields = await team.getFields(req.params.userId);
    res.json({ fields });
  })
);

router.post(
  '/:userId/fields',
  requireUserToken,
  wrap(async (req, res) => {
    const fields = req.body?.fields || req.body;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return res.status(400).json({ error: 'fields object required' });
    }
    const count = await team.replaceFields(req.params.userId, fields);
    res.json({ ok: true, count });
  })
);

// ---- Checkbox state ---------------------------------------

router.get(
  '/:userId/state',
  requireUserToken,
  wrap(async (req, res) => {
    const state = await team.getChecklistState(req.params.userId);
    res.json({ state });
  })
);

router.post(
  '/:userId/state',
  requireUserToken,
  wrap(async (req, res) => {
    const state = req.body?.state || req.body;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ error: 'state object required' });
    }
    const count = await team.setChecklistState(req.params.userId, state);
    res.json({ ok: true, updated: count });
  })
);

module.exports = router;
