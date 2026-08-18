import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPdf, type ExportColumn } from "@/lib/exportData";

interface Props<T> {
  rows: T[];
  columns: ExportColumn<T>[];
  /** Used for the file name and the PDF header, e.g. "Project List". */
  title: string;
  disabled?: boolean;
}

export default function ExportMenu<T>({ rows, columns, title, disabled }: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const empty = disabled || rows.length === 0;

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !empty && setOpen((o) => !o)}
        disabled={empty}
        title={empty ? "Nothing to export" : `Export ${rows.length} rows`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-40 disabled:hover:bg-background"
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <button
            onClick={() => run(() => exportToExcel(rows, columns, fileName))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary/60"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-success" />
            <span className="flex-1">Excel</span>
            <span className="text-[10px] text-muted-foreground">.csv</span>
          </button>
          <button
            onClick={() => run(() => exportToPdf(rows, columns, title))}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs hover:bg-secondary/60"
          >
            <FileText className="h-3.5 w-3.5 text-destructive" />
            <span className="flex-1">PDF</span>
            <span className="text-[10px] text-muted-foreground">print</span>
          </button>
        </div>
      )}
    </div>
  );
}
