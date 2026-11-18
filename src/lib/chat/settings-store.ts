import "server-only";
import { db, t } from "@/db";

export async function setSetting(key: string, value: unknown) {
  await db.insert(t.settings).values({ key, value: value as never }).onConflictDoUpdate({ target: t.settings.key, set: { value: value as never } });
}
