# n8n "Conplus — Send Chase (front-end trigger)" — CC / BCC pass-through

Workflow id `PzNbj5Syi2OYAo2j` on threeecho.app.n8n.cloud. The Chase page now sends
`cc` and `bcc` (comma-separated) in both the query string and the JSON body of the
POST to `/webhook/conplus-send-chase`. Two edits make the Gmail node use them.
The `GO_LIVE` safe sink is kept: until it is `true`, CC/BCC stay empty just as
`to` is overridden to the handover inbox.

**Status: APPLIED 2 Nov 2026 (pm) over the REST API** (workflow versionId
`1421622f-7908-405c-816c-d0beea026d5d`, left active). The edits below are the
record of what changed; re-apply by hand only if the workflow is ever restored
from an older version.

## 1. Node "Prep email" (Code)

After this line:

```js
const emailTo = (GO_LIVE && appTo) ? appTo : SAFE_TO;
```

insert:

```js
// CC / BCC from the Chase page (projects.chase_cc / chase_bcc, comma-separated); same GO_LIVE gate.
const list = (v) => Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/).filter(Boolean);
const qq = $('Webhook').first().json.query || {};
const emailCc = GO_LIVE ? list(wb.cc || qq.cc).join(',') : '';
const emailBcc = GO_LIVE ? list(wb.bcc || qq.bcc).join(',') : '';
```

and in the final `return`, change

```js
clock, stage: r.stage, emailTo, subject, body,
```

to

```js
clock, stage: r.stage, emailTo, emailCc, emailBcc, subject, body,
```

## 2. Node "Send Gmail"

Options → add **CC** = `{{ $json.emailCc || '' }}` and **BCC** = `{{ $json.emailBcc || '' }}`
(parameters `options.ccList` / `options.bccList`).

## Check

Send now from a Payment chase card whose project has a CC saved. With `GO_LIVE=false`
the mail still lands only in the handover inbox and the execution's "Prep email"
output shows `emailCc: ""`. Flip `GO_LIVE` only on the client's go-ahead (fixes log item 30).
