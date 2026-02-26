// ─── Projects ───
export interface Project {
  id: string;
  name: string;
  status: "active" | "completed" | "delayed" | "on-hold";
  progress: number;
  budget: number;
  actual: number;
  materialsAllocated: number;
  claimsStatus: "submitted" | "certified" | "paid" | "pending";
  alerts: number;
  location: string;
  startDate: string;
  endDate: string;
}

export const projects: Project[] = [
  { id: "P-001", name: "Marina Bay Infrastructure Phase 2", status: "active", progress: 72, budget: 4500000, actual: 3240000, materialsAllocated: 156, claimsStatus: "certified", alerts: 2, location: "Marina Bay, Singapore", startDate: "Jan 2024", endDate: "Dec 2025" },
  { id: "P-002", name: "Clementi Road Expansion", status: "active", progress: 45, budget: 2800000, actual: 1540000, materialsAllocated: 89, claimsStatus: "submitted", alerts: 1, location: "Clementi, West Region", startDate: "Jun 2024", endDate: "Aug 2025" },
  { id: "P-003", name: "Woodlands MRT Extension", status: "delayed", progress: 38, budget: 8200000, actual: 4100000, materialsAllocated: 234, claimsStatus: "pending", alerts: 5, location: "Woodlands, North Region", startDate: "Mar 2024", endDate: "Mar 2026" },
  { id: "P-004", name: "Tuas Industrial Complex B7", status: "active", progress: 91, budget: 1200000, actual: 1080000, materialsAllocated: 45, claimsStatus: "paid", alerts: 0, location: "Tuas, West Region", startDate: "Oct 2024", endDate: "Apr 2025" },
  { id: "P-005", name: "Jurong East HDB Renovation", status: "completed", progress: 100, budget: 960000, actual: 920000, materialsAllocated: 32, claimsStatus: "paid", alerts: 0, location: "Jurong East, West Region", startDate: "May 2024", endDate: "Dec 2024" },
  { id: "P-006", name: "Changi Airport T5 Support", status: "on-hold", progress: 15, budget: 12000000, actual: 1800000, materialsAllocated: 67, claimsStatus: "pending", alerts: 3, location: "Changi, East Region", startDate: "Feb 2025", endDate: "Dec 2027" },
];

// ─── Inventory ───
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  totalQty: number;
  unit: string;
  value: number;
  stockLevel: number; // 0-100
  status: "sufficient" | "low" | "critical" | "out";
  projectAllocations: { projectId: string; qty: number }[];
}

export const inventory: InventoryItem[] = [
  { id: "M-001", name: "Portland Cement (OPC)", category: "Cement", totalQty: 1200, unit: "bags", value: 18000, stockLevel: 35, status: "low", projectAllocations: [{ projectId: "P-001", qty: 500 }, { projectId: "P-002", qty: 400 }] },
  { id: "M-002", name: "Steel Reinforcement Bars (16mm)", category: "Steel", totalQty: 8500, unit: "kg", value: 42500, stockLevel: 78, status: "sufficient", projectAllocations: [{ projectId: "P-001", qty: 3000 }, { projectId: "P-003", qty: 4000 }] },
  { id: "M-003", name: "Ready-Mix Concrete (G30)", category: "Concrete", totalQty: 450, unit: "m³", value: 67500, stockLevel: 60, status: "sufficient", projectAllocations: [{ projectId: "P-003", qty: 200 }, { projectId: "P-004", qty: 150 }] },
  { id: "M-004", name: "Scaffolding Frame Set", category: "Equipment", totalQty: 120, unit: "sets", value: 36000, stockLevel: 22, status: "critical", projectAllocations: [{ projectId: "P-001", qty: 50 }, { projectId: "P-003", qty: 60 }] },
  { id: "M-005", name: "Safety Helmets (Class A)", category: "Safety", totalQty: 500, unit: "pcs", value: 7500, stockLevel: 85, status: "sufficient", projectAllocations: [{ projectId: "P-001", qty: 100 }, { projectId: "P-002", qty: 80 }] },
  { id: "M-006", name: "Plywood Formwork (18mm)", category: "Timber", totalQty: 300, unit: "sheets", value: 15000, stockLevel: 45, status: "low", projectAllocations: [{ projectId: "P-002", qty: 120 }, { projectId: "P-004", qty: 80 }] },
  { id: "M-007", name: "PVC Pipes (150mm)", category: "Piping", totalQty: 2000, unit: "m", value: 24000, stockLevel: 92, status: "sufficient", projectAllocations: [{ projectId: "P-003", qty: 800 }] },
  { id: "M-008", name: "Waterproofing Membrane", category: "Chemical", totalQty: 50, unit: "rolls", value: 12500, stockLevel: 10, status: "critical", projectAllocations: [{ projectId: "P-001", qty: 30 }] },
];

