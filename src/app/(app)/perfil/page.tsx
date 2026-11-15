import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Field, SubmitButton, Avatar, Badge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { ROLE_LABEL } from "@/lib/permissions";
import { updateProfile } from "../configuracoes/actions";

export const metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const s = await requireUser();
  const [u] = await db.select().from(t.users).where(eq(t.users.id, s.id));
  return (
    <div className="max-w-2xl">
      <PageHeader title="Meu perfil" />
      <div className="card p-5">
        <div className="flex items-center gap-4 mb-5"><Avatar name={u.name} src={u.avatarUrl} size={64} /><div><p className="font-semibold text-lg">{u.name}</p><p className="text-sm text-muted">{u.email}</p><Badge tone="brand" className="mt-1">{ROLE_LABEL[u.role]}</Badge></div></div>
        <ActionForm action={updateProfile} success="Perfil atualizado." className="grid sm:grid-cols-2 gap-4">
          <Field label="Nome"><input name="name" className="input" defaultValue={u.name} required /></Field>
          <Field label="Telefone"><input name="phone" className="input" defaultValue={u.phone ?? ""} /></Field>
          <Field label="Foto de perfil" className="sm:col-span-2"><input type="file" name="avatar" accept="image/*" className="text-sm" /></Field>
          <div className="sm:col-span-2 border-t border-line pt-4"><p className="text-sm font-medium mb-3">Alterar senha</p><div className="grid sm:grid-cols-2 gap-4"><Field label="Senha atual"><input name="currentPassword" type="password" className="input" autoComplete="current-password" /></Field><Field label="Nova senha"><input name="newPassword" type="password" className="input" minLength={6} autoComplete="new-password" /></Field></div></div>
          <div className="sm:col-span-2 flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
