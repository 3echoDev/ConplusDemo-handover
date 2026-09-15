// Delivery-order scan: photo of the supplier's DO → prefilled receipt lines.
//
// The photo is downscaled in the browser and POSTed to the n8n webhook
// "Conplus — DO Scan" (docs/n8n/build_do_scan.mjs), which asks a vision model
// to read the DO number, the delivery date and, for each PO line we send it,
// the quantity delivered. The app then PREFILLS the "Receiving now" inputs —
// the person still checks every number and presses Log. Nothing is written by
// the scan itself (requirements PO-16..PO-20).
//
// Pure functions live here so they can be unit-tested; downscaleImage is the
// only browser-bound helper.

export const DO_SCAN_URL =
  (import.meta.env?.VITE_DO_SCAN_URL as string | undefined) ?? "https://threeecho.app.n8n.cloud/webhook/conplus-do-scan";
export const DO_SCAN_TOKEN = (import.meta.env?.VITE_CHASE_TOKEN as string | undefined) ?? "cnp_chase_8b21f4a9e6c3";

export interface ScanLineIn {
  line_id: string;
  description: string;
  qty: number;
  unit: string | null;
  outstanding: number;
}

export interface ScanRequest {
  po_number: string;
  supplier_name: string | null;
  lines: ScanLineIn[];
  image: { mime: string; base64: string };
}

export interface ScanLineOut {
  line_id: string;
  qty_received: number | null;
  note?: string | null;
}

export interface ScanResult {
  ok: boolean;
  reason?: string;
  do_number?: string | null;
  delivery_date?: string | null; // YYYY-MM-DD
  lines?: ScanLineOut[];
  unmatched?: { description: string; qty: number | null }[];
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}

export interface ScanApplied {
  doNumber: string | null;
  deliveryDate: string | null;
  receiving: Record<string, string>;
  /** Human-readable things to double-check, shown above the table. */
  notes: string[];
  matchedLines: number;
}

export function buildScanRequest(
  po: { po_number: string; supplier_name: string | null },
  lines: { id: string; description: string; qty: number; unit: string | null; qty_balance: number }[],
  image: { mime: string; base64: string },
): ScanRequest {
  return {
    po_number: po.po_number,
    supplier_name: po.supplier_name,
    lines: lines.map((l) => ({ line_id: l.id, description: l.description, qty: l.qty, unit: l.unit, outstanding: l.qty_balance })),
    image,
  };
}

const isoDate = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/**
 * Turn the scan result into form values. Quantities are clamped to the line's
 * outstanding balance (the RPC would reject more anyway) and every clamp,
 * unmatched DO line or model warning becomes a note for the person to read.
 */
export function applyScanResult(
  result: ScanResult,
  lines: { id: string; description: string; qty_balance: number }[],
  current: Record<string, string> = {},
): ScanApplied {
  const notes: string[] = [];
  const receiving: Record<string, string> = { ...current };
  let matched = 0;

  if (!result.ok) {
    return { doNumber: null, deliveryDate: null, receiving, notes: [result.reason ?? "Scan failed."], matchedLines: 0 };
  }

  const byId = new Map(lines.map((l) => [l.id, l]));
  const filled = new Set<string>();
  for (const s of result.lines ?? []) {
    const line = byId.get(s.line_id);
    if (!line) continue;
    if (s.qty_received == null || !Number.isFinite(Number(s.qty_received))) {
      if (s.note) notes.push(`${line.description}: ${s.note}`);
      continue;
    }
    filled.add(line.id);
    let q = Number(s.qty_received);
    if (q < 0) q = 0;
    if (q > line.qty_balance) {
      notes.push(`${line.description}: DO shows ${q}, only ${line.qty_balance} outstanding — set to ${line.qty_balance}.`);
      q = line.qty_balance;
    }
    receiving[line.id] = q > 0 ? String(q) : "";
    if (s.note) notes.push(`${line.description}: ${s.note}`);
    matched += 1;
  }
  // lines the DO did not give a figure for: leave blank rather than "receive everything"
  for (const l of lines) {
    if (!filled.has(l.id)) receiving[l.id] = "";
  }
  for (const u of result.unmatched ?? []) {
    notes.push(`On the DO but not on this PO: ${u.description}${u.qty != null ? ` × ${u.qty}` : ""}.`);
  }
  for (const w of result.warnings ?? []) notes.push(w);
  if (result.confidence === "low") notes.unshift("Low-confidence read — check every quantity against the paper DO.");

  return {
    doNumber: result.do_number?.toString().trim() || null,
    deliveryDate: isoDate(result.delivery_date),
    receiving,
    notes,
    matchedLines: matched,
  };
}

/** Browser only: shrink a photo to ≤ maxSide px JPEG and return base64 (no data: prefix). */
export async function downscaleImage(file: File, maxSide = 1600, quality = 0.85): Promise<{ mime: string; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { mime: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

/** POST the scan request to the n8n webhook. Throws on transport errors; returns {ok:false} on refusals. */
export async function requestDoScan(req: ScanRequest, signal?: AbortSignal): Promise<ScanResult> {
  const r = await fetch(DO_SCAN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Chase-Token": DO_SCAN_TOKEN },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) return { ok: false, reason: `Scan service returned ${r.status}` };
  const j = (await r.json()) as ScanResult | ScanResult[];
  return Array.isArray(j) ? j[0] : j;
}
