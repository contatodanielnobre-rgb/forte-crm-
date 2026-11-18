"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Plus, Archive, Star, Filter, ArrowLeft, Info, CalendarClock, History, ExternalLink, Tag, MoreVertical, UserPlus, Link2, CheckCircle2, Loader2, MessageCircle, AlertTriangle, X, Check, ArchiveRestore, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDay, fmtTime } from "@/lib/format";
import { Avatar, Modal, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, uploadMedia, type Conv, type Label, type Msg, type UserOpt } from "./client-api";
import { MessageBubble } from "./message-bubble";
import { Composer, type Outgoing } from "./composer";
import { ContactPanel } from "./contact-panel";
import { ContactPicker, TaskForm } from "./task-form";
import { assignConversation, createLeadFromConversation, deleteChatMessage, linkConversation, markConversationRead, setConversationStatus, startConversation, toggleArchive, toggleContactLabel, toggleFavorite } from "@/app/(app)/forte-chat/actions";

type Props = { me: UserOpt & { role: string }; users: UserOpt[]; labels: Label[]; configured: boolean; blobEnabled: boolean; canViewAll: boolean; canManageLabels: boolean; canCreateLead: boolean };
type Filters = { q: string; label: string; assignee: string; unread: boolean; kind: "" | "lead" | "cliente" | "novo"; view: "todas" | "arquivadas" | "favoritas" };
const STATUS_OPTS = [{ k: "ABERTA", l: "Em atendimento" }, { k: "AGUARDANDO", l: "Aguardando" }, { k: "RESOLVIDA", l: "Resolvida" }] as const;