// ─── Purchase Orders ───
export type POStatus = "draft" | "pending" | "approved" | "issued" | "delivered" | "closed";

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  project: string;
  projectId: string;
  amount: number;
  status: POStatus;
  createdDate: string;
  deliveryDate: string;
  items: { material: string; qty: number; unitPrice: number }[];
}

export const purchaseOrders: PurchaseOrder[] = [
  { id: "PO-001", poNumber: "PO-2025-0147", supplier: "Singapore Building Materials Pte Ltd", project: "Marina Bay Infrastructure Phase 2", projectId: "P-001", amount: 45000, status: "approved", createdDate: "2025-02-10", deliveryDate: "2025-03-01", items: [{ material: "Portland Cement (OPC)", qty: 500, unitPrice: 15 }, { material: "Steel Reinforcement Bars", qty: 2000, unitPrice: 5 }] },
  { id: "PO-002", poNumber: "PO-2025-0148", supplier: "Eastern Steel Supply Co.", project: "Woodlands MRT Extension", projectId: "P-003", amount: 128000, status: "issued", createdDate: "2025-02-12", deliveryDate: "2025-03-15", items: [{ material: "Steel Reinforcement Bars (16mm)", qty: 10000, unitPrice: 5.2 }, { material: "Scaffolding Frame Set", qty: 80, unitPrice: 950 }] },
  { id: "PO-003", poNumber: "PO-2025-0149", supplier: "Pacific Concrete Solutions", project: "Clementi Road Expansion", projectId: "P-002", amount: 32500, status: "pending", createdDate: "2025-02-18", deliveryDate: "2025-03-08", items: [{ material: "Ready-Mix Concrete (G30)", qty: 200, unitPrice: 150 }, { material: "Plywood Formwork", qty: 50, unitPrice: 50 }] },
  { id: "PO-004", poNumber: "PO-2025-0150", supplier: "SafetyFirst Equipment Pte Ltd", project: "Tuas Industrial Complex B7", projectId: "P-004", amount: 8750, status: "delivered", createdDate: "2025-02-05", deliveryDate: "2025-02-20", items: [{ material: "Safety Helmets (Class A)", qty: 200, unitPrice: 15 }, { material: "Safety Harness", qty: 50, unitPrice: 115 }] },
  { id: "PO-005", poNumber: "PO-2025-0151", supplier: "Waterproofing Specialists SG", project: "Marina Bay Infrastructure Phase 2", projectId: "P-001", amount: 18500, status: "draft", createdDate: "2025-02-22", deliveryDate: "2025-03-20", items: [{ material: "Waterproofing Membrane", qty: 40, unitPrice: 250 }, { material: "Sealant Compound", qty: 100, unitPrice: 85 }] },
  { id: "PO-006", poNumber: "PO-2025-0152", supplier: "Singapore Building Materials Pte Ltd", project: "Changi Airport T5 Support", projectId: "P-006", amount: 67000, status: "pending", createdDate: "2025-02-20", deliveryDate: "2025-04-01", items: [{ material: "Portland Cement (OPC)", qty: 1000, unitPrice: 15 }, { material: "PVC Pipes (150mm)", qty: 3000, unitPrice: 12 }] },
];

