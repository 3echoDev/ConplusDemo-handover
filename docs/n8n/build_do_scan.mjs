// Builds (or updates) the n8n workflow "Conplus — DO Scan" on the 3echo cloud instance.
//
// The Deliveries page POSTs a downscaled photo of a supplier delivery order plus
// the PO's line items; the workflow asks a vision model to read the DO number,
// the delivery date and the delivered quantity per PO line, and returns JSON
// the page uses to PREFILL the receipt form. Nothing is written to Supabase
// here — the person reviews and presses Log.
//
//   node docs/n8n/build_do_scan.mjs        # create/update + activate
//
// Auth: same X-Chase-Token header the chase sender uses (N8N_CONPLUS_CHASE_TOKEN).
// Model: OpenAI via the org's existing n8n credential (no Anthropic credential
// exists on this instance). Swap OPENAI_CRED / MODEL below if that changes.
import fs from "node:fs";

const ENV = "C:/Users/Muhsin/Desktop/Claude/.env";
const env = fs.readFileSync(ENV, "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
const KEY = get("N8N_CONPLUS_API_KEY");
const URL = (get("N8N_CONPLUS_API_URL") || "https://threeecho.app.n8n.cloud/api/v1").replace(/\/$/, "");
const TOKEN = get("N8N_CONPLUS_CHASE_TOKEN") || "cnp_chase_8b21f4a9e6c3";
if (!KEY) throw new Error("N8N_CONPLUS_API_KEY missing");

const NAME = "Conplus — DO Scan (front-end trigger)";
const OPENAI_CRED = { openAiApi: { id: "BQfCGKf0sLl10lgn", name: "3echodev OpenAi account" } };
const MODEL = "gpt-4o";

const guardCode = `
const TOKEN = ${JSON.stringify(TOKEN)};
const req = $input.first().json;
const headers = req.headers || {};
if ((headers['x-chase-token'] || '') !== TOKEN) {
  return [{ json: { ok: false, reason: 'bad token' } }];
}
const b = req.body || {};
if (!b.image || !b.image.base64 || !b.image.mime) {
  return [{ json: { ok: false, reason: 'image {mime, base64} required' } }];
}
if (!Array.isArray(b.lines)) {
  return [{ json: { ok: false, reason: 'lines[] required' } }];
}
if (b.image.base64.length > 6_000_000) {
  return [{ json: { ok: false, reason: 'image too large — retake closer or use a smaller photo' } }];
}
return [{ json: {
  ok: true,
  po_number: String(b.po_number || ''),
  supplier_name: b.supplier_name || null,
  lines: b.lines.map(l => ({ line_id: String(l.line_id), description: String(l.description || ''), qty: Number(l.qty || 0), unit: l.unit || null, outstanding: Number(l.outstanding || 0) })),
  data_url: 'data:' + b.image.mime + ';base64,' + b.image.base64,
} }];
`.trim();

const SYSTEM = `You read supplier delivery orders (DO) for a Singapore flooring contractor and match them to a purchase order.
Return ONLY a JSON object with this shape:
{
  "do_number": string|null,          // the supplier's DO / delivery note number as printed
  "delivery_date": "YYYY-MM-DD"|null, // the delivery or document date on the DO
  "lines": [ { "line_id": string, "qty_received": number|null, "note": string|null } ],
  "unmatched": [ { "description": string, "qty": number|null } ],
  "confidence": "high"|"medium"|"low",
  "warnings": [string]
}
Rules:
- "lines" must contain one entry per PO line you were given, using the given line_id. qty_received is the quantity delivered for that line on THIS DO, in the PO line's unit; null if the DO does not list that item.
- Match by product name, colour/RAL code and pack size; ignore minor wording differences. Never merge two different colours.
- Anything on the DO that matches no PO line goes in "unmatched".
- Do not invent numbers. If a figure is illegible, use null and explain in "warnings".
- Dates written DD/MM/YYYY, DD/MM/YY or DD.MM.YY are day-first. A two-digit year is 20YY (24/07/26 → 2026-07-24). These documents are from 2025 onwards.`;

const buildBody = `={{ JSON.stringify({
  model: ${JSON.stringify(MODEL)},
  temperature: 0,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: ${JSON.stringify(SYSTEM)} },
    { role: 'user', content: [
      { type: 'text', text: 'Purchase order ' + $json.po_number + ($json.supplier_name ? ' from ' + $json.supplier_name : '') + '. PO lines (line_id | description | ordered qty unit | still outstanding):\\n' + $json.lines.map(l => l.line_id + ' | ' + l.description + ' | ' + l.qty + ' ' + (l.unit || '') + ' | ' + l.outstanding).join('\\n') + '\\n\\nRead the attached delivery order and fill the JSON.' },
      { type: 'image_url', image_url: { url: $json.data_url, detail: 'high' } }
    ] }
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
const known = new Set(($('Guard').first().json.lines || []).map(l => l.line_id));
const lines = Array.isArray(out.lines) ? out.lines.filter(l => l && known.has(String(l.line_id))).map(l => ({
  line_id: String(l.line_id),
  qty_received: (l.qty_received === null || l.qty_received === undefined || l.qty_received === '') ? null : Number(l.qty_received),
  note: l.note ? String(l.note) : null,
})) : [];
return [{ json: {
  ok: true,
  do_number: out.do_number ? String(out.do_number) : null,
  delivery_date: out.delivery_date ? String(out.delivery_date) : null,
  lines,
  unmatched: Array.isArray(out.unmatched) ? out.unmatched.map(u => ({ description: String(u.description || ''), qty: u.qty == null ? null : Number(u.qty) })) : [],
  confidence: ['high','medium','low'].includes(out.confidence) ? out.confidence : 'medium',
  warnings: Array.isArray(out.warnings) ? out.warnings.map(String) : [],
  model: ${JSON.stringify(MODEL)},
} }];
`.trim();

const nodes = [
  {
    parameters: { httpMethod: "POST", path: "conplus-do-scan", responseMode: "lastNode", options: {} },
    id: "n-webhook", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0],
    webhookId: "c0e1a5d2-7d0c-4f6e-9b3a-conplusdoscan",
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
      options: { timeout: 90000, response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "n-openai", name: "Read DO (vision)", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [680, -80],
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
  "Valid?": { main: [[{ node: "Read DO (vision)", type: "main", index: 0 }], [{ node: "Rejected", type: "main", index: 0 }]] },
  "Read DO (vision)": { main: [[{ node: "Parse result", type: "main", index: 0 }]] },
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
console.log(`${existing ? "updated" : "created"} ${wf.id} "${NAME}" → POST https://threeecho.app.n8n.cloud/webhook/conplus-do-scan`);
