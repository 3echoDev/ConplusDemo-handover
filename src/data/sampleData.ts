// ─── Shared UI types & helpers ───
// Data now lives in Supabase (see db.ts / AppDataContext.tsx).
// This module only defines the UI-facing shapes and formatting helpers.

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  status: "active" | "completed" | "delayed" | "on-hold" | "cancelled";
  progress: number;
  budget: number;
  actual: number;
  materialsAllocated: number;
  claimsStatus: "submitted" | "certified" | "paid" | "pending";
  alerts: number;
  location: string;
  companyAddress: string;
  clientPo: string;
  quotationRef: string;
  retentionPct?: number;
  retentionCapPct?: number;
  yearAwarded: string;
  startDate: string;
  endDate: string;
  scope: string;
  manager: string;
  contactPerson: string;
  contactNumber: string;
}

export interface ProjectVO {
  id: string;
  projectId: string;
  projectCode: string;
  voNumber: string;
  quotationRef: string;
  description: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
}

export type WOStatus =
  | "draft"
  | "created"
  | "confirmed"
  | "pending_completion"
  | "completed"
  | "pending_invoice"
  | "cancelled";

export interface WorksOrderLine {
  id: string;
  areaId: string;
  seq: number;
  description: string;
  colour: string;
  dosage: number | null;
  dosageUnit: string;
  packingSize: number | null;
  packingUnit: string;
  requiredQty: number | null;
  orderQty: number | null;
  unitPrice: number | null;
  parentLineId: string | null;
  qtyUnit: string;
  isMixComponent: boolean;
  remarks: string;
}

export interface WorksOrderArea {
  id: string;
  seq: number;
  areaName: string;
  areaSqm: number | null;
  ralColour: string;
  prepNote: string;
  lines: WorksOrderLine[];
}

export interface WorksOrder {
  id: string;
  woNumber: string;
  projectId: string;
  projectCode: string;
  clientName: string;
  jobNo: string;
  sales: string;
  projectIc: string;
  siteAddress: string;
  quotationRef: string;
  startDate?: string;
  issueDate?: string;
  siteContact: string;
  siteContactNumber: string;
  // Client-side contact, sourced from the linked project (distinct from the
  // site delivery contact above).
  contactPerson: string;
  contactNumber: string;
  status: WOStatus;
  remarks: string;
  areas: WorksOrderArea[];
}

export interface ProjectAllocation {
  projectId: string;
  projectCode: string;
  projectName: string;
  qty: number;
  usedQty: number;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: string;
  supplier: string;
  totalQty: number;
  unit: string;
  value: number;
  unitValue: number;
  stockLevel: number;
  location: string;
  alertThreshold: number;
  status: "sufficient" | "low" | "critical" | "out";
  projectAllocations: ProjectAllocation[];
}

export type POStatus = "draft" | "pending" | "approved" | "rejected" | "issued" | "delivered" | "closed";

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  supplierAddress: string;
  supplierContact: string;
  supplierPhone: string;
  supplierEmail: string;
  project: string;
  projectId: string;
  projectCode: string;
  worksOrder: string;
  shipTo: string;
  paymentTerms: string;
  requestedBy: string;
  remarks: string;
  amount: number;
  gst: number;
  status: POStatus;
  createdDate: string;
  deliveryDate: string;
  // Spec 2 — Coway PO template alignment (all nullable/optional).
  vendorQuotationRef?: string;
  attnName?: string;
  deliveryCharge?: number;
  deliveryAddress?: string;
  deliveryContact?: string;
  deliveryContactNumber?: string;
  items: { material: string; qty: number; unitPrice: number; unit?: string; discountPct?: number }[];
}

export interface SupplierInfo {
  name: string;
  paymentTerms: string;
  address: string;
}

export type InvoiceStatus = "received" | "pending-review" | "approved" | "rejected" | "paid";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendor: string;
  amount: number;
  date: string;
  poMatch: string | null;
  status: InvoiceStatus;
  confidence: number | null;
  documentUrl: string | null;
  lineItems: { description: string; qty: number; unitPrice: number; total: number }[];
}

export interface Alert {
  id: string;
  type: "stock" | "invoice" | "claim" | "delay";
  title: string;
  description: string;
  project?: string;
  timestamp: string;
  severity: "high" | "medium" | "low";
}

export interface Claim {
  id: string;
  claimNumber: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  amount: number;
  claimNo: number | null;
  totalClaim: number | null;
  certifiedAmount: number | null;
  remarks: string;
  gst: number | null;
  totalAmount: number | null;
  poRef: string;
  woRef: string;
  doRef: string;
  paymentTerms: string;
  firstReleasePct: number | null;
  secondReleasePct: number | null;
  advancePayment: number | null;
  advanceRecovery: number | null;
  clientName: string;
  clientAddress: string;
  contactPerson: string;
  contactNumber: string;
  submittedDate: string;
  claimDate: string; // Spec 4 — the claim's own date (claims.claim_date)
  isFinal: boolean; // Spec 4 — appends "(Final)" to the claim number
  certifiedDate?: string;
  paidDate?: string;
  status: "submitted" | "certified" | "paid" | "pending" | "rejected";
  description: string;
  lines?: ClaimLine[];
}

export interface ClaimLine {
  id: string;
  claimId: string;
  section: "A" | "B";
  quotationRef: string;
  seq: number;
  pgRef: string;
  description: string;
  unit: string;
  qty: number | null;
  rate: number | null;
  contractAmount: number | null;
  prevQty: number | null;
  prevAmount: number | null;
  currQty: number | null;
  currAmount: number | null;
  cumQty: number | null;
  cumAmount: number | null;
  verifiedQty: number | null;
  verifiedAmount: number | null;
  remarks: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: "high" | "medium" | "low";
  assignedTo: string;
  dueDate: string;
  completedDate?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  docType: string;
  projectCode: string;
  fileName: string;
  fileUrl: string | null;
  createdAt: string;
  notes: string;
}

// ─── Helpers ───
export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 0 }).format(amount);

export const getStatusColor = (status: string) => {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success",
    completed: "bg-primary/10 text-primary",
    delayed: "bg-destructive/10 text-destructive",
    "on-hold": "bg-warning/10 text-warning",
    sufficient: "bg-success",
    low: "bg-warning",
    critical: "bg-destructive",
    out: "bg-muted-foreground",
    draft: "bg-muted text-muted-foreground",
    pending: "bg-warning/10 text-warning",
    approved: "bg-success/10 text-success",
    issued: "bg-primary/10 text-primary",
    delivered: "bg-info/10 text-info",
    closed: "bg-muted text-muted-foreground",
    received: "bg-info/10 text-info",
    "pending-review": "bg-warning/10 text-warning",
    rejected: "bg-destructive/10 text-destructive",
    submitted: "bg-primary/10 text-primary",
    certified: "bg-success/10 text-success",
    paid: "bg-success/10 text-success",
  };
  return map[status] || "bg-muted text-muted-foreground";
};

export const timeAgo = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};
