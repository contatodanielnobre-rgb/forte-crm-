"use client";
import { useActionState } from "react";
import { setupAction } from "../actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div><label className="label">Seu nome</label><input name="name" className="input" required autoFocus /></div>
      <div><label className="label">E-mail</label><input name="email" type="email" className="input" required /></div>
      <div><label className="label">Senha</label><input name="password" type="password" className="input" minLength={6} required /></div>
      {state?.error && <p className="text-sm text-red-600 bg-red-600/10 rounded-xl px-3 py-2">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Criando..." : "Criar administrador e entrar"}</button>
    </form>
  );
}
