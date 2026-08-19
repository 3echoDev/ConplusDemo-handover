import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { fetchRecordHistory, type HistoryRow } from "@/data/db";
import { timeAgo } from "@/data/sampleData";

/** snake_case column names read badly to a client — title-case them. */
const prettyField = (k: string) =>
  k
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "")
    .replace(/\bpct\b/gi, "%")
    .replace(/\bqty\b/gi, "quantity")
    .replace(/\bpo\b/gi, "PO")
    .replace(/\bwo\b/gi, "WO")
    .replace(/\bdo\b/gi, "DO")
    .replace(/\bgst\b/gi, "GST")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

const shortValue = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
};

/** Columns that change on every write and say nothing useful. */
const NOISE = new Set(["updated_at", "created_at", "last_calculated_at"]);

function describe(row: HistoryRow): string {
  if (row.action === "insert") return "created this";
  if (row.action === "delete") return "deleted this";
  const fields = Object.entries(row.changed_fields ?? {}).filter(([k]) => !NOISE.has(k));
  if (fields.length === 0) return "made a change";
  const parts = fields
    .slice(0, 3)
    .map(([k, v]) => `${prettyField(k)} from ${shortValue(v.from)} to ${shortValue(v.to)}`);
  const more = fields.length > 3 ? ` and ${fields.length - 3} more` : "";
  return `changed ${parts.join(", ")}${more}`;
}

export default function ActivityLog({ recordId }: { recordId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["history", recordId],
    queryFn: () => fetchRecordHistory(recordId),
    staleTime: 15_000,
  });

  const rows = (data ?? []).filter(
    (r) => r.action !== "update" || Object.keys(r.changed_fields ?? {}).some((k) => !NOISE.has(k)),
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 bg-secondary/50 px-3 py-2">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Activity
        </span>
      </div>

      {isLoading ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          No changes recorded yet. Every edit from here on is logged with a name and a time.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-2.5 px-3 py-2.5 text-xs">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <span className="min-w-0 text-card-foreground">
                <b className="font-semibold">{r.performed_by_name}</b> {describe(r)}
                <span className="ml-1.5 text-muted-foreground">· {timeAgo(r.performed_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
