import { z } from "zod";
import { CATEGORY_IDS } from "../../web/lib/categories.js";

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

function describeDay(iso) {
  return `${weekdayFormat.format(new Date(`${iso}T00:00:00Z`))}, ${iso}`;
}

export const RESEARCH_SYSTEM = `Você é o pesquisador de uma agenda de programação infantil usada por pais e mães no Brasil.
Sua tarefa é encontrar, na internet, eventos e atividades para crianças (de bebês a 12 anos) que vão acontecer numa cidade e num período determinados.

O que procurar: teatro infantil, shows e concertos para crianças, cinema infantil e sessões especiais, oficinas, contação de histórias, feiras e festas para famílias, exposições e museus com atividades infantis, planetário e ciência, circo, atividades ao ar livre em parques, esportes e recreação, programação de shoppings, Sesc, centros culturais, bibliotecas e prefeitura.

Regras importantes:
- Só inclua eventos com data confirmada dentro do período pedido. Confira o ANO: notícias antigas aparecem muito nas buscas e devem ser descartadas.
- Confira a cidade: descarte eventos de outras cidades com nome parecido (por exemplo, "Porto" em Portugal não é Porto Alegre).
- Prefira páginas oficiais (site do teatro, Sympla, prefeitura, Sesc, shopping) e matérias recentes de jornais locais.
- Atividades permanentes (um parque, um museu em funcionamento normal) só entram se houver algo especial e datado no período.
- Para cada evento, anote: título, o que a criança vai fazer/ver, data de início e de fim, dias e horários, local e endereço, preço (ou se é gratuito), faixa etária indicada (diga se a fonte informa ou se você está estimando) e a URL da fonte.
- Não invente nada. Se não conseguir confirmar a data, deixe o evento de fora.

Responda em português, com uma lista de eventos em texto corrido ou tópicos, um evento por item, sempre com a URL da fonte.`;

export function buildResearchPrompt({ city, today, windowEnd, knownEvents }) {
  const hints = city.hints?.length ? `\nBoas fontes para esta cidade: ${city.hints.join("; ")}.` : "";
  const known = knownEvents.length
    ? `\n\nJá temos estes eventos na agenda (não precisa pesquisá-los de novo; só mencione algum se encontrar uma correção importante, como data ou local diferentes):\n${knownEvents
        .map(
          (e) => `- ${e.title} (${e.start_date}${e.end_date !== e.start_date ? ` a ${e.end_date}` : ""}) — ${e.venue}`,
        )
        .join("\n")}`
    : "";

  return `Hoje é ${describeDay(today)}.
Encontre eventos e atividades para crianças em ${city.name} (${city.state}, ${city.country}) que acontecem entre ${today} e ${windowEnd}.
Dê atenção especial aos próximos dois fins de semana e a feriados no período.${hints}${known}`;
}

export const EXTRACTION_SYSTEM = `Você converte anotações de pesquisa sobre eventos infantis em dados estruturados para um aplicativo.

Regras:
- Inclua apenas eventos que tenham data de início, local e URL de fonte nas anotações.
- Datas no formato AAAA-MM-DD. Para evento de um dia só, end_date = start_date. Para temporadas e exposições, end_date é o último dia.
- schedule: dias e horários em texto curto (ex.: "Sábados e domingos, 16h" ou "14h às 18h"), ou null.
- description: 1 ou 2 frases curtas, em português, dizendo o que a criança vai fazer ou ver.
- category: uma destas: ${CATEGORY_IDS.join(", ")}.
- age_min e age_max: faixa etária em anos inteiros. Se a fonte não informa, estime pelo tipo de atividade e marque age_estimated = true. Use null quando não houver limite (por exemplo, age_max null para "a partir de 5 anos").
- is_free = true só se for gratuito para crianças (entrada franca, retirada gratuita de ingresso etc.).
- source: nome curto da fonte (ex.: "Sympla", "GZH", "Prefeitura de Porto Alegre").
- Se o mesmo evento aparecer mais de uma vez, inclua uma vez só.
- Não invente informação que não está nas anotações.`;

export function buildExtractionPrompt({ city, today, notes }) {
  return `Cidade: ${city.name} (${city.state}). Hoje é ${describeDay(today)}.

Anotações da pesquisa:
<anotacoes>
${notes}
</anotacoes>`;
}

export const ExtractedEvent = z.object({
  title: z.string(),
  description: z.string(),
  // Texto livre (e não enum) para que uma categoria inesperada não invalide a lista toda;
  // normalizeEvent troca valores desconhecidos por "outro".
  category: z.string().describe(`Uma destas: ${CATEGORY_IDS.join(", ")}`),
  start_date: z.string().describe("AAAA-MM-DD"),
  end_date: z.string().describe("AAAA-MM-DD"),
  schedule: z.string().nullable(),
  venue: z.string(),
  address: z.string().nullable(),
  price: z.string().nullable(),
  is_free: z.boolean(),
  age_min: z.number().nullable(),
  age_max: z.number().nullable(),
  age_estimated: z.boolean(),
  url: z.string(),
  source: z.string(),
});

export const ExtractionResult = z.object({ events: z.array(ExtractedEvent) });
