#!/usr/bin/env node
// scripts/create-users.js
//
// Creates Victor + Kaja in the Users table and prints their personal tokens.
// Run AFTER setup-airtable.js has created the schema.
//
//   node scripts/create-users.js
//
// Re-running is safe: existing users are skipped (their tokens are NOT re-shown,
// because we don't store them in plaintext anywhere else).

require('dotenv').config();
const crypto = require('crypto');
const Airtable = require('airtable');

const apiKey = process.env.AIRTABLE_API_KEY;
const baseId = process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_TEAM_BASE_ID;

if (!apiKey || !baseId) {
  console.error('Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID in .env');
  process.exit(1);
}

const base = new Airtable({ apiKey }).base(baseId);

const USERS = [
  { userId: 'victor',    name: 'Victor',    role: 'Marketing & growth', color: 'victor' },
  { userId: 'kaja',      name: 'Kaja',      role: 'Product & design',   color: 'kaja' },
  { userId: 'krisztina', name: 'Krisztina', role: '',                   color: 'krisztina' },
  { userId: 'oliver',    name: 'Oliver',    role: '',                   color: 'oliver' },
];

async function findByUserId(userId) {
  const records = await base('Users')
    .select({ filterByFormula: `{userId} = '${userId}'`, maxRecords: 1 })
    .firstPage();
  return records[0] || null;
}

(async () => {
  console.log('\nCreating users...\n');
  const results = [];
  for (const u of USERS) {
    const existing = await findByUserId(u.userId);
    if (existing) {
      console.log(`✓ ${u.userId} already exists — skipping (token not shown)`);
      results.push({ userId: u.userId, token: null, existed: true });
      continue;
    }
    const token = crypto.randomBytes(16).toString('hex');
    await base('Users').create([
      {
        fields: {
          ...u,
          token,
          createdAt: new Date().toISOString().slice(0, 10),
        },
      },
    ]);
    console.log(`+ Created ${u.userId}`);
    results.push({ userId: u.userId, token, existed: false });
  }

  console.log('\n' + '='.repeat(60));
  console.log('SAVE THESE TOKENS — they will not be shown again');
  console.log('='.repeat(60));
  for (const r of results) {
    if (r.token) {
      console.log(`  ${r.userId}: ${r.token}`);
    } else {
      console.log(`  ${r.userId}: (already existed — check Airtable Users table for the token)`);
    }
  }
  console.log('='.repeat(60));
  console.log('\nShare links:');
  console.log('  Replace BACKEND with your Railway domain and FRONTEND with your Vercel URL.\n');
  for (const r of results) {
    const tok = r.token || '<TOKEN_FROM_AIRTABLE>';
    const param = r.userId === 'victor' ? 'vtoken' : 'ktoken';
    console.log(`  ${r.userId}: https://FRONTEND/?api=https://BACKEND&${param}=${tok}`);
  }
  console.log('');
})();
