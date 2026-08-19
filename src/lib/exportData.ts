// Export any table to Excel (CSV) or PDF (browser print), with no extra
// dependencies. PDF follows the same print-a-window approach as poDocument.ts.

export interface ExportColumn<T> {
  header: string;
  /** Value for the cell. Return a number for right-aligned numeric columns. */
  value: (row: T) => string | number | null | undefined;
}

const stamp = () => new Date().toISOString().slice(0, 10);

const cell = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

/* ─────────────── Excel (CSV) ─────────────── */

function toCsv<T>(rows: T[], cols: ExportColumn<T>[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [cols.map((c) => esc(c.header)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(cell(c.value(r)))).join(","));
  return lines.join("\r\n");
}

export function exportToExcel<T>(rows: T[], cols: ExportColumn<T>[], name: string): void {
  // BOM so Excel reads UTF-8 correctly (client names contain accents).
  const blob = new Blob(["\uFEFF" + toCsv(rows, cols)], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${stamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/* ─────────────── PDF (print) ─────────────── */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function exportToPdf<T>(rows: T[], cols: ExportColumn<T>[], title: string): void {
  const head = cols
    .map((c) => `<th${typeof rows[0] !== "undefined" && typeof c.value(rows[0]) === "number" ? ' class="r"' : ""}>${escapeHtml(c.header)}</th>`)
    .join("");

  const body = rows
    .map((r) => {
      const tds = cols
        .map((c) => {
          const v = c.value(r);
          const numeric = typeof v === "number";
          const text = numeric ? v.toLocaleString("en-SG", { maximumFractionDigits: 2 }) : cell(v);
          return `<td${numeric ? ' class="r"' : ""}>${escapeHtml(text)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-end;
          border-bottom: 2.5px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  .co { font-size: 17px; font-weight: 800; letter-spacing: .5px; }
  .sub { font-size: 11px; color: #555; margin-top: 2px; }
  .meta { text-align: right; font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f2f4f8; text-align: left; font-size: 10px; text-transform: uppercase;
       letter-spacing: .4px; padding: 6px 8px; border-bottom: 1.5px solid #ccc; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #fbfcfe; }
  .r { text-align: right; }
  tfoot td { border-top: 1.5px solid #ccc; font-weight: 700; }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="co">CONPLUS RESOURCES PTE LTD</div>
      <div class="sub">${escapeHtml(title)}</div>
    </div>
    <div class="meta">
      ${rows.length} record${rows.length === 1 ? "" : "s"}<br />
      ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
    </div>
  </div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

/* ─────────────── Single-record export ─────────────── */

/** A section of a single-record export: a heading plus label/value pairs or a table. */
export interface RecordSection {
  heading: string;
  fields?: { label: string; value: string | number | null | undefined }[];
  table?: { headers: string[]; rows: (string | number | null | undefined)[][] };
}

/**
 * One record to CSV — header fields stacked, then any tables underneath.
 * Opens in Excel keeping the document's shape rather than flattening to one row.
 */
export function exportRecordToExcel(sections: RecordSection[], name: string): void {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  for (const sec of sections) {
    lines.push(esc(sec.heading.toUpperCase()));
    for (const f of sec.fields ?? []) lines.push(`${esc(f.label)},${esc(f.value)}`);
    if (sec.table) {
      lines.push(sec.table.headers.map(esc).join(","));
      for (const r of sec.table.rows) lines.push(r.map(esc).join(","));
    }
    lines.push("");
  }
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${stamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
