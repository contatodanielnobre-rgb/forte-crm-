// Aplica as migrações SQL do Criador de Conteúdo (creator/supabase/migrations) no Postgres do Supabase.
// Uso: npm run creator:migrate        (usa DATABASE_URL do .env; cada arquivo roda em transação e fica registrado)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const _pg = require('postgres'); const postgres = _pg.default || _pg
try { const env = fs.readFileSync('.env', 'utf-8'); for (const l of env.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim() } } catch { /* sem .env */ }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} })
const dir = path.resolve('creator/supabase/migrations')
await sql`create table if not exists public.creator_migrations (name text primary key, applied_at timestamptz not null default now())`
const done = new Set((await sql`select name from public.creator_migrations`).map((r) => r.name))
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if (done.has(f)) { console.log('já aplicada', f); continue }
  const text = fs.readFileSync(path.join(dir, f), 'utf-8')
  try {
    await sql.begin(async (tx) => { await tx.unsafe(text); await tx`insert into public.creator_migrations (name) values (${f})` })
    console.log('APLICADA ', f)
  } catch (e) { console.error('ERRO em', f, '→', e.message); process.exit(1) }
}
await sql.end()
