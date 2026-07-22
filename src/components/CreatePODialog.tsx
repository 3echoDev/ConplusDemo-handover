import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useAppData } from "@/data/AppDataContext";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface LineItem {
  material: string;
  qty: number;
  unitPrice: number;
}

export default function CreatePODialog({ open, onClose }: Props) {
  const { projects, suppliers, supplierDetails, teamMembers, createPO } = useAppData();
  const [supplier, setSupplier] = useState("");
  const [projectId, setProjectId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [worksOrder, setWorksOrder] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ material: "", qty: 1, unitPrice: 0 }]);
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

  const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const addLine = () => setItems([...items, { material: "", qty: 1, unitPrice: 0 }]);

  const removeLine = (idx: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleSubmit = async () => {
    if (saving || !supplier || !projectId || !deliveryDate || items.some((i) => !i.material || i.qty <= 0)) return;
    setSaving(true);
    try {
      await createPO({ supplier, projectId, items, deliveryDate, worksOrder, shipTo, paymentTerms, requestedBy, remarks });
      setSupplier("");
      setProjectId("");
      setDeliveryDate("");
      setWorksOrder("");
      setShipTo("");
      setPaymentTerms("");
      setRequestedBy("");
      setRemarks("");
      setItems([{ material: "", qty: 1, unitPrice: 0 }]);
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
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
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
                    <th className="text-right p-2.5 font-medium w-20">Qty</th>
                    <th className="text-right p-2.5 font-medium w-28">Unit Price</th>
                    <th className="text-right p-2.5 font-medium w-28">Total</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.material}
                          onChange={(e) => updateLine(idx, "material", e.target.value)}
                          placeholder="e.g. KU601 (7046)"
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
                      <td className="p-2 text-right text-sm font-medium text-card-foreground">
                        ${(item.qty * item.unitPrice).toLocaleString("en-SG", { minimumFractionDigits: 2 })}
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

          {/* Total */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-sm font-medium text-muted-foreground">Total Amount</span>
            <span className="text-xl font-heading font-bold text-card-foreground">
              ${total.toLocaleString("en-SG", { minimumFractionDigits: 2 })}
            </span>
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
