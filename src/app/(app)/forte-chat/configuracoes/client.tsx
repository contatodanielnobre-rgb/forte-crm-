"use client";
import * as React from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { ActionForm, ActionButton } from "@/components/action-form";
import { SubmitButton } from "@/components/ui";
import { createLabel, deleteLabel, saveChatSettings, updateLabel } from "../actions";
import type { ChatSettings } from "@/lib/chat/core";

type L = { id: string; name: string; color: string };
export function LabelsManager({ labels, canManage }: { labels: L[]; canManage: boolean }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {labels.map((l) => editing === l.id ? (
          <li key={l.id}><ActionForm action={updateLabel.bind(null, l.id)} success="Etiqueta atualizada." onDone={() => setEditing(null)} className="flex items-center gap-1.5"><input type="color" name="color" defaultValue={l.color} className="h-8 w-9 rounded-lg border border-line bg-surface" /><input name="name" defaultValue={l.name} className="input h-8 w-40" /><button className="btn-primary btn-sm"><Check size={13} /></button><button type="button" onClick={() => setEditing(null)} className="btn-ghost btn-sm"><X size={13} /></button></ActionForm></li>
        ) : (
          <li key={l.id} className="flex items-center gap-1.5 rounded-xl border border-line pl-2.5 pr-1 h-9 text-sm"><span className="w-3 h-3 rounded-full" style={{ background: l.color }} />{l.name}
            {canManage && <><button onClick={() => setEditing(l.id)} className="btn-ghost h-7 w-7 p-0 rounded-lg" title="Editar"><Pencil size={13} /></button><ActionButton action={() => deleteLabel(l.id)} confirm={`Excluir a etiqueta "${l.name}"? Ela sai de todos os contatos.`} success="Etiqueta excluída." className="btn-ghost h-7 w-7 p-0 rounded-lg text-red-500"><Trash2 size={13} /></ActionButton></>}
          </li>
        ))}
      </ul>
      {canManage ? <ActionForm action={createLabel} success="Etiqueta criada." reset className="flex flex-wrap items-center gap-2"><input type="color" name="color" defaultValue="#D4A017" className="h-10 w-11 rounded-xl border border-line bg-surface" /><input name="name" className="input w-56" placeholder="Nova etiqueta" required /><SubmitButton className="btn-secondary"><Plus size={15} /> Criar</SubmitButton></ActionForm> : <p className="text-xs text-muted">Somente administradores e gestores criam ou editam etiquetas.</p>}
    </div>
  );
}

export function SettingsForm({ settings }: { settings: ChatSettings }) {
  return (
    <ActionForm action={saveChatSettings} success="Configurações salvas." className="space-y-3 text-sm">
      <Toggle name="unassignedVisibleToAll" on={settings.unassignedVisibleToAll} label="Conversas sem responsável ficam visíveis para toda a equipe" hint="Assim nenhum contato novo fica sem atendimento; qualquer vendedor pode clicar em “Assumir atendimento”. Desligado: só administradores e gestores veem e distribuem." />
      <Toggle name="autoCreateLead" on={settings.autoCreateLead} label="Criar lead automaticamente para números desconhecidos" hint="Mensagem de um número que não existe no CRM cria um lead em “Novo Lead”, origem WhatsApp. Números já cadastrados nunca são duplicados." />
      <Toggle name="logMessagesInHistory" on={settings.logMessagesInHistory} label="Registrar mensagens enviadas no histórico do lead/cliente" hint="Áudios, documentos e imagens sempre geram registro; textos são agrupados (1 registro a cada 30 min) para não poluir a ficha." />
      <SubmitButton>Salvar</SubmitButton>
    </ActionForm>
  );
}
function Toggle({ name, on, label, hint }: { name: string; on: boolean; label: string; hint: string }) {
  return <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" name={name} defaultChecked={on} className="mt-1 accent-[#D4A017] w-4 h-4" /><span><span className="font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span></label>;
}
