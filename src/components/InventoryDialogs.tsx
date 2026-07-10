import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAppData } from "@/data/AppDataContext";
import { cn } from "@/lib/utils";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-card-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5";

function SubmitRow({ onClose, onSubmit, disabled, label }: { onClose: () => void; onSubmit: () => void; disabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
      <button onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
          disabled ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {label}
      </button>
    </div>
  );
}

/* ── Material picker (shared) ── */
function MaterialPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { inventory } = useAppData();
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const q = query.toLowerCase();
    return inventory
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [inventory, query]);

  return (
    <div className="space-y-2">
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter materials..." className={inputCls} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} size={6}>
        {options.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} — {i.totalQty} {i.unit} ({i.status})
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── Update Stock ── */
export function UpdateStockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { inventory, updateStock } = useAppData();
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState<string>("");

  if (!open) return null;
  const item = inventory.find((i) => i.id === materialId);

  const submit = async () => {
    if (!item || qty === "") return;
    await updateStock(item.id, Number(qty));
    setMaterialId("");
    setQty("");
    onClose();
  };

  return (
    <ModalShell title="Update Stock" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <label className={labelCls}>Material</label>
          <MaterialPicker value={materialId} onChange={setMaterialId} />
        </div>
        {item && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <p className="font-medium text-card-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Current: {item.totalQty} {item.unit} · Alert threshold: {item.alertThreshold} · Location: {item.location}
            </p>
          </div>
        )}
        <div>
          <label className={labelCls}>New Quantity On Hand</label>
          <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder={item ? String(item.totalQty) : "0"} className={inputCls} />
        </div>
      </div>
      <SubmitRow onClose={onClose} onSubmit={submit} disabled={!item || qty === ""} label="Update Stock" />
    </ModalShell>
  );
}

/* ── Transfer (allocate to project) ── */
export function TransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { inventory, projects, allocateMaterial } = useAppData();
  const [materialId, setMaterialId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [qty, setQty] = useState<string>("");

  if (!open) return null;
  const item = inventory.find((i) => i.id === materialId);
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "delayed");
  const qtyNum = Number(qty);
  const valid = !!item && !!projectId && qtyNum > 0 && qtyNum <= (item?.totalQty ?? 0);

  const submit = async () => {
    if (!valid || !item) return;
    await allocateMaterial(item.id, projectId, qtyNum);
    setMaterialId("");
    setProjectId("");
    setQty("");
    onClose();
  };

  return (
    <ModalShell title="Transfer Stock to Project" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div>
          <label className={labelCls}>Material</label>
          <MaterialPicker value={materialId} onChange={setMaterialId} />
        </div>
        {item && (
          <p className="text-xs text-muted-foreground">
            Available: <span className="font-medium text-card-foreground">{item.totalQty} {item.unit}</span>
          </p>
        )}
        <div>
          <label className={labelCls}>Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
            <option value="">Select project...</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Quantity to Transfer</label>
          <input type="number" min={1} max={item?.totalQty ?? undefined} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          {item && qtyNum > item.totalQty && (
            <p className="text-xs text-destructive mt-1">Cannot transfer more than available stock.</p>
          )}
        </div>
      </div>
      <SubmitRow onClose={onClose} onSubmit={submit} disabled={!valid} label="Transfer" />
    </ModalShell>
  );
}

/* ── Add Material ── */
export function AddMaterialDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { suppliers, addMaterial } = useAppData();
  const [name, setName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [category, setCategory] = useState<"coating" | "expandable">("coating");
  const [unit, setUnit] = useState("pails");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("");
  const [qty, setQty] = useState<string>("0");
  const [threshold, setThreshold] = useState<string>("5");

  if (!open) return null;
  const valid = name.trim() !== "" && itemCode.trim() !== "";

  const submit = async () => {
    if (!valid) return;
    await addMaterial({
      itemCode: itemCode.trim(),
      name: name.trim(),
      category,
      unit: unit.trim() || "pails",
      supplierName: supplier,
      location: location.trim(),
      qty: Number(qty) || 0,
      threshold: Number(threshold) || 5,
    });
    setName(""); setItemCode(""); setSupplier(""); setLocation(""); setQty("0"); setThreshold("5");
    onClose();
  };

  return (
    <ModalShell title="Add Material" onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Material Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WL 100-7040" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Item Code</label>
            <input type="text" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="e.g. WL100-7040" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as "coating" | "expandable")} className={inputCls}>
              <option value="coating">Coating</option>
              <option value="expandable">Expandable (consumable)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pails / pcs / sets" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Supplier</label>
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls}>
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Storage Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. R3 L2" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Initial Quantity</label>
            <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Alert Threshold</label>
            <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>
      <SubmitRow onClose={onClose} onSubmit={submit} disabled={!valid} label="Add Material" />
    </ModalShell>
  );
}
