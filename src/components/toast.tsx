"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; kind: "success" | "error" };
const Ctx = React.createContext<{ push: (m: string, k?: Toast["kind"]) => void }>({ push: () => {} });
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-[calc(100%-2rem)] max-w-sm">
        {items.map((t) => (
          <div key={t.id} className={cn("card px-4 py-3 flex items-start gap-3 text-sm animate-fadeUp", t.kind === "error" && "border-red-500/40")}>
            {t.kind === "success" ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> : <AlertCircle size={18} className="text-red-500 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-muted hover:text-fg"><X size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
