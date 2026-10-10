import { z } from "zod";
import { CATEGORY_IDS } from "../../web/lib/categories.js";

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });

function describeDay(iso) {
  return `${weekdayFormat.format(new Date(`${iso}T00:00:00Z`))}, ${iso}`;
}

export const RESEARCH_SYSTEM = `Você é o pesquisador de uma agenda de programação infantil usada por pais e mães no Brasil.
Sua tarefa é encontrar, na internet, eventos e atividades para crianças (de bebês a 12 anos) que vão acontecer numa cidade e num período determinados.

O que procurar: teatro infantil, shows e concertos para crianças, cinema infantil e sessões especiais, oficinas, contação de histórias, feiras e festas para famílias, exposições e museus com atividades infantis, planetário e ciência, circo, atividades ao ar livre em parques, esportes e recreação, programação de shoppings, Sesc, centros culturais, bibliotecas e prefeitura.

Como pesquisar:
- Use a ferramenta de busca na web antes de responder. Nunca responda de memória: seu conhecimento é antigo e a agenda muda toda semana.
- Faça várias buscas diferentes (por exemplo: "teatro infantil <cidade> <mês> <ano>", "agenda infantil fim de semana <cidade>", Sympla infantil, Sesc, shoppings, feriados como o Dia das Crianças) até ter uma boa lista.

Regras importantes:
- Só inclua eventos com data confirmada dentro do período pedido. Confira o ANO: notícias antigas aparecem muito nas buscas e devem ser descartadas.
- Confira a cidade: descarte eventos de outras cidades com nome parecido (por exemplo, "Porto" em Portugal não é Porto Alegre).
- Prefira páginas oficiais (site do teatro, Sympla, prefeitura, Sesc, shopping) e matérias recentes de jornais locais.
- Atividades permanentes (um parque, um museu em funcionamento normal) só entram se houver algo especial e datado no período.
- Para cada evento, anote: título, o que a criança vai fazer/ver, data de início e de fim, dias e horários, local, endereço e bairro, se é em lugar fechado ou ao ar livre, quem realiza (companhia, grupo ou instituição), preço (ou se é gratuito), faixa etária indicada (diga se a fonte informa ou se você está estimando) e a URL da fonte.
- Não invente nada. Se não conseguir confirmar a data, deixe o evento de fora.

Responda em português, com uma lista de eventos em texto corrido ou tópicos, um evento por item, sempre com a URL da fonte.`;

export function buildResearchPrompt({ city, today, windowEnd, knownEvents, readSources = [] }) {
  const hints = city.hints?.length ? `\nBoas fontes para esta cidade: ${city.hints.join("; ")}.` : "";
  const alreadyRead = readSources.length
    ? `\nEstas páginas de agenda já são lidas diretamente por outro sistema, então não gaste buscas nelas; procure em outros lugares: ${readSources.join("; ")}.`
    : "";
  const known = knownEvents.length
    ? `\n\nJá temos estes eventos na agenda. Pesquise eventos NOVOS, que não estão nesta lista; só mencione algum destes se encontrar uma correção importante (data ou local diferentes):\n${knownEvents
        .map(
          (e) => `- ${e.title} (${e.start_date}${e.end_date !== e.start_date ? ` a ${e.end_date}` : ""}) — ${e.venue}`,
        )
        .join("\n")}`
    : "";

  return `Hoje é ${describeDay(today)}.
Encontre eventos e atividades para crianças em ${city.name} (${city.state}, ${city.country}) que acontecem entre ${today} e ${windowEnd}.
Dê atenção especial aos próximos dois fins de semana e a feriados no período.${hints}${alreadyRead}${known}`;
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
- neighborhood: o bairro do local, se der para saber (ex.: "Centro Histórico", "Moinhos de Vento"), ou null.
- setting: "indoor" se for em lugar fechado (teatro, museu, shopping), "outdoor" se for ao ar livre (parque, praça, rua), "misto" se tiver os dois, ou null se não der para saber.
- organizer: quem realiza (companhia de teatro, grupo, instituição), se as anotações disserem, ou null.
- As anotações podem trazer o texto de páginas de agenda ("Fonte fixa"), que listam eventos para todas as idades: inclua só os pensados para crianças de até 12 anos ou para toda a família, e ignore os de adultos. Se um evento de fonte fixa não tiver link próprio, use o endereço da página da fonte como url e o nome da fonte como source.
- Quando uma feira ou festival tiver dezenas de sessões curtas (como a programação infantil da Feira do Livro), inclua só até 6 destaques que mais agradam crianças, cada um com sua data.
- Se o mesmo evento aparecer mais de uma vez, inclua uma vez só.
- Não invente informação que não está nas anotações.

Responda somente com JSON, sem texto antes ou depois: um objeto {"events": [...]} em que cada evento tem exatamente os campos
title, description, category, start_date, end_date, schedule, venue, address, neighborhood, setting, organizer, price, is_free, age_min, age_max, age_estimated, url, source.`;

export function buildExtractionPrompt({ city, today, windowEnd, notes }) {
  const period = windowEnd ? ` Interessam os eventos que acontecem entre ${today} e ${windowEnd}.` : "";
  return `Cidade: ${city.name} (${city.state}). Hoje é ${describeDay(today)}.${period}

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
  neighborhood: z.string().nullable().describe("Bairro"),
  setting: z.string().nullable().describe("indoor, outdoor ou misto"),
  organizer: z.string().nullable().describe("Companhia, grupo ou instituição que realiza"),
  price: z.string().nullable(),
  is_free: z.boolean(),
  age_min: z.number().nullable(),
  age_max: z.number().nullable(),
  age_estimated: z.boolean(),
  url: z.string(),
  source: z.string(),
});

export const ExtractionResult = z.object({ events: z.array(ExtractedEvent) });

// JSON Schema enviado à API (modo de saída estruturada).
const { $schema, ...extractionJsonSchema } = z.toJSONSchema(ExtractionResult);
export const EXTRACTION_JSON_SCHEMA = extractionJsonSchema;
