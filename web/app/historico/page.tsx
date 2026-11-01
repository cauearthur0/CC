import type { Metadata } from "next";
import Link from "next/link";

import { buscarHistorico } from "@/lib/api";
import { dataCurta, hms } from "@/lib/formato";
import { VEREDITOS_CHECAVEIS } from "@/lib/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico" };

const STATUS: Record<string, string> = {
  fila: "na fila",
  processando: "em andamento",
  concluida: "pronta",
  erro: "erro",
  rejeitada: "recusado",
};

export default async function Historico() {
  const itens = await buscarHistorico();
  return (
    <section className="historico">
      <h1>Suas checagens</h1>
      <p className="suave">Ficam guardadas neste navegador (sem login). Em outro aparelho, use o link de cada relatório.</p>
      {itens.length === 0 ? (
        <p>
          Nenhuma checagem ainda. <Link href="/">Checar um vídeo</Link>.
        </p>
      ) : (
        <ul className="lista-historico">
          {itens.map((it) => {
            const est = it.estatisticas;
            return (
              <li key={it.id}>
                <Link href={`/checagem/${it.id}`}>
                  <img src={`/api/checagens/${it.id}/thumb.jpg`} alt="" width={54} height={96} loading="lazy" />
                  <span className="info">
                    <strong>{it.titulo || "Vídeo sem título"}</strong>
                    <span className="suave">
                      {dataCurta(it.criado_em)}
                      {it.duracao ? ` · ${hms(it.duracao)}` : ""} · {STATUS[it.status] ?? it.status}
                      {it.simulado ? " · simulado" : ""}
                    </span>
                    {est && est.checaveis ? (
                      <span className="barra mini" aria-label={`${est.pct_errado_ou_distorcido}% falso ou enganoso`}>
                        {VEREDITOS_CHECAVEIS.filter((v) => est.por_veredito[v]).map((v) => (
                          <span key={v} className={`seg seg-${v}`} style={{ flexGrow: est.por_veredito[v] }} />
                        ))}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
