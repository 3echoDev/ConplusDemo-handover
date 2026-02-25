import { Building2, Users, Bell, Shield, Database, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const tabs = [
  { id: "general", label: "General", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your workspace and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Tabs */}
        <div className="w-48 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", activeTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 rounded-xl border border-border bg-card shadow-sm p-6">
          {activeTab === "general" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-heading font-semibold text-card-foreground mb-4">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "Company Name", value: "Conplus Resources Pte Ltd" },
                    { label: "Registration No.", value: "202312345K" },
                    { label: "Address", value: "10 Anson Road, #12-08, Singapore 079903" },
                    { label: "Contact", value: "+65 6123 4567" },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{f.label}</label>
                      <input defaultValue={f.value} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">Save Changes</button>
              </div>
            </div>
          )}
          {activeTab === "team" && (
            <div className="space-y-4">
              <h3 className="text-base font-heading font-semibold text-card-foreground">Team Members</h3>
              <p className="text-sm text-muted-foreground">Manage your team access and roles. Invite new members to collaborate on projects.</p>
              <div className="rounded-lg border border-border p-8 text-center">
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Team management coming soon</p>
              </div>
            </div>
          )}
          {activeTab === "notifications" && (
            <div className="space-y-4">
              <h3 className="text-base font-heading font-semibold text-card-foreground">Notification Preferences</h3>
              {["Low Stock Alerts", "Invoice Reminders", "PO Approvals", "Claim Updates", "Daily Digest"].map((n) => (
                <div key={n} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <span className="text-sm font-medium text-card-foreground">{n}</span>
                  <button className="h-6 w-10 rounded-full bg-primary relative transition-colors">
                    <span className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary-foreground transition-transform" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {activeTab === "security" && (
            <div className="space-y-4">
              <h3 className="text-base font-heading font-semibold text-card-foreground">Security Settings</h3>
              <div className="rounded-lg border border-border p-8 text-center">
                <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Security configuration coming soon</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
