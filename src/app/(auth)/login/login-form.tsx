"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";
import { LogIn } from "lucide-react";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div><label className="label">E-mail</label><input name="email" type="email" className="input" placeholder="voce@fortecompany.com.br" required autoFocus /></div>
      <div><label className="label">Senha</label><input name="password" type="password" className="input" placeholder="••••••••" required /></div>
      {state?.error && <p className="text-sm text-red-600 bg-red-600/10 rounded-xl px-3 py-2">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}><LogIn size={16} /> {pending ? "Entrando..." : "Entrar"}</button>
    </form>
  );
}
