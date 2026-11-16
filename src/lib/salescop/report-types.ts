/** Tipos compartilhados (cliente/servidor) dos relatórios inteligentes. */
export const AI_REPORT_TYPES = [
  { key: "diario", label: "Relatório diário" }, { key: "semanal", label: "Relatório semanal" }, { key: "mensal", label: "Relatório mensal" },
  { key: "vendedor", label: "Individual por vendedor" }, { key: "conversao", label: "Relatório de conversão" }, { key: "produtividade", label: "Relatório de produtividade" }, { key: "gargalos", label: "Relatório de gargalos" },
] as const;
export type AiReportKind = (typeof AI_REPORT_TYPES)[number]["key"];
export type ReportContent = {
  indicadores: { label: string; value: string }[];
  metas: { label: string; value: string }[];
  resultados: string[];
  comparacao: { planejado: number; realizado: number; pct: number; detalhe: string }[];
  problemas: string[];
  oportunidades: string[];
  recomendacoes: string[];
  tabela?: { columns: string[]; rows: (string | number)[][] };
};
