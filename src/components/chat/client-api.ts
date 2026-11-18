"use client";
import type { ConversationItem, ChatMessageItem } from "@/lib/chat/queries";

export type Conv = ConversationItem;
export type Msg = ChatMessageItem & { pending?: boolean; localError?: string; tempId?: string };
export type MediaInfo = { id: string; fileName: string; mimeType: string; size: number; durationSec: number | null; kind: string };
export type Label = { id: string; name: string; color: string };
export type UserOpt = { id: string; name: string };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: init?.body instanceof FormData ? init?.headers : { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { window.location.href = "/login?next=/forte-chat"; throw new Error("Sessão expirada."); }
  if (!r.ok) throw new Error((j as { error?: string }).error || `Erro ${r.status}`);
  return j as T;
}

const DIRECT_LIMIT = 4 * 1024 * 1024; // limite de corpo das funções da Vercel

/** Sobe um arquivo/áudio. Pequenos: direto para a API. Grandes: navegador → Vercel Blob (privado) → registro. */
export async function uploadMedia(file: Blob, fileName: string, opts: { durationSec?: number; blobEnabled: boolean }): Promise<MediaInfo> {
  const type = file.type || "application/octet-stream";
  if (file.size > DIRECT_LIMIT) {
    if (!opts.blobEnabled) throw new Error("Arquivos acima de 4 MB exigem o armazenamento Vercel Blob configurado.");
    const { upload } = await import("@vercel/blob/client");
    const path = `chat/${new Date().toISOString().slice(0, 7)}/${fileName.normalize("NFKD").replace(/[^\w.\-]+/g, "_")}`;
    let res: { url: string }, access: "private" | "public" = "private";
    try { res = await upload(path, file, { access: "private", handleUploadUrl: "/api/chat/blob", contentType: type }); }
    catch { access = "public"; res = await upload(path, file, { access: "public", handleUploadUrl: "/api/chat/blob", contentType: type }); }
    const j = await api<{ media: MediaInfo }>("/api/chat/media/register", { method: "POST", body: JSON.stringify({ url: res.url, access, fileName, mimeType: type, size: file.size }) });
    return j.media;
  }
  const fd = new FormData();
  fd.append("file", new File([file], fileName, { type }));
  if (opts.durationSec) fd.append("durationSec", String(opts.durationSec));
  const j = await api<{ media: MediaInfo }>("/api/chat/upload", { method: "POST", body: fd });
  return j.media;
}

export const mediaUrl = (id: string, download = false) => `/api/chat/media/${id}${download ? "?download=1" : ""}`;
export const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const EMOJIS = "😀 😁 😂 🤣 😊 😍 😘 😎 🤩 🙂 😉 🤗 🤔 😅 😇 🙏 👍 👎 👏 🙌 💪 🤝 👋 ✌️ 👌 🤞 ☝️ 👉 ✅ ❌ ⚠️ ❗ ❓ 💯 🔥 ⭐ ✨ 🎉 🎊 🏆 🥇 🚀 📈 📉 💰 💵 💳 🧾 📄 📎 📌 📅 ⏰ ⏳ 📞 📱 💬 📧 🔗 💡 🎯 🛒 🎁 ❤️ 💙 💚 💛 🖤 🤍 😢 😭 😡 😱 😴 🤷 🤦 🙄 😬 🤐 👀 🍀 ☕ 🍕 🎂 🌞 🌙 ⚡ 🌧️ 🏠 🏢 🚗 ✈️".split(" ");
