import { useEffect, useState } from "react";
import { X, Plus, Trash2, Calculator } from "lucide-react";
import { useAppData } from "@/data/AppDataContext";
import { calcRequiredQty } from "@/data/db";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface LineDraft {
  description: string;
  colour: string;
  dosage: string;
  packingSize: string;
  overrideQty: string;
  isMixComponent: boolean;
  remarks: string;
}

interface AreaDraft {
  areaName: string;
  areaSqm: string;
  ralColour: string;
  prepNote: string;
  lines: LineDraft[];
}

const emptyLine = (): LineDraft => ({
  description: "",
  colour: "",
  dosage: "",
  packingSize: "",
  overrideQty: "",
  isMixComponent: false,
  remarks: "",
});

const emptyArea = (): AreaDraft => ({
  areaName: "",
  areaSqm: "",
  ralColour: "",
  prepNote: "Surface preparation by blasting/grinding to concrete",
  lines: [emptyLine()],
});

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function CreateWODialog({ open, onClose }: Props) {
  const { projects, teamMembers, createWorksOrder, getNextWONumber } = useAppData();

  const [woNumber, setWoNumber] = useState("");
  const [projectId, setProjectId] = useState("");
  const [jobNo, setJobNo] = useState("");
  const [sales, setSales] = useState("");
  const [projectIc, setProjectIc] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [quotationRef, setQuotationRef] = useState("");
  const [startDate, setStartDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [areas, setAreas] = useState<AreaDraft[]>([emptyArea()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getNextWONumber()
      .then((n) => setWoNumber((prev) => prev || n))
      .catch(() => undefined);
  }, [open, getNextWONumber]);

  if (!open) return null;

  const project = projects.find((p) => p.id === projectId);

  const selectProject = (id: string) => {
    setProjectId(id);
    const p = projects.find((pr) => pr.id === id);
    if (!p) return;
    setJobNo((prev) => prev || p.code);
    setSiteAddress((prev) => prev || p.name);
    setSales((prev) => prev || p.manager);
  };

  const patchArea = (ai: number, patch: Partial<AreaDraft>) =>
    setAreas((prev) => prev.map((a, i) => (i === ai ? { ...a, ...patch } : a)));

  const patchLine = (ai: number, li: number, patch: Partial<LineDraft>) =>
    setAreas((prev) =>
      prev.map((a, i) =>
        i === ai ? { ...a, lines: a.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)) } : a,
      ),
    );

  const addArea = () => setAreas((prev) => [...prev, emptyArea()]);
  const removeArea = (ai: number) => setAreas((prev) => prev.filter((_, i) => i !== ai));
  const addLine = (ai: number) =>
    setAreas((prev) => prev.map((a, i) => (i === ai ? { ...a, lines: [...a.lines, emptyLine()] } : a)));
  const removeLine = (ai: number, li: number) =>
    setAreas((prev) =>
      prev.map((a, i) => (i === ai ? { ...a, lines: a.lines.filter((_, j) => j !== li) } : a)),
    );

  /** What the quantity will be — same formula the database uses. */
  const previewQty = (area: AreaDraft, line: LineDraft): number | null => {
    if (line.isMixComponent) return null;
    if (line.overrideQty.trim() !== "") return num(line.overrideQty);
    return calcRequiredQty(num(area.areaSqm), num(line.dosage), num(line.packingSize));
  };

  const totalSets = areas.reduce(
    (sum, a) => sum + a.lines.reduce((s, l) => s + (previewQty(a, l) ?? 0), 0),
    0,
  );

  const canSave =
    woNumber.trim() !== "" &&
    projectId !== "" &&
    areas.some((a) => a.areaName.trim() !== "" && a.lines.some((l) => l.description.trim() !== ""));

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await createWorksOrder({
        woNumber: woNumber.trim(),
        projectId,
        projectCode: project?.code ?? "",
        clientName: project?.client ?? "",
        jobNo,
        sales,
        projectIc,
        siteAddress,
        quotationRef,
        startDate,
        remarks,
        areas: areas
          .filter((a) => a.areaName.trim() !== "")
          .map((a) => ({
            areaName: a.areaName.trim(),
            areaSqm: num(a.areaSqm),
            ralColour: a.ralColour,
            prepNote: a.prepNote,
            lines: a.lines
              .filter((l) => l.description.trim() !== "")
              .map((l) => ({
                description: l.description.trim(),
                colour: l.colour,
                dosage: num(l.dosage),
                packingSize: num(l.packingSize),
                // null lets the database trigger compute it
                requiredQty: l.overrideQty.trim() === "" ? null : num(l.overrideQty),
                isMixComponent: l.isMixComponent,
                remarks: l.remarks,
              })),
          })),
      });
      onClose();
      setAreas([emptyArea()]);
      setWoNumber("");
      setProjectId("");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const label = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-4xl rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Create Works Order</h2>
            <p className="text-xs text-muted-foreground">
              Quantities are worked out from area, dosage and pack size
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* header */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Works Order No.</label>
              <input className={field} value={woNumber} onChange={(e) => setWoNumber(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Project</label>
              <select className={field} value={projectId} onChange={(e) => selectProject(e.target.value)}>
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Job No.</label>
              <input className={field} value={jobNo} onChange={(e) => setJobNo(e.target.value)} />
            </div>
            <div>
              <label className={label}>Sales</label>
              <select className={field} value={sales} onChange={(e) => setSales(e.target.value)}>
                <option value="">—</option>
                {teamMembers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Project I/C</label>
              <select className={field} value={projectIc} onChange={(e) => setProjectIc(e.target.value)}>
                <option value="">—</option>
                {teamMembers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Site address</label>
              <input className={field} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
            </div>
            <div>
              <label className={label}>Start date</label>
              <input type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={label}>Quotation ref</label>
              <input className={field} value={quotationRef} onChange={(e) => setQuotationRef(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Remarks</label>
              <input className={field} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>

          {/* areas */}
          {areas.map((area, ai) => (
            <div key={ai} className="rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                <span className="text-sm font-semibold">Area {ai + 1}</span>
                {areas.length > 1 && (
                  <button onClick={() => removeArea(ai)} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className={label}>Area name</label>
                  <input
                    className={field}
                    placeholder="Basement 2 Driveway"
                    value={area.areaName}
                    onChange={(e) => patchArea(ai, { areaName: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label}>Area (m²)</label>
                  <input
                    className={field}
                    inputMode="decimal"
                    placeholder="4436"
                    value={area.areaSqm}
                    onChange={(e) => patchArea(ai, { areaSqm: e.target.value })}
                  />
                </div>
                <div>
                  <label className={label}>RAL colour</label>
                  <input
                    className={field}
                    placeholder="RAL 7040"
                    value={area.ralColour}
                    onChange={(e) => patchArea(ai, { ralColour: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className={label}>Preparation note</label>
                  <input className={field} value={area.prepNote} onChange={(e) => patchArea(ai, { prepNote: e.target.value })} />
                </div>
              </div>

              {/* lines */}
              <div className="border-t border-border px-4 py-3">
                <div className="hidden gap-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_88px_88px_92px_88px_1fr_28px]">
                  <span>Description</span>
                  <span>Colour</span>
                  <span>Dosage</span>
                  <span>Pack size</span>
                  <span className="text-right">Qty</span>
                  <span>Remarks</span>
                  <span />
                </div>

                {area.lines.map((line, li) => {
                  const qty = previewQty(area, line);
                  const auto = line.overrideQty.trim() === "" && !line.isMixComponent;
                  return (
                    <div
                      key={li}
                      className="grid grid-cols-1 gap-2 py-1.5 sm:grid-cols-[1fr_88px_88px_92px_88px_1fr_28px] sm:items-center"
                    >
                      <input
                        className={field}
                        placeholder="Primer coat"
                        value={line.description}
                        onChange={(e) => patchLine(ai, li, { description: e.target.value })}
                      />
                      <input
                        className={field}
                        placeholder="RAL"
                        value={line.colour}
                        onChange={(e) => patchLine(ai, li, { colour: e.target.value })}
                      />
                      <input
                        className={field}
                        inputMode="decimal"
                        placeholder="0.135"
                        value={line.dosage}
                        onChange={(e) => patchLine(ai, li, { dosage: e.target.value })}
                      />
                      <input
                        className={field}
                        inputMode="decimal"
                        placeholder="12"
                        disabled={line.isMixComponent}
                        value={line.packingSize}
                        onChange={(e) => patchLine(ai, li, { packingSize: e.target.value })}
                      />
                      <input
                        className={cn(field, "text-right font-semibold", auto && "bg-muted/60 text-primary")}
                        placeholder={line.isMixComponent ? "—" : auto ? String(qty ?? "") : ""}
                        value={line.overrideQty}
                        disabled={line.isMixComponent}
                        onChange={(e) => patchLine(ai, li, { overrideQty: e.target.value })}
                        title={auto ? "Calculated — type to override" : "Manual override"}
                      />
                      <input
                        className={field}
                        placeholder="Add 3% SM100"
                        value={line.remarks}
                        onChange={(e) => patchLine(ai, li, { remarks: e.target.value })}
                      />
                      <div className="flex items-center gap-1">
                        {area.lines.length > 1 && (
                          <button
                            onClick={() => removeLine(ai, li)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <label className="col-span-full flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground sm:col-span-7">
                        <input
                          type="checkbox"
                          checked={line.isMixComponent}
                          onChange={(e) => patchLine(ai, li, { isMixComponent: e.target.checked })}
                        />
                        Mix component — part of the mix, not ordered separately
                      </label>
                    </div>
                  );
                })}

                <button
                  onClick={() => addLine(ai)}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" /> Add line
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addArea}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" /> Add area
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Total to order</span>
            <span className="font-semibold">{totalSets} sets</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave || saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create works order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
