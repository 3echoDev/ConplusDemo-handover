import { createContext, useContext, useMemo, useCallback, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Project,
  InventoryItem,
  PurchaseOrder,
  POStatus,
  Invoice,
  InvoiceStatus,
  Alert,
  Claim,
  ProjectTask,
  DocumentRecord,
  ProjectVO,
  WorksOrder,
  WOStatus,
} from "./sampleData";
import {
  fetchProjects,
  fetchMaterials,
  fetchAllocations,
  fetchPOs,
  fetchPOLines,
  fetchInvoices,
  fetchClaims,
  fetchAlerts,
  fetchTasks,
  fetchDocuments,
  fetchVOs,
  fetchWorksOrders,
  fetchWOAreas,
  fetchWOLines,
  fetchSuppliers,
  fetchTeamMemberNames,
  mapProject,
  mapMaterial,
  mapPO,
  mapInvoice,
  mapClaim,
  mapAlert,
  mapTask,
  mapDocument,
  mapVO,
  mapWorksOrder,
  dbCreatePO,
  dbUpdatePOStatus,
  dbUpdatePOFields,
  dbUpdateInvoiceStatus,
  dbUpdateStock,
  dbAddMaterial,
  dbAllocateMaterial,
  dbCreateClaim,
  dbUpdateClaimStatus,
  dbUpdateClaimFields,
  dbRegisterInvoiceUpload,
  dbCreateProject,
  dbResolveAlert,
  dbCreateWorksOrder,
  dbUpdateWOStatus,
  nextWONumber,
  type AddMaterialInput,
  type CreateProjectInput,
  type POFieldUpdates,
  type POLineRow,
  type CreateWOInput,
  type ClaimFieldUpdates,
} from "./db";

// Poll so that changes made outside the app (e.g. by Claude via MCP) show up live.
const POLL_MS = 7000;

interface NewPOData {
  supplier: string;
  projectId: string;
  items: { material: string; qty: number; unitPrice: number }[];
  deliveryDate: string;
  worksOrder: string;
  shipTo: string;
  paymentTerms: string;
  requestedBy: string;
  remarks: string;
}

interface AppData {
  projects: Project[];
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  alerts: Alert[];
  claims: Claim[];
  projectTasks: ProjectTask[];
  documents: DocumentRecord[];
  projectVOs: ProjectVO[];
  worksOrders: WorksOrder[];
  suppliers: string[];
  supplierDetails: Map<string, { paymentTerms: string; address: string }>;
  teamMembers: string[];
  /** material_id -> real PO prices seen for it, with project + date */
  materialPrices: Map<string, { price: number; projectCode: string; date: string }[]>;
  isLoading: boolean;
  lastSyncedAt: number;

  createPO: (data: NewPOData) => Promise<void>;
  updatePOStatus: (poId: string, status: POStatus) => Promise<void>;
  updatePOFields: (poId: string, fields: POFieldUpdates) => Promise<void>;
  updateClaimFields: (claimId: string, fields: ClaimFieldUpdates) => Promise<void>;
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => Promise<void>;
  updateStock: (itemId: string, newQty: number) => Promise<void>;
  addMaterial: (input: AddMaterialInput) => Promise<void>;
  allocateMaterial: (materialId: string, projectId: string, qty: number) => Promise<void>;
  createClaim: (projectId: string, amount: number, description: string) => Promise<void>;
  updateClaimStatus: (claimId: string, status: Claim["status"]) => Promise<void>;
  registerInvoiceUpload: (file: File) => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
  createWorksOrder: (input: CreateWOInput) => Promise<void>;
  updateWOStatus: (woId: string, status: WOStatus) => Promise<void>;
  getNextWONumber: () => Promise<string>;
}

