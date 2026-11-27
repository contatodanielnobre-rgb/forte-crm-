// Vigia das APIs de IA: percebe quando o provedor recusa por falta de saldo (ou chave inválida) e quando volta.
// Olha todas as chamadas em um só lugar (imagem, texto, áudio), sem depender de cada função lembrar de conferir.

export type IssueKind = "credits" | "key";
export interface Issue { kind: IssueKind; code: string }

const HOSTS: Record<string, string> = {
  "api.openai.com": "openai", "generativelanguage.googleapis.com": "google", "fal.run": "fal",
  "api.ideogram.ai": "ideogram", "api.stability.ai": "stability", "external.api.recraft.ai": "recraft",
};
/** limite de velocidade (rate_limit) NÃO entra aqui: passa sozinho em minutos */
const CREDITS = /(insufficient_quota|billing_hard_limit_reached|billing_not_active|credit_balance_exhausted|project_spend_limit_exceeded|organization_spend_limit_exceeded|organization_usage_limit_exceeded|exceeded your current quota|exhausted[_ ]balance|insufficient[_ ](balance|funds)|payment[_ ]required)/i;
const KEY = /(invalid_api_key|incorrect api key|account_deactivated)/i;
const WATCHED = new Set([400, 401, 402, 403, 429]);
/** o teto de gasto antigo vem como 400: vale só o campo "code" exato, para um texto do cliente repetido no erro não disparar */
const HARD_LIMIT = /"code"\s*:\s*"billing_hard_limit_reached"/;

/** o que esta resposta do provedor diz sobre a conta (null = nada a ver com saldo ou chave) */
export function classify(status: number, body: string): Issue | null {
  if (!WATCHED.has(status)) return null;
  if (status === 400) return HARD_LIMIT.test(body) ? { kind: "credits", code: "billing_hard_limit_reached" } : null;
  const key = KEY.exec(body);
  if (key && (status === 401 || status === 403)) return { kind: "key", code: key[1].toLowerCase().replace(/ /g, "_") };
  const money = CREDITS.exec(body);
  if (money) return { kind: "credits", code: money[1].toLowerCase().replace(/ /g, "_") };
  if (status === 402) return { kind: "credits", code: "payment_required" };
  return null;
}

/** a mesma leitura a partir da mensagem de erro montada pelas funções ("…: 429 {corpo}") */
export function issueInMessage(message: string): Issue | null {
  const m = /:\s*(400|401|402|403|429)\b([\s\S]*)$/.exec(message);
  return m ? classify(Number(m[1]), m[2]) : null;
}

export interface Hooks { down(provider: string, issue: Issue): Promise<unknown>; up(provider: string, startedAt: string): Promise<unknown> }

let installed = false;
export function watchProviders(hooks: Hooks) {
  if (installed) return;
  installed = true;
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const startedAt = new Date().toISOString();
    const res = await real(input, init);
    try {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const provider = HOSTS[url.hostname];
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (provider) {
        if (!res.ok && WATCHED.has(res.status)) {
          const issue = classify(res.status, (await res.clone().text()).slice(0, 2000));
          if (issue) await hooks.down(provider, issue);
        } else if (res.ok && method === "POST") await hooks.up(provider, startedAt); // só uma criação paga prova que há saldo
      }
    } catch (e) { console.warn("vigia de API", e instanceof Error ? e.message : String(e)); }
    return res;
  };
}
