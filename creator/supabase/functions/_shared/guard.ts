// Proteções das chamadas feitas por clientes: arquivos só das próprias marcas, tamanho dos pedidos, mensagens de erro sem
// detalhes internos e trava contra a IA devolver os manuais de treino da plataforma.

/** caminho de arquivo bem formado e dentro de uma das marcas permitidas */
export function pathAllowed(path: string, brands: Set<string>) {
  if (!path || /(\.\.|\/\/|%|\\)/.test(path) || path.startsWith("/")) return false;
  return brands.has(path.split("/")[0].toLowerCase());
}

/** corta textos gigantes (cada letra enviada à IA custa); arquivos em base64 têm limite próprio */
export function clampBody(value: unknown, max = 24_000, depth = 0): unknown {
  if (typeof value === "string") return value.length > max ? value.slice(0, max) : value;
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 400).map((v) => clampBody(v, max, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 200).map(([k, v]) => [k, k.endsWith("_b64") ? v : clampBody(v, max, depth + 1)]));
}

/** o que o cliente pode ler quando algo falha: nunca a resposta crua do provedor */
export function publicError(message: string) {
  if (/safety|moderation|content[_ ]policy|policy_violation|rejected by|not allowed/i.test(message)) return "O pedido foi recusado pelos filtros de segurança. Reescreva sem conteúdo proibido.";
  if (/rate limit|429|overloaded|timeout|timed out/i.test(message)) return "O serviço de imagem está muito ocupado agora. Tente de novo em alguns minutos.";
  return "Não consegui concluir agora. Se algum crédito foi usado, ele voltou. Tente de novo em alguns minutos.";
}

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const SIZE = 14;
/** quantos trechos de 14 palavras da resposta são cópia literal dos manuais */
export function copied(answer: unknown, secrets: (string | null | undefined)[]) {
  const known = new Set<string>();
  for (const s of secrets) { if (!s) continue; const w = words(s); for (let i = 0; i + SIZE <= w.length; i++) known.add(w.slice(i, i + SIZE).join(" ")); }
  if (!known.size) return 0;
  const texts: string[] = [];
  const walk = (v: unknown) => { if (typeof v === "string") texts.push(v); else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk); };
  walk(answer);
  const w = words(texts.join(" "));
  const hit = new Set<string>();
  for (let i = 0; i + SIZE <= w.length; i++) { const k = w.slice(i, i + SIZE).join(" "); if (known.has(k)) hit.add(k); }
  return hit.size;
}
