// Supabase data access layer: row types, UI mappers, and mutations.
import { supabase } from "@/lib/supabase";
import type {
  Project,
  InventoryItem,
  ProjectAllocation,
  PurchaseOrder,
  POStatus,
  Invoice,
  InvoiceStatus,
  Alert,
  Claim,
  ProjectTask,
  DocumentRecord,
} from "./sampleData";
import { timeAgo } from "./sampleData";
import { buildPOHtml } from "@/lib/poDocument";

/* ─────────────── Row shapes (subset of columns we use) ─────────────── */

export interface ProjectRow {
  id: string;
  project_code: string;
  name: string;
  client_name: string | null;
  location: string | null;
  scope: string | null;
  manager: string | null;
  sales_manager: string | null;
  contact_person: string | null;
  contract_value: number | null;
  vo_value: number | null;
  total_contract_value: number | null;
  actual_cost: number | null;
  progress: number | null;
  status: string;
  claims_status: string | null;
  alerts_count: number | null;
  year_awarded: string | null;
  start_date: string | null;
  end_date: string | null;
  updated_at: string;
}

export interface MaterialRow {
  id: string;
  item_code: string;
  name: string;
  category: string | null;
  coating_type: string | null;
  unit: string;
  supplier_name: string | null;
  storage_location: string | null;
  qty_on_hand: number;
  estimated_unit_value: number;
  status: "sufficient" | "low" | "critical" | "out";
  alert_threshold: number;
  is_active: boolean;
  updated_at: string;
}

export interface AllocationRow {
  id: string;
  material_id: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  allocated_qty: number;
  used_qty: number;
  updated_at: string;
}

export interface PORow {
  id: string;
  po_number: string;
  project_id: string | null;
  project_code: string | null;
  project_site: string | null;
  works_order: string | null;
  supplier_name: string | null;
  status: POStatus;
  total_amount: number;
  gst_amount: number;
  remarks: string | null;
  // Added via migration — undefined until the ALTER TABLE has been run.
  ship_to?: string | null;
  payment_terms?: string | null;
  requested_by?: string | null;
  created_date: string | null;
  delivery_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  name: string;
  payment_terms: string | null;
  address: string | null;
  is_active: boolean;
}

export interface POLineRow {
  id: string;
  po_id: string;
  description: string;
  qty: number;
  unit: string | null;
  unit_price: number;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  supplier_name: string | null;
  po_ref: string | null;
  invoice_date: string | null;
  amount: number;
  gst: number;
  total: number;
  status: string;
  ocr_confidence: number | null;
  document_url: string | null;
  updated_at: string;
}

export interface ClaimRow {
  id: string;
  claim_number: string | null;
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  amount: number;
  submitted_date: string | null;
  certified_date: string | null;
  paid_date: string | null;
  status: string;
  description: string | null;
  updated_at: string;
}

export interface AlertRow {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  project_code: string | null;
  is_resolved: boolean;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  doc_type: string;
  project_code: string | null;
  file_url: string | null;
  file_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface TaskRow {
  id: string;
  project_id: string;
  project_code: string | null;
  title: string;
  description: string | null;
  status: "pending" | "in-progress" | "completed" | "blocked";
  priority: "high" | "medium" | "low";
  assigned_to: string | null;
  due_date: string | null;
  completed_date: string | null;
}

/* ─────────────── Fetchers ─────────────── */

async function selectAll<T>(table: string, query: string, order?: { column: string; ascending?: boolean }): Promise<T[]> {
  let q = supabase.from(table).select(query);
  if (order) q = q.order(order.column, { ascending: order.ascending ?? false });
  // Supabase caps at 1000 rows by default; our largest table is 258 rows.
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

export const fetchProjects = () => selectAll<ProjectRow>("projects", "*", { column: "total_contract_value" });
export const fetchDocuments = () => selectAll<DocumentRow>("documents", "*", { column: "created_at" });
export const fetchMaterials = () => selectAll<MaterialRow>("materials", "*", { column: "qty_on_hand" });
export const fetchAllocations = () => selectAll<AllocationRow>("material_allocations", "*", { column: "updated_at" });
export const fetchPOs = () => selectAll<PORow>("purchase_orders", "*", { column: "created_date" });
export const fetchPOLines = () => selectAll<POLineRow>("po_line_items", "id,po_id,description,qty,unit,unit_price");
export const fetchInvoices = () => selectAll<InvoiceRow>("supplier_invoices", "*", { column: "invoice_date" });
export const fetchClaims = () => selectAll<ClaimRow>("claims", "*", { column: "submitted_date" });
export const fetchTasks = () => selectAll<TaskRow>("project_tasks", "*", { column: "due_date", ascending: true });

export async function fetchAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`alerts: ${error.message}`);
  return (data ?? []) as AlertRow[];
}

