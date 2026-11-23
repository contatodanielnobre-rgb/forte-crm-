// Copia TODOS os dados do schema public de um Postgres de origem (Neon) para o Supabase.
// Uso:
//   SOURCE_URL=postgres://... TARGET_URL=postgres://... node scripts/neon-to-supabase.mjs plan   (só compara, não grava)
//   SOURCE_URL=... TARGET_URL=... node scripts/neon-to-supabase.mjs copy                          (copia; aborta se o destino tiver dados)
// Não altera a origem. Nunca imprime as URLs.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const _pg = require('postgres'); const postgres = _pg.default || _pg

const mode = process.argv[2] || 'plan'
const src = postgres(process.env.SOURCE_URL, { max: 1, prepare: false, ssl: 'require', onnotice: () => {} })
const dst = postgres(process.env.TARGET_URL, { max: 1, prepare: false, onnotice: () => {} })

const tablesOf = async (db) => (await db`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`).map((r) => r.table_name)
const colsOf = async (db, t) => (await db`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=${t} order by ordinal_position`).map((r) => `${r.column_name}:${r.data_type}`)

const st = await tablesOf(src), dt = await tablesOf(dst)
console.log('tabelas origem:', st.length, '| destino:', dt.length)
const onlySrc = st.filter((t) => !dt.includes(t)), onlyDst = dt.filter((t) => !st.includes(t))
if (onlySrc.length) console.log('SÓ NA ORIGEM (não serão copiadas):', onlySrc.join(', '))
if (onlyDst.length) console.log('só no destino (ficam vazias):', onlyDst.join(', '))

const common = st.filter((t) => dt.includes(t))
const diffs = []
const counts = {}
for (const t of common) {
  const a = await colsOf(src, t), b = await colsOf(dst, t)
  const miss = a.filter((c) => !b.includes(c)), extra = b.filter((c) => !a.includes(c))
  if (miss.length || extra.length) diffs.push({ t, faltaNoDestino: miss, soNoDestino: extra })
  counts[t] = { origem: (await src.unsafe(`select count(*)::int n from public."${t}"`))[0].n, destino: (await dst.unsafe(`select count(*)::int n from public."${t}"`))[0].n }
}
console.log('diferenças de colunas:', diffs.length ? JSON.stringify(diffs) : 'nenhuma')
console.log('linhas por tabela (origem/destino):')
for (const [t, c] of Object.entries(counts)) if (c.origem || c.destino) console.log('  ', t.padEnd(28), c.origem, '/', c.destino)
console.log('total de linhas na origem:', Object.values(counts).reduce((s, c) => s + c.origem, 0))

if (mode !== 'copy') { console.log('\n(plan: nada foi gravado)'); await src.end(); await dst.end(); process.exit(0) }
if (diffs.length) { console.log('ABORTADO: colunas diferentes entre origem e destino'); process.exit(1) }
if (Object.values(counts).some((c) => c.destino > 0)) { console.log('ABORTADO: o destino já tem dados'); process.exit(1) }

// ordem por chaves estrangeiras (pais antes dos filhos)
const fks = await dst`select cl.relname child, pl.relname parent from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_class pl on pl.oid=c.confrelid join pg_namespace n on n.oid=cl.relnamespace where c.contype='f' and n.nspname='public' and cl.relname<>pl.relname`
const order = []; const left = new Set(common)
while (left.size) {
  const ready = [...left].filter((t) => fks.filter((f) => f.child === t && left.has(f.parent)).length === 0)
  if (!ready.length) { order.push(...left); break }
  for (const t of ready) { order.push(t); left.delete(t) }
}
// referências circulares/auto-referências: relaxa as FKs só durante a cópia, em uma transação
await dst.begin(async (tx) => {
  try { await tx`set local session_replication_role = replica` } catch (e) { console.log('aviso: não consegui relaxar FKs, seguindo pela ordem') }
  for (const t of order) {
    if (!counts[t].origem) continue
    const batch = 500
    for (let off = 0; off < counts[t].origem; off += batch) {
      const [{ j }] = await src.unsafe(`select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) j from (select * from public."${t}" order by ctid limit ${batch} offset ${off}) x`)
      await tx.unsafe(`insert into public."${t}" select * from jsonb_populate_recordset(null::public."${t}", $1::text::jsonb)`, [JSON.stringify(j)])
    }
    console.log('copiada', t, counts[t].origem)
  }
})
// sequences (colunas serial/identity)
const seqs = await dst`select table_name t, column_name c, pg_get_serial_sequence('public.'||quote_ident(table_name), column_name) s from information_schema.columns where table_schema='public' and column_default like 'nextval%'`
for (const q of seqs) if (q.s) await dst.unsafe(`select setval('${q.s}', greatest((select coalesce(max("${q.c}"),0) from public."${q.t}"),1))`)

let bad = 0
for (const t of common) { const n = (await dst.unsafe(`select count(*)::int n from public."${t}"`))[0].n; if (n !== counts[t].origem) { bad++; console.log('DIVERGE', t, counts[t].origem, n) } }
console.log(bad ? `ATENÇÃO: ${bad} tabela(s) divergem` : 'CONFERIDO: todas as tabelas com a mesma quantidade de linhas')
await src.end(); await dst.end()
