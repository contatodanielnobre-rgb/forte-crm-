import type { Role } from "@/db/schema";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrador", GESTOR: "Gestor", COMERCIAL: "Comercial", OPERACIONAL: "Operacional" };

export type Permission =
  | "dashboard.view" | "pipeline.view" | "pipeline.manage" | "pipeline.viewAll" | "clients.view" | "clients.viewAll" | "clients.manage"
  | "finance.view" | "finance.manage" | "agenda.view" | "journey.manage" | "meetings.view" | "reports.view" | "ranking.view"
  | "settings.manage" | "users.manage" | "goals.manage" | "scoring.manage" | "awards.manage" | "demo.manage";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: ["dashboard.view", "pipeline.view", "pipeline.manage", "pipeline.viewAll", "clients.view", "clients.viewAll", "clients.manage", "finance.view", "finance.manage", "agenda.view", "journey.manage", "meetings.view", "reports.view", "ranking.view", "settings.manage", "users.manage", "goals.manage", "scoring.manage", "awards.manage", "demo.manage"],
  GESTOR: ["dashboard.view", "pipeline.view", "pipeline.manage", "pipeline.viewAll", "clients.view", "clients.viewAll", "clients.manage", "finance.view", "agenda.view", "journey.manage", "meetings.view", "reports.view", "ranking.view"],
  COMERCIAL: ["dashboard.view", "pipeline.view", "pipeline.manage", "clients.view", "agenda.view", "meetings.view", "ranking.view"],
  OPERACIONAL: ["dashboard.view", "clients.view", "agenda.view", "journey.manage", "meetings.view", "ranking.view"],
};

export const can = (role: Role, p: Permission) => MATRIX[role]?.includes(p) ?? false;
export const isManager = (role: Role) => role === "ADMIN" || role === "GESTOR";
