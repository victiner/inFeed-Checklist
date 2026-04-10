// src/services/airtableTeam.js
// Airtable adapter for the shared team checklist feature.
// Tables: Users, ChecklistItems, ScheduleBlocks, FieldEdits

const Airtable = require('airtable');

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_TEAM_BASE_ID || process.env.AIRTABLE_BASE_ID;

let base = null;
function getBase() {
  if (!apiKey || !baseId) {
    throw new Error(
      'Airtable not configured: set AIRTABLE_API_KEY and AIRTABLE_BASE_ID (or AIRTABLE_TEAM_BASE_ID)'
    );
  }
  if (!base) {
    base = new Airtable({ apiKey }).base(baseId);
  }
  return base;
}

const TABLES = {
  USERS: 'Users',
  CHECKLIST_ITEMS: 'ChecklistItems',
  SCHEDULE_BLOCKS: 'ScheduleBlocks',
  FIELD_EDITS: 'FieldEdits',
};

// ---- helpers ------------------------------------------------

async function selectAll(table, filterByFormula) {
  const records = [];
  await getBase()(table)
    .select(filterByFormula ? { filterByFormula } : {})
    .eachPage((page, next) => {
      records.push(...page);
      next();
    });
  return records;
}

function escapeFormulaString(s) {
  return String(s).replace(/'/g, "\\'");
}

function byUserFormula(userId) {
  return `{userId} = '${escapeFormulaString(userId)}'`;
}

async function deleteAll(table, records) {
  // Airtable allows deleting up to 10 ids per call.
  const ids = records.map(r => r.id);
  for (let i = 0; i < ids.length; i += 10) {
    await getBase()(table).destroy(ids.slice(i, i + 10));
  }
}

async function createAll(table, rows) {
  // Airtable allows creating up to 10 records per call.
  const created = [];
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10).map(fields => ({ fields }));
    const res = await getBase()(table).create(chunk);
    created.push(...res);
  }
  return created;
}

// ---- Users --------------------------------------------------

async function listUsers() {
  const records = await selectAll(TABLES.USERS);
  // Never expose the token in the list — only public fields.
  return records.map(r => ({
    userId: r.get('userId'),
    name: r.get('name'),
    role: r.get('role'),
    color: r.get('color'),
    createdAt: r.get('createdAt'),
  }));
}

async function getUserRecord(userId) {
  const records = await selectAll(TABLES.USERS, byUserFormula(userId));
  return records[0] || null;
}

async function getUserToken(userId) {
  const rec = await getUserRecord(userId);
  if (!rec) return null;
  return rec.get('token') || null;
}

async function createUser({ userId, name, role, color }) {
  const token = require('crypto').randomBytes(16).toString('hex');
  const [created] = await getBase()(TABLES.USERS).create([
    {
      fields: {
        userId,
        name: name || '',
        role: role || '',
        color: color || '',
        token,
        createdAt: new Date().toISOString().slice(0, 10),
      },
    },
  ]);
  return {
    userId: created.get('userId'),
    name: created.get('name'),
    role: created.get('role'),
    color: created.get('color'),
    token, // returned on creation only
  };
}

// ---- ChecklistItems ----------------------------------------

async function getChecklist(userId) {
  const records = await selectAll(TABLES.CHECKLIST_ITEMS, byUserFormula(userId));
  return records
    .map(r => ({
      itemId: r.get('itemId'),
      phaseLabel: r.get('phaseLabel') || '',
      sectionTitle: r.get('sectionTitle') || '',
      label: r.get('label') || '',
      sub: r.get('sub') || '',
      tag: r.get('tag') || '',
      effort: r.get('effort') || '',
      done: !!r.get('done'),
      order: r.get('order') ?? 0,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function replaceChecklist(userId, items) {
  const existing = await selectAll(TABLES.CHECKLIST_ITEMS, byUserFormula(userId));
  await deleteAll(TABLES.CHECKLIST_ITEMS, existing);
  const rows = (items || []).map((it, idx) => ({
    itemId: String(it.itemId || `${userId}-${idx}`),
    userId,
    phaseLabel: it.phaseLabel || '',
    sectionTitle: it.sectionTitle || '',
    label: it.label || '',
    sub: it.sub || '',
    tag: it.tag || '',
    effort: it.effort || '',
    done: !!it.done,
    order: typeof it.order === 'number' ? it.order : idx,
  }));
  await createAll(TABLES.CHECKLIST_ITEMS, rows);
  return rows.length;
}

async function getChecklistState(userId) {
  const items = await getChecklist(userId);
  const state = {};
  for (const it of items) state[it.itemId] = !!it.done;
  return state;
}

async function setChecklistState(userId, state) {
  // Patch the `done` field on matching ChecklistItems rows.
  const existing = await selectAll(TABLES.CHECKLIST_ITEMS, byUserFormula(userId));
  const byItemId = new Map(existing.map(r => [r.get('itemId'), r]));
  const updates = [];
  for (const [itemId, done] of Object.entries(state || {})) {
    const rec = byItemId.get(itemId);
    if (rec) updates.push({ id: rec.id, fields: { done: !!done } });
  }
  for (let i = 0; i < updates.length; i += 10) {
    await getBase()(TABLES.CHECKLIST_ITEMS).update(updates.slice(i, i + 10));
  }
  return updates.length;
}

// ---- ScheduleBlocks ----------------------------------------

async function getSchedule(userId) {
  const records = await selectAll(TABLES.SCHEDULE_BLOCKS, byUserFormula(userId));
  return records
    .map(r => ({
      blockId: r.get('blockId'),
      startTime: r.get('startTime') || '',
      endTime: r.get('endTime') || '',
      label: r.get('label') || '',
      sub: r.get('sub') || '',
      location: r.get('location') || '',
      order: r.get('order') ?? 0,
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function replaceSchedule(userId, blocks) {
  const existing = await selectAll(TABLES.SCHEDULE_BLOCKS, byUserFormula(userId));
  await deleteAll(TABLES.SCHEDULE_BLOCKS, existing);
  const rows = (blocks || []).map((b, idx) => ({
    blockId: String(b.blockId || `${userId}-sch-${idx}`),
    userId,
    startTime: b.startTime || '',
    endTime: b.endTime || '',
    label: b.label || '',
    sub: b.sub || '',
    location: b.location || '',
    order: typeof b.order === 'number' ? b.order : idx,
  }));
  await createAll(TABLES.SCHEDULE_BLOCKS, rows);
  return rows.length;
}

// ---- FieldEdits --------------------------------------------

async function getFields(userId) {
  const records = await selectAll(TABLES.FIELD_EDITS, byUserFormula(userId));
  const out = {};
  for (const r of records) {
    const key = r.get('fieldKey');
    if (key) out[key] = r.get('value') || '';
  }
  return out;
}

async function replaceFields(userId, fields) {
  const existing = await selectAll(TABLES.FIELD_EDITS, byUserFormula(userId));
  await deleteAll(TABLES.FIELD_EDITS, existing);
  const now = new Date().toISOString().slice(0, 10);
  const rows = Object.entries(fields || {}).map(([fieldKey, value]) => ({
    userId,
    fieldKey,
    value: value == null ? '' : String(value),
    updatedAt: now,
  }));
  await createAll(TABLES.FIELD_EDITS, rows);
  return rows.length;
}

module.exports = {
  listUsers,
  getUserRecord,
  getUserToken,
  createUser,
  getChecklist,
  replaceChecklist,
  getChecklistState,
  setChecklistState,
  getSchedule,
  replaceSchedule,
  getFields,
  replaceFields,
};
