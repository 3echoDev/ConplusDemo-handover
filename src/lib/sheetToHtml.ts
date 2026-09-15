// Render an ExcelJS worksheet as print HTML that looks like the sheet itself:
// merges, fills, fonts, borders, alignment, column widths, row heights and
// number formats are honoured, formula cells show their cached result.
//
// Used by the Progress Claim "Print / PDF" so the PDF is the client's Excel
// master page for page (the client's own PDF is exactly that: the workbook
// printed), instead of a separately designed HTML layout.

import type ExcelJS from "exceljs";

export interface SheetRenderOptions {
  /** Print area "B13:Q80"; defaults to the sheet's pageSetup.printArea, else the used range. */
  range?: string;
  /** Rows to repeat at the top of every printed page (Excel "print titles"), e.g. "1:12". */
  titleRows?: string;
  /** Replace a cell's text (exact match after trim) with raw HTML — used for the letterhead. */
  replace?: Record<string, string>;
  /** Column width multiplier (px per Excel character width). */
  pxPerChar?: number;
  /** Width the sheet must fit into (px). Fonts scale down by the same ratio, like Excel "fit to 1 page wide". Default 734 (A4 portrait, 8 mm margins). */
  fitWidthPx?: number;
}

const colToNum = (col: string) => col.toUpperCase().split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
const parseRef = (ref: string) => {
  const m = ref.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!m) throw new Error(`bad cell ref ${ref}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
};
const parseRange = (range: string) => {
  const [a, b] = range.split(":");
  const A = parseRef(a), B = parseRef(b ?? a);
  return { top: Math.min(A.row, B.row), left: Math.min(A.col, B.col), bottom: Math.max(A.row, B.row), right: Math.max(A.col, B.col) };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const argbToCss = (argb?: string) => (argb && argb.length === 8 ? `#${argb.slice(2)}` : argb && argb.length === 6 ? `#${argb}` : null);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Enough of Excel number formatting for these sheets: currency/accounting, %, dates, plain. */
export function formatCellValue(raw: ExcelJS.CellValue, numFmt?: string): string {
  let v: unknown = raw;
  if (v && typeof v === "object" && "formula" in (v as object)) v = (v as ExcelJS.CellFormulaValue).result;
  if (v && typeof v === "object" && "richText" in (v as object)) return (v as ExcelJS.CellRichTextValue).richText.map((p) => p.text).join("");
  if (v && typeof v === "object" && "error" in (v as object)) return "";
  if (v == null) return "";
  const fmt = numFmt ?? "";
  if (v instanceof Date) {
    const d = v;
    if (/mmm.*yy/i.test(fmt) && !/d/i.test(fmt.replace(/dd?\//, ""))) {
      if (/^mm\/yyyy$/i.test(fmt)) return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    }
    if (/^mm\/yyyy$/i.test(fmt) || /^mm-yyyy$/i.test(fmt)) return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    if (/^mmm-yy$/i.test(fmt)) return `${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
    if (/mmm/i.test(fmt)) return `${String(d.getDate()).padStart(2, "0")}/${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  if (typeof v === "number") {
    const sections = fmt.split(";");
    if (v === 0 && sections.length >= 3 && /"-"|\\-|-/.test(sections[2])) return "-";
    if (/%/.test(fmt)) {
      const dp = (fmt.match(/0\.(0+)%/) ?? [])[1]?.length ?? 0;
      return `${(v * 100).toFixed(dp)}%`;
    }
    const neg = v < 0;
    const abs = Math.abs(v);
    const dp = /0\.00/.test(fmt) ? 2 : /0\.0(?!0)/.test(fmt) ? 1 : /#,##0(?!\.)/.test(fmt) || /^0$/.test(fmt) ? 0 : Number.isInteger(v) ? 0 : 2;
    const grouped = /#,##/.test(fmt) || /\$/.test(fmt) ? abs.toLocaleString("en-SG", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : abs.toFixed(dp);
    const money = /\$/.test(fmt);
    const body = money ? `$ ${grouped}` : grouped;
    if (neg) return sections.length >= 2 && /\(/.test(sections[1]) ? `(${body})` : `-${body}`;
    return body;
  }
  return String(v);
}

function borderCss(b: Partial<ExcelJS.Borders> | undefined): string {
  if (!b) return "";
  const side = (s?: Partial<ExcelJS.Border>) => (s && s.style ? (s.style === "medium" || s.style === "thick" ? "2px solid #000" : "1px solid #000") : "");
  const out: string[] = [];
  if (side(b.top)) out.push(`border-top:${side(b.top)}`);
  if (side(b.bottom)) out.push(`border-bottom:${side(b.bottom)}`);
  if (side(b.left)) out.push(`border-left:${side(b.left)}`);
  if (side(b.right)) out.push(`border-right:${side(b.right)}`);
  return out.join(";");
}

function fontCss(f: Partial<ExcelJS.Font> | undefined, scale = 1): string {
  const out: string[] = [];
  out.push(`font-size:${((f?.size ?? 10) * scale).toFixed(2)}pt`);
  if (!f) return out.join(";");
  if (f.bold) out.push("font-weight:700");
  if (f.italic) out.push("font-style:italic");
  if (f.name) out.push(`font-family:'${f.name}',Arial,sans-serif`);
  const c = argbToCss(f.color?.argb);
  if (c) out.push(`color:${c}`);
  if (f.underline) out.push("text-decoration:underline");
  return out.join(";");
}

function fillCss(fill: ExcelJS.Fill | undefined): string {
  if (!fill || fill.type !== "pattern") return "";
  const c = argbToCss(fill.fgColor?.argb);
  return c && fill.pattern !== "none" ? `background:${c}` : "";
}

function alignCss(a: Partial<ExcelJS.Alignment> | undefined, isNumber: boolean): string {
  const out: string[] = [];
  const h = a?.horizontal ?? (isNumber ? "right" : "left");
  out.push(`text-align:${h === "centerContinuous" || h === "distributed" ? "center" : h === "fill" ? "left" : h}`);
  out.push(`vertical-align:${a?.vertical === "top" ? "top" : a?.vertical === "middle" ? "middle" : "bottom"}`);
  if (a?.wrapText) out.push("white-space:pre-wrap;word-break:break-word");
  else out.push("white-space:pre");
  if (a?.indent) out.push(`padding-left:${4 + a.indent * 8}px`);
  return out.join(";");
}

/** Merge map from the worksheet model: master address → span, plus the set of covered cells. */
function mergeMap(ws: ExcelJS.Worksheet): { spans: Map<string, { rows: number; cols: number }>; covered: Set<string> } {
  const spans = new Map<string, { rows: number; cols: number }>();
  const covered = new Set<string>();
  const model = (ws as unknown as { model?: { merges?: string[] } }).model;
  const merges: string[] = model?.merges ?? Object.keys((ws as unknown as { _merges?: Record<string, unknown> })._merges ?? {});
  for (const m of merges) {
    const r = parseRange(m);
    spans.set(`${r.top}:${r.left}`, { rows: r.bottom - r.top + 1, cols: r.right - r.left + 1 });
    for (let row = r.top; row <= r.bottom; row++) for (let col = r.left; col <= r.right; col++) if (row !== r.top || col !== r.left) covered.add(`${row}:${col}`);
  }
  return { spans, covered };
}

export function worksheetToHtml(ws: ExcelJS.Worksheet, opts: SheetRenderOptions = {}): string {
  const pxPerChar = opts.pxPerChar ?? 7;
  const areaRef = opts.range ?? ws.pageSetup?.printArea ?? null;
  const area = areaRef ? parseRange(areaRef.split(",")[0]) : { top: 1, left: 1, bottom: ws.rowCount, right: ws.columnCount };
  const { spans, covered } = mergeMap(ws);

  let totalWidth = 0;
  for (let c = area.left; c <= area.right; c++) {
    const col = ws.getColumn(c);
    totalWidth += col.hidden ? 0 : Math.round((col.width ?? 8.43) * pxPerChar + 5);
  }
  const colWidthPx = (c: number) => {
    const col = ws.getColumn(c);
    if (col.hidden) return 0;
    const w = col.width ?? 8.43;
    return Math.round(w * pxPerChar + 5);
  };
  const rowHeightPx = (r: number) => {
    const row = ws.getRow(r);
    if (row.hidden) return 0;
    return row.height ? Math.round((row.height * 96) / 72 * (totalWidth > (opts.fitWidthPx ?? 734) ? (opts.fitWidthPx ?? 734) / totalWidth : 1)) : null;
  };

  const widths: number[] = [];
  for (let c = area.left; c <= area.right; c++) widths.push(colWidthPx(c));
  // Proportional widths: the sheet scales to the page like Excel's "fit to 1 page wide",
  // and fonts shrink by the same ratio so text still fits its cell.
  const cols = widths.map((w) => `<col style="width:${totalWidth ? ((w / totalWidth) * 100).toFixed(3) : 0}%">`);
  const fitWidth = opts.fitWidthPx ?? 734;
  const scale = totalWidth > fitWidth ? fitWidth / totalWidth : 1;

  const renderRows = (from: number, to: number, isHeader: boolean) => {
    const parts: string[] = [];
    for (let r = from; r <= to; r++) {
      const h = rowHeightPx(r);
      if (h === 0) continue;
      const tds: string[] = [];
      for (let c = area.left; c <= area.right; c++) {
        if (covered.has(`${r}:${c}`)) continue;
        if (colWidthPx(c) === 0) continue;
        const cell = ws.getCell(r, c);
        const span = spans.get(`${r}:${c}`);
        const text = formatCellValue(cell.value, cell.numFmt);
        const isNumber = typeof (cell.value && typeof cell.value === "object" && "result" in (cell.value as object) ? (cell.value as ExcelJS.CellFormulaValue).result : cell.value) === "number";
        const rep = opts.replace?.[text.trim()];
        const wrap = !!cell.alignment?.wrapText;
        let spill = false;
        if (!wrap && text && !isNumber && !span) {
          // spill allowed when the next cell to the right is empty (and not a merge master)
          const next = c + 1 <= area.right ? ws.getCell(r, c + 1) : null;
          const nextText = next ? formatCellValue(next.value, next.numFmt) : "x";
          spill = !!next && nextText === "" && !covered.has(`${r}:${c + 1}`) && !spans.has(`${r}:${c + 1}`);
        }
        const style = [fillCss(cell.fill as ExcelJS.Fill), fontCss(cell.font, scale), borderCss(cell.border), alignCss(cell.alignment, isNumber), spill ? "overflow:visible;white-space:nowrap;position:relative;z-index:1" : ""].filter(Boolean).join(";");
        const attrs = [span?.rows && span.rows > 1 ? `rowspan="${span.rows}"` : "", span?.cols && span.cols > 1 ? `colspan="${span.cols}"` : "", `style="${style}"`].filter(Boolean).join(" ");
        tds.push(`<td ${attrs}>${rep ?? esc(text)}</td>`);
      }
      parts.push(`<tr${h ? ` style="height:${h}px"` : ""}>${tds.join("")}</tr>`);
    }
    return isHeader ? `<thead>${parts.join("")}</thead>` : parts.join("");
  };

  let head = "";
  let bodyFrom = area.top;
  if (opts.titleRows) {
    const [a, b] = opts.titleRows.split(":").map(Number);
    head = renderRows(a, b, true);
    if (a <= area.top && area.top <= b) bodyFrom = b + 1;
  }
  const body = renderRows(bodyFrom, area.bottom, false);
  return `<table class="sheet" style="width:100%;max-width:${totalWidth}px;table-layout:fixed;border-collapse:collapse;font-size:${(8 * scale).toFixed(2)}pt"><colgroup>${cols.join("")}</colgroup>${head}<tbody>${body}</tbody></table>`;
}

/** Base CSS for printed sheets: fixed layout, A4 portrait, thin default typography. */
export const SHEET_PRINT_CSS = `
  @page { size: A4 portrait; margin: 10mm 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; }
  .page { page-break-after: always; padding: 6px 0; }
  .page:last-child { page-break-after: auto; }
  .page-inner { transform-origin: top left; }
  table.sheet td { padding: 1px 3px; overflow: hidden; font-size: 8pt; line-height: 1.15; }
  table.sheet thead { display: table-header-group; }
  table.sheet tr { page-break-inside: avoid; }
  .letterhead { display: block; width: 100%; max-width: 620px; margin: 0 0 6px 0; }
  @media screen { body { background: #e5e7eb; } .page { background: #fff; margin: 12px auto; width: 210mm; box-sizing: border-box; padding: 10mm 8mm; box-shadow: 0 1px 6px rgba(0,0,0,.2); } }
`;
