"use client";
import * as React from "react";
import { Modal } from "@/components/ui";
import { ActionForm } from "./action-form";

/** Botão que abre um modal com conteúdo (ex.: formulário). Fecha ao concluir via contexto. */
const CloseCtx = React.createContext<() => void>(() => {});
export const useCloseModal = () => React.useContext(CloseCtx);

export function ModalButton({ label, title, children, className = "btn-primary btn-sm", size = "md", icon }: { label: React.ReactNode; title: string; children: React.ReactNode; className?: string; size?: "sm" | "md" | "lg" | "xl"; icon?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{icon}{label}</button>
      <Modal open={open} onClose={close} title={title} size={size}><CloseCtx.Provider value={close}>{children}</CloseCtx.Provider></Modal>
    </>
  );
}

export function CloseOnDone({ children, action, ...rest }: Omit<React.ComponentProps<typeof ActionForm>, "onDone"> & { children: React.ReactNode }) {
  const close = useCloseModal();
  return <ActionForm action={action} onDone={close} {...rest}>{children}</ActionForm>;
}
