// Builds (or updates) the n8n workflow "Conplus — PO Approval Request (email)" on the
// 3echo cloud instance. Trigger: the app POSTs to the webhook when a PO enters
// 'pending'. Recipient is a SAFE SINK until GO_LIVE is flipped in the Prep node.
//   node docs/n8n/build_po_approval.mjs            # create/update (inactive → activates)
import fs from "node:fs";

const ENV = "C:/Users/Muhsin/Desktop/Claude/.env";
const env = fs.readFileSync(ENV, "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
const KEY = get("N8N_CONPLUS_API_KEY");
const URL = (get("N8N_CONPLUS_API_URL") || "https://threeecho.app.n8n.cloud/api/v1").replace(/\/$/, "");
const TOKEN = get("N8N_CONPLUS_CHASE_TOKEN") || "cnp_chase_8b21f4a9e6c3";
if (!KEY) throw new Error("N8N_CONPLUS_API_KEY missing");

const NAME = "Conplus — PO Approval Request (email)";
const SUPABASE = "https://ethxxhlpmfpnuaxeyshy.supabase.co";
const SUPABASE_CRED = { httpHeaderAuth: { id: "MUuLQ534ntlbgNp0", name: "Supabase apikey (Conplus)" } };
const GMAIL_CRED = { gmailOAuth2: { id: "tA8BzzJxbHJxIBJT", name: "Info 3echo" } };

const guardCode = `
const TOKEN = ${JSON.stringify(TOKEN)};
const req = $input.first().json;
const headers = req.headers || {};
if ((headers['x-chase-token'] || '') !== TOKEN) {
  return [{ json: { ok: false, status: 401, reason: 'bad token' } }];
}
const b = req.body || {};
const poId = b.po_id || b.record?.id;
if (!poId || !/^[0-9a-f-]{36}$/i.test(poId)) {
  return [{ json: { ok: false, status: 400, reason: 'po_id (uuid) required' } }];
}
return [{ json: { ok: true, po_id: poId, submitted_by: b.submitted_by || null } }];
`.trim();

const prepCode = `
// Flip to true only with Conplus' go-ahead: until then approval requests land in the handover mailbox.
const GO_LIVE = false;
const LIVE_TO = 'conplus@singnet.com.sg';
const SAFE_TO = 'muhsinsbasha@gmail.com';

const resp = $input.first().json;
const body = Array.isArray(resp.body) ? resp.body : (resp.body ? [resp.body] : []);
const po = body[0];
if (!po) return [{ json: { actionable: false, reason: 'PO not found' } }];
if (po.status !== 'pending') return [{ json: { actionable: false, reason: 'PO status is ' + po.status + ', not pending' } }];

const money = (n) => Number(n || 0).toLocaleString('en-SG', { style: 'currency', currency: 'SGD' });
const lines = (po.po_line_items || []).map((l, i) =>
  \`\${i + 1}. \${l.description}  —  \${Number(l.qty)} \${l.unit || ''} @ \${money(l.unit_price)} = \${money(l.total_price)}\`
).join('\\n');
const submittedBy = $('Guard & Route').first().json.submitted_by || po.submitted_by || po.requested_by || '—';

const subject = \`PO \${po.po_number} awaiting your approval — \${po.supplier_name || 'supplier'} \${money(po.total_amount)}\`;
const text = [
  'Dear Sir,',
  '',
  \`Purchase Order \${po.po_number} has been submitted for your approval.\`,
  '',
  \`Supplier: \${po.supplier_name || '—'}\`,
  \`Project / site: \${po.project_site || po.ship_to || '—'}\`,
  \`Works order: \${po.works_order || '—'}\`,
  \`Total: \${money(po.total_amount)}\`,
  \`Submitted by: \${submittedBy}\`,
  '',
  'Items:',
  lines || '(no line items)',
  '',
  'To APPROVE or REJECT, open Store Health and use the Pending approvals section:',
  'https://conplus-live.vercel.app/store/health',
  '',
  'Approve: select your name, click Approve on this PO.',
  'Reject: click Reject and enter the reason — the PO returns to draft for correction.',
  '',
  'Conplus Resources Pte Ltd — automated notification',
].join('\\n');

return [{ json: { actionable: true, to: GO_LIVE ? LIVE_TO : SAFE_TO, subject, text, po_number: po.po_number, go_live: GO_LIVE } }];
`.trim();

const nodes = [
  {
    parameters: { httpMethod: "POST", path: "conplus-po-approval", responseMode: "responseNode", options: {} },
    id: "wh", name: "Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "conplus-po-approval",
  },
  { parameters: { jsCode: guardCode }, id: "guard", name: "Guard & Route", type: "n8n-nodes-base.code", typeVersion: 2, position: [220, 0] },
  {
    parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose" }, conditions: [{ id: "c1", leftValue: "={{ $json.ok }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} },
    id: "ifok", name: "Valid request?", type: "n8n-nodes-base.if", typeVersion: 2, position: [440, 0],
  },
  {
    parameters: {
      url: `=${SUPABASE}/rest/v1/purchase_orders?id=eq.{{ $json.po_id }}&select=id,po_number,supplier_name,project_site,ship_to,works_order,total_amount,status,submitted_by,requested_by,po_line_items(description,qty,unit,unit_price,total_price)`,
      authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
      options: { response: { response: { fullResponse: true, neverError: true } } },
    },
    id: "fetch", name: "Fetch PO", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [660, -100], credentials: SUPABASE_CRED,
  },
  { parameters: { jsCode: prepCode }, id: "prep", name: "Prep email", type: "n8n-nodes-base.code", typeVersion: 2, position: [880, -100] },
  {
    parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose" }, conditions: [{ id: "c2", leftValue: "={{ $json.actionable }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} },
    id: "ifact", name: "Actionable?", type: "n8n-nodes-base.if", typeVersion: 2, position: [1100, -100],
  },
  {
    parameters: { sendTo: "={{ $json.to }}", subject: "={{ $json.subject }}", emailType: "text", message: "={{ $json.text }}", options: { appendAttribution: false } },
    id: "gmail", name: "Send approval request", type: "n8n-nodes-base.gmail", typeVersion: 2.1, position: [1320, -200], credentials: GMAIL_CRED,
  },
  {
    parameters: { respondWith: "json", responseBody: '={{ { ok: true, po_number: $(\'Prep email\').first().json.po_number, sent_to: $(\'Prep email\').first().json.to, go_live: $(\'Prep email\').first().json.go_live } }}', options: {} },
    id: "resp_ok", name: "Respond sent", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [1540, -200],
  },
  {
    parameters: { respondWith: "json", responseBody: "={{ { ok: false, reason: $json.reason } }}", options: {} },
    id: "resp_na", name: "Respond not actionable", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [1320, 20],
  },
  {
    parameters: { respondWith: "json", responseBody: "={{ { ok: false, reason: $json.reason } }}", options: { responseCode: "={{ $json.status || 400 }}" } },
    id: "resp_bad", name: "Respond bad request", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [660, 120],
  },
];
const connections = {
  Webhook: { main: [[{ node: "Guard & Route", type: "main", index: 0 }]] },
  "Guard & Route": { main: [[{ node: "Valid request?", type: "main", index: 0 }]] },
  "Valid request?": { main: [[{ node: "Fetch PO", type: "main", index: 0 }], [{ node: "Respond bad request", type: "main", index: 0 }]] },
  "Fetch PO": { main: [[{ node: "Prep email", type: "main", index: 0 }]] },
  "Prep email": { main: [[{ node: "Actionable?", type: "main", index: 0 }]] },
  "Actionable?": { main: [[{ node: "Send approval request", type: "main", index: 0 }], [{ node: "Respond not actionable", type: "main", index: 0 }]] },
  "Send approval request": { main: [[{ node: "Respond sent", type: "main", index: 0 }]] },
};
const body = { name: NAME, nodes, connections, settings: { executionOrder: "v1", timezone: "Asia/Singapore" } };

const api = async (p, init = {}) => {
  const r = await fetch(`${URL}/${p}`, { ...init, headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${init.method || "GET"} ${p} -> ${r.status}: ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
};
const existing = (await api("workflows?limit=250")).data.find((w) => w.name === NAME);
const wf = existing ? await api(`workflows/${existing.id}`, { method: "PUT", body: JSON.stringify(body) }) : await api("workflows", { method: "POST", body: JSON.stringify(body) });
if (!wf.active) await api(`workflows/${wf.id}/activate`, { method: "POST" });
console.log(`${existing ? "updated" : "created"} ${wf.id} ${NAME}; webhook: https://threeecho.app.n8n.cloud/webhook/conplus-po-approval`);