// ─── Invoices / Documents ───
export type InvoiceStatus = "received" | "pending-review" | "approved" | "rejected";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendor: string;
  amount: number;
  date: string;
  poMatch: string | null;
  status: InvoiceStatus;
  confidence: number;
  lineItems: { description: string; qty: number; unitPrice: number; total: number }[];
}

export const invoices: Invoice[] = [
  { id: "INV-001", invoiceNumber: "SBM-2025-3421", vendor: "Singapore Building Materials Pte Ltd", amount: 45000, date: "2025-02-15", poMatch: "PO-2025-0147", status: "approved", confidence: 96, lineItems: [{ description: "Portland Cement OPC 50kg bags", qty: 500, unitPrice: 15, total: 7500 }, { description: "Steel Rebar 16mm", qty: 2000, unitPrice: 5, total: 10000 }] },
  { id: "INV-002", invoiceNumber: "ESS-8812", vendor: "Eastern Steel Supply Co.", amount: 128000, date: "2025-02-20", poMatch: "PO-2025-0148", status: "pending-review", confidence: 89, lineItems: [{ description: "Steel Reinforcement 16mm HY", qty: 10000, unitPrice: 5.2, total: 52000 }, { description: "Scaffolding Frame Set Complete", qty: 80, unitPrice: 950, total: 76000 }] },
  { id: "INV-003", invoiceNumber: "PCS-0094", vendor: "Pacific Concrete Solutions", amount: 33200, date: "2025-02-22", poMatch: null, status: "received", confidence: 72, lineItems: [{ description: "Ready-Mix Concrete G30", qty: 200, unitPrice: 150, total: 30000 }, { description: "Delivery Surcharge", qty: 1, unitPrice: 3200, total: 3200 }] },
  { id: "INV-004", invoiceNumber: "SFE-7744", vendor: "SafetyFirst Equipment Pte Ltd", amount: 8750, date: "2025-02-18", poMatch: "PO-2025-0150", status: "approved", confidence: 98, lineItems: [{ description: "Safety Helmet Class A", qty: 200, unitPrice: 15, total: 3000 }, { description: "Full Body Harness", qty: 50, unitPrice: 115, total: 5750 }] },
];

// ─── Alerts ───
export interface Alert {
  id: string;
  type: "stock" | "invoice" | "claim" | "delay";
  title: string;
  description: string;
  project?: string;
  timestamp: string;
  severity: "high" | "medium" | "low";
}

export const alerts: Alert[] = [
  { id: "A-001", type: "stock", title: "Cement Running Low", description: "Portland Cement stock at 35% — below reorder threshold for Project P-001", project: "Marina Bay Infrastructure", timestamp: "12 min ago", severity: "high" },
  { id: "A-002", type: "stock", title: "Scaffolding Critical", description: "Scaffolding Frame Sets at 22% — 2 projects affected", project: "Woodlands MRT Extension", timestamp: "45 min ago", severity: "high" },
  { id: "A-003", type: "invoice", title: "Overdue Invoice", description: "Invoice ESS-8812 pending review for 5 days", project: "Woodlands MRT Extension", timestamp: "2 hrs ago", severity: "medium" },
  { id: "A-004", type: "claim", title: "Missing Claim Submission", description: "Monthly progress claim for P-003 not yet submitted", project: "Woodlands MRT Extension", timestamp: "1 day ago", severity: "high" },
  { id: "A-005", type: "stock", title: "Waterproofing Membrane Low", description: "Only 10% stock remaining — reorder immediately", project: "Marina Bay Infrastructure", timestamp: "3 hrs ago", severity: "high" },
  { id: "A-006", type: "delay", title: "Delivery Delay", description: "PO-2025-0148 delivery delayed by 3 days", project: "Woodlands MRT Extension", timestamp: "5 hrs ago", severity: "medium" },
];

