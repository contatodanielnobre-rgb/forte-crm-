// Importa os dados do Criador de Conteúdo que estavam no PC (demo/.data) para o Supabase do admin.
// Uso: node creator/scripts/import-from-pc.mjs <pasta demo/.data> <email do dono dos registros> [--dry]
// Mantém os mesmos ids (as imagens e referências continuam apontando certo), troca created_by pelo usuário informado
// e envia os arquivos referenciados para o bucket privado "studio". Não imprime chaves.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const _pg = require('postgres'); const postgres = _pg.default || _pg

const [dataDir, ownerEmail, flag] = process.argv.slice(2)
const DRY = flag === '--dry'
const read = (f) => fs.readFileSync(f, 'utf-8')
const envOf = (txt) => { const o = {}; for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim() } return o }
const adm = envOf(read('.env'))
const cofre = envOf(read(process.env.COFRE_PATH || 'E:/Forte Company/CRM/CHAVES-COLE-AQUI.env'))
const SB = cofre.FORTE_CRM_ADMIN_URL, SECRET = cofre.FORTE_CRM_ADMIN_SECRET_KEY
const H = { apikey: SECRET, Authorization: 'Bearer ' + SECRET }
const sql = postgres(adm.DATABASE_URL, { max: 2, prepare: false, onnotice: () => {} })

// 1) usuário dono (Supabase Auth + profiles)
async function ensureOwner() {
  let r = await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H }); let j = await r.json()
  let u = (j.users ?? []).find((x) => x.email?.toLowerCase() === ownerEmail.toLowerCase())
  if (!u) {
    r = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, password: crypto.randomBytes(24).toString('base64url'), email_confirm: true }) })
    u = await r.json(); if (!u.id) throw new Error('não consegui criar o usuário no Auth: ' + JSON.stringify(u).slice(0, 200))
  }
  await sql`insert into public.profiles (id, email, full_name, role) values (${u.id}, ${ownerEmail}, ${ownerEmail.split('@')[0]}, 'admin') on conflict (id) do update set role = 'admin', active = true`
  return u.id
}

const db = JSON.parse(read(path.join(dataDir, 'db.json'))).db
const TABLES = ['studio_settings', 'studio_brands', 'studio_assets', 'studio_brand_docs', 'studio_generations', 'studio_images', 'logo_projects', 'logo_versions', 'logo_brandings', 'thumb_projects', 'thumb_versions']
const owner = DRY ? '00000000-0000-0000-0000-000000000000' : await ensureOwner()
console.log('dono dos registros:', ownerEmail, DRY ? '(simulação)' : owner)

const colsOf = async (t) => (await sql`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=${t}`).map((r) => r.column_name)
await sql.begin(async (tx) => {
  try { await tx`set local session_replication_role = replica` } catch { console.log('aviso: não consegui desligar gatilhos') }
  for (const t of TABLES) {
    const rows = db[t] ?? []
    if (!rows.length) { console.log(t.padEnd(22), 'vazia'); continue }
    const dcols = await colsOf(t)
    const cols = dcols.filter((c) => c in rows[0] || rows.some((r) => c in r))
    const clean = rows.map((r) => { const o = {}; for (const c of cols) if (c in r) o[c] = r[c]; for (const k of ['created_by', 'updated_by']) if (k in o) o[k] = o[k] ? owner : null; if ('client_id' in o) o.client_id = null; return o })
    const dropped = Object.keys(rows[0]).filter((k) => !dcols.includes(k))
    if (t === 'studio_settings') { // linha única já existe: atualiza
      const r0 = clean[0]; delete r0.id
      const sets = Object.keys(r0)
      if (sets.length && !DRY) await tx.unsafe(`update public.studio_settings set ${sets.map((c, i) => `"${c}" = (jsonb_populate_record(null::public.studio_settings, $1::text::jsonb)).${`"${c}"`}`).join(', ')}`, [JSON.stringify(r0)])
      console.log(t.padEnd(22), 'atualizada'); continue
    }
    // uma linha por vez, só com as colunas que ela tem (o resto usa o padrão do banco)
    if (!DRY) for (const o of clean) {
      const ks = Object.keys(o).filter((k) => o[k] !== undefined && dcols.includes(k))
      const cl = ks.map((c) => `"${c}"`).join(', ')
      await tx.unsafe(`insert into public."${t}" (${cl}) select ${cl} from jsonb_populate_record(null::public."${t}", $1::text::jsonb) on conflict do nothing`, [JSON.stringify(o)])
    }
    console.log(t.padEnd(22), rows.length, 'linhas', dropped.length ? `(colunas ignoradas: ${dropped.join(',')})` : '')
  }
  if (DRY) throw new Error('DRY')
}).catch((e) => { if (e.message !== 'DRY') throw e; console.log('simulação concluída: nada gravado') })

// 2) arquivos referenciados → bucket studio
const refd = new Set()
for (const t of TABLES) for (const r of db[t] ?? []) for (const [k, v] of Object.entries(r)) if (typeof v === 'string' && /path$/.test(k) && v.includes('/')) refd.add(v)
const types = JSON.parse(read(path.join(dataDir, 'db.json'))).types ?? {}
const list = [...refd].filter((p) => fs.existsSync(path.join(dataDir, 'files', 'studio', p)))
console.log('arquivos referenciados:', refd.size, '| existem no PC:', list.length)
if (!DRY) {
  let ok = 0, fail = 0, i = 0
  const worker = async () => {
    while (i < list.length) {
      const p = list[i++]
      const buf = fs.readFileSync(path.join(dataDir, 'files', 'studio', p))
      const ct = types['studio/' + p] || (p.endsWith('.png') ? 'image/png' : 'image/jpeg')
      const r = await fetch(`${SB}/storage/v1/object/studio/${p.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { ...H, 'Content-Type': ct, 'x-upsert': 'true' }, body: buf })
      if (r.ok) ok++; else { fail++; console.log('falhou', p.slice(0, 60), r.status, (await r.text()).slice(0, 100)) }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  console.log('arquivos enviados:', ok, '| falhas:', fail)
}
await sql.end()
