import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, FileText, Menu, X, Bell, RefreshCw, Building2, FolderKanban, Package, Radio
} from "lucide-react";
import { useAppData } from "@/data/AppDataContext";
import { timeAgo } from "@/data/sampleData";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/", badge: "VISION" },
  { label: "Projects", icon: FolderKanban, path: "/projects", badge: "VISION" },
  { label: "Inventory", icon: Package, path: "/inventory", badge: "FLOW" },
  { label: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", badge: "FLOW" },
  { label: "Documents", icon: FileText, path: "/documents", badge: "ASSET" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const location = useLocation();
  const { alerts, lastSyncedAt, resolveAlert } = useAppData();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out shrink-0",
          sidebarOpen ? "w-64" : "w-[68px]"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col overflow-hidden">
              <span className="font-heading text-sm font-bold text-sidebar-accent-foreground tracking-tight">CONPLUS</span>
              <span className="text-[10px] font-medium text-sidebar-foreground/60 uppercase tracking-widest">Resources</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">{item.badge}</span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Live view link */}
        <a
          href="/v2"
          target="_blank"
          rel="noreferrer"
          className="mx-3 mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all"
        >
          <Radio className="h-[18px] w-[18px] shrink-0 text-success" />
          {sidebarOpen && (
            <>
              <span className="flex-1">Live View</span>
              <span className="text-[9px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">V2</span>
            </>
          )}
        </a>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center h-12 border-t border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Sync indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-pulse-dot text-success" />
              <span>Synced {lastSyncedAt > 0 ? timeAgo(new Date(lastSyncedAt).toISOString()) : "..."}</span>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setAlertsOpen(!alertsOpen)}
                className={cn("relative rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors", alertsOpen && "bg-secondary text-foreground")}
              >
                <Bell className="h-5 w-5" />
                {alerts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{alerts.length}</span>
                )}
              </button>

              {alertsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAlertsOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-96 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-sm font-heading font-semibold text-card-foreground">Alerts</h3>
                      <span className="text-xs text-muted-foreground">{alerts.length} unresolved</span>
                    </div>
                    <div className="divide-y divide-border">
                      {alerts.length === 0 && (
                        <p className="p-6 text-center text-sm text-muted-foreground">No unresolved alerts.</p>
                      )}
                      {alerts.map((a) => (
                        <div key={a.id} className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={cn("text-sm font-medium", a.severity === "high" ? "text-destructive" : "text-card-foreground")}>{a.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-1">{a.project ? `${a.project} · ` : ""}{a.timestamp}</p>
                            </div>
                            <button
                              onClick={() => resolveAlert(a.id)}
                              className="shrink-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              Resolve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Profile */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">JL</div>
              <span className="text-sm font-medium hidden md:inline">Jensen Lim</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
