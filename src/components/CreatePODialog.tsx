import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useAppData } from "@/data/AppDataContext";
import { cn } from "@/lib/utils";
import MaterialPicker from "@/components/MaterialPicker";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface LineItem {
  material: string;
  materialId: string | null;
  unit: string; // packing size, e.g. 30kg/set (client PO template)
  qty: number;
  unitPrice: number;
  discPerUnit: number;
}

const emptyLine = (): LineItem => ({ material: "", materialId: null, unit: "", qty: 1, unitPrice: 0, discPerUnit: 0 });
const lineAmount = (i: LineItem) => i.qty * Math.max(0, i.unitPrice - i.discPerUnit);

export default function CreatePODialog({ open, onClose }: Props) {
  const { projects, suppliers, supplierDetails, teamMembers, createPO, inventory } = useAppData();
  const [discountAmount, setDiscountAmount] = useState(0);
  const [supplier, setSupplier] = useState("");
  const [projectId, setProjectId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [worksOrder, setWorksOrder] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const selectSupplier = (name: string) => {
    setSupplier(name);
    // Prefill payment terms from the supplier's own record (editable after).
    setPaymentTerms(supplierDetails.get(name)?.paymentTerms ?? "");
  };

  const selectProject = (id: string) => {
    setProjectId(id);
    // Default Ship To = the project site (their POs deliver to site).
    const p = projects.find((pr) => pr.id === id);
    if (p) setShipTo((prev) => prev || p.name);
  };

  const subtotal = items.reduce((s, i) => s + lineAmount(i), 0);
  const net = Math.max(0, subtotal - (discountAmount || 0));
  const gst = Math.round(net * 0.09 * 100) / 100;
  const total = net;

  const addLine = () => setItems([...items, emptyLine()]);

  const removeLine = (idx: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof LineItem, value: string | number | null) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  // Material picked from stock → default the Unit to its packing size (stock_unit, else unit).
  const pickMaterial = (idx: number, next: { description: string; materialId: string | null }) => {
    const m = next.materialId ? inventory.find((x) => x.id === next.materialId) : null;
    setItems(items.map((item, i) => {
      if (i !== idx) return item;
      const unit = item.unit || (m ? m.stockUnit || m.unit || "" : "");
      return { ...item, material: next.description, materialId: next.materialId, unit };
    }));
  };

  const handleSubmit = async () => {
    if (saving || !supplier || !projectId || !deliveryDate || items.some((i) => !i.material || i.qty <= 0)) return;
    setSaving(true);
    try {
      await createPO({ supplier, projectId, items, discountAmount: discountAmount || 0, deliveryDate, worksOrder, shipTo, paymentTerms, requestedBy, remarks });
      setSupplier("");
      setProjectId("");
      setDeliveryDate("");
      setWorksOrder("");
      setShipTo("");
      setPaymentTerms("");
      setRequestedBy("");
      setRemarks("");
      setItems([emptyLine()]);
      setDiscountAmount(0);
      onClose();
    } catch {
      // error toast already shown by context
    } finally {
      setSaving(false);
    }
  };

  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "delayed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-card-foreground">Create Purchase Order</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Supplier & Project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Supplier</label>
              <select
                value={supplier}
                onChange={(e) => selectSupplier(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Project</label>
              <select
                value={projectId}
                onChange={(e) => selectProject(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select project...</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Delivery / Ship To / Terms / Requested By */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Expected Delivery Date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Requested By</label>
              <select
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select team member...</option>
                {teamMembers.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Works Order No</label>
              <input
                type="text"
                value={worksOrder}
                onChange={(e) => setWorksOrder(e.target.value)}
                placeholder="e.g. 25026"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Ship To</label>
              <input
                type="text"
                value={shipTo}
                onChange={(e) => setShipTo(e.target.value)}
                placeholder="Delivery address / site"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Payment Terms</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Auto-filled from supplier"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes for this PO"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Line Items</label>
              <button onClick={addLine} className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                <Plus className="h-3 w-3" /> Add Item
              </button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left p-2.5 font-medium">Material</th>
                    <th className="text-left p-2.5 font-medium w-24" title="Packing size as printed on the PO, e.g. 30kg/set">Unit</th>
                    <th className="text-right p-2.5 font-medium w-16">Qty</th>
                    <th className="text-right p-2.5 font-medium w-24">Unit Price</th>
                    <th className="text-right p-2.5 font-medium w-24" title="Discount per unit">Disc/Unit</th>
                    <th className="text-right p-2.5 font-medium w-28">Amount</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="p-2">
                        <MaterialPicker
                          value={item.material}
                          materialId={item.materialId}
                          onChange={(next) => pickMaterial(idx, next)}
                          placeholder="paste the name from the inventory list"
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateLine(idx, "unit", e.target.value)}
                          placeholder="30kg/set"
                          list="po-unit-options"
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={item.qty}
                          onChange={(e) => updateLine(idx, "qty", Number(e.target.value))}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unitPrice}
                          onChange={(e) => updateLine(idx, "unitPrice", Number(e.target.value))}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.discPerUnit}
                          onChange={(e) => updateLine(idx, "discPerUnit", Number(e.target.value))}
                          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="p-2 text-right text-sm font-medium text-card-foreground">
                        ${lineAmount(item).toLocaleString("en-SG", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2">
                        <button onClick={() => removeLine(idx)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <datalist id="po-unit-options">
            {[...new Set(inventory.map((m) => m.stockUnit || m.unit).filter(Boolean))].sort().map((u) => (
              <option key={u} value={u as string} />
            ))}
          </datalist>

          {/* Totals — mirrors the PO template: Subtotal → Discount → Total → GST → Grand */}
          <div className="space-y-1.5 pt-3 border-t border-border text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums text-card-foreground">${subtotal.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground" title="Lump-sum discount off the whole order (separate from Disc/Unit)">Discount</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                className="w-32 rounded border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">GST (9%)</span>
              <span className="tabular-nums text-card-foreground">${gst.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
              <span className="font-medium text-muted-foreground">Total (before GST)</span>
              <span className="text-xl font-heading font-bold text-card-foreground">${total.toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !supplier || !projectId || !deliveryDate || items.some((i) => !i.material)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              !saving && supplier && projectId && deliveryDate && items.every((i) => i.material)
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {saving ? "Creating..." : "Create PO (Pending Approval)"}
          </button>
        </div>
      </div>
    </div>
  );
}
