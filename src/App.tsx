import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { AppDataProvider } from "@/data/AppDataContext";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import InventoryPage from "@/pages/InventoryPage";
import PurchaseOrdersPage from "@/pages/PurchaseOrdersPage";
import WorksOrdersPage from "@/pages/WorksOrdersPage";
import DocumentsPage from "@/pages/DocumentsPage";
import LiveViewPage from "@/pages/LiveViewPage";
import { lazy, Suspense } from "react";
const ClaimsPivot = lazy(() => import("@/components/ClaimsPivot"));
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

// Client-facing deployments set VITE_LIVE_VIEW_ONLY=true: the live view is
// served at the root URL and the full app is not reachable at all.
const LIVE_VIEW_ONLY = import.meta.env.VITE_LIVE_VIEW_ONLY === "true";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppDataProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {LIVE_VIEW_ONLY ? (
            <Routes>
              <Route path="/claims" element={<Suspense fallback={<div>Loading…</div>}><ClaimsPivot /></Suspense>} />
              <Route path="*" element={<LiveViewPage />} />
            </Routes>
          ) : (
            <Routes>
              {/* v2: lightweight live presentation view (no app chrome) */}
              <Route path="/v2" element={<LiveViewPage />} />

              {/* v1: full application */}
              <Route
                path="*"
                element={
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/works-orders" element={<WorksOrdersPage />} />
                      <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
                      <Route path="/documents" element={<DocumentsPage />} />
                      <Route path="/claims" element={<Suspense fallback={<div>Loading…</div>}><ClaimsPivot /></Suspense>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                }
              />
            </Routes>
          )}
        </BrowserRouter>
      </AppDataProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