// ─── Claims Data (for chart) ───
export const claimsData = [
  { month: "Sep", submitted: 320000, certified: 280000, paid: 250000 },
  { month: "Oct", submitted: 450000, certified: 410000, paid: 380000 },
  { month: "Nov", submitted: 380000, certified: 350000, paid: 320000 },
  { month: "Dec", submitted: 520000, certified: 480000, paid: 440000 },
  { month: "Jan", submitted: 410000, certified: 370000, paid: 310000 },
  { month: "Feb", submitted: 480000, certified: 420000, paid: 0 },
];

// ─── Individual Claims ───
export interface Claim {
  id: string;
  claimNumber: string;
  projectId: string;
  projectName: string;
  amount: number;
  submittedDate: string;
  status: "submitted" | "certified" | "paid" | "pending";
  description: string;
}

export const claims: Claim[] = [
  { id: "CLM-001", claimNumber: "CLM-2025-001", projectId: "P-001", projectName: "Marina Bay Infrastructure Phase 2", amount: 180000, submittedDate: "2025-02-20", status: "certified", description: "Progress Claim #3 - Foundation Works" },
  { id: "CLM-002", claimNumber: "CLM-2025-002", projectId: "P-002", projectName: "Clementi Road Expansion", amount: 95000, submittedDate: "2025-02-22", status: "submitted", description: "Progress Claim #2 - Road Base Layer" },
  { id: "CLM-003", claimNumber: "CLM-2025-003", projectId: "P-003", projectName: "Woodlands MRT Extension", amount: 205000, submittedDate: "2025-02-15", status: "pending", description: "Progress Claim #4 - Overdue" },
  { id: "CLM-004", claimNumber: "CLM-2025-004", projectId: "P-004", projectName: "Tuas Industrial Complex B7", amount: 65000, submittedDate: "2025-02-18", status: "paid", description: "Final Progress Claim" },
  { id: "CLM-005", claimNumber: "CLM-2025-005", projectId: "P-001", projectName: "Marina Bay Infrastructure Phase 2", amount: 142000, submittedDate: "2025-02-25", status: "submitted", description: "Progress Claim #4 - Structural Works" },
];

// ─── Performance Data ───
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: "Sales" | "Operations" | "Finance";
  score: number;
  tasksCompleted: number;
  tasksTotal: number;
  trend: "up" | "down" | "stable";
}

export const teamMembers: TeamMember[] = [
  { id: "T-001", name: "Sarah Chen", role: "Project Manager", department: "Operations", score: 92, tasksCompleted: 47, tasksTotal: 50, trend: "up" },
  { id: "T-002", name: "Marcus Tan", role: "Procurement Lead", department: "Operations", score: 78, tasksCompleted: 34, tasksTotal: 42, trend: "stable" },
  { id: "T-003", name: "Priya Sharma", role: "Finance Controller", department: "Finance", score: 88, tasksCompleted: 28, tasksTotal: 30, trend: "up" },
  { id: "T-004", name: "David Lim", role: "Site Supervisor", department: "Operations", score: 65, tasksCompleted: 22, tasksTotal: 35, trend: "down" },
  { id: "T-005", name: "Rachel Wong", role: "Sales Manager", department: "Sales", score: 85, tasksCompleted: 19, tasksTotal: 22, trend: "up" },
  { id: "T-006", name: "Ahmad Ibrahim", role: "QA Inspector", department: "Operations", score: 71, tasksCompleted: 30, tasksTotal: 40, trend: "down" },
];

// ─── Project Tasks ───
export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: "high" | "medium" | "low";
  assignedTo: string;
  dueDate: string;
  completedDate?: string;
}

