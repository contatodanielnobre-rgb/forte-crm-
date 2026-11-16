import Image from "next/image";
import { redirect } from "next/navigation";
import { hasUsers } from "@/lib/bootstrap";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuração inicial" };
export default async function SetupPage() {
  if (await hasUsers()) redirect("/login");
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md card p-8 animate-fadeUp">
        <Image src="/brand/logo-full.png" alt="Forte Company" width={180} height={60} className="mb-6" />
        <h1 className="text-xl font-semibold">Configuração inicial</h1>
        <p className="text-sm text-muted mb-6">Crie a conta do administrador para começar a usar o FORTE CRM. As etapas do pipeline, tipos de reunião e regras de pontuação padrão serão criadas automaticamente (você pode editá-las depois em Configurações).</p>
        <SetupForm />
      </div>
    </div>
  );
}
