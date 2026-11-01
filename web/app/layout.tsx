import type { Metadata, Viewport } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Checa Vídeo", template: "%s · Checa Vídeo" },
  description: "Recebeu um vídeo no WhatsApp ou no Instagram? Envie o arquivo e veja o que nele é verdade, com fontes.",
  metadataBase: new URL(process.env.URL_PUBLICA ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#16181c" },
  ],
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#conteudo" className="pular">
          Pular para o conteúdo
        </a>
        <header className="topo">
          <Link href="/" className="marca">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="2" width="14" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m13 15 3 3 6-7" fill="none" stroke="var(--destaque)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Checa Vídeo
          </Link>
          <nav aria-label="Principal">
            <Link href="/">Checar</Link>
            <Link href="/historico">Histórico</Link>
          </nav>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="rodape">
          <p>Checagem assistida por IA. Pode conter erros. Confira as fontes antes de compartilhar.</p>
        </footer>
      </body>
    </html>
  );
}
