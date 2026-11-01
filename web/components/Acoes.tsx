"use client";

import { useState } from "react";

export function Acoes({ id, url, titulo }: { id: string; url: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const base = `/api/checagens/${id}`;

  async function copiar() {
    const link = typeof window !== "undefined" ? `${window.location.origin}/checagem/${id}` : url;
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ title: titulo, text: "Checagem do vídeo", url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copie o link:", link);
    }
  }

  return (
    <div className="acoes" role="group" aria-label="Compartilhar e exportar">
      <button type="button" className="botao primario" onClick={copiar}>
        {copiado ? "Link copiado ✓" : "Copiar link"}
      </button>
      <a className="botao" href={`${base}/card.png?baixar=1`} download>
        Imagem para redes
      </a>
      <a className="botao" href={`${base}/relatorio.pdf`} download>
        PDF
      </a>
      <a className="botao" href={`${base}/relatorio.md`} download>
        Markdown
      </a>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Link copiado" : ""}
      </span>
    </div>
  );
}
