import { cookies } from "next/headers";

import type { Checagem, ItemHistorico } from "./tipos";

// Endereço do backend visto pelo servidor Next (dentro do Docker: http://api:8000).
export const API_INTERNA = process.env.API_INTERNA_URL ?? "http://127.0.0.1:8000";

export async function buscarChecagem(id: string): Promise<Checagem | null> {
  const r = await fetch(`${API_INTERNA}/api/checagens/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API respondeu ${r.status}`);
  return (await r.json()) as Checagem;
}

export async function buscarHistorico(): Promise<ItemHistorico[]> {
  const sessao = (await cookies()).get("cv_sessao")?.value;
  if (!sessao) return [];
  const r = await fetch(`${API_INTERNA}/api/historico`, {
    cache: "no-store",
    headers: { cookie: `cv_sessao=${sessao}` },
  });
  if (!r.ok) return [];
  return ((await r.json()) as { itens: ItemHistorico[] }).itens;
}
