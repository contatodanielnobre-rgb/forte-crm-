import "./load-env";
// Aplica as migrações SQL da pasta ./drizzle (uso: npm run db:migrate)
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrações aplicadas com sucesso.");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
