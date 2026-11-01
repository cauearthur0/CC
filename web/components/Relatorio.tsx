import { Acoes } from "@/components/Acoes";
import { Player, Tempo } from "@/components/Player";
import { ChipVeredito, IconeVeredito } from "@/components/Veredito";
import { dataCurta, dominio, hms, TIPO_FONTE } from "@/lib/formato";
import { VEREDITOS_CHECAVEIS, type AlegacaoRel, type Checagem, type FonteRel, type Relatorio as Rel } from "@/lib/tipos";

const MAX_NAO_CHECAVEIS_VISIVEIS = 3;

function Fontes({ fontes }: { fontes: FonteRel[] }) {
  if (!fontes.length) return null;
  return (
    <ul className="fontes">
      {fontes.map((f) => (
        <li key={f.url}>
          <img
            src={`https://icons.duckduckgo.com/ip3/${dominio(f.url)}.ico`}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <a href={f.url} target="_blank" rel="noopener noreferrer">
            {f.titulo || dominio(f.url)}
          </a>
          <span className="meta-fonte">
            {dominio(f.url)}
            {f.tipo ? ` · ${TIPO_FONTE[f.tipo] ?? f.tipo}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Barra({ rel, ch }: { rel: Rel; ch: Checagem }) {
  const est = rel.estatisticas;
  const presentes = VEREDITOS_CHECAVEIS.filter((v) => est.por_veredito[v] > 0);
  const resumo = presentes.map((v) => `${ch.definicoes[v].rotulo}: ${est.porcentagens[v]}%`).join(", ");
  return (
    <div className="placar">
      <div className="barra" role="img" aria-label={est.checaveis ? `Resultado: ${resumo}` : "Nenhuma alegação checável"}>
        {est.checaveis ? (
          presentes.map((v) => (
            <span key={v} className={`seg seg-${v}`} style={{ flexGrow: est.por_veredito[v] }} />
          ))
        ) : (
          <span className="seg seg-nao_checavel" style={{ flexGrow: 1 }} />
        )}
      </div>
      <ul className="legenda-barra">
        {presentes.map((v) => (
          <li key={v} className={`cor-${v}`}>
            <IconeVeredito v={v} /> {ch.definicoes[v].rotulo} <strong>{est.porcentagens[v]}%</strong>
          </li>
        ))}
      </ul>
      <details className="definicoes">
        <summary>O que significa cada veredito</summary>
        <dl>
          {(Object.keys(ch.definicoes) as (keyof Checagem["definicoes"])[]).map((v) => (
            <div key={v}>
              <dt>
                <ChipVeredito v={v} definicoes={ch.definicoes} compacto />
              </dt>
              <dd>{ch.definicoes[v].definicao}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function CartaoAlegacao({ a, ch }: { a: AlegacaoRel; ch: Checagem }) {
  const rotulo = hms(a.t_ini);
  if (a.status === "nao_verificada" || !a.veredito) {
    return (
      <li className="alegacao pendente">
        <div className="cabeca">
          <Tempo id={ch.id} t={a.t_ini} rotulo={rotulo} />
          <span className="chip chip-nao_checavel">Não verificada</span>
        </div>
        <blockquote>“{a.citacao}”</blockquote>
        {a.nota ? <p className="suave">{a.nota}</p> : null}
      </li>
    );
  }
  return (
    <li className={`alegacao v-${a.veredito}`}>
      <div className="cabeca">
        <Tempo id={ch.id} t={a.t_ini} rotulo={rotulo} />
        <ChipVeredito v={a.veredito} definicoes={ch.definicoes} />
        {a.confianca_rotulo ? <span className="confianca">confiança {a.confianca_rotulo}</span> : null}
      </div>
      <blockquote>“{a.citacao}”</blockquote>
      {a.tipo === "atribuicao_de_citacao" ? <p className="tipo">Citação atribuída</p> : null}
      {a.explicacao ? <p>{a.explicacao}</p> : null}
      {a.o_que_e_verdade_por_tras ? (
        <details className="verdade">
          <summary>O que é verdade por trás</summary>
          <p>{a.o_que_e_verdade_por_tras}</p>
        </details>
      ) : null}
      {a.nota ? <p className="nota">{a.nota}</p> : null}
      <Fontes fontes={a.fontes} />
    </li>
  );
}

function LinhaNaoChecavel({ a, ch, extra }: { a: AlegacaoRel; ch: Checagem; extra: boolean }) {
  return (
    <li className={`alegacao nao-checavel${extra ? " extra" : ""}`}>
      <Tempo id={ch.id} t={a.t_ini} rotulo={hms(a.t_ini)} />
      <span className="citacao-curta">“{a.citacao}”</span>
      <span className="tipo-curto">
        <IconeVeredito v="nao_checavel" /> {(ch.tipos[a.tipo] ?? a.tipo).toLowerCase()}
      </span>
    </li>
  );
}

export function Relatorio({ ch }: { ch: Checagem }) {
  const rel = ch.relatorio!;
  const est = rel.estatisticas;
  const naoChecaveis = rel.alegacoes.filter((a) => a.status === "nao_checavel");
  const extras = new Set(naoChecaveis.slice(MAX_NAO_CHECAVEIS_VISIVEIS).map((a) => a.id));
  const vertical = rel.video.altura > rel.video.largura;

  return (
    <article className="relatorio">
      {rel.simulado ? (
        <p className="aviso-simulado" role="note">
          <strong>Relatório simulado.</strong> Gerado sem IA e sem consultar fontes, só para demonstrar a interface.
        </p>
      ) : null}

      <header className="cabecalho">
        <Player src={`/api/checagens/${ch.id}/video`} poster={`/api/checagens/${ch.id}/thumb.jpg`} vertical={vertical} />
        <div className="cabecalho-texto">
          <h1>{rel.titulo || "Checagem de vídeo"}</h1>
          <p className="meta">
            {hms(rel.video.duracao)} de vídeo · checado em {dataCurta(rel.checado_em)}
            {rel.autor_ou_conta ? <> · conta: {rel.autor_ou_conta}</> : null}
          </p>
          <Barra rel={rel} ch={ch} />
        </div>
      </header>

      <section className="resumo" aria-label="Resumo">
        {rel.resumo.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </section>

      <Acoes id={ch.id} url={ch.url} titulo={rel.titulo} />

      <section aria-labelledby="t-linha">
        <h2 id="t-linha">Linha do tempo</h2>
        <div className="linha-tempo">
          {extras.size ? (
            <input type="checkbox" id="mostrar-todas" className="sr-only alternador" />
          ) : null}
          <ol>
            {rel.alegacoes.map((a) =>
              a.status === "nao_checavel" ? (
                <LinhaNaoChecavel key={a.id} a={a} ch={ch} extra={extras.has(a.id)} />
              ) : (
                <CartaoAlegacao key={a.id} a={a} ch={ch} />
              ),
            )}
          </ol>
          {extras.size ? (
            <label htmlFor="mostrar-todas" className="botao discreto mostrar-todas">
              <span className="quando-fechado">Mostrar todas ({naoChecaveis.length} falas não checáveis)</span>
              <span className="quando-aberto">Esconder falas não checáveis extras</span>
            </label>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="t-acertos">
        <h2 id="t-acertos">Acertos</h2>
        {rel.acertos.length ? (
          <ul className="acertos">
            {rel.acertos.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : (
          <p className="suave">Nenhum acerto factual identificado.</p>
        )}
      </section>

      <section aria-labelledby="t-contagem">
        <h2 id="t-contagem">Contagem</h2>
        <p>
          {est.total} alegações no total: {est.checaveis} checáveis e {est.nao_checaveis} não checáveis (opinião,
          previsão, chamada à ação).
          {est.nao_verificadas ? ` ${est.nao_verificadas} ficaram sem verificar (veja as limitações).` : ""}
        </p>
        <table className="tabela-contagem">
          <thead>
            <tr>
              <th scope="col">Veredito</th>
              <th scope="col">Alegações</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            {VEREDITOS_CHECAVEIS.map((v) => (
              <tr key={v}>
                <th scope="row">
                  <ChipVeredito v={v} definicoes={ch.definicoes} compacto />
                </th>
                <td>{est.por_veredito[v]}</td>
                <td>{est.porcentagens[v]}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="suave">Porcentagens calculadas sobre as {est.checaveis} alegações checáveis.</p>
        {est.frase ? <p className="frase-destaque">{est.frase}</p> : null}
      </section>

      {rel.padrao_desinformacao ? (
        <section aria-labelledby="t-padrao">
          <h2 id="t-padrao">Como a desinformação é construída</h2>
          <p>{rel.padrao_desinformacao}</p>
        </section>
      ) : null}

      <section aria-labelledby="t-limitacoes">
        <h2 id="t-limitacoes">Limitações desta checagem</h2>
        {rel.limitacoes.length ? (
          <ul>
            {rel.limitacoes.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : (
          <p className="suave">Nenhuma limitação registrada.</p>
        )}
        <p className="aviso-ia" role="note">
          {ch.aviso}
        </p>
      </section>

      <section aria-labelledby="t-transcricao">
        <details className="transcricao">
          <summary>
            <h2 id="t-transcricao">Transcrição completa</h2>
          </summary>
          <p className="suave">
            <span className="origem origem-fala">fala</span> áudio transcrito ·{" "}
            <span className="origem origem-legenda">legenda</span> texto queimado no vídeo ·{" "}
            <span className="origem origem-tela">tela</span> outros textos · trechos em destaque: legenda e fala não batem
          </p>
          <ol>
            {rel.transcricao.map((t, i) => (
              <li key={i} className={t.divergencia ? "divergente" : undefined}>
                <Tempo id={ch.id} t={t.t_ini} rotulo={hms(t.t_ini)} />
                <span className={`origem origem-${t.origem}`}>{t.origem}</span>
                <span>
                  {t.texto}
                  {t.divergencia && t.legenda ? (
                    <span className="legenda-diverge">
                      <strong>Legenda diz:</strong> “{t.legenda}”
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {rel.transcricao.length === 0 ? <p className="suave">Nenhuma fala ou texto detectados.</p> : null}
        </details>
      </section>

      {rel.fontes_consolidadas.length ? (
        <section aria-labelledby="t-fontes">
          <h2 id="t-fontes">Fontes</h2>
          <Fontes fontes={rel.fontes_consolidadas} />
        </section>
      ) : null}

      <form action={`/api/checagens/${ch.id}/rechecar`} method="post" className="rechecar">
        <button type="submit" className="botao discreto">
          Checar de novo
        </button>
        <span className="suave"> Roda a checagem outra vez com fontes atualizadas.</span>
      </form>
    </article>
  );
}
