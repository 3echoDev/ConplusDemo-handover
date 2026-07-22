import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Calendar, DollarSign, MapPin, TrendingUp, Users, X } from "lucide-react";
import { StatusBadge } from "@/components/shared/UIComponents";
import { formatCurrency } from "@/data/sampleData";
import { useAppData } from "@/data/AppDataContext";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const labelCls = "block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5";

interface VORowInput {
  voNumber: string;
  quotationRef: string;
  amount: string;
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { projects, createProject } = useAppData();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [clientPo, setClientPo] = useState("");
  const [scope, setScope] = useState("");
  const [salesManager, setSalesManager] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [vos, setVos] = useState<VORowInput[]>([]);
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const codeTaken = projects.some((p) => p.code.toLowerCase() === code.trim().toLowerCase());
  const valid = code.trim() !== "" && name.trim() !== "" && !codeTaken;

  const setVo = (i: number, k: keyof VORowInput, v: string) =>
    setVos(vos.map((row, n) => (n === i ? { ...row, [k]: v } : row)));

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createProject({
        projectCode: code.trim(),
        name: name.trim(),
        clientName: client.trim(),
        clientPo: clientPo.trim(),
        scope: scope.trim(),
        salesManager: salesManager.trim().toUpperCase(),
        contractValue: Number(contractValue) || 0,
        siteAddress: siteAddress.trim(),
        companyAddress: companyAddress.trim(),
        startDate,
        vos: vos.map((v) => ({ voNumber: v.voNumber.trim(), quotationRef: v.quotationRef.trim(), amount: Number(v.amount) || 0 })),
      });
      setCode(""); setName(""); setClient(""); setClientPo(""); setScope(""); setSalesManager("");
      setContractValue(""); setSiteAddress(""); setCompanyAddress(""); setStartDate(""); setVos([]);
      onClose();
    } catch {
      // toast shown by context
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-heading font-semibold text-card-foreground">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Project Code</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. E26001" className={inputCls} />
            {codeTaken && <p className="text-xs text-destructive mt-1">This project code already exists.</p>}
          </div>
          <div>
            <label className={labelCls}>Sales Manager</label>
            <input type="text" value={salesManager} onChange={(e) => setSalesManager(e.target.value)} placeholder="e.g. JENSEN" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Project / Site Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tampines Industrial Park B" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Client (Main Contractor)</label>
            <input type="text" value={client} onChange={(e) => setClient(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Client PO No</label>
            <input type="text" value={clientPo} onChange={(e) => setClientPo(e.target.value)} placeholder="e.g. PO-0022344" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Scope of Work</label>
            <input type="text" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="e.g. Supply And Apply Of Epoxy Floor Coating System" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Site Address</label>
            <textarea rows={2} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Project / site address" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Company Address (client's registered address)</label>
            <textarea rows={2} value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Contract Value (SGD)</label>
            <input type="number" min={0} step={0.01} value={contractValue} onChange={(e) => setContractValue(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Commencement Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </div>

          {/* Variation Orders — each with its own quotation reference */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls + " mb-0"}>Variation Orders</label>
              <button type="button" onClick={() => setVos([...vos, { voNumber: "", quotationRef: "", amount: "" }])} className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                + Add VO
              </button>
            </div>
            {vos.length === 0 && <p className="text-xs text-muted-foreground">None — add VOs now or later; the total contract value updates automatically.</p>}
            <div className="space-y-2">
              {vos.map((vo, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 items-center">
                  <input type="text" value={vo.voNumber} onChange={(e) => setVo(i, "voNumber", e.target.value)} placeholder={`VO${i + 1}`} className={inputCls} />
                  <input type="text" value={vo.quotationRef} onChange={(e) => setVo(i, "quotationRef", e.target.value)} placeholder="Quotation ref" className={inputCls} />
                  <input type="number" min={0} step={0.01} value={vo.amount} onChange={(e) => setVo(i, "amount", e.target.value)} placeholder="Amount" className={inputCls} />
                  <button type="button" onClick={() => setVos(vos.filter((_, n) => n !== i))} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {vos.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Total contract value will be {formatCurrency((Number(contractValue) || 0) + vos.reduce((s, v) => s + (Number(v.amount) || 0), 0))}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || saving}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              valid && !saving ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, isLoading } = useAppData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [showNew, setShowNew] = useState(false);

  const filtered = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase()) ||
                         project.client.toLowerCase().includes(search.toLowerCase()) ||
                         project.code.toLowerCase().includes(search.toLowerCase()) ||
                         project.location.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || project.status === filter;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "active" || p.status === "delayed").length,
    completed: projects.filter((p) => p.status === "completed").length,
    totalBudget: projects.reduce((sum, p) => sum + p.budget, 0),
    totalContract: projects.reduce((sum, p) => sum + p.budget, 0),
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">VISION — Project Management & Tracking</p>
        </div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Projects</span>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <p className="text-3xl font-heading font-bold text-card-foreground">{stats.total}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</span>
            <Users className="h-4 w-4 text-success" />
          </div>
          <p className="text-3xl font-heading font-bold text-success">{stats.active}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed</span>
            <Calendar className="h-4 w-4 text-accent" />
          </div>
          <p className="text-3xl font-heading font-bold text-card-foreground">{stats.completed}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Contract</span>
            <DollarSign className="h-4 w-4 text-warning" />
          </div>
          <p className="text-2xl font-heading font-bold text-card-foreground">{formatCurrency(stats.totalBudget)}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              filter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter("active")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              filter === "active" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            Active
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              filter === "completed" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((project) => (
          <div
            key={project.id}
            className="rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all cursor-pointer group"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-base font-heading font-semibold text-card-foreground group-hover:text-primary transition-colors mb-1">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {project.client} · {project.code}
                  </div>
                </div>
                <StatusBadge status={project.status} />
              </div>

              <div className="space-y-4">
                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium text-card-foreground">{project.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        project.progress >= 75 ? "bg-success" : project.progress >= 50 ? "bg-primary" : "bg-warning"
                      )}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Budget</p>
                    <p className="text-sm font-semibold text-card-foreground">{formatCurrency(project.budget)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Timeline</p>
                    <p className="text-sm font-semibold text-card-foreground">
                      {project.startDate} - {project.endDate}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {isLoading ? "Loading projects from database..." : "No projects found matching your criteria."}
          </p>
        </div>
      )}

      <NewProjectDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