export async function fetchSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("name,payment_terms,address,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`suppliers: ${error.message}`);
  // Client data has duplicate company names under different vendor codes
  // (e.g. Nippon Paint Dennis/Roadline) — dedupe by name for the dropdown.
  const seen = new Set<string>();
  return ((data ?? []) as SupplierRow[]).filter((s) => !seen.has(s.name) && seen.add(s.name));
}

export async function fetchTeamMemberNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("name")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`team_members: ${error.message}`);
  return (data ?? []).map((t: { name: string }) => t.name);
}

/* ─────────────── Mappers (DB row → UI shape) ─────────────── */

const PROJECT_STATUSES = ["active", "completed", "delayed", "on-hold", "cancelled"] as const;

export function mapProject(row: ProjectRow, allocCount: number, alertCount: number): Project {
  const status = (PROJECT_STATUSES as readonly string[]).includes(row.status) ? row.status : "active";
  return {
    id: row.id,
    code: row.project_code,
    name: row.name,
    client: row.client_name ?? "—",
    status: status as Project["status"],
    progress: row.progress ?? 0,
    budget: row.total_contract_value ?? row.contract_value ?? 0,
    actual: row.actual_cost ?? 0,
    materialsAllocated: allocCount,
    claimsStatus: (row.claims_status ?? "pending") as Project["claimsStatus"],
    alerts: alertCount || (row.alerts_count ?? 0),
    location: row.location ?? "Singapore",
    startDate: row.start_date ?? row.year_awarded ?? "—",
    endDate: row.end_date ?? "—",
    scope: row.scope ?? "—",
    manager: row.manager ?? row.sales_manager ?? "—",
    contactPerson: row.contact_person ?? "—",
  };
}

export function mapMaterial(row: MaterialRow, allocations: AllocationRow[]): InventoryItem {
  const threshold = row.alert_threshold || 5;
  // Stock bar %: "full" at 4× the alert threshold.
  const stockLevel = Math.max(0, Math.min(100, Math.round((row.qty_on_hand / (threshold * 4)) * 100)));
  const mapped: ProjectAllocation[] = allocations.map((a) => ({
    projectId: a.project_id ?? "",
    projectCode: a.project_code ?? "",
    projectName: a.project_name ?? a.project_code ?? "—",
    qty: a.allocated_qty,
    usedQty: a.used_qty,
  }));
  return {
    id: row.id,
    code: row.item_code,
    name: row.name,
    category: row.coating_type || (row.category === "expandable" ? "Expandable" : "Coating"),
    supplier: row.supplier_name ?? "—",
    totalQty: row.qty_on_hand,
    unit: row.unit,
    value: (row.estimated_unit_value ?? 0) * row.qty_on_hand,
    unitValue: row.estimated_unit_value ?? 0,
    stockLevel,
    location: row.storage_location ?? "—",
    alertThreshold: threshold,
    status: row.status,
    projectAllocations: mapped,
  };
}

export function mapPO(row: PORow, lines: POLineRow[], supplier?: SupplierRow): PurchaseOrder {
  return {
    id: row.id,
    poNumber: row.po_number,
    supplier: row.supplier_name ?? "—",
    supplierAddress: supplier?.address ?? "",
    project: row.project_site || row.project_code || "—",
    projectId: row.project_id ?? "",
    projectCode: row.project_code ?? "",
    worksOrder: row.works_order ?? "",
    shipTo: row.ship_to ?? "",
    paymentTerms: row.payment_terms ?? supplier?.payment_terms ?? "",
    requestedBy: row.requested_by ?? "",
    remarks: row.remarks ?? "",
    amount: row.total_amount,
    gst: row.gst_amount,
    status: row.status,
    createdDate: row.created_date ?? row.created_at.slice(0, 10),
    deliveryDate: row.delivery_date ?? "—",
    items: lines.map((l) => ({ material: l.description, qty: l.qty, unitPrice: l.unit_price })),
  };
}

