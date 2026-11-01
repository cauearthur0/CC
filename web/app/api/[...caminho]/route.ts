// Proxy de /api/* para o backend FastAPI. Mantém tudo na mesma origem (cookie de sessão,
// sem CORS) e transmite o upload em streaming, sem limite de corpo do Next.
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = process.env.API_INTERNA_URL ?? "http://127.0.0.1:8000";
const SALTO = ["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "expect"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await ctx.params;
  const url = new URL(req.url);
  const destino = `${API}/api/${caminho.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  for (const h of SALTO) headers.delete(h);

  const temCorpo = !["GET", "HEAD"].includes(req.method);
  const resp = await fetch(destino, {
    method: req.method,
    headers,
    body: temCorpo ? req.body : undefined,
    redirect: "manual",
    cache: "no-store",
    // @ts-expect-error: necessário no Node para enviar corpo em streaming
    duplex: temCorpo ? "half" : undefined,
  });

  const saida = new Headers();
  resp.headers.forEach((valor, chave) => {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(chave)) {
      saida.set(chave, valor);
    }
  });
  for (const c of resp.headers.getSetCookie()) saida.append("set-cookie", c);
  const tamanho = resp.headers.get("content-length");
  if (tamanho && !resp.headers.get("content-encoding")) saida.set("content-length", tamanho);
  return new Response(resp.body, { status: resp.status, headers: saida });
}

export { proxy as DELETE, proxy as GET, proxy as HEAD, proxy as PATCH, proxy as POST, proxy as PUT };
