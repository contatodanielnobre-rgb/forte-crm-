import Image from "next/image";
import { redirect } from "next/navigation";
import { hasUsers } from "@/lib/bootstrap";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await hasUsers())) redirect("/setup");
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0a0a0c] text-white relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-brand/25 blur-3xl" />
        <div className="absolute bottom-0 -left-40 w-[420px] h-[420px] rounded-full bg-brand/10 blur-3xl" />
        <Image src="/brand/logo-mark.png" alt="Forte Company" width={64} height={64} className="relative" />
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">O centro de comando comercial, financeiro e operacional da Forte Company.</h1>
          <p className="mt-4 text-white/60">Leads, vendas, clientes, contratos, agenda e desempenho — tudo em um só lugar.</p>
        </div>
        <p className="relative text-xs text-white/40">FORTE CRM · Marketing e Vendas</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fadeUp">
          <Image src="/brand/logo-full.png" alt="Forte Company" width={200} height={70} className="dark:invert-0 mb-8" priority />
          <h2 className="text-xl font-semibold">Bem-vindo de volta</h2>
          <p className="text-sm text-muted mb-6">Entre com suas credenciais para acessar o FORTE CRM.</p>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