export const invoiceStatusFromDb = (s: string): InvoiceStatus =>
  (s === "pending_review" ? "pending-review" : s) as InvoiceStatus;
export const invoiceStatusToDb = (s: InvoiceStatus): string =>
  s === "pending-review" ? "pending_review" : s;

export function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number ?? "—",
    vendor: row.supplier_name ?? "—",
    amount: row.total || row.amount,
    date: row.invoice_date ?? "—",
    poMatch: row.po_ref,
    status: invoiceStatusFromDb(row.status),
    confidence: row.ocr_confidence,
    documentUrl: row.document_url,
    lineItems: [],
  };
}

export function mapClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    claimNumber: row.claim_number ?? "—",
    projectId: row.project_id,
    projectName: row.project_name ?? row.project_code ?? "—",
    amount: row.amount,
    submittedDate: row.submitted_date ?? "—",
    certifiedDate: row.certified_date ?? undefined,
    paidDate: row.paid_date ?? undefined,
    status: row.status as Claim["status"],
    description: row.description ?? "",
  };
}

export function mapAlert(row: AlertRow): Alert {
  const typeMap: Record<string, Alert["type"]> = {
    low_stock: "stock",
    claim_pending: "claim",
    delay: "delay",
    delivery_overdue: "delay",
    po_pending: "invoice",
    po_overdue: "invoice",
    invoice_overdue: "invoice",
    general: "delay",
  };
  return {
    id: row.id,
    type: typeMap[row.type] ?? "delay",
    title: row.title,
    description: row.description ?? "",
    project: row.project_code ?? undefined,
    timestamp: timeAgo(row.created_at),
    severity: (row.severity === "critical" ? "high" : row.severity) as Alert["severity"],
  };
}

export function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    docType: row.doc_type,
    projectCode: row.project_code ?? "—",
    fileName: row.file_name ?? "—",
    fileUrl: row.file_url,
    createdAt: row.created_at.slice(0, 10),
    notes: row.notes ?? "",
  };
}

export function mapTask(row: TaskRow): ProjectTask {
  return {
    id: row.id,
    projectId: row.project_id,
    projectCode: row.project_code ?? "",
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    priority: row.priority,
    assignedTo: row.assigned_to ?? "—",
    dueDate: row.due_date ?? "—",
    completedDate: row.completed_date ?? undefined,
  };
}

/* ─────────────── Mutations ─────────────── */

export const computeStockStatus = (qty: number, threshold: number): MaterialRow["status"] => {
  if (qty <= 0) return "out";
  if (qty <= 2) return "critical";
  if (qty < threshold) return "low";
  return "sufficient";
};

const today = () => new Date().toISOString().slice(0, 10);

