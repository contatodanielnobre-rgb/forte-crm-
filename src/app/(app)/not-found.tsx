import Link from "next/link";
export default function NotFound() {
  return <div className="card max-w-lg mx-auto mt-16 p-8 text-center"><h2 className="text-lg font-semibold">Página não encontrada</h2><p className="text-sm text-muted mt-1">O registro pode ter sido removido ou você não tem acesso a ele.</p><Link href="/dashboard" className="btn-primary mt-5">Voltar ao dashboard</Link></div>;
}
