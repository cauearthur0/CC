"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const MAX_MB = 200;
const MAX_MIN = 10;
const EXTENSOES = ["mp4", "mov", "webm", "m4v"];

function duracaoDoArquivo(arquivo: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(arquivo);
    const fim = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => fim(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => fim(null);
    setTimeout(() => fim(null), 4000);
    v.src = url;
  });
}

export function Upload({ erroInicial }: { erroInicial?: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState(erroInicial ?? "");
  const [arrastando, setArrastando] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);

  async function escolher(f: File | undefined | null) {
    setErro("");
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSOES.includes(ext)) {
      setErro("Formato não suportado. Envie um arquivo .mp4, .mov ou .webm.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setErro(`O arquivo tem ${(f.size / 1024 / 1024).toFixed(0)} MB. O limite é ${MAX_MB} MB.`);
      return;
    }
    const d = await duracaoDoArquivo(f);
    if (d !== null && d > MAX_MIN * 60) {
      setErro(`O vídeo tem ${(d / 60).toFixed(1)} min. O limite é ${MAX_MIN} min.`);
      return;
    }
    setArquivo(f);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!arquivo) {
      entrada.current?.click();
      return;
    }
    const dados = new FormData(e.currentTarget);
    dados.set("arquivo", arquivo);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/checagens");
    xhr.setRequestHeader("X-Requested-With", "fetch");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgresso(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      let corpo: { id?: string; erro?: string } = {};
      try {
        corpo = JSON.parse(xhr.responseText);
      } catch {
        /* resposta não-JSON */
      }
      if (xhr.status < 300 && corpo.id) {
        router.push(`/checagem/${corpo.id}`);
      } else {
        setProgresso(null);
        setErro(corpo.erro ?? "Não foi possível enviar o vídeo. Tente de novo.");
      }
    };
    xhr.onerror = () => {
      setProgresso(null);
      setErro("A conexão caiu durante o envio. Tente de novo.");
    };
    setProgresso(0);
    xhr.send(dados);
  }

  const enviando = progresso !== null;

  return (
    <form
      className="upload"
      action="/api/checagens"
      method="post"
      encType="multipart/form-data"
      onSubmit={enviar}
    >
      <label
        className={`zona${arrastando ? " arrastando" : ""}${arquivo ? " escolhido" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void escolher(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={entrada}
          type="file"
          name="arquivo"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
          required
          className="sr-only"
          onChange={(e) => void escolher(e.target.files?.[0])}
          disabled={enviando}
        />
        <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {arquivo ? (
          <span>
            <strong>{arquivo.name}</strong>
            <br />
            {(arquivo.size / 1024 / 1024).toFixed(1)} MB · toque para trocar
          </span>
        ) : (
          <span>
            <strong>Escolher vídeo</strong> ou arrastar para cá
            <br />
            mp4, mov ou webm · até {MAX_MB} MB · até {MAX_MIN} min
          </span>
        )}
      </label>

      <label className="campo">
        <span>Onde você viu esse vídeo? (opcional)</span>
        <input type="text" name="origem" maxLength={500} placeholder="Ex.: grupo da família no WhatsApp, link do Reels" disabled={enviando} />
      </label>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {enviando ? (
        <div className="barra-envio" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progresso}%` }} />
          <span>{progresso < 100 ? `Enviando… ${progresso}%` : "Conferindo o arquivo…"}</span>
        </div>
      ) : (
        <button type="submit" className="botao primario grande">
          Checar vídeo
        </button>
      )}
    </form>
  );
}
