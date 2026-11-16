import type { Role } from "@/db/schema";

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrador", GESTOR: "Gestor", COMERCIAL: "Comercial", OPERACIONAL: "Operacional" };

export type Permission =
  | "dashboard.view" | "pipeline.view" | "pipeline.manage" | "pipeline.viewAll" | "clients.view" | "clients.viewAll" | "clients.manage"
  | "finance.view" | "finance.manage" | "agenda.view" | "journey.manage" | "meetings.view" | "reports.view" | "ranking.view"
  | "settings.manage" | "users.manage" | "goals.manage" | "scoring.manage" | "awards.manage" | "demo.manage"
  // SALES COP AI: view = acessa o módulo (Comercial vê só o próprio recorte); manage = aprova planos, resolve irregularidades, roda análises; settings = configura o agente
  | "salescop.view" | "salescop.manage" | "salescop.settings";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: ["dashboard.view", "pipeline.view", "pipeline.manage", "pipeline.viewAll", "clients.view", "clients.viewAll", "clients.manage", "finance.view", "finance.manage", "agenda.view", "journey.manage", "meetings.view", "reports.view", "ranking.view", "settings.manage", "users.manage", "goals.manage", "scoring.manage", "awards.manage", "demo.manage", "salescop.view", "salescop.manage", "salescop.settings"],
  GESTOR: ["dashboard.view", "pipeline.view", "pipeline.manage", "pipeline.viewAll", "clients.view", "clients.viewAll", "clients.manage", "finance.view", "agenda.view", "journey.manage", "meetings.view", "reports.view", "ranking.view", "salescop.view", "salescop.manage"],
  COMERCIAL: ["dashboard.view", "pipeline.view", "pipeline.manage", "clients.view", "agenda.view", "meetings.view", "ranking.view", "salescop.view"],
  OPERACIONAL: ["dashboard.view", "clients.view", "agenda.view", "journey.manage", "meetings.view", "ranking.view"],
};

export const can = (role: Role, p: Permission) => MATRIX[role]?.includes(p) ?? false;
export const isManager = (role: Role) => role === "ADMIN" || role === "GESTOR";
