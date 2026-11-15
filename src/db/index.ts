import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { conn?: ReturnType<typeof postgres> };

const conn =
  globalForDb.conn ??
  postgres(process.env.DATABASE_URL!, {
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    prepare: false, // compatível com pgBouncer / Supabase pooler
    idle_timeout: 20,
  });
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export type DB = typeof db;
export * as t from "./schema";
