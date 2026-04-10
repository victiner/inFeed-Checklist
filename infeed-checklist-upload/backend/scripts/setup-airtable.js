#!/usr/bin/env node
// scripts/setup-airtable.js
//
// One-time helper that creates the 4 required tables in your Airtable base
// using the metadata API. Run AFTER you've created an empty base in Airtable
// and put AIRTABLE_API_KEY + AIRTABLE_BASE_ID in your local .env file.
//
//   node scripts/setup-airtable.js
//
// Re-running is safe: tables/fields that already exist are skipped.

require('dotenv').config();

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_TEAM_BASE_ID;

if (!apiKey || !baseId) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env');
  process.exit(1);
}

const SCHEMA = [
  {
    name: 'Users',
    fields: [
      { name: 'userId',    type: 'singleLineText' }, // primary
      { name: 'name',      type: 'singleLineText' },
      { name: 'role',      type: 'singleLineText' },
      { name: 'color',     type: 'singleLineText' },
      { name: 'token',     type: 'singleLineText' },
      { name: 'createdAt', type: 'date', options: { dateFormat: { name: 'iso' } } },
    ],
  },
  {
    name: 'ChecklistItems',
    fields: [
      { name: 'itemId',       type: 'singleLineText' }, // primary
      { name: 'userId',       type: 'singleLineText' },
      { name: 'phaseLabel',   type: 'singleLineText' },
      { name: 'sectionTitle', type: 'singleLineText' },
      { name: 'label',        type: 'singleLineText' },
      { name: 'sub',          type: 'multilineText' },
      { name: 'tag',          type: 'singleLineText' },
      { name: 'effort',       type: 'singleLineText' },
      { name: 'done',         type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
      { name: 'order',        type: 'number', options: { precision: 0 } },
    ],
  },
  {
    name: 'ScheduleBlocks',
    fields: [
      { name: 'blockId',   type: 'singleLineText' }, // primary
      { name: 'userId',    type: 'singleLineText' },
      { name: 'startTime', type: 'singleLineText' },
      { name: 'endTime',   type: 'singleLineText' },
      { name: 'label',     type: 'singleLineText' },
      { name: 'sub',       type: 'singleLineText' },
      { name: 'location',  type: 'singleLineText' },
      { name: 'order',     type: 'number', options: { precision: 0 } },
    ],
  },
  {
    name: 'FieldEdits',
    fields: [
      { name: 'userId',    type: 'singleLineText' }, // primary
      { name: 'fieldKey',  type: 'singleLineText' },
      { name: 'value',     type: 'multilineText' },
      { name: 'updatedAt', type: 'date', options: { dateFormat: { name: 'iso' } } },
    ],
  },
];

const API = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

async function listTables() {
  const r = await fetch(API, { headers });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Cannot list tables (${r.status}): ${body}\n\nMake sure your PAT has the schema.bases:read scope and access to this base.`);
  }
  const data = await r.json();
  return data.tables || [];
}

async function createTable(spec) {
  const body = {
    name: spec.name,
    fields: spec.fields,
  };
  const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Failed to create table ${spec.name}: ${r.status} ${text}`);
  }
  return r.json();
}

async function addField(tableId, field) {
  const r = await fetch(`${API}/${tableId}/fields`, {
    method: 'POST',
    headers,
    body: JSON.stringify(field),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Failed to add field ${field.name}: ${r.status} ${text}`);
  }
}

(async () => {
  try {
    console.log(`\nConnecting to base ${baseId}...`);
    const existing = await listTables();
    const byName = new Map(existing.map(t => [t.name, t]));

    for (const spec of SCHEMA) {
      const have = byName.get(spec.name);
      if (!have) {
        console.log(`+ Creating table: ${spec.name}`);
        const created = await createTable(spec);
        byName.set(created.name, created);
      } else {
        console.log(`✓ Table exists: ${spec.name} — checking fields`);
        const haveFields = new Set((have.fields || []).map(f => f.name));
        for (const field of spec.fields) {
          if (!haveFields.has(field.name)) {
            console.log(`  + Adding field: ${field.name}`);
            await addField(have.id, field);
          }
        }
      }
    }

    console.log('\nSchema setup complete.\n');
    console.log('Next: run `node scripts/create-users.js` to create Victor + Kaja and get their tokens.\n');
  } catch (err) {
    console.error('\nSetup failed:', err.message);
    console.error('\nTroubleshooting:');
    console.error('  - Your PAT needs scopes: schema.bases:read, schema.bases:write, data.records:read, data.records:write');
    console.error('  - Your PAT must have access to this specific base');
    console.error('  - The base must already exist (create it manually in Airtable first)');
    process.exit(1);
  }
})();
