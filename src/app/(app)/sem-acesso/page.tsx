import Link from "next/link";
import { ShieldAlert } from "lucide-react";
export const metadata = { title: "Acesso negado" };
export default function Denied() {
  return <div className="card max-w-lg mx-auto mt-16 p-8 text-center"><div className="mx-auto w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 grid place-items-center mb-3"><ShieldAlert size={22} /></div><h2 className="text-lg font-semibold">Acesso negado</h2><p className="text-sm text-muted mt-1">Seu perfil não tem permissão para acessar esta área. Fale com um administrador.</p><Link href="/dashboard" className="btn-primary mt-5">Ir para o dashboard</Link></div>;
}
