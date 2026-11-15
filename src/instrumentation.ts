// Garante o fuso horário da operação no servidor (na Vercel a variável TZ é reservada).
export async function register() {
  if (!process.env.TZ || process.env.TZ === "UTC") process.env.TZ = process.env.APP_TZ || "America/Fortaleza";
}
