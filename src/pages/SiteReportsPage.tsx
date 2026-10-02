import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarRange, ClipboardCheck, HardHat, LayoutGrid, UserRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { isoDate, weekStart } from "@/lib/siteReports";
import { fetchLastWo, fetchMaterials, fetchProjects, reporterName, setReporterName } from "@/lib/siteReportsApi";
import DailyReportTab from "@/components/site-reports/DailyReportTab";
import WeeklyPlanTab from "@/components/site-reports/WeeklyPlanTab";
import DashboardTab from "@/components/site-reports/DashboardTab";
import { ProjectPicker, type SiteMaterial, type SiteProject } from "@/components/site-reports/pickers";
import { Button, TextInput } from "@/components/site-reports/primitives";

/*
  ConPlus — Site Reports
  ----------------------
  Lynn's project planning & tracking workflow (18 Sep, R1 25 Sep) in one tab:
    Daily report  — DAILY WORK REPORT + DAILY MATERIAL REPORT (planned / actual / defect),
                    Save draft before work -> finish ACTUAL at the end of the day -> Submit
    Weekly plan   — the Monday whiteboard as rows
    Dashboard     — the per-project Dashboard Report sheet, with Excel export
  The PM / PC picks the project once; everything below follows it. The URL
  carries ?project=&tab=&date=&week= so a link opens the same view.
*/

type Tab = "daily" | "plan" | "dashboard";
const TABS: { id: Tab; label: string; short: string; Icon: typeof LayoutGrid }[] = [
  { id: "daily", label: "Daily report", short: "Daily", Icon: ClipboardCheck },
  { id: "plan", label: "Weekly plan", short: "Plan", Icon: CalendarRange },
  { id: "dashboard", label: "Dashboard", short: "Dashboard", Icon: LayoutGrid },
];
const LAST_PROJECT_KEY = "conplus_site_reports_project";

const readLastProject = () => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) || "";
  } catch {
    return "";
  }
};

/**
 * embedded: rendered inside the v1 AppLayout, whose <main> scrolls with 24px
 * padding. Sticky offsets are measured inside that padding, so the page bleeds
 * over it (-m-6) and the header pins at -1.5rem: flush with the pane's top
 * instead of leaving a band where content shows through above it.
 */
