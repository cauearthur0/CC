import { Upload } from "@/components/Upload";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <div className="inicio">
      <section className="chamada">
        <h1>Recebeu um vídeo e ficou na dúvida?</h1>
        <p>
          Envie o arquivo do vídeo. A gente lê o que é falado e escrito nele, separa as afirmações e checa cada uma
          em fontes confiáveis. Você recebe o veredito de cada uma, com links para responder a quem mandou.
        </p>
      </section>

      <Upload erroInicial={erro} />

      <section className="explica">
        <h2>Por que não dá para colar o link?</h2>
        <p>
          Instagram, TikTok, YouTube e Kwai bloqueiam acesso automático aos vídeos. Por isso a checagem precisa do
          arquivo: baixe o vídeo para o celular ou computador e envie aqui.
        </p>
        <details>
          <summary>Como baixar o vídeo</summary>
          <ul>
            <li>
              <strong>WhatsApp:</strong> abra o vídeo, toque nos três pontinhos (ou em compartilhar) e escolha
              “Salvar”. No iPhone, “Salvar” manda para a galeria.
            </li>
            <li>
              <strong>Instagram, TikTok, Shorts, Kwai:</strong> use o botão de salvar ou baixar do próprio app quando
              existir. Se não existir, qualquer ferramenta de download de vídeos funciona: copie o link do vídeo e cole
              nela.
            </li>
            <li>
              Depois, toque em <strong>Escolher vídeo</strong> acima e selecione o arquivo na galeria ou em Arquivos.
            </li>
          </ul>
        </details>
        <h2>O que acontece com o vídeo</h2>
        <p>
          O vídeo fica guardado para que o relatório possa mostrar os trechos checados. O relatório tem um link
          próprio, que só quem tiver o link consegue abrir. Não use para vídeos com dados pessoais de terceiros.
        </p>
      </section>
    </div>
  );
}
