# inFeed Checklist

Shared team checklist + schedule view for Victor and Kaja, backed by Airtable.

```
inFeed Checklist/
├── backend/        Express API (deploy to Railway)
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/team.js
│   │   └── services/airtableTeam.js
│   ├── scripts/
│   │   ├── setup-airtable.js   create the 4 Airtable tables
│   │   └── create-users.js     create Victor + Kaja, print tokens
│   ├── package.json
│   ├── railway.toml
│   └── .env.example
└── frontend/       Static site (deploy to Vercel)
    ├── index.html
    └── vercel.json
```

## Setup — first time

### 1. Create the Airtable base (manual, 1 minute)

1. Go to airtable.com → **+ Create a base** → **Start from scratch**
2. Name it **inFeed Checklist**
3. Don't worry about the default table — the script wipes it.
4. Copy the base ID from the URL (`airtable.com/appXXXXX/...` → `appXXXXX`)

### 2. Create a Personal Access Token

1. Go to https://airtable.com/create/tokens
2. **Name:** infeed-checklist
3. **Scopes:** `data.records:read`, `data.records:write`, `schema.bases:read`, `schema.bases:write`
4. **Access:** add the inFeed Checklist base only
5. Copy the `pat...` token — shown only once

### 3. Configure backend locally

```bash
cd backend
cp .env.example .env
# edit .env and fill in:
#   AIRTABLE_API_KEY=pat...
#   AIRTABLE_BASE_ID=app...
#   TEAM_VIEWER_SECRET=$(openssl rand -hex 32)

npm install
```

### 4. Run the schema + user setup scripts

```bash
node scripts/setup-airtable.js     # creates the 4 tables
node scripts/create-users.js       # creates Victor + Kaja, prints tokens
```

**Save the printed tokens immediately** — they're not stored anywhere else and the script will not re-print them.

### 5. Smoke test locally

```bash
npm start
# in another terminal:
curl http://localhost:3000/health
curl http://localhost:3000/team/users
```

### 6. Push to GitHub

From the repo root (`inFeed Checklist/`):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/infeed-checklist.git
git push -u origin main
```

### 7. Deploy backend to Railway

1. https://railway.app → **New Project** → **Deploy from GitHub Repo**
2. Pick your repo
3. **Settings → Root Directory:** `backend`
4. **Settings → Environment** — paste the same vars from your local `.env`
5. **Settings → Networking → Generate Domain** → copy the Railway URL

Smoke test:
```bash
curl https://YOUR-RAILWAY-DOMAIN/health
```

### 8. Deploy frontend to Vercel

1. https://vercel.com/new → import the same GitHub repo
2. **Root Directory:** `frontend`
3. **Framework Preset:** Other
4. Deploy → copy the Vercel URL

If your Vercel URL does not end in `.vercel.app` (custom domain), add it to Railway env:
```
CORS_ALLOWED_ORIGINS=https://your-custom-domain.com
```

### 9. Send the share links

```
Victor: https://YOUR-VERCEL-URL/?api=https://YOUR-RAILWAY-URL&vtoken=VICTOR_TOKEN
Kaja:   https://YOUR-VERCEL-URL/?api=https://YOUR-RAILWAY-URL&ktoken=KAJA_TOKEN
Admin:  https://YOUR-VERCEL-URL/?api=https://YOUR-RAILWAY-URL&token=TEAM_VIEWER_SECRET
```

The admin link sees and edits both columns.

## How it works

- Browser saves changes to `localStorage` (instant) and pushes to the backend (debounced 600ms)
- Backend stores everything in Airtable; reading does a full pull on page load
- Each user has a per-user token; the admin secret bypasses all per-user checks
- No sign-in flow — auth is whoever has the URL with the right token

## API

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| GET | `/team/users` | none |
| POST | `/team/users` | `?token=<MASTER>` |
| GET/POST | `/team/:userId/checklist` | `?token=<user or master>` |
| GET/POST | `/team/:userId/schedule` | `?token=<user or master>` |
| GET/POST | `/team/:userId/fields` | `?token=<user or master>` |
| GET/POST | `/team/:userId/state` | `?token=<user or master>` |

## Local development

Backend:
```bash
cd backend && npm run dev
```

Frontend (any static server):
```bash
cd frontend && npx serve .
# then open: http://localhost:3000/?api=http://localhost:3000&token=YOUR_MASTER
```
(Note: if the backend is on port 3000 too, run the static server on a different port — `npx serve . -l 8080`.)
