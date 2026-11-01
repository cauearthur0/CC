"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { Checagem } from "@/lib/tipos";

function decorrido(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

export function Progresso({ inicial }: { inicial: Checagem }) {
  const router = useRouter();
  const [ch, setCh] = useState<Checagem>(inicial);
  const [agora, setAgora] = useState(() => Date.now());
  const desvio = useMemo(() => Date.now() - Date.parse(inicial.agora), [inicial.agora]);

  useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout>;
    async function consultar() {
      try {
        const r = await fetch(`/api/checagens/${inicial.id}`, { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as Checagem;
          if (!vivo) return;
          setCh(d);
          if (d.status === "concluida" || d.status === "erro" || d.status === "rejeitada") {
            router.refresh();
            return;
          }
        }
      } catch {
        /* rede instável: tenta de novo */
      }
      if (vivo) espera = setTimeout(consultar, 1500);
    }
    espera = setTimeout(consultar, 1200);
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      vivo = false;
      clearTimeout(espera);
      clearInterval(relogio);
    };
  }, [inicial.id, router]);

  const inicio = Date.parse(ch.iniciado_em ?? ch.criado_em);
  const atual = ch.etapas.findIndex((e) => e.codigo === ch.etapa);

  return (
    <section className="progresso" aria-live="polite">
      <h1>Checando o vídeo…</h1>
      <p className="suave">
        Leva de 1 a 5 minutos. Pode fechar esta página: o link continua valendo e o resultado fica no seu histórico.
      </p>
      <p className="decorrido">
        Tempo decorrido: <strong>{decorrido(agora - desvio - inicio)}</strong>
      </p>
      {ch.status === "fila" ? (
        <p className="na-fila">Na fila, aguardando um processador livre…</p>
      ) : null}
      <ol className="etapas">
        {ch.etapas.map((e, i) => {
          const estado = ch.status === "fila" ? "pendente" : i < atual ? "feita" : i === atual ? "atual" : "pendente";
          let detalhe = "";
          if (e.codigo === "alegacoes" && ch.n_alegacoes && i <= atual) detalhe = `${ch.n_alegacoes} encontradas`;
          if (e.codigo === "checando" && estado === "atual" && ch.progresso_total)
            detalhe = `alegação ${ch.progresso_atual} de ${ch.progresso_total}`;
          if (e.codigo === "checando" && estado === "feita" && ch.progresso_total)
            detalhe = `${ch.progresso_total} checadas`;
          return (
            <li key={e.codigo} className={`etapa ${estado}`}>
              <span className="marcador" aria-hidden="true">
                {estado === "feita" ? "✓" : estado === "atual" ? <span className="girando" /> : ""}
              </span>
              <span>
                {e.nome}
                {detalhe ? <span className="suave"> · {detalhe}</span> : null}
                <span className="sr-only">
                  {estado === "feita" ? " (concluída)" : estado === "atual" ? " (em andamento)" : " (pendente)"}
                </span>
              </span>
              {estado === "atual" && e.codigo === "checando" && ch.progresso_total ? (
                <progress max={ch.progresso_total} value={ch.progresso_atual} aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
