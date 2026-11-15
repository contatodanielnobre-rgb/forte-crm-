import "./load-env";
// Cria o administrador inicial (se não existir) e carrega os dados de demonstração.
// Uso: npm run db:seed  (variáveis: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD)
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, t } from "../src/db";
import { ensureDefaults } from "../src/lib/bootstrap";
import { loadDemoData } from "../src/lib/demo";

async function main() {
  await ensureDefaults(true);
  const email = (process.env.ADMIN_EMAIL || "admin@fortecompany.com.br").toLowerCase();
  let admin = await db.query.users.findFirst({ where: eq(t.users.email, email) });
  if (!admin) {
    [admin] = await db.insert(t.users).values({ name: process.env.ADMIN_NAME || "Administrador Forte", email, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "forte1234", 10), role: "ADMIN" }).returning();
    console.log(`Admin criado: ${email} / senha: ${process.env.ADMIN_PASSWORD || "forte1234"}`);
  }
  if (process.env.SKIP_DEMO !== "1") { await loadDemoData(admin.id); console.log("Dados de demonstração carregados (usuários demo: senha demo1234)."); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
