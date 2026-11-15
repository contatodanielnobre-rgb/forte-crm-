"use client";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const denied = /acesso negado|permiss/i.test(error.message);
  return (
    <div className="card max-w-lg mx-auto mt-16 p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 grid place-items-center mb-3"><ShieldAlert size={22} /></div>
      <h2 className="text-lg font-semibold">{denied ? "Acesso negado" : "Algo deu errado"}</h2>
      <p className="text-sm text-muted mt-1">{denied ? "Seu perfil não tem permissão para acessar esta área. Fale com um administrador." : error.message || "Ocorreu um erro inesperado."}</p>
      <div className="flex justify-center gap-2 mt-5"><Link href="/dashboard" className="btn-primary">Ir para o dashboard</Link>{!denied && <button onClick={reset} className="btn-secondary">Tentar novamente</button>}</div>
    </div>
  );
}
