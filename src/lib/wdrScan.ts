// Work Done Report scan: the WDR PDF → prefilled work-done periods.
//
// Same shape as the delivery-order scan (doScan.ts) and the same n8n instance:
// the PDF pages are rasterised in the browser and POSTed to the webhook
// "Conplus — WDR Scan" (docs/n8n/build_wdr_scan.mjs), which asks a vision model
// for the work period and, for each claim line we send it, the quantity done in
// that period. The result PREFILLS the breakdown — the team still reviews and
// presses Confirm (Wendy, 3 Nov 2026). Nothing is written by the scan itself.
//
// Why vision and not a table parse: in the client's own sample the WDR form's
// QUANTITY and LOCATION columns are blank, and the figure that reaches the claim
// (107.64 m²) is a handwritten take-off on the marked-up floor plan behind it
// ("5m x 2m = 10m²" … "= 107.635m²"). Expect to correct it; never trust it.

export const WDR_SCAN_URL =
  (import.meta.env?.VITE_WDR_SCAN_URL as string | undefined) ?? "https://threeecho.app.n8n.cloud/webhook/conplus-wdr-scan";
export const WDR_SCAN_TOKEN = (import.meta.env?.VITE_CHASE_TOKEN as string | undefined) ?? "cnp_chase_8b21f4a9e6c3";

export interface WdrScanLineIn {
  line_id: string;
  pg_ref: string;
  zone: string;
  description: string;
  unit: string | null;
  /** Priced quantity, so the model can sanity-check its own reading. */
  qty: number | null;
  /** Already claimed in earlier periods. */
  claimed: number;
}

export interface WdrScanRequest {
  project_code: string;
  claim_no: string | number;
  lines: WdrScanLineIn[];
  /** One entry per page of the WDR, in order. */
  pages: { mime: string; base64: string }[];
}

export interface WdrScanLineOut {
  line_id: string;
  qty: number | null;
  location?: string | null;
  note?: string | null;
}

export interface WdrScanResult {
  ok: boolean;
  reason?: string;
  period_from?: string | null; // YYYY-MM-DD
  period_to?: string | null;
  lines?: WdrScanLineOut[];
  unmatched?: { description: string; qty: number | null }[];
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}

export interface WdrApplied {
  periodFrom: string | null;
  periodTo: string | null;
  /** line id → { qty, location } for the CURRENT period only. */
  current: Record<string, { qty: number; location: string }>;
  notes: string[];
  matchedLines: number;
}

export function buildWdrRequest(
  claim: { projectCode: string; claimNo: string | number },
  lines: { id: string; pgRef: string; zone: string; description: string; unit: string; qty: number | null; prevQty: number | null }[],
  pages: { mime: string; base64: string }[],
): WdrScanRequest {
  return {
    project_code: claim.projectCode,
    claim_no: claim.claimNo,
    lines: lines.map((l) => ({
      line_id: l.id,
      pg_ref: l.pgRef,
      zone: l.zone,
      description: l.description,
      unit: l.unit || null,
      qty: l.qty,
      claimed: l.prevQty ?? 0,
    })),
    pages,
  };
}

const isoDate = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/**
 * Turn a scan result into prefill values for the current period. A quantity that
 * would take a line past its priced quantity is capped and called out — over-claiming
 * an item is the one mistake the main contractor always rejects.
 */
export function applyWdrScan(
  result: WdrScanResult,
  lines: { id: string; description: string; qty: number | null; prevQty: number | null }[],
): WdrApplied {
  const notes: string[] = [];
  const current: Record<string, { qty: number; location: string }> = {};

  if (!result.ok) {
    return { periodFrom: null, periodTo: null, current, notes: [result.reason ?? "Scan failed."], matchedLines: 0 };
  }

  const byId = new Map(lines.map((l) => [l.id, l]));
  let matched = 0;
  for (const s of result.lines ?? []) {
    const line = byId.get(s.line_id);
    if (!line) continue;
    const location = (s.location ?? "").toString().trim();
    if (s.qty == null || !Number.isFinite(Number(s.qty))) {
      if (s.note) notes.push(`${line.description.split("\n")[0]}: ${s.note}`);
      continue;
    }
    let q = Number(s.qty);
    if (q < 0) q = 0;
    const priced = line.qty;
    const already = line.prevQty ?? 0;
    if (priced != null && already + q > priced) {
      const room = Math.max(0, Math.round((priced - already) * 100) / 100);
      notes.push(
        `${line.description.split("\n")[0]}: WDR reads ${q}, but only ${room} of the priced ${priced} is left — set to ${room}.`,
      );
      q = room;
    }
    current[line.id] = { qty: q, location };
    if (s.note) notes.push(`${line.description.split("\n")[0]}: ${s.note}`);
    matched += 1;
  }

  for (const u of result.unmatched ?? []) {
    notes.push(`On the WDR but not on this claim: ${u.description}${u.qty != null ? ` × ${u.qty}` : ""}.`);
  }
  for (const w of result.warnings ?? []) notes.push(w);
  if (result.confidence === "low" || matched === 0) {
    notes.unshift("Quantities on a WDR are usually handwritten on the drawing — check every figure before confirming.");
  }

  return {
    periodFrom: isoDate(result.period_from),
    periodTo: isoDate(result.period_to),
    current,
    notes,
    matchedLines: matched,
  };
}

/** Browser only: rasterise every page of a PDF to JPEG base64 (no data: prefix). */
export async function rasterisePdf(file: File, maxSide = 1800, quality = 0.82): Promise<{ mime: string; base64: string }[]> {
  return rasterisePdfData(await file.arrayBuffer(), maxSide, quality);
}

/**
 * Same, for a PDF already stored in the documents bucket. Used by the print to
 * append the Work Done Report behind the claim so the whole submission to the
 * main contractor comes out of one Save-as-PDF.
 */
export async function rasterisePdfUrl(url: string, maxSide = 1800, quality = 0.82): Promise<{ mime: string; base64: string }[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not read the Work Done Report (${r.status})`);
  return rasterisePdfData(await r.arrayBuffer(), maxSide, quality);
}

async function rasterisePdfData(data: ArrayBuffer, maxSide: number, quality: number): Promise<{ mime: string; base64: string }[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data }).promise;
  const out: { mime: string; base64: string }[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, maxSide / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    out.push({ mime: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}

/** POST the scan request to the n8n webhook. Throws on transport errors; returns {ok:false} on refusals. */
export async function requestWdrScan(req: WdrScanRequest, signal?: AbortSignal): Promise<WdrScanResult> {
  const r = await fetch(WDR_SCAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Chase-Token": WDR_SCAN_TOKEN },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) return { ok: false, reason: `Scan service returned ${r.status}` };
  const j = (await r.json()) as WdrScanResult | WdrScanResult[];
  return Array.isArray(j) ? j[0] : j;
}
