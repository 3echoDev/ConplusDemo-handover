// Patches the live n8n workflow "Conplus — Send Chase (front-end trigger)" (PzNbj5Syi2OYAo2j)
// so the email the app previews is the email n8n sends: the app now POSTs a JSON
// body {to, subject, body}; the "Prep email" node uses those when present and only
// falls back to its old built-in wording when they are missing.
//
// Recipient stays the SAFE SINK (handover inbox) until GO_LIVE is flipped here.
//   node docs/n8n/patch_send_chase_body.mjs
import fs from "node:fs";

const ENV = "C:/Users/Muhsin/Desktop/Claude/.env";
const env = fs.readFileSync(ENV, "utf8");
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
const prep = wf.nodes.find((n) => n.name === "Prep email");
if (!prep) throw new Error("Prep email node not found");
if (!/SAFE SINK/.test(prep.parameters.jsCode)) throw new Error("unexpected Prep code — refusing to patch blindly");

const OLD_TO = "const emailTo = 'muhsinsbasha@gmail.com';";
const NEW_TO = `// App-supplied recipient / wording (POST JSON body from the Chase page). Recipient is
// honoured only when GO_LIVE is true; until then everything lands in the handover inbox.
const GO_LIVE = false;
const SAFE_TO = 'muhsinsbasha@gmail.com';
const wb = ($('Webhook').first().json.body) || {};
const appTo = (wb.to || $('Webhook').first().json.query?.to || '').trim();
const emailTo = (GO_LIVE && appTo) ? appTo : SAFE_TO;`;
if (!prep.parameters.jsCode.includes(OLD_TO) && !prep.parameters.jsCode.includes("const GO_LIVE = false;")) throw new Error("emailTo line not found");
let code = prep.parameters.jsCode.replace(OLD_TO, NEW_TO);

const OLD_RET = "return [{ json: { actionable: true, claim_id: r.claim_id, claim_number: r.claim_number, clock, stage: r.stage, emailTo, subject, body } }];";
const NEW_RET = `if (wb.subject && String(wb.subject).trim()) subject = String(wb.subject).trim();
if (wb.body && String(wb.body).trim()) body = String(wb.body);
return [{ json: { actionable: true, claim_id: r.claim_id, claim_number: r.claim_number, clock, stage: r.stage, emailTo, subject, body, from_app: !!(wb.subject || wb.body) } }];`;
if (!code.includes(OLD_RET) && !code.includes("from_app:")) throw new Error("return line not found");
code = code.replace(OLD_RET, NEW_RET);
prep.parameters.jsCode = code;

const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
await api(`workflows/${ID}`, { method: "PUT", body: JSON.stringify(body) });
await api(`workflows/${ID}/deactivate`, { method: "POST" });
await api(`workflows/${ID}/activate`, { method: "POST" });
console.log(`patched + re-activated ${ID} "${wf.name}" — Prep email now honours app subject/body; recipient safe-sinked until GO_LIVE`);