export const projectTasks: ProjectTask[] = [
  // P-001 - Marina Bay Infrastructure Phase 2
  { id: "TASK-001", projectId: "P-001", title: "Foundation Inspection", description: "Conduct structural integrity assessment of foundation work", status: "completed", priority: "high", assignedTo: "Ahmad Ibrahim", dueDate: "2025-02-15", completedDate: "2025-02-14" },
  { id: "TASK-002", projectId: "P-001", title: "Cement Reorder", description: "Place urgent order for 500 bags of Portland Cement", status: "in-progress", priority: "high", assignedTo: "Marcus Tan", dueDate: "2025-02-28" },
  { id: "TASK-003", projectId: "P-001", title: "Progress Claim Submission", description: "Submit monthly progress claim for certification", status: "pending", priority: "medium", assignedTo: "Priya Sharma", dueDate: "2025-03-05" },
  { id: "TASK-004", projectId: "P-001", title: "Waterproofing Application", description: "Apply waterproofing membrane to basement level", status: "in-progress", priority: "high", assignedTo: "David Lim", dueDate: "2025-03-10" },

  // P-002 - Clementi Road Expansion
  { id: "TASK-005", projectId: "P-002", title: "Road Survey Completion", description: "Complete topographical survey of road expansion area", status: "completed", priority: "high", assignedTo: "Sarah Chen", dueDate: "2025-02-20", completedDate: "2025-02-18" },
  { id: "TASK-006", projectId: "P-002", title: "Concrete Delivery Coordination", description: "Schedule ready-mix concrete delivery with Pacific Concrete", status: "in-progress", priority: "medium", assignedTo: "Marcus Tan", dueDate: "2025-03-08" },
  { id: "TASK-007", projectId: "P-002", title: "Traffic Management Plan", description: "Finalize traffic diversion plan with LTA", status: "pending", priority: "high", assignedTo: "Sarah Chen", dueDate: "2025-03-01" },

  // P-003 - Woodlands MRT Extension
  { id: "TASK-008", projectId: "P-003", title: "Steel Reinforcement Installation", description: "Install steel reinforcement bars for tunnel support", status: "blocked", priority: "high", assignedTo: "David Lim", dueDate: "2025-03-15" },
  { id: "TASK-009", projectId: "P-003", title: "Resolve Material Shortage", description: "Address scaffolding shortage affecting work progress", status: "in-progress", priority: "high", assignedTo: "Marcus Tan", dueDate: "2025-02-27" },
  { id: "TASK-010", projectId: "P-003", title: "Delay Impact Assessment", description: "Assess impact of 3-day delivery delay on project timeline", status: "pending", priority: "high", assignedTo: "Sarah Chen", dueDate: "2025-02-26" },
  { id: "TASK-011", projectId: "P-003", title: "Progress Claim (Overdue)", description: "Submit overdue monthly progress claim", status: "pending", priority: "high", assignedTo: "Priya Sharma", dueDate: "2025-02-24" },

  // P-004 - Tuas Industrial Complex B7
  { id: "TASK-012", projectId: "P-004", title: "Final Safety Inspection", description: "Conduct final safety inspection before handover", status: "in-progress", priority: "high", assignedTo: "Ahmad Ibrahim", dueDate: "2025-03-15" },
  { id: "TASK-013", projectId: "P-004", title: "Handover Documentation", description: "Prepare handover documentation and certificates", status: "pending", priority: "medium", assignedTo: "Sarah Chen", dueDate: "2025-04-01" },
];

// ─── Suppliers ───
export const suppliers = [
  "Singapore Building Materials Pte Ltd",
  "Eastern Steel Supply Co.",
  "Pacific Concrete Solutions",
  "SafetyFirst Equipment Pte Ltd",
  "Waterproofing Specialists SG",
  "Asia Timber & Plywood Pte Ltd",
  "National Pipe Industries",
];

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
