import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Progresso } from "@/components/Progresso";
import { Relatorio } from "@/components/Relatorio";
import { buscarChecagem } from "@/lib/api";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ch = await buscarChecagem(id).catch(() => null);
  if (!ch) return { title: "Checagem não encontrada" };
  if (ch.status !== "concluida" || !ch.relatorio) return { title: "Checagem em andamento", robots: { index: false } };
  const rel = ch.relatorio;
  const descricao = rel.resumo.join(" ");
  return {
    title: rel.titulo,
    description: descricao,
    robots: { index: false },
    openGraph: {
      title: `Checagem: ${rel.titulo}`,
      description: descricao,
      images: [{ url: `/api/checagens/${id}/card.png`, width: 1080, height: 1350 }],
    },
  };
}

export default async function PaginaChecagem({ params }: Props) {
  const { id } = await params;
  const ch = await buscarChecagem(id);
  if (!ch) notFound();

  if (ch.status === "concluida" && ch.relatorio) return <Relatorio ch={ch} />;

  if (ch.status === "erro" || ch.status === "rejeitada") {
    return (
      <section className="caixa-erro">
        <h1>{ch.status === "rejeitada" ? "Vídeo recusado" : "Não foi possível terminar a checagem"}</h1>
        <p>{ch.erro_msg || "Ocorreu um erro inesperado."}</p>
        <div className="acoes">
          {ch.status === "erro" && ch.video ? (
            <form action={`/api/checagens/${ch.id}/rechecar`} method="post">
              <button className="botao primario" type="submit">
                Tentar de novo
              </button>
            </form>
          ) : null}
          <Link className="botao" href="/">
            Enviar outro vídeo
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* sem JavaScript, a página se atualiza sozinha */}
      <noscript dangerouslySetInnerHTML={{ __html: '<meta http-equiv="refresh" content="5">' }} />
      <Progresso inicial={ch} />
    </>
  );
}