export default function SiteReportsPage({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<SiteProject[]>([]);
  const [materials, setMaterials] = useState<SiteMaterial[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [lastWo, setLastWo] = useState("");
  const [locationHints, setLocationHints] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dailyDirty, setDailyDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const today = isoDate(new Date());
  const tab = (["daily", "plan", "dashboard"].includes(params.get("tab") ?? "") ? params.get("tab") : "daily") as Tab;
  const date = params.get("date") || today;
  const week = weekStart(params.get("week") || date);
  const code = params.get("project") || readLastProject();
  const project = useMemo(() => projects.find((p) => p.project_code === code) ?? null, [projects, code]);

  const patch = useCallback(
    (next: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) (v == null ? p.delete(k) : p.set(k, v));
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    document.title = "Site Reports · CONPLUS";
    (async () => {
      const [ps, ms] = await Promise.all([fetchProjects(), fetchMaterials()]);
      setProjects(ps);
      setMaterials(ms);
      setLoadingProjects(false);
    })();
  }, []);

  // Remember the project, and keep it in the URL once it resolves.
  useEffect(() => {
    if (!project) return;
    try {
      localStorage.setItem(LAST_PROJECT_KEY, project.project_code);
    } catch {
      /* not remembered in private mode */
    }
    if (params.get("project") !== project.project_code) patch({ project: project.project_code });
  }, [project, params, patch]);

  useEffect(() => {
    if (!project) return;
    setLastWo("");
    fetchLastWo(project).then(setLastWo);
  }, [project]);

  // Location suggestions: what this project's plan and reports already use.
  useEffect(() => {
    if (!project) return;
    (async () => {
      const [{ data: plan }, { data: reps }] = await Promise.all([
        supabase.from("site_weekly_plan").select("location").eq("project_id", project.id).limit(500),
        supabase.from("site_daily_reports").select("site_location, site_report_lines(location)").eq("project_id", project.id).limit(200),
      ]);
      const set = new Set<string>();
      for (const r of (plan as { location: string | null }[]) ?? []) if (r.location) set.add(r.location);
      for (const r of (reps as { site_location: string; site_report_lines: { location: string | null }[] }[]) ?? []) {
        if (r.site_location) set.add(r.site_location);
        for (const l of r.site_report_lines ?? []) if (l.location) set.add(l.location);
      }
      setLocationHints([...set].sort((a, b) => a.localeCompare(b)));
    })();
  }, [project, refreshKey]);

  const changed = useCallback(() => setRefreshKey((k) => k + 1), []);
  const guardNav = (action: () => void) => (dailyDirty ? setPendingNav(() => action) : action());

  return (
    <div className={cn("bg-background", embedded ? "-m-6 min-h-[calc(100%+3rem)]" : "min-h-screen")}>
      <header className={cn("sticky z-40 border-b border-border bg-card", embedded ? "-top-6" : "top-0")}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <a
            href="/"
            onClick={(e) => {
              if (!dailyDirty) return;
              e.preventDefault();
              setPendingNav(() => () => (window.location.href = "/"));
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
            aria-label="Back to Live Operations"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="font-heading text-base font-bold tracking-tight text-foreground">Site Reports</h1>
            <p className="truncate text-xs text-muted-foreground">Weekly plan · daily work &amp; material reports · dashboard</p>
          </div>
          <ReporterChip />
        </div>
      </header>

      <main className={cn("mx-auto space-y-5 px-4 py-5", tab === "dashboard" ? "max-w-7xl" : "max-w-3xl")}>
        {/* Project */}
        <div className="space-y-2">
          <ProjectPicker
            projects={projects}
            value={project}
            loading={loadingProjects}
            onChange={(p) => p.project_code !== project?.project_code && guardNav(() => patch({ project: p.project_code }))}
          />
          {project && (
            <p className="px-1 text-xs text-muted-foreground">
              {[project.client_name, project.location, project.coating_system].filter(Boolean).join(" · ")}
              {lastWo && <span> · WO {lastWo}</span>}
            </p>
          )}
        </div>

        {project && (
          <div role="tablist" aria-label="Site Reports sections" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-secondary/60 p-1">
            {TABS.map(({ id, label, short, Icon }) => (
              <button
                key={id}
                id={`sr-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`sr-panel-${id}`}
                onClick={() => patch({ tab: id })}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150",
                  tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate sm:hidden">{short}</span>
                <span className="hidden truncate sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}

        {!project && !loadingProjects && (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <HardHat className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <p className="mt-3 font-medium text-foreground">Pick a project to start</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              The weekly plan, daily reports and the Dashboard Report are kept per project. Search by project code, name or client.
            </p>
          </div>
        )}

        {project && (
          <>
            {/* Panels stay mounted so an unsaved report survives a look at the dashboard. */}
            <div id="sr-panel-daily" role="tabpanel" aria-labelledby="sr-tab-daily" hidden={tab !== "daily"}>
              <DailyReportTab
                key={project.id}
                project={project}
                materials={materials}
                date={date}
                onDateChange={(d) => patch({ date: d === today ? null : d })}
                onChanged={changed}
                onDirtyChange={setDailyDirty}
                resetSignal={resetSignal}
                locationHints={locationHints}
              />
            </div>
            <div id="sr-panel-plan" role="tabpanel" aria-labelledby="sr-tab-plan" hidden={tab !== "plan"}>
              <WeeklyPlanTab
                key={project.id}
                project={project}
                week={week}
                onWeekChange={(w) => patch({ week: w === weekStart(today) ? null : w })}
                onChanged={changed}
                locationHints={locationHints}
              />
            </div>
            <div id="sr-panel-dashboard" role="tabpanel" aria-labelledby="sr-tab-dashboard" hidden={tab !== "dashboard"}>
              <DashboardTab
                key={project.id}
                project={project}
                lastWo={lastWo}
                refreshKey={refreshKey}
                onOpenDay={(d) => guardNav(() => patch({ tab: "daily", date: d === today ? null : d }))}
              />
            </div>
          </>
        )}
      </main>

      <AlertDialog open={pendingNav !== null} onOpenChange={(o) => !o && setPendingNav(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the unsaved daily report?</AlertDialogTitle>
            <AlertDialogDescription>The open daily report has edits that are not saved. Go back to it and save the draft to keep them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl" onClick={() => patch({ tab: "daily" })}>
              Back to the report
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl"
              onClick={() => {
                const a = pendingNav;
                setPendingNav(null);
                setResetSignal((n) => n + 1);
                a?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Reporting as …" — the name stamped on saves and submissions (no logins in this app). */
function ReporterChip() {
  const [name, setName] = useState(reporterName());
  const [draft, setDraft] = useState(name);
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(name);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-auto inline-flex h-10 max-w-[11rem] cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-foreground transition-colors duration-150 hover:bg-secondary"
          aria-label={name ? `Reporting as ${name}. Change name` : "Set your name"}
        >
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", !name && "text-muted-foreground")}>{name || "Your name"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 origin-[var(--radix-popover-content-transform-origin)] rounded-xl">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setReporterName(draft);
            setName(draft.trim());
            setOpen(false);
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="sr-reporter" className="block text-[13px] font-medium text-foreground">
              Reporting as
            </label>
            <TextInput id="sr-reporter" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" placeholder="e.g. Lynn" autoFocus />
            <p className="text-xs text-muted-foreground">Saved on this device and stamped on every save and submission.</p>
          </div>
          <Button variant="primary" type="submit" className="w-full">
            Save name
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
