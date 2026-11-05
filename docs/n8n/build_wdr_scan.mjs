// Builds (or updates) the n8n workflow "Conplus — WDR Scan" on the 3echo cloud instance.
//
// Item 2 of Wendy's 3 Nov 2026 asks. The claim lines editor POSTs every page of
// the Work Done Report (rasterised in the browser) plus the claim's priced
// items; the workflow asks a vision model for the work period and, per item,
// the quantity done in that period, and returns JSON the editor uses to
// PREFILL the work-done breakdown. Nothing is written to Supabase here — the
// team reviews and presses Save, exactly like the DO scan.
//
//   node docs/n8n/build_wdr_scan.mjs        # create/update + activate
//
// Worth knowing before you trust a reading: on the client's own sample the WDR
// form's QUANTITY and LOCATION columns are BLANK, and the figure that reaches
// the claim (107.64 m²) is a handwritten take-off on the marked-up floor plan
// behind it ("5m x 2m = 10m²" … "= 107.635m²"). The model is asked to add those
// up and to say so in its note; the person still checks it against the drawing.
//
// Auth: the same X-Chase-Token header the chase sender and the DO scan use.
import fs from "node:fs";

const ENV = "C:/Users/Muhsin/Desktop/Claude/.env";
const env = fs.readFileSync(ENV, "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
const KEY = get("N8N_CONPLUS_API_KEY");
const URL = (get("N8N_CONPLUS_API_URL") || "https://threeecho.app.n8n.cloud/api/v1").replace(/\/$/, "");
const TOKEN = get("N8N_CONPLUS_CHASE_TOKEN") || "cnp_chase_8b21f4a9e6c3";
if (!KEY) throw new Error("N8N_CONPLUS_API_KEY missing");

const NAME = "Conplus — WDR Scan (front-end trigger)";
const OPENAI_CRED = { openAiApi: { id: "BQfCGKf0sLl10lgn", name: "3echodev OpenAi account" } };
const MODEL = "gpt-4o";
const MAX_PAGES = 6;

const guardCode = `
const TOKEN = ${JSON.stringify(TOKEN)};
const req = $input.first().json;
const headers = req.headers || {};
if ((headers['x-chase-token'] || '') !== TOKEN) {
  return [{ json: { ok: false, reason: 'bad token' } }];
}
const b = req.body || {};
if (!Array.isArray(b.pages) || b.pages.length === 0) {
  return [{ json: { ok: false, reason: 'pages[] of {mime, base64} required' } }];
}
if (!Array.isArray(b.lines) || b.lines.length === 0) {
  return [{ json: { ok: false, reason: 'lines[] required — save the claim lines first' } }];
}
const pages = b.pages.slice(0, ${MAX_PAGES});
const total = pages.reduce((s, p) => s + ((p && p.base64) ? p.base64.length : 0), 0);
if (total > 18_000_000) {
  return [{ json: { ok: false, reason: 'report too large — rescan at a lower resolution' } }];
}
for (const p of pages) {
  if (!p || !p.base64 || !p.mime) return [{ json: { ok: false, reason: 'every page needs {mime, base64}' } }];
}
return [{ json: {
  ok: true,
  project_code: String(b.project_code || ''),
  claim_no: String(b.claim_no || ''),
  truncated: b.pages.length > ${MAX_PAGES},
  lines: b.lines.map(l => ({
    line_id: String(l.line_id),
    pg_ref: String(l.pg_ref || ''),
    zone: String(l.zone || ''),
    description: String(l.description || '').replace(/\\s+/g, ' ').slice(0, 300),
    unit: l.unit || null,
    qty: l.qty == null ? null : Number(l.qty),
    claimed: Number(l.claimed || 0),
  })),
  data_urls: pages.map(p => 'data:' + p.mime + ';base64,' + p.base64),
} }];
`.trim();

const SYSTEM = `You read Work Done Reports (WDR) for a Singapore epoxy-flooring sub-contractor and map them onto the items of a progress claim.
A WDR packet is usually a printed form page followed by one or more marked-up architectural drawings.
Return ONLY a JSON object with this shape:
{
  "period_from": "YYYY-MM-DD"|null,   // the form's WORK PERIOD "START FROM"
  "period_to": "YYYY-MM-DD"|null,     // the form's "COMPLETION"
  "lines": [ { "line_id": string, "qty": number|null, "location": string|null, "note": string|null } ],
  "unmatched": [ { "description": string, "qty": number|null } ],
  "confidence": "high"|"medium"|"low",
  "warnings": [string]
}
Rules:
- "qty" is the quantity done in THIS period only, in that claim line's unit. It is NOT cumulative and must never include the "already claimed" figure you were given.
- The form's QUANTITY column is often blank. The real figure is usually handwritten on the drawing as a set of take-offs, e.g. "5m x 2m = 10m²", "2.8 x 2.7 = 7.56m²", often with a circled grand total. Add the take-offs up, prefer a handwritten grand total when one is shown, and put the arithmetic you used in "note".
- Match a take-off to a claim line by the room or zone it is drawn in and by the surface (floor / wall / ceiling / upturn), using the line's zone and description. If you cannot tell which line a figure belongs to, put it in "unmatched" rather than guessing.
- Use null for any line the report does not cover. Do not spread one total across several lines.
- Never return a qty that would take a line past its priced quantity; if your reading would, return the reading anyway and say so in "warnings".
- "location" is the place as written on the report ("1st Storey", a grid line, a room name).
- Do not invent numbers. If handwriting is illegible, use null and explain in "warnings".
- Dates written DD/MM/YYYY, DD/MM/YY or DD.MM.YY are day-first. A two-digit year is 20YY (23/08/26 → 2026-08-23). These documents are from 2025 onwards.`;

const buildBody = `={{ JSON.stringify({
  model: ${JSON.stringify(MODEL)},
  temperature: 0,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: ${JSON.stringify(SYSTEM)} },
    { role: 'user', content: [
      { type: 'text', text: 'Project ' + $json.project_code + ', progress claim ' + $json.claim_no + '. Claim lines (line_id | S/N | zone | description | priced qty unit | already claimed):\\n' + $json.lines.map(l => l.line_id + ' | ' + l.pg_ref + ' | ' + l.zone + ' | ' + l.description + ' | ' + (l.qty == null ? '?' : l.qty) + ' ' + (l.unit || '') + ' | ' + l.claimed).join('\\n') + '\\n\\nThe attached ' + $json.data_urls.length + ' page(s) are the Work Done Report for this period' + ($json.truncated ? ' (later pages were dropped — say so in warnings)' : '') + '. Read them and fill the JSON.' }
    ].concat($json.data_urls.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'high' } }))) }
  ]
}) }}`;

const parseCode = `
const resp = $input.first().json;
const body = resp.body ?? resp;
let text = body?.choices?.[0]?.message?.content ?? '';
if (typeof text !== 'string') text = JSON.stringify(text);
let out;
try { out = JSON.parse(text); }
catch (e) {
  const m = text.match(/\\{[\\s\\S]*\\}/);
  try { out = m ? JSON.parse(m[0]) : null; } catch (e2) { out = null; }
}
if (!out || typeof out !== 'object') {
  return [{ json: { ok: false, reason: 'model returned no JSON', raw: String(text).slice(0, 400) } }];
}
const guard = $('Guard').first().json;
const known = new Set((guard.lines || []).map(l => l.line_id));
const lines = Array.isArray(out.lines) ? out.lines.filter(l => l && known.has(String(l.line_id))).map(l => ({
  line_id: String(l.line_id),
  qty: (l.qty === null || l.qty === undefined || l.qty === '') ? null : Number(l.qty),
  location: l.location ? String(l.location) : null,
  note: l.note ? String(l.note) : null,
})) : [];
const warnings = Array.isArray(out.warnings) ? out.warnings.map(String) : [];
if (guard.truncated) warnings.push('Only the first ${MAX_PAGES} pages of the report were read.');
return [{ json: {
  ok: true,
  period_from: out.period_from ? String(out.period_from) : null,
  period_to: out.period_to ? String(out.period_to) : null,
  lines,
  unmatched: Array.isArray(out.unmatched) ? out.unmatched.map(u => ({ description: String(u.description || ''), qty: u.qty == null ? null : Number(u.qty) })) : [],
  confidence: ['high','medium','low'].includes(out.confidence) ? out.confidence : 'medium',
  warnings,
  model: ${JSON.stringify(MODEL)},
} }];
`.trim();

const nodes = [
  {
    parameters: { httpMethod: "POST", path: "conplus-wdr-scan", responseMode: "lastNode", options: {} },
    id: "n-webhook", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0],
    // webhookId must be set or the production webhook never registers via the API.
    webhookId: "a7f3b914-2c58-4de6-8a1f-conpluswdrscan",
  },
  { parameters: { jsCode: guardCode }, id: "n-guard", name: "Guard", type: "n8n-nodes-base.code", typeVersion: 2, position: [220, 0] },
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: "strict", version: 2 },
        conditions: [{ id: "c1", leftValue: "={{ $json.ok }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }],
        combinator: "and",
      },
      options: {},
    },
    id: "n-if", name: "Valid?", type: "n8n-nodes-base.if", typeVersion: 2, position: [440, 0],
  },
  {
    parameters: {
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "openAiApi",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
      sendBody: true,
      specifyBody: "json",
      jsonBody: buildBody,
      // Several full-page drawings at detail:high take longer than one DO photo.
      options: { timeout: 180000, response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "n-openai", name: "Read WDR (vision)", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [680, -80],
    credentials: OPENAI_CRED,
  },
  { parameters: { jsCode: parseCode }, id: "n-parse", name: "Parse result", type: "n8n-nodes-base.code", typeVersion: 2, position: [920, -80] },
  {
    parameters: { jsCode: "return [{ json: { ok: false, reason: $json.reason || 'rejected' } }];" },
    id: "n-reject", name: "Rejected", type: "n8n-nodes-base.code", typeVersion: 2, position: [680, 120],
  },
];

const connections = {
  Webhook: { main: [[{ node: "Guard", type: "main", index: 0 }]] },
  Guard: { main: [[{ node: "Valid?", type: "main", index: 0 }]] },
  "Valid?": { main: [[{ node: "Read WDR (vision)", type: "main", index: 0 }], [{ node: "Rejected", type: "main", index: 0 }]] },
  "Read WDR (vision)": { main: [[{ node: "Parse result", type: "main", index: 0 }]] },
};

const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "Asia/Singapore", saveManualExecutions: true } };

async function api(p, init = {}) {
  const r = await fetch(`${URL}/${p}`, { ...init, headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${init.method || "GET"} ${p} → ${r.status}: ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : null;
}

const list = await api("workflows?limit=250");
const existing = (list.data || []).find((w) => w.name === NAME);
const wf = existing ? await api(`workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(body) }) : await api("workflows", { method: "POST", body: JSON.stringify(body) });
// re-register the webhook: deactivate → activate (a PUT on an active workflow does not re-register)
if (wf.active) await api(`workflows/${wf.id}/deactivate`, { method: "POST" });
await api(`workflows/${wf.id}/activate`, { method: "POST" });
console.log(`${existing ? "updated" : "created"} ${wf.id} "${NAME}" → POST https://threeecho.app.n8n.cloud/webhook/conplus-wdr-scan`);
