# ConPlus AI Transformation — Demo App

React app for the ConPlus AI Transformation Suite, connected live to the shared Supabase database. It serves **both build plans** from one codebase:

| Mode | URL | What it is |
|---|---|---|
| **v1 — Full app** | `/` (Dashboard, Projects, Inventory, Purchase Orders, Documents) | Build Plan v1: the full web application. All buttons write to Supabase — create/approve/reject POs, update/add/transfer stock, approve/reject invoices, submit/certify claims. |
| **v2 — Live view** | `/v2` | Build Plan v2 companion: a lightweight read-only presentation screen. Operations are performed by talking to Claude (Claude Desktop + Supabase MCP, see `../claude-desktop-setup/`); this screen polls the database every ~7s so changes appear live. |

Both modes read and write the **same Supabase database**, so anything Claude does shows up in v1, and anything clicked in v1 shows up on the v2 screen.

## Setup

```sh
npm install
```

Create `.env.local` (not committed) with:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_KEY=<key>
```

> ⚠️ The demo currently uses the **service-role key** for simplicity. That is acceptable only for a locally-run demo — never deploy this publicly with that key. For a deployed version, switch to the anon key + RLS policies.

## Run

```sh
npm run dev   # http://localhost:8080  (v1) and http://localhost:8080/v2 (live view)
```

## Client deployment (Vercel) — live view only

The public client deployment serves **only the live view, at the root URL** and uses the **anon key** (read-only via RLS — anon has SELECT-only policies). Set these environment variables in Vercel:

```
VITE_SUPABASE_URL   = https://<project>.supabase.co
VITE_SUPABASE_KEY   = <anon public key>        # Dashboard → Settings → API. NEVER the service_role key.
VITE_LIVE_VIEW_ONLY = true
```

With `VITE_LIVE_VIEW_ONLY=true` every path renders the live view; the full app is not reachable. `vercel.json` handles the SPA rewrite.

## Data layer

- `src/lib/supabase.ts` — Supabase client
- `src/data/db.ts` — row types, DB→UI mappers, and all mutations (PO numbering follows ConPlus format `YYMM-NNNN`, GST 9%)
- `src/data/AppDataContext.tsx` — react-query polling (7s) + mutation wrappers with toasts
- `src/data/sampleData.ts` — UI types and formatting helpers only (mock arrays removed)

Stock status rule (matches the Claude Desktop project instructions): `qty <= 0` out, `<= 2` critical, `< threshold` low, else sufficient.

## Tech

Vite · React 18 · TypeScript · shadcn-ui · Tailwind CSS · TanStack Query · Supabase
