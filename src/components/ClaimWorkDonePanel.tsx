// Work Done Report panel — item 2 of Wendy's 3 Nov 2026 asks.
//
// Sits above the claim lines editor. Upload the WDR for this claim's period,
// optionally scan it to prefill the quantities, review, then save the lines as
// usual. The scan NEVER writes: it fills the inputs and the team confirms, the
// same contract as the delivery-order scan.
//
// The WDR belongs to this claim's period alone and is deliberately not carried
// into the next claim; only the quantities carry forward, as previous periods.

import { useRef, useState } from "react";
import { FileText, Loader2, ScanLine, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { applyWdrScan, buildWdrRequest, rasterisePdf, requestWdrScan, type WdrApplied } from "@/lib/wdrScan";
import { uploadDocument, dbSetClaimWdr } from "@/data/db";

export interface WdrState {
  url: string;
  filename: string;
  periodFrom: string | null;
  periodTo: string | null;
}

interface ScanLine {
  id: string;
  pgRef: string;
  zone: string;
  description: string;
  unit: string;
  qty: number | null;
  prevQty: number | null;
}

interface Props {
  claimId: string;
  projectCode: string;
  claimNo: string | number;
  wdr: WdrState | null;
  onWdrChange: (w: WdrState | null) => void;
  /** The lines the scan maps onto — only saved lines have ids to match against. */
  lines: ScanLine[];
  /** Hand the prefill back to the editor; it decides how to merge it. */
  onPrefill: (applied: WdrApplied) => void;
}

export default function ClaimWorkDonePanel({
  claimId, projectCode, claimNo, wdr, onWdrChange, lines, onPrefill,
}: Props) {
  const [busy, setBusy] = useState<null | "upload" | "scan">(null);
  const [notes, setNotes] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Kept so "Scan" can re-read the pages without a second upload.
  const pdfRef = useRef<File | null>(null);

  const upload = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("The Work Done Report must be a PDF.");
      return;
    }
    setBusy("upload");
    try {
      const path = `claims/${claimId}/wdr-${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const url = await uploadDocument(path, file, "application/pdf");
      if (!url) throw new Error("Upload failed");
      const next: WdrState = { url, filename: file.name, periodFrom: wdr?.periodFrom ?? null, periodTo: wdr?.periodTo ?? null };
      await dbSetClaimWdr(claimId, next);
      pdfRef.current = file;
      onWdrChange(next);
      setNotes([]);
      toast.success("Work Done Report attached to this claim");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach the Work Done Report");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the Work Done Report from this claim? The quantities already entered stay.")) return;
    try {
      await dbSetClaimWdr(claimId, null);
      pdfRef.current = null;
      onWdrChange(null);
      setNotes([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the Work Done Report");
    }
  };

  const scan = async () => {
    const file = pdfRef.current;
    if (!file) {
      toast.error("Re-attach the PDF in this session to scan it — the file itself is not kept in the browser.");
      return;
    }
    if (!lines.length) {
      toast.error("Save the claim lines first, so the scan has items to map onto.");
      return;
    }
    setBusy("scan");
    setNotes([]);
    try {
      const pages = await rasterisePdf(file);
      const req = buildWdrRequest({ projectCode, claimNo }, lines, pages);
      const result = await requestWdrScan(req);
      const applied = applyWdrScan(result, lines);
      setNotes(applied.notes);
      if (!result.ok) {
        toast.error(applied.notes[0] ?? "Scan failed");
        return;
      }
      onPrefill(applied);
      if (applied.periodFrom || applied.periodTo) {
        onWdrChange({ ...(wdr as WdrState), periodFrom: applied.periodFrom, periodTo: applied.periodTo });
        await dbSetClaimWdr(claimId, { ...(wdr as WdrState), periodFrom: applied.periodFrom, periodTo: applied.periodTo });
      }
      toast.success(
        applied.matchedLines
          ? `Prefilled ${applied.matchedLines} line${applied.matchedLines === 1 ? "" : "s"} — check every figure, then save.`
          : "The scan read no quantities — enter them from the drawing.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not scan the Work Done Report");
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid="claim-wdr-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-card-foreground">
          <FileText className="h-3.5 w-3.5" />
          Work Done Report (this claim period)
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          />
          <button type="button" className={btn} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {wdr ? "Replace PDF" : "Upload WDR"}
          </button>
          <button type="button" className={btn} disabled={busy !== null || !pdfRef.current} onClick={() => void scan()}>
            {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
            Scan to prefill
          </button>
          {wdr && (
            <button type="button" className={btn} disabled={busy !== null} onClick={() => void remove()} aria-label="Remove WDR">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {wdr ? (
        <p className="text-[11px] text-muted-foreground">
          <a href={wdr.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{wdr.filename}</a>
          {" — appended to the printed claim as one PDF for the main contractor."}
          {!pdfRef.current && " Re-attach it in this session if you want to scan it."}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No report attached yet. The claim still prints without it.
        </p>
      )}

      {notes.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded border border-warning/40 bg-warning/10 px-4 py-2 text-[11px] text-card-foreground">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