const AppDataContext = createContext<AppData | null>(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

const Q = { refetchInterval: POLL_MS, staleTime: POLL_MS / 2, retry: 1 };

export function AppDataProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: fetchProjects, ...Q });
  const materialsQ = useQuery({ queryKey: ["materials"], queryFn: fetchMaterials, ...Q });
  const allocationsQ = useQuery({ queryKey: ["allocations"], queryFn: fetchAllocations, ...Q });
  const posQ = useQuery({ queryKey: ["pos"], queryFn: fetchPOs, ...Q });
  const poLinesQ = useQuery({ queryKey: ["poLines"], queryFn: fetchPOLines, ...Q });
  const invoicesQ = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices, ...Q });
  const claimsQ = useQuery({ queryKey: ["claims"], queryFn: fetchClaims, ...Q });
  const alertsQ = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts, ...Q });
  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks, ...Q });
  const documentsQ = useQuery({ queryKey: ["documents"], queryFn: fetchDocuments, ...Q });
  const vosQ = useQuery({ queryKey: ["projectVOs"], queryFn: fetchVOs, ...Q });
  const wosQ = useQuery({ queryKey: ["worksOrders"], queryFn: fetchWorksOrders, ...Q });
  const woAreasQ = useQuery({ queryKey: ["woAreas"], queryFn: fetchWOAreas, ...Q });
  const woLinesQ = useQuery({ queryKey: ["woLines"], queryFn: fetchWOLines, ...Q });
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers, staleTime: 5 * 60_000 });
  const teamQ = useQuery({ queryKey: ["teamMembers"], queryFn: fetchTeamMemberNames, staleTime: 5 * 60_000 });

  const invalidate = useCallback(
    (...keys: string[]) => keys.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    [queryClient]
  );

  /* ── derived UI data ── */

  const allocRows = allocationsQ.data ?? [];

  const projects: Project[] = useMemo(() => {
    const rows = projectsQ.data ?? [];
    const allocByProject = new Map<string, number>();
    for (const a of allocRows) {
      const key = a.project_id ?? a.project_code ?? "";
      allocByProject.set(key, (allocByProject.get(key) ?? 0) + 1);
    }
    const alertsByProject = new Map<string, number>();
    for (const al of alertsQ.data ?? []) {
      if (al.project_code) alertsByProject.set(al.project_code, (alertsByProject.get(al.project_code) ?? 0) + 1);
    }
    return rows.map((r) =>
      mapProject(
        r,
        (allocByProject.get(r.id) ?? 0) + (allocByProject.get(r.project_code) ?? 0),
        alertsByProject.get(r.project_code) ?? 0
      )
    );
  }, [projectsQ.data, allocRows, alertsQ.data]);

  const purchaseOrders: PurchaseOrder[] = useMemo(() => {
    const rows = posQ.data ?? [];
    const linesByPO = new Map<string, POLineRow[]>();
    for (const l of poLinesQ.data ?? []) {
      const list = linesByPO.get(l.po_id) ?? [];
      list.push(l);
      linesByPO.set(l.po_id, list);
    }
    const supplierByName = new Map((suppliersQ.data ?? []).map((s) => [s.name, s]));
    return rows.map((r) => mapPO(r, linesByPO.get(r.id) ?? [], supplierByName.get(r.supplier_name ?? "")));
  }, [posQ.data, poLinesQ.data, suppliersQ.data]);

  // Derive material unit values from real PO line-item prices.
  // Conservative name matching only: a material matches a PO line when the
  // material's word tokens are a subset of the line description's tokens;
  // the most specific candidate wins, ties are skipped.
  const poPrices = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const toks = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
    const mats = (materialsQ.data ?? []).map((m) => ({ id: m.id, tokens: toks(m.name) }));
    const poById = new Map((posQ.data ?? []).map((p) => [p.id, p]));

    // material_id -> list of {price, projectCode, date}
    const prices = new Map<string, { price: number; projectCode: string; date: string }[]>();
    for (const line of poLinesQ.data ?? []) {
      if (!line.unit_price) continue;
      const lineTokens = toks(line.description);
      let best: { id: string; size: number } | null = null;
      let tied = false;
      for (const m of mats) {
        if (m.tokens.size < 2) continue;
        let subset = true;
        for (const t of m.tokens) if (!lineTokens.has(t)) { subset = false; break; }
        if (!subset) continue;
        if (!best || m.tokens.size > best.size) { best = { id: m.id, size: m.tokens.size }; tied = false; }
        else if (m.tokens.size === best.size && m.id !== best.id) tied = true;
      }
      if (!best || tied) continue;
      const po = poById.get(line.po_id);
      const list = prices.get(best.id) ?? [];
      list.push({ price: line.unit_price, projectCode: po?.project_code ?? "", date: po?.created_date ?? "" });
      prices.set(best.id, list);
    }
    return prices;
  }, [materialsQ.data, poLinesQ.data, posQ.data]);

  const inventory: InventoryItem[] = useMemo(() => {
    const rows = materialsQ.data ?? [];
    const byMaterial = new Map<string, typeof allocRows>();
    for (const a of allocRows) {
      const list = byMaterial.get(a.material_id) ?? [];
      list.push(a);
      byMaterial.set(a.material_id, list);
    }
    return rows
      .filter((r) => r.is_active !== false)
      .map((r) => {
        const item = mapMaterial(r, byMaterial.get(r.id) ?? []);
        const priced = poPrices.get(r.id);
        if (item.unitValue === 0 && priced && priced.length > 0) {
          // Raw materials: most recent real PO price. (Expandables keep their
          // recorded unit price, which is already the averaged client value.)
          const latest = [...priced].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
          item.unitValue = latest.price;
          item.value = item.totalQty * latest.price;
        }
        return item;
      });
  }, [materialsQ.data, allocRows, poPrices]);

  const invoices = useMemo(() => (invoicesQ.data ?? []).map(mapInvoice), [invoicesQ.data]);
  const claims = useMemo(() => (claimsQ.data ?? []).map(mapClaim), [claimsQ.data]);
  const alerts = useMemo(() => (alertsQ.data ?? []).map(mapAlert), [alertsQ.data]);
  const projectTasks = useMemo(() => (tasksQ.data ?? []).map(mapTask), [tasksQ.data]);
  const documents = useMemo(() => (documentsQ.data ?? []).map(mapDocument), [documentsQ.data]);
  const projectVOs = useMemo(() => (vosQ.data ?? []).map(mapVO), [vosQ.data]);

  const worksOrders = useMemo(
    () => (wosQ.data ?? []).map((w) => mapWorksOrder(w, woAreasQ.data ?? [], woLinesQ.data ?? [])),
    [wosQ.data, woAreasQ.data, woLinesQ.data],
  );

  /* ── mutations ── */

  const run = useCallback(
    async (fn: () => Promise<unknown>, success: string, keys: string[]) => {
      try {
        const result = await fn();
        invalidate(...keys);
        toast.success(typeof result === "string" ? `${success} (${result})` : success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        throw e;
      }
    },
    [invalidate]
  );

  const createPO = useCallback(
    async (data: NewPOData) => {
      const project = projects.find((p) => p.id === data.projectId);
      await run(
        () =>
          dbCreatePO({
            supplierName: data.supplier,
            projectId: data.projectId,
            projectCode: project?.code ?? "",
            projectName: project?.name ?? "",
            deliveryDate: data.deliveryDate,
            worksOrder: data.worksOrder,
            shipTo: data.shipTo,
            paymentTerms: data.paymentTerms,
            requestedBy: data.requestedBy,
            remarks: data.remarks,
            items: data.items,
          }),
        "Purchase order created — pending approval",
        ["pos", "poLines", "alerts", "documents"]
      );
    },
    [projects, run]
  );

  const updatePOStatus = useCallback(
    (poId: string, status: POStatus) =>
      run(() => dbUpdatePOStatus(poId, status), `PO ${status}`, ["pos", "alerts"]),
    [run]
  );

  const updatePOFields = useCallback(
    (poId: string, fields: POFieldUpdates) =>
      run(() => dbUpdatePOFields(poId, fields), "PO details updated", ["pos"]),
    [run]
  );

  const updateInvoiceStatus = useCallback(
    (invoiceId: string, status: InvoiceStatus) =>
      run(() => dbUpdateInvoiceStatus(invoiceId, status), `Invoice ${status.replace("-", " ")}`, ["invoices"]),
    [run]
  );

  const updateStock = useCallback(
    async (itemId: string, newQty: number) => {
      const item = inventory.find((i) => i.id === itemId);
      if (!item) return;
      await run(
        () => dbUpdateStock(itemId, newQty, item.alertThreshold),
        `${item.name}: stock set to ${newQty} ${item.unit}`,
        ["materials"]
      );
    },
    [inventory, run]
  );

  const addMaterial = useCallback(
    (input: AddMaterialInput) => run(() => dbAddMaterial(input), `Material "${input.name}" added`, ["materials"]),
    [run]
  );

  const allocateMaterial = useCallback(
    async (materialId: string, projectId: string, qty: number) => {
      const item = inventory.find((i) => i.id === materialId);
      const project = projects.find((p) => p.id === projectId);
      if (!item || !project) return;
      await run(
        () =>
          dbAllocateMaterial({
            materialId,
            currentQty: item.totalQty,
            threshold: item.alertThreshold,
            projectId,
            projectCode: project.code,
            projectName: project.name,
            qty,
          }),
        `Transferred ${qty} ${item.unit} of ${item.name} to ${project.code}`,
        ["materials", "allocations"]
      );
    },
    [inventory, projects, run]
  );

  const createClaim = useCallback(
    async (projectId: string, amount: number, description: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;
      await run(
        () =>
          dbCreateClaim({
            projectId,
            projectCode: project.code,
            projectName: project.name,
            amount,
            description,
          }),
        "Claim submitted",
        ["claims"]
      );
    },
    [projects, run]
  );

  const updateClaimStatus = useCallback(
    (claimId: string, status: Claim["status"]) =>
      run(() => dbUpdateClaimStatus(claimId, status), `Claim marked ${status}`, ["claims"]),
    [run]
  );

  const registerInvoiceUpload = useCallback(
    (file: File) =>
      run(() => dbRegisterInvoiceUpload(file), `Invoice "${file.name}" uploaded and registered`, ["invoices", "documents"]),
    [run]
  );

  const createProject = useCallback(
    (input: CreateProjectInput) =>
      run(() => dbCreateProject(input), `Project ${input.projectCode} created`, ["projects"]),
    [run]
  );

  const resolveAlert = useCallback(
    (alertId: string) => run(() => dbResolveAlert(alertId), "Alert resolved", ["alerts"]),
    [run]
  );

  const createWorksOrder = useCallback(
    (input: CreateWOInput) =>
      run(() => dbCreateWorksOrder(input), "Works order created", [
        "worksOrders",
        "woAreas",
        "woLines",
      ]),
    [run]
  );

  const updateWOStatus = useCallback(
    (woId: string, status: WOStatus) =>
      run(() => dbUpdateWOStatus(woId, status), "Works order updated", ["worksOrders"]),
    [run]
  );

  const getNextWONumber = useCallback(() => nextWONumber(), []);

  const updateClaimFields = useCallback(
    (claimId: string, fields: ClaimFieldUpdates) =>
      run(() => dbUpdateClaimFields(claimId, fields), "Claim updated", ["claims"]),
    [run]
  );

  const lastSyncedAt = Math.max(
    projectsQ.dataUpdatedAt,
    materialsQ.dataUpdatedAt,
    posQ.dataUpdatedAt,
    invoicesQ.dataUpdatedAt,
    claimsQ.dataUpdatedAt
  );

  return (
    <AppDataContext.Provider
      value={{
        projects,
        inventory,
        purchaseOrders,
        invoices,
        alerts,
        claims,
        projectTasks,
        documents,
        projectVOs,
        worksOrders,
        suppliers: (suppliersQ.data ?? []).map((s) => s.name),
        supplierDetails: new Map(
          (suppliersQ.data ?? []).map((s) => [s.name, { paymentTerms: s.payment_terms ?? "", address: s.address ?? "" }])
        ),
        teamMembers: teamQ.data ?? [],
        materialPrices: poPrices,
        isLoading: projectsQ.isLoading || materialsQ.isLoading || posQ.isLoading,
        lastSyncedAt,
        createPO,
        updatePOStatus,
        updatePOFields,
        updateClaimFields,
        updateInvoiceStatus,
        updateStock,
        addMaterial,
        allocateMaterial,
        createClaim,
        updateClaimStatus,
        registerInvoiceUpload,
        createProject,
        resolveAlert,
        createWorksOrder,
        updateWOStatus,
        getNextWONumber,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}
