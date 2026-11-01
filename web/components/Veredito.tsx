import type { Definicao, Veredito } from "@/lib/tipos";

// Ícones simples (SVG inline) para o veredito não depender só da cor.
export function IconeVeredito({ v, tamanho = 16 }: { v: Veredito; tamanho?: number }) {
  const comum = {
    width: tamanho,
    height: tamanho,
    viewBox: "0 0 16 16",
    "aria-hidden": true,
    focusable: false,
    className: "icone",
  } as const;
  switch (v) {
    case "verdadeiro":
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="7.25" fill="currentColor" />
          <path d="M4.6 8.3 7 10.6l4.5-5" stroke="var(--fundo-chip)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "parcial":
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
        </svg>
      );
    case "enganoso":
      return (
        <svg {...comum}>
          <path d="M8 1.2 15 14.3H1z" fill="currentColor" />
          <path d="M8 6v3.6" stroke="var(--fundo-chip)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.9" r="1" fill="var(--fundo-chip)" />
        </svg>
      );
    case "falso":
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="7.25" fill="currentColor" />
          <path d="m5.3 5.3 5.4 5.4m0-5.4-5.4 5.4" stroke="var(--fundo-chip)" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "sem_fonte":
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="2.4 1.6" />
          <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.6-.8 1.3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r=".95" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...comum}>
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function ChipVeredito({
  v,
  definicoes,
  compacto = false,
}: {
  v: Veredito;
  definicoes: Record<Veredito, Definicao>;
  compacto?: boolean;
}) {
  const d = definicoes[v];
  return (
    <span className={`chip chip-${v}${compacto ? " chip-compacto" : ""}`} title={d.definicao}>
      <IconeVeredito v={v} />
      <span>{d.rotulo}</span>
    </span>
  );
}
