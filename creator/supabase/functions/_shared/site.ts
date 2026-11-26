// Leitura de site para o assistente de treino da marca (Edge Function e demo). Só fetch; sem dependências.
import type { SiteSummary } from "./prompts.ts";

const GENERIC = new Set(["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica", "helvetica neue", "arial", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "times new roman", "times", "georgia", "courier new", "courier", "menlo", "monaco", "consolas", "liberation mono", "oxygen", "ubuntu", "cantarell", "fira sans", "droid sans", "open sans"]);

/** Bloqueia endereços internos (localhost, redes privadas) — o servidor não deve ser usado para varrer a rede interna */
function allowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol)) return false;
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (privateIp(h) || h.startsWith("[") || (u.port && !["80", "443"].includes(u.port))) return false;
  return true;
}
const privateIp = (ip: string) => /^(127\.|10\.|0\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^(::1$|::$|f[cd]|fe80|::ffff:)/i.test(ip);
/** um domínio público que aponta para um endereço interno também é recusado */
async function publicHost(host: string) {
  // deno-lint-ignore no-explicit-any
  const resolve = (globalThis as any).Deno?.resolveDns;
  if (!resolve) return true;
  for (const type of ["A", "AAAA"]) {
    try { if (((await resolve(host, type)) as string[]).some(privateIp)) return false; } catch { /* sem registro deste tipo, ou consulta indisponível */ }
  }
  return true;
}

async function get(url: string, ms: number, max: number): Promise<string | null> {
  try {
    let u = new URL(url);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    let res: Response | null = null;
    // os redirecionamentos são seguidos um a um, conferindo cada destino
    for (let hop = 0; hop < 5; hop++) {
      if (!allowed(u) || !(await publicHost(u.hostname))) return null;
      res = await fetch(u.toString(), { signal: ctl.signal, redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; FortePortalBot/1.0)", Accept: "text/html,text/css,*/*" } });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      await res.body?.cancel();
      u = new URL(next, u);
    }
    clearTimeout(timer);
    if (!res?.ok) return null;
    return (await res.text()).slice(0, max);
  } catch { return null; }
}

const hexToRgb = (h: string) => { const s = h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h; return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; };
function isNeutral(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn < 24; // cinza/preto/branco: pouco informativo
}

export async function fetchSite(raw: string): Promise<SiteSummary | null> {
  let url = (raw ?? "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const html = await get(url, 9000, 500_000);
  if (!html) return null;

  const meta = (re: RegExp) => (re.exec(html)?.[1] ?? "").trim();
  const title = meta(/<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s+/g, " ");
  const description = meta(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i) || meta(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);

  // CSS: inline + até 2 folhas de estilo do próprio site
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const base = new URL(url);
  const links = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map((m) => /href=["']([^"']+)["']/i.exec(m[0])?.[1]).filter(Boolean) as string[];
  const googleFamilies: string[] = [];
  for (const href of links) {
    const g = /fonts\.googleapis\.com\/css2?\?(.*)/i.exec(href);
    if (g) { for (const m of g[1].matchAll(/family=([^&:]+)/g)) googleFamilies.push(decodeURIComponent(m[1].replace(/\+/g, " "))); }
  }
  let fetched = 0;
  for (const href of links) {
    if (fetched >= 2 || /fonts\.googleapis\.com/i.test(href)) continue;
    try { const abs = new URL(href, base); if (abs.host !== base.host) continue; const c = await get(abs.toString(), 6000, 300_000); if (c) { css += "\n" + c; fetched++; } } catch { /* ignora */ }
  }
  const all = html + "\n" + css;

  // cores: HEX mais frequentes (sem neutros) + theme-color
  const count = new Map<string, number>();
  for (const m of all.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = "#" + (m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1]).toUpperCase();
    if (isNeutral(hex)) continue;
    count.set(hex, (count.get(hex) ?? 0) + 1);
  }
  const theme = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{6})["']/i.exec(html)?.[1]?.toUpperCase();
  const colors = [...(theme && !isNeutral(theme) ? [theme] : []), ...[...count.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);

  // fontes: Google Fonts + font-family declaradas
  const fams = new Map<string, number>();
  googleFamilies.forEach((f) => fams.set(f, (fams.get(f) ?? 0) + 5));
  for (const m of all.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    for (const part of m[1].split(",")) {
      const n = part.replace(/["']/g, "").replace(/!important/i, "").trim();
      if (!n || GENERIC.has(n.toLowerCase()) || n.startsWith("var(") || n.length > 40) continue;
      fams.set(n, (fams.get(n) ?? 0) + 1);
    }
  }
  const fonts = [...fams.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 6);

  // texto visível
  const text = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 6000);
  return { url, title, description, text, colors, fonts };
}