// Upload a file to the public "documents" bucket, returns its public URL (or null on failure).
async function uploadToBucket(path: string, body: Blob, contentType: string): Promise<string | null> {
  const { error } = await supabase.storage.from("documents").upload(path, body, { contentType, upsert: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("storage upload failed:", error.message);
    return null;
  }
  return supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
}

// PO numbers follow ConPlus format YYMM-NNNN (e.g. 2607-0003).
async function nextPONumber(): Promise<string> {
  const prefix = today().slice(2, 4) + today().slice(5, 7);
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .like("po_number", `${prefix}-%`)
    .order("po_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const lastSeq = data?.[0]?.po_number?.split("-")[1];
  const next = lastSeq ? parseInt(lastSeq, 10) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

export interface CreatePOInput {
  supplierName: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  deliveryDate: string;
  shipTo: string;
  paymentTerms: string;
  requestedBy: string;
  remarks: string;
  items: { material: string; qty: number; unitPrice: number }[];
}

export async function dbCreatePO(input: CreatePOInput): Promise<string> {
  const poNumber = await nextPONumber();
  const subtotal = input.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const gst = Math.round(subtotal * 0.09 * 100) / 100;

  const base = {
    po_number: poNumber,
    project_id: input.projectId || null,
    project_code: input.projectCode,
    project_site: input.projectName,
    supplier_name: input.supplierName,
    status: "pending",
    total_amount: subtotal,
    gst_amount: gst,
    remarks: input.remarks || null,
    created_date: today(),
    delivery_date: input.deliveryDate,
  };
  const extended = {
    ...base,
    ship_to: input.shipTo || null,
    payment_terms: input.paymentTerms || null,
    requested_by: input.requestedBy || null,
  };

  // ship_to/payment_terms/requested_by come from a migration; if it hasn't
  // been applied yet, fall back to the base columns so PO creation still works.
  let insert = await supabase.from("purchase_orders").insert(extended).select("id").single();
  if (insert.error && /column|schema cache/i.test(insert.error.message)) {
    insert = await supabase.from("purchase_orders").insert(base).select("id").single();
  }
  const { data: po, error } = insert;
  if (error) throw new Error(error.message);

  const { error: lineErr } = await supabase.from("po_line_items").insert(
    input.items.map((i) => ({
      po_id: po.id,
      description: i.material,
      qty: i.qty,
      unit_price: i.unitPrice,
      qty_balance: i.qty,
    }))
  );
  if (lineErr) throw new Error(lineErr.message);

  await supabase.from("alerts").insert({
    type: "po_pending",
    severity: "medium",
    title: `PO ${poNumber} pending approval`,
    description: `${input.supplierName} — S$${subtotal.toLocaleString("en-SG")} for ${input.projectName}`,
    project_id: input.projectId || null,
    project_code: input.projectCode,
    reference_type: "purchase_order",
  });

  // Generate the PO document, store it in the documents bucket, and register
  // it in the central document repository (ASSET module).
  const poDoc: PurchaseOrder = {
    id: po.id,
    poNumber,
    supplier: input.supplierName,
    supplierAddress: "",
    project: input.projectName,
    projectId: input.projectId,
    projectCode: input.projectCode,
    worksOrder: "",
    shipTo: input.shipTo,
    paymentTerms: input.paymentTerms,
    requestedBy: input.requestedBy,
    remarks: input.remarks,
    amount: subtotal,
    gst,
    status: "pending",
    createdDate: today(),
    deliveryDate: input.deliveryDate,
    items: input.items,
  };
  const html = buildPOHtml(poDoc, { autoPrint: false });
  const fileUrl = await uploadToBucket(`pos/${poNumber}.html`, new Blob([html], { type: "text/html" }), "text/html");

  await supabase.from("documents").insert({
    title: `Purchase Order ${poNumber} — ${input.supplierName}`,
    doc_type: "po",
    project_id: input.projectId || null,
    project_code: input.projectCode,
    file_name: `${poNumber}.html`,
    file_url: fileUrl,
    mime_type: "text/html",
    notes: "Generated via web app",
  });

  return poNumber;
}

export async function dbUpdatePOStatus(poId: string, status: POStatus): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  const { error } = await supabase.from("purchase_orders").update(patch).eq("id", poId);
  if (error) throw new Error(error.message);
}

export async function dbUpdateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<void> {
  const patch: Record<string, unknown> = {
    status: invoiceStatusToDb(status),
    updated_at: new Date().toISOString(),
  };
  if (status === "paid") patch.payment_date = today();
  const { error } = await supabase.from("supplier_invoices").update(patch).eq("id", invoiceId);
  if (error) throw new Error(error.message);
}

export async function dbUpdateStock(materialId: string, newQty: number, threshold: number): Promise<void> {
  const { error } = await supabase
    .from("materials")
    .update({
      qty_on_hand: newQty,
      status: computeStockStatus(newQty, threshold),
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId);
  if (error) throw new Error(error.message);
}

export interface AddMaterialInput {
  itemCode: string;
  name: string;
  category: "coating" | "expandable";
  unit: string;
  supplierName: string;
  location: string;
  qty: number;
  threshold: number;
}

export async function dbAddMaterial(input: AddMaterialInput): Promise<void> {
  const { error } = await supabase.from("materials").insert({
    item_code: input.itemCode,
    name: input.name,
    category: input.category,
    unit: input.unit,
    supplier_name: input.supplierName || null,
    storage_location: input.location || null,
    qty_on_hand: input.qty,
    alert_threshold: input.threshold,
    status: computeStockStatus(input.qty, input.threshold),
  });
  if (error) throw new Error(error.message);
}

export interface AllocateInput {
  materialId: string;
  currentQty: number;
  threshold: number;
  projectId: string;
  projectCode: string;
  projectName: string;
  qty: number;
}

export async function dbAllocateMaterial(input: AllocateInput): Promise<void> {
  const { error } = await supabase.from("material_allocations").insert({
    material_id: input.materialId,
    project_id: input.projectId || null,
    project_code: input.projectCode,
    project_name: input.projectName,
    allocated_qty: input.qty,
  });
  if (error) throw new Error(error.message);
  await dbUpdateStock(input.materialId, input.currentQty - input.qty, input.threshold);
}

export interface CreateClaimInput {
  projectId: string;
  projectCode: string;
  projectName: string;
  amount: number;
  description: string;
}

export async function dbCreateClaim(input: CreateClaimInput): Promise<string> {
  const year = new Date().getFullYear();
  const { count, error: cntErr } = await supabase
    .from("claims")
    .select("id", { count: "exact", head: true });
  if (cntErr) throw new Error(cntErr.message);
  const claimNumber = `CLM-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const { error } = await supabase.from("claims").insert({
    claim_number: claimNumber,
    project_id: input.projectId,
    project_code: input.projectCode,
    project_name: input.projectName,
    amount: input.amount,
    submitted_date: today(),
    status: "submitted",
    description: input.description || null,
  });
  if (error) throw new Error(error.message);
  return claimNumber;
}

export async function dbUpdateClaimStatus(claimId: string, status: Claim["status"]): Promise<void> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "certified") patch.certified_date = today();
  if (status === "paid") patch.paid_date = today();
  const { error } = await supabase.from("claims").update(patch).eq("id", claimId);
  if (error) throw new Error(error.message);
}

// Store an uploaded invoice file in the documents bucket and register it
// (data entry / OCR happens later via review or Claude).
export async function dbRegisterInvoiceUpload(file: File): Promise<void> {
  const base = file.name.replace(/\.[^.]+$/, "");
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const fileUrl = await uploadToBucket(
    `invoices/${Date.now()}-${safeName}`,
    file,
    file.type || "application/octet-stream"
  );

  const { error } = await supabase.from("supplier_invoices").insert({
    invoice_number: base,
    status: "received",
    invoice_date: today(),
    document_url: fileUrl,
    remarks: `Uploaded via web app (${file.name}) — pending data entry`,
  });
  if (error) throw new Error(error.message);

  await supabase.from("documents").insert({
    title: `Supplier invoice ${base}`,
    doc_type: "invoice",
    file_name: file.name,
    file_url: fileUrl,
    mime_type: file.type || null,
    file_size_kb: Math.round(file.size / 1024),
    notes: "Uploaded via web app — pending data entry",
  });
}

export interface CreateProjectInput {
  projectCode: string;
  name: string;
  clientName: string;
  scope: string;
  salesManager: string;
  contractValue: number;
  voValue: number;
  startDate: string;
}

export async function dbCreateProject(input: CreateProjectInput): Promise<void> {
  const { error } = await supabase.from("projects").insert({
    project_code: input.projectCode,
    name: input.name,
    client_name: input.clientName || null,
    scope: input.scope || null,
    sales_manager: input.salesManager || null,
    contract_value: input.contractValue,
    vo_value: input.voValue,
    total_contract_value: input.contractValue + input.voValue,
    year_awarded: String(new Date().getFullYear()),
    start_date: input.startDate || null,
    status: "active",
  });
  if (error) throw new Error(error.message);
}

export async function dbResolveAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from("alerts")
    .update({ is_resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) throw new Error(error.message);
}
