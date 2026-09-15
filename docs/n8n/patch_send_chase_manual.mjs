// Patches "Conplus — Send Chase (front-end trigger)" (PzNbj5Syi2OYAo2j) so the app can send a
// reminder on any day, not only on the 7-day marks: when the POST body carries manual:true the
// claim row is fetched without the needs_action_today filter and the reminder is logged as manual
// (counts in the sequence per the client's rule, does not move the cadence).
//   node docs/n8n/patch_send_chase_manual.mjs
import fs from "node:fs";

const env = fs.readFileSync("C:/Users/Muhsin/Desktop/Claude/.env", "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();
const KEY = get("N8N_CONPLUS_API_KEY");
const URL = (get("N8N_CONPLUS_API_URL") || "https://threeecho.app.n8n.cloud/api/v1").replace(/\/$/, "");
const ID = "PzNbj5Syi2OYAo2j";

async function api(p, init = {}) {
  const r = await fetch(`${URL}/${p}`, { ...init, headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${init.method || "GET"} ${p} → ${r.status}: ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : null;
}

const wf = await api(`workflows/${ID}`);
const http = wf.nodes.find((n) => n.name === "HTTP Chase Row");
const log = wf.nodes.find((n) => n.name === "Log chase reminder");
if (!http || !log) throw new Error("nodes not found");

const params = http.parameters.queryParameters.parameters;
const nat = params.find((p) => p.name === "needs_action_today");
if (!nat) throw new Error("needs_action_today param not found");
// PostgREST: in.(true,false) matches every row → filter effectively off for manual sends
nat.value = "={{ ($('Webhook').first().json.body || {}).manual ? 'in.(true,false)' : 'eq.true' }}";

if (!/p_is_manual: false/.test(log.parameters.jsonBody)) throw new Error("p_is_manual literal not found in Log node");
log.parameters.jsonBody = log.parameters.jsonBody.replace("p_is_manual: false", "p_is_manual: !!(($('Webhook').first().json.body || {}).manual)");

const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
await api(`workflows/${ID}`, { method: "PUT", body: JSON.stringify(body) });
await api(`workflows/${ID}/deactivate`, { method: "POST" });
await api(`workflows/${ID}/activate`, { method: "POST" });
console.log(`patched + re-activated ${ID}: manual sends allowed on any day, logged with p_is_manual=true`);
