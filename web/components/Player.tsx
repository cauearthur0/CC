"use client";

import { useEffect, useRef, useState } from "react";

const EVENTO = "checa:posicionar";

/** Player do vídeo. Clicar num timestamp do relatório posiciona e toca a partir dali. */
export function Player({ src, poster, vertical }: { src: string; poster: string; vertical: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(true);
  const [flutuante, setFlutuante] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting), { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    function posicionar(ev: Event) {
      const t = (ev as CustomEvent<number>).detail;
      const v = video.current;
      if (!v) return;
      v.currentTime = t;
      void v.play().catch(() => undefined);
      if (!visivel) setFlutuante(true);
    }
    window.addEventListener(EVENTO, posicionar);
    return () => window.removeEventListener(EVENTO, posicionar);
  }, [visivel]);

  useEffect(() => {
    if (visivel) setFlutuante(false);
  }, [visivel]);

  return (
    <div ref={caixa} className={`player-caixa${vertical ? " vertical" : ""}`}>
      <div className={`player${flutuante ? " flutuante" : ""}`}>
        <video ref={video} src={src} poster={poster} controls playsInline preload="metadata" />
        {flutuante && (
          <button
            type="button"
            className="fechar-flutuante"
            aria-label="Fechar mini player"
            onClick={() => {
              video.current?.pause();
              setFlutuante(false);
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/** Timestamp clicável. Sem JavaScript, abre o vídeo no instante (fragmento #t=). */
export function Tempo({ id, t, rotulo }: { id: string; t: number; rotulo: string }) {
  return (
    <a
      className="tempo"
      href={`/api/checagens/${id}/video#t=${Math.floor(t)}`}
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(EVENTO, { detail: t }));
      }}
      aria-label={`Ver o vídeo a partir de ${rotulo}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
      </svg>
      {rotulo}
    </a>
  );
}