export function ChatApp(p: Props) {
  const toast = useToast(); const push = toast.push; const sp = useSearchParams();
  const [filters, setFilters] = React.useState<Filters>({ q: "", label: "", assignee: "", unread: false, kind: "", view: "todas" });
  const [showFilters, setShowFilters] = React.useState(false);
  const [convs, setConvs] = React.useState<Conv[] | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(sp.get("c"));
  const [active, setActive] = React.useState<Conv | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [hasMore, setHasMore] = React.useState(true);
  const [panel, setPanel] = React.useState<string | null>(null); // aba do painel lateral
  const [panelKey, setPanelKey] = React.useState(0);
  const [replyTo, setReplyTo] = React.useState<Msg | null>(null);
  const [modal, setModal] = React.useState<null | "new" | "task" | "labels" | "forward" | "template" | "assign" | "link" | "lead" | "search">(null);
  const [forwardMsg, setForwardMsg] = React.useState<Msg | null>(null);
  const [msgSearch, setMsgSearch] = React.useState<{ q: string; results: Msg[] } | null>(null);
  const sinceRef = React.useRef<string | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);
  const filtersRef = React.useRef(filters); filtersRef.current = filters;
  const activeRef = React.useRef(activeId); activeRef.current = activeId;

  const qs = (f: Filters) => new URLSearchParams({ q: f.q, label: f.label, assignee: f.assignee, unread: f.unread ? "1" : "", kind: f.kind, view: f.view }).toString();

  // ───── sincronização (tempo real por polling curto) ─────
  const sync = React.useCallback(async (opts: { full?: boolean } = {}) => {
    const c = activeRef.current;
    const since = !opts.full && c ? sinceRef.current : null;
    try {
      const r = await api<{ now: string; conversations: Conv[]; messages: Msg[] | null; active: Conv | null }>(`/api/chat/sync?${qs(filtersRef.current)}${c ? `&c=${c}` : ""}${since ? `&since=${encodeURIComponent(since)}` : ""}`);
      setConvs(r.conversations);
      if (c && c === activeRef.current) {
        if (r.active) setActive(r.active);
        if (r.messages) {
          if (!since) { setMsgs(r.messages); setHasMore(r.messages.length >= 60); }
          else if (r.messages.length) setMsgs((cur) => { const map = new Map(cur.map((m) => [m.id, m])); for (const m of r.messages!) map.set(m.id, { ...map.get(m.id), ...m, pending: false }); return [...map.values()].filter((m) => !m.tempId || !r.messages!.some((x) => x.id === m.id)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)); });
          sinceRef.current = r.now;
          if (r.active?.unread) void markConversationRead(c).catch(() => {});
        }
      }
    } catch (e) { if (opts.full) push((e as Error).message, "error"); }
  }, [push]);

  React.useEffect(() => { void sync({ full: true }); }, [filters, sync]);
  React.useEffect(() => {
    let alive = true;
    const loop = async () => { while (alive) { await new Promise((r) => setTimeout(r, document.hidden ? 15000 : activeRef.current ? 3000 : 6000)); if (alive) await sync(); } };
    void loop();
    return () => { alive = false; };
  }, [sync]);

  const open = React.useCallback((id: string | null) => {
    setActiveId(id); activeRef.current = id; sinceRef.current = null; setMsgs([]); setReplyTo(null); setMsgSearch(null); atBottom.current = true;
    setActive(id ? convs?.find((c) => c.id === id) ?? null : null);
    const url = new URL(window.location.href); if (id) url.searchParams.set("c", id); else url.searchParams.delete("c"); window.history.replaceState(null, "", url);
    if (id) void sync({ full: true });
  }, [convs, sync]);

  // rola para o fim quando chegam mensagens e o usuário já está no fim
  React.useEffect(() => { const el = scroller.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  const loadOlder = async () => {
    if (!activeId || !msgs.length) return;
    const el = scroller.current; const h = el?.scrollHeight ?? 0;
    const r = await api<{ messages: Msg[] }>(`/api/chat/conversations/${activeId}/messages?before=${encodeURIComponent(String(msgs[0].createdAt))}`);
    setHasMore(r.messages.length >= 60);
    setMsgs((cur) => [...r.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur]);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - h; });
  };

  // ───── envio ─────
  const send = async (o: Outgoing, retryOf?: Msg) => {
    if (!activeId) return;
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Msg = { id: tempId, tempId, conversationId: activeId, direction: "OUT", type: o.file ? (o.file.blob.type.startsWith("audio/") ? "audio" : o.file.blob.type.startsWith("image/") ? "image" : "document") : "text", body: o.text ?? (o.file && !o.file.blob.type.startsWith("audio/") ? o.file.name : null), status: "PENDENTE", error: null, media: null, sender: { id: p.me.id, name: p.me.name }, createdAt: new Date(), updatedAt: new Date(), deleted: false, template: null, forwarded: false, scheduled: false, waMessageId: null, reactionTo: null, reply: replyTo ? { id: replyTo.id, body: replyTo.body, type: replyTo.type, direction: replyTo.direction } : null, pending: true } as Msg;
    if (retryOf) setMsgs((cur) => cur.filter((m) => m.id !== retryOf.id));
    setMsgs((cur) => [...cur, optimistic]); atBottom.current = true;
    const reply = replyTo; setReplyTo(null);
    try {
      let mediaId: string | undefined;
      if (o.file) mediaId = (await uploadMedia(o.file.blob, o.file.name, { durationSec: o.file.durationSec, blobEnabled: p.blobEnabled })).id;
      const r = await api<{ results: { ok: boolean; message: Msg }[] }>("/api/chat/send", { method: "POST", body: JSON.stringify({ conversationId: activeId, text: o.text ?? null, mediaId: mediaId ?? null, replyToId: reply?.id ?? null }) });
      const m = r.results[0].message;
      setMsgs((cur) => cur.map((x) => (x.id === tempId ? { ...m, reply: optimistic.reply } : x)));
    } catch (e) {
      setMsgs((cur) => cur.map((x) => (x.id === tempId ? { ...x, pending: false, status: "FALHA", localError: (e as Error).message, retry: o } as Msg : x)));
    }
    void sync();
  };

  const reactionsByWa = React.useMemo(() => { const map = new Map<string, string[]>(); for (const m of msgs) if (m.type === "reaction" && m.reactionTo && m.body) map.set(m.reactionTo, [...(map.get(m.reactionTo) ?? []), m.body]); return map; }, [msgs]);
  const visibleMsgs = msgs.filter((m) => m.type !== "reaction");
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast.push(ok); await sync(); setPanelKey((k) => k + 1); } catch (e) { toast.push((e as Error).message, "error"); } };

  const counts = { unread: convs?.filter((c) => c.unread > 0).length ?? 0 };
  const showList = !activeId;

  return (
    <div className="flex h-full min-h-0 rounded-2xl overflow-hidden border border-line bg-surface shadow-card">
      {/* COLUNA 1 — conversas */}
      <section className={cn("w-full md:w-[340px] lg:w-[380px] shrink-0 flex flex-col border-r border-line min-h-0", !showList && "hidden md:flex")}>
        <div className="h-14 px-3 flex items-center gap-2 border-b border-line bg-[#0a0a0c] text-white shrink-0">
          <MessageCircle size={18} className="text-gold" /><p className="font-semibold tracking-wide flex-1">FORTE <span className="text-gold">CHAT</span></p>
          <button onClick={() => setModal("new")} className="h-9 w-9 rounded-xl grid place-items-center hover:bg-white/10" title="Nova conversa"><Plus size={18} /></button>
        </div>
        {!p.configured && <Link href="/forte-chat/configuracoes" className="flex items-start gap-2 px-3 py-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-b border-amber-500/20"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> WhatsApp ainda não configurado: envio e recebimento desativados. Ver o que falta →</Link>}
        <div className="p-2.5 space-y-2 border-b border-line">
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Pesquisar conversa, contato ou mensagem" className="input h-9 pl-9 rounded-full bg-surface-2 border-transparent" /></div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {([["todas", "Todas"], ["favoritas", "Favoritas"], ["arquivadas", "Arquivadas"]] as const).map(([k, l]) => <Chip key={k} on={filters.view === k} onClick={() => setFilters({ ...filters, view: k })}>{k === "favoritas" && <Star size={11} />}{k === "arquivadas" && <Archive size={11} />}{l}</Chip>)}
            <Chip on={filters.unread} onClick={() => setFilters({ ...filters, unread: !filters.unread })}>Não lidas{counts.unread > 0 && !filters.unread ? ` · ${counts.unread}` : ""}</Chip>
            <Chip on={showFilters || !!(filters.label || filters.assignee || filters.kind)} onClick={() => setShowFilters((v) => !v)}><Filter size={11} /> Filtros</Chip>
          </div>
          {showFilters && (
            <div className="grid grid-cols-3 gap-1.5">
              <select className="input h-8 text-xs" value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as Filters["kind"] })}><option value="">Leads e clientes</option><option value="lead">Somente leads</option><option value="cliente">Somente clientes</option><option value="novo">Não cadastrados</option></select>
              <select className="input h-8 text-xs" value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })}><option value="">Todas etiquetas</option>{p.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <select className="input h-8 text-xs" value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}><option value="">Responsável</option><option value="none">Sem responsável</option>{p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </div>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto min-h-0">
          {convs === null && <li className="p-8 grid place-items-center"><Loader2 className="animate-spin text-muted" /></li>}
          {convs?.length === 0 && <li className="p-8 text-center text-sm text-muted">{filters.q || filters.label || filters.assignee || filters.unread || filters.kind ? "Nenhuma conversa com esses filtros." : p.configured ? "Nenhuma conversa ainda. Clique em + para iniciar com um contato do CRM." : "As conversas aparecem aqui quando o WhatsApp estiver conectado."}</li>}
          {convs?.map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.id)} className={cn("w-full text-left flex gap-3 px-3 py-2.5 border-b border-line/60 hover:bg-surface-2 transition", activeId === c.id && "bg-surface-2")}>
                <Avatar name={c.name} size={46} className={cn(c.kind === "cliente" && "ring-2 ring-emerald-500/50", c.kind === "lead" && "ring-2 ring-gold/40")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><p className="font-medium truncate flex-1">{c.name}</p><span className={cn("text-[11px] shrink-0", c.unread ? "text-gold font-semibold" : "text-muted")}>{c.lastMessageAt ? listTime(c.lastMessageAt) : ""}</span></div>
                  <div className="flex items-center gap-2"><p className="text-[13px] text-muted truncate flex-1">{c.lastMessageDirection === "OUT" && "Você: "}{c.lastMessagePreview ?? (c.company || c.phone)}</p>{c.favorite && <Star size={12} className="text-gold fill-gold shrink-0" />}{c.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-gold text-black text-[11px] font-bold grid place-items-center shrink-0">{c.unread}</span>}</div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wide", c.kind === "cliente" ? "text-emerald-600" : c.kind === "lead" ? "text-gold" : "text-muted")}>{c.kind === "novo" ? "Não cadastrado" : c.kind}</span>
                    {c.status !== "ABERTA" && <span className="text-[10px] text-muted">· {STATUS_OPTS.find((s) => s.k === c.status)?.l}</span>}
                    {c.labels.slice(0, 3).map((l) => <LabelDot key={l.id} l={l} />)}{c.labels.length > 3 && <span className="text-[10px] text-muted">+{c.labels.length - 3}</span>}
                    <span className="ml-auto text-[10px] text-muted truncate max-w-[110px]">{c.assignee?.name ?? "Sem responsável"}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* COLUNA 2 — conversa */}
      <section className={cn("flex-1 min-w-0 flex flex-col min-h-0", showList && "hidden md:flex")}>
        {!activeId ? (
          <div className="flex-1 grid place-items-center text-center p-8 bg-surface-2/40">
            <div><div className="w-16 h-16 mx-auto rounded-2xl bg-[#0a0a0c] grid place-items-center mb-4"><MessageCircle className="text-gold" size={28} /></div><p className="font-semibold text-lg">FORTE CHAT</p><p className="text-sm text-muted mt-1 max-w-sm">Atenda leads e clientes pelo WhatsApp sem sair do CRM. Selecione uma conversa ou inicie uma nova com um contato já cadastrado.</p><button onClick={() => setModal("new")} className="btn-primary mt-4"><Plus size={16} /> Nova conversa</button></div>
          </div>
        ) : !active ? <div className="flex-1 grid place-items-center"><Loader2 className="animate-spin text-muted" /></div> : (
          <>
            <header className="min-h-14 px-2 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 border-b border-line bg-surface shrink-0">
              <button onClick={() => open(null)} className="md:hidden btn-ghost btn-icon h-9 w-9"><ArrowLeft size={18} /></button>
              <button onClick={() => setPanel(panel ? null : "dados")} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                <Avatar name={active.name} size={40} />
                <div className="min-w-0">
                  <p className="font-semibold truncate leading-tight">{active.name}{active.company && <span className="font-normal text-muted"> · {active.company}</span>}</p>
                  <p className="text-xs text-muted truncate">{active.phone}{active.stage && <> · <span style={{ color: active.stage.color }}>●</span> {active.stage.name}</>} · {active.assignee ? `Resp.: ${active.assignee.name}` : "Sem responsável"}</p>
                  {active.labels.length > 0 && <div className="flex gap-1 mt-1 flex-wrap">{active.labels.map((l) => <LabelPill key={l.id} l={l} />)}</div>}
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setModal("task")} className="btn-secondary btn-sm hidden sm:inline-flex" title="Agendar tarefa"><CalendarClock size={14} /> <span className="hidden lg:inline">Agendar tarefa</span></button>
                <button onClick={() => setModal("task")} className="sm:hidden btn-ghost btn-icon h-9 w-9" title="Agendar tarefa"><CalendarClock size={18} /></button>
                <button onClick={() => setPanel("historico")} className="btn-ghost btn-icon h-9 w-9" title="Histórico"><History size={18} /></button>
                {(active.clientId || active.leadId) && <Link href={active.clientId ? `/clientes/${active.clientId}` : `/pipeline?lead=${active.leadId}`} className="btn-ghost btn-icon h-9 w-9 hidden sm:grid" title="Abrir ficha completa"><ExternalLink size={17} /></Link>}
                <button onClick={() => setPanel(panel ? null : "dados")} className={cn("btn-ghost btn-icon h-9 w-9", panel && "text-gold")} title="Informações do contato"><Info size={18} /></button>
                <ConvMenu c={active} p={p} onAction={(k) => {
                  if (k === "labels" || k === "assign" || k === "link" || k === "lead" || k === "search") setModal(k);
                  else if (k === "fav") void run(() => toggleFavorite(active.id), active.favorite ? "Removida das favoritas." : "Adicionada às favoritas.");
                  else if (k === "archive") void run(() => toggleArchive(active.id), active.archived ? "Conversa desarquivada." : "Conversa arquivada.");
                  else if (k === "take") void run(() => assignConversation(active.id, p.me.id), "Você assumiu o atendimento.");
                  else if (k.startsWith("status:")) void run(() => setConversationStatus(active.id, k.slice(7) as "ABERTA"), "Status atualizado.");
                }} />
              </div>
            </header>
            {msgSearch && (
              <div className="border-b border-line bg-surface-2/60 px-4 py-2 text-sm max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between mb-1"><p className="text-xs text-muted">{msgSearch.results.length} resultado(s) para “{msgSearch.q}”</p><button onClick={() => setMsgSearch(null)}><X size={14} /></button></div>
                {msgSearch.results.map((m) => <button key={m.id} onClick={() => { const el = document.getElementById(`m-${m.id}`); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("animate-pulse"); setTimeout(() => el.classList.remove("animate-pulse"), 1500); } else toast.push("Role para cima para carregar mensagens mais antigas.", "error"); }} className="block w-full text-left py-1 hover:text-gold truncate"><span className="text-xs text-muted mr-2">{fmtDay(new Date(m.createdAt))} {fmtTime(m.createdAt)}</span>{m.body}</button>)}
              </div>
            )}
            <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (el.scrollTop < 40 && hasMore && msgs.length) void loadOlder(); }} className="flex-1 overflow-y-auto min-h-0 py-3 space-y-1.5 bg-[radial-gradient(circle_at_1px_1px,rgb(var(--line))_1px,transparent_0)] [background-size:22px_22px] bg-surface-2/50">
              {hasMore && msgs.length >= 60 && <div className="text-center"><button onClick={loadOlder} className="btn-ghost btn-sm">Carregar mensagens anteriores</button></div>}
              {visibleMsgs.length === 0 && <p className="text-center text-sm text-muted py-10">Nenhuma mensagem ainda nesta conversa.</p>}
              {visibleMsgs.map((m, i) => {
                const day = fmtDay(new Date(m.createdAt)); const prev = visibleMsgs[i - 1];
                return (
                  <React.Fragment key={m.id}>
                    {(!prev || fmtDay(new Date(prev.createdAt)) !== day) && <div className="text-center py-2"><span className="text-[11px] bg-surface border border-line rounded-full px-3 py-1 text-muted capitalize shadow-sm">{day}</span></div>}
                    <MessageBubble m={m} reactions={m.waMessageId ? reactionsByWa.get(m.waMessageId) : undefined} onReply={() => setReplyTo(m)} onForward={() => { setForwardMsg(m); setModal("forward"); }} canDelete={p.canViewAll || (m.direction === "OUT" && m.sender?.id === p.me.id)}
                      onDelete={() => { if (confirm("Excluir esta mensagem do CRM?\n\nAtenção: a Cloud API do WhatsApp não permite apagar a mensagem do celular do contato — ela será removida apenas do FORTE CHAT (registrado na auditoria).")) void run(() => deleteChatMessage(m.id), "Mensagem excluída do CRM."); }}
                      onRetry={(m as Msg & { retry?: Outgoing }).retry ? () => void send((m as Msg & { retry: Outgoing }).retry, m) : undefined}
                      onJump={(id) => document.getElementById(`m-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })} />
                  </React.Fragment>
                );
              })}
            </div>
            <Composer disabled={!p.configured} disabledReason={<>Envio desativado: a integração oficial com o WhatsApp ainda não foi configurada. <Link href="/forte-chat/configuracoes" className="underline font-medium">Ver o que falta</Link></>} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSend={(o) => send(o)} onTemplates={() => setModal("template")} windowOpen={active.windowOpen} />
          </>
        )}
      </section>

      {/* COLUNA 3 — informações do contato */}
      {activeId && panel && (
        <div className="fixed inset-0 z-40 min-[1600px]:static min-[1600px]:z-auto min-[1600px]:w-[340px] min-[1600px]:shrink-0 flex">
          <div className="flex-1 bg-black/40 min-[1600px]:hidden" onClick={() => setPanel(null)} />
          <div className="w-[90vw] max-w-[360px] min-[1600px]:w-full min-[1600px]:max-w-none h-full"><ContactPanel conversationId={activeId} tab={panel} onClose={() => setPanel(null)} refreshKey={panelKey} onChanged={() => void sync()} /></div>
        </div>
      )}

      {/* ───── modais ───── */}
      <Modal open={modal === "new"} onClose={() => setModal(null)} title="Nova conversa"><NewConversation onOpen={async (kind, id) => { try { const cid = await startConversation(kind, id); setModal(null); setFilters((f) => ({ ...f, view: "todas" })); open(cid); } catch (e) { toast.push((e as Error).message, "error"); } }} /></Modal>
      <Modal open={modal === "task" && !!active} onClose={() => setModal(null)} title="Agendar tarefa" size="lg">{active && <TaskForm conversationId={active.id} contactName={`${active.name} · ${active.phone}`} users={p.users} me={p.me.id} canAssign={p.canViewAll} blobEnabled={p.blobEnabled} onDone={() => { setModal(null); setPanelKey((k) => k + 1); }} />}</Modal>
      <Modal open={modal === "labels" && !!active} onClose={() => setModal(null)} title="Etiquetas do contato" size="sm">{active && <LabelPicker c={active} labels={p.labels} canManage={p.canManageLabels} onToggle={(id) => run(() => toggleContactLabel(active.id, id))} />}</Modal>
      <Modal open={modal === "forward"} onClose={() => setModal(null)} title="Encaminhar mensagem" size="sm">{forwardMsg && <ForwardPicker convs={convs ?? []} exclude={activeId} onSend={async (ids) => { try { const r = await api<{ results: { ok: boolean; error?: string }[] }>("/api/chat/send", { method: "POST", body: JSON.stringify({ conversationIds: ids, forwardMessageId: forwardMsg.id }) }); const fails = r.results.filter((x) => !x.ok); if (fails.length) toast.push(`${r.results.length - fails.length} enviada(s). Falha: ${fails[0].error}`, "error"); else toast.push("Mensagem encaminhada."); setModal(null); void sync(); } catch (e) { toast.push((e as Error).message, "error"); } }} />}</Modal>
      <Modal open={modal === "template" && !!active} onClose={() => setModal(null)} title="Enviar modelo aprovado" size="md">{active && <TemplatePicker onSend={async (tpl) => { try { await api("/api/chat/send", { method: "POST", body: JSON.stringify({ conversationId: active.id, template: tpl }) }); toast.push("Modelo enviado."); setModal(null); void sync(); } catch (e) { toast.push((e as Error).message, "error"); } }} />}</Modal>
      <Modal open={modal === "assign" && !!active} onClose={() => setModal(null)} title="Responsável pelo atendimento" size="sm">{active && <div className="space-y-1">{p.users.map((u) => <button key={u.id} onClick={() => void run(() => assignConversation(active.id, u.id), "Responsável atualizado.").then(() => setModal(null))} className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-2 text-sm", active.assignee?.id === u.id && "bg-surface-2")}><Avatar name={u.name} size={28} /> <span className="flex-1 text-left">{u.name}</span>{active.assignee?.id === u.id && <Check size={15} className="text-gold" />}</button>)}<button onClick={() => void run(() => assignConversation(active.id, null), "Conversa sem responsável.").then(() => setModal(null))} className="w-full text-left px-3 py-2 rounded-xl hover:bg-surface-2 text-sm text-muted">Remover responsável</button></div>}</Modal>
      <Modal open={modal === "link" && !!active} onClose={() => setModal(null)} title="Vincular a contato existente" size="md">{active && <LinkContact onPick={async (kind, id) => { await run(() => linkConversation(active.id, kind, id), "Conversa vinculada ao cadastro."); setModal(null); }} />}</Modal>
      <Modal open={modal === "lead" && !!active} onClose={() => setModal(null)} title="Cadastrar como novo lead" size="md">{active && <form action={async (fd) => { await run(() => createLeadFromConversation(active.id, fd), "Lead cadastrado no pipeline."); setModal(null); }} className="grid sm:grid-cols-2 gap-3"><Field label="Nome" className="sm:col-span-2"><input name="name" className="input" defaultValue={active.profileName ?? ""} required autoFocus /></Field><Field label="Empresa"><input name="company" className="input" /></Field><Field label="E-mail"><input name="email" type="email" className="input" /></Field><Field label="Valor potencial (R$)"><input name="value" className="input" inputMode="decimal" /></Field><Field label="Telefone"><input className="input bg-surface-2" value={active.phone} readOnly /></Field><div className="sm:col-span-2 flex justify-end"><button className="btn-primary"><UserPlus size={16} /> Cadastrar lead</button></div></form>}</Modal>
      <Modal open={modal === "search" && !!active} onClose={() => setModal(null)} title="Pesquisar nesta conversa" size="sm">{active && <form action={async (fd) => { const q = String(fd.get("q") ?? "").trim(); if (!q) return; try { const r = await api<{ messages: Msg[] }>(`/api/chat/conversations/${active.id}/messages?q=${encodeURIComponent(q)}`); setMsgSearch({ q, results: r.messages }); setModal(null); } catch (e) { toast.push((e as Error).message, "error"); } }} className="flex gap-2"><input name="q" className="input" placeholder="Texto da mensagem" autoFocus /><button className="btn-primary"><Search size={15} /></button></form>}</Modal>
    </div>
  );
}

function listTime(d: Date | string) { const x = new Date(d); const day = fmtDay(x); return day === "Hoje" ? fmtTime(x) : day === "Ontem" ? "Ontem" : x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); }
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={cn("h-7 px-2.5 rounded-full text-xs whitespace-nowrap flex items-center gap-1 border transition", on ? "bg-[#0a0a0c] text-gold border-gold/40 dark:bg-gold/15" : "border-line text-muted hover:text-fg")}>{children}</button>; }
function LabelDot({ l }: { l: Label }) { return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 rounded-full border" style={{ borderColor: `${l.color}55`, color: l.color, background: `${l.color}14` }}>{l.name}</span>; }
function LabelPill({ l }: { l: Label }) { return <span className="text-[10px] font-medium px-1.5 py-px rounded-md text-white" style={{ background: l.color }}>{l.name}</span>; }

function ConvMenu({ c, p, onAction }: { c: Conv; p: Props; onAction: (k: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const Item = ({ k, icon: Icon, children }: { k: string; icon: typeof Tag; children: React.ReactNode }) => <button onClick={() => { setOpen(false); onAction(k); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-left text-sm"><Icon size={14} /> {children}</button>;
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost btn-icon h-9 w-9"><MoreVertical size={18} /></button>
      {open && <>
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-10 z-30 w-60 card py-1">
          <Item k="labels" icon={Tag}>Etiquetas</Item>
          <Item k="search" icon={Search}>Pesquisar mensagens</Item>
          {p.canViewAll ? <Item k="assign" icon={UserCheck}>Atribuir responsável</Item> : !c.assignee && <Item k="take" icon={UserCheck}>Assumir atendimento</Item>}
          <div className="border-t border-line my-1" />
          {STATUS_OPTS.map((s) => <button key={s.k} onClick={() => { setOpen(false); onAction(`status:${s.k}`); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-left text-sm">{c.status === s.k ? <CheckCircle2 size={14} className="text-gold" /> : <span className="w-3.5" />} {s.l}</button>)}
          <div className="border-t border-line my-1" />
          <Item k="fav" icon={Star}>{c.favorite ? "Remover das favoritas" : "Favoritar"}</Item>
          <Item k="archive" icon={c.archived ? ArchiveRestore : Archive}>{c.archived ? "Desarquivar" : "Arquivar"}</Item>
          {c.kind === "novo" && <><div className="border-t border-line my-1" /><Item k="link" icon={Link2}>Vincular a contato existente</Item>{p.canCreateLead && <Item k="lead" icon={UserPlus}>Cadastrar como novo lead</Item>}</>}
        </div>
      </>}
    </div>
  );
}

function NewConversation({ onOpen }: { onOpen: (kind: "lead" | "cliente", id: string) => void }) {
  const [v, setV] = React.useState<{ key: string; label: string } | null>(null);
  return <div className="space-y-3"><p className="text-sm text-muted">Busque um lead ou cliente já cadastrado no CRM. Se já existir conversa com o número, ela é reaberta — o contato nunca é duplicado.</p><ContactPicker value={v} onChange={setV} /><div className="flex justify-end"><button disabled={!v} onClick={() => { const [k, id] = v!.key.split(":"); onOpen(k as "lead", id); }} className="btn-primary">Abrir conversa</button></div></div>;
}
function LinkContact({ onPick }: { onPick: (kind: "lead" | "cliente", id: string) => void }) {
  const [v, setV] = React.useState<{ key: string; label: string } | null>(null);
  return <div className="space-y-3"><p className="text-sm text-muted">Escolha o lead ou cliente que é dono deste número. As etiquetas e o histórico passam a ficar no cadastro.</p><ContactPicker value={v} onChange={setV} /><div className="flex justify-end"><button disabled={!v} onClick={() => { const [k, id] = v!.key.split(":"); onPick(k as "lead", id); }} className="btn-primary"><Link2 size={15} /> Vincular</button></div></div>;
}

function LabelPicker({ c, labels, canManage, onToggle }: { c: Conv; labels: Label[]; canManage: boolean; onToggle: (id: string) => Promise<void> }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const on = new Set(c.labels.map((l) => l.id));
  return (
    <div className="space-y-1">
      {labels.map((l) => <button key={l.id} disabled={!!busy} onClick={async () => { setBusy(l.id); await onToggle(l.id); setBusy(null); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-2 text-sm"><span className="w-3 h-3 rounded-full" style={{ background: l.color }} /><span className="flex-1 text-left">{l.name}</span>{busy === l.id ? <Loader2 size={14} className="animate-spin" /> : on.has(l.id) && <Check size={15} className="text-gold" />}</button>)}
      <p className="text-[11px] text-muted pt-2">As etiquetas ficam salvas no cadastro do lead/cliente.{canManage && <> <Link href="/forte-chat/configuracoes" className="underline">Gerenciar etiquetas</Link></>}</p>
    </div>
  );
}

function ForwardPicker({ convs, exclude, onSend }: { convs: Conv[]; exclude: string | null; onSend: (ids: string[]) => Promise<void> }) {
  const [sel, setSel] = React.useState<string[]>([]); const [q, setQ] = React.useState(""); const [busy, setBusy] = React.useState(false);
  const list = convs.filter((c) => c.id !== exclude && c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <input className="input" placeholder="Buscar conversa" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-72 overflow-y-auto space-y-0.5">{list.map((c) => <li key={c.id}><label className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-surface-2 cursor-pointer text-sm"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id].slice(0, 10) : sel.filter((x) => x !== c.id))} /><Avatar name={c.name} size={28} /><span className="flex-1 truncate">{c.name}</span>{!c.windowOpen && <span className="text-[10px] text-amber-600">fora das 24h</span>}</label></li>)}</ul>
      <div className="flex justify-between items-center"><span className="text-xs text-muted">{sel.length} selecionada(s) · máx. 10</span><button disabled={!sel.length || busy} onClick={async () => { setBusy(true); await onSend(sel); setBusy(false); }} className="btn-primary">{busy && <Loader2 size={15} className="animate-spin" />} Encaminhar</button></div>
    </div>
  );
}

function TemplatePicker({ onSend }: { onSend: (t: { name: string; language: string; params: string[] }) => Promise<void> }) {
  const [list, setList] = React.useState<{ name: string; language: string; body: string; params: number; category: string }[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<number>(-1); const [params, setParams] = React.useState<string[]>([]); const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { api<{ templates: NonNullable<typeof list> }>("/api/chat/templates").then((r) => setList(r.templates)).catch((e) => setErr((e as Error).message)); }, []);
  if (err) return <p className="text-sm text-red-500">{err}</p>;
  if (!list) return <div className="grid place-items-center py-6"><Loader2 className="animate-spin text-muted" /></div>;
  if (!list.length) return <p className="text-sm text-muted">Nenhum modelo aprovado encontrado. Crie e aprove modelos no WhatsApp Manager e informe <code>WHATSAPP_BUSINESS_ACCOUNT_ID</code> para listá-los aqui.</p>;
  const tpl = list[sel];
  return (
    <div className="space-y-3">
      <select className="input" value={sel} onChange={(e) => { const i = Number(e.target.value); setSel(i); setParams(Array(list[i]?.params ?? 0).fill("")); }}><option value={-1}>Selecione o modelo</option>{list.map((x, i) => <option key={`${x.name}-${x.language}`} value={i}>{x.name} ({x.language}) · {x.category}</option>)}</select>
      {tpl && <><div className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{tpl.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`)}</div>{params.map((v, i) => <Field key={i} label={`Variável {{${i + 1}}}`}><input className="input" value={v} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} /></Field>)}</>}
      <div className="flex justify-end"><button disabled={!tpl || busy || params.some((x) => !x.trim())} onClick={async () => { setBusy(true); await onSend({ name: tpl.name, language: tpl.language, params }); setBusy(false); }} className="btn-primary">{busy && <Loader2 size={15} className="animate-spin" />} Enviar modelo</button></div>
    </div>
  );
}
