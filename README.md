# Pequenos Rolês — agenda infantil

App (web, instalável no celular) com rolês para fazer com as crianças na sua cidade: teatro, oficinas, shows, cinema,
exposições, festas e passeios, **escolhidos pela idade e pelos interesses de cada criança**. A programação é buscada na
internet e organizada automaticamente por IA (Kimi K3, da Moonshot AI) duas vezes por semana.

Começa com **Porto Alegre**; dá para incluir outras cidades.

## O que o app tem

- **Início**: os rolês do período (hoje, fim de semana, 7 ou 30 dias), com busca, filtros (grátis, ao ar livre, lugar
  coberto, tipo), "Novidades da semana", "Pertinho de vocês", "Rolês grátis" e a sugestão da IA para a idade da criança.
- **Mapa**: os rolês num mapa colorido da cidade, com marcos (parques, orla, museus), eventos do mesmo lugar juntos
  num alfinete e distância até você (se você permitir a localização) ou até o centro.
- **Agenda**: a semana da família, com o que vocês marcaram, status (salvo, confirmado, lembrete) e lembrete no
  celular (arquivo de agenda).
- **Favoritos**: os rolês salvos com o ♥, próximos e os que já passaram.
- **Perfil**: dados do responsável e das crianças (foto, idade, interesses), cidade, raio de busca, faixa de preço,
  dias preferidos e alertas (sugestões da IA, eventos grátis, chuva → lugares cobertos, pela previsão do tempo).
- **Detalhe do evento**: foto, horários, faixa etária, local no mapa, quem realiza, "Por que indicamos?", traçar rota,
  compartilhar e adicionar à agenda.
- **Boas-vindas**: três passos para personalizar na primeira vez (ou entrar com o código da família).
- **Família conectada** (opcional): a mesma agenda, os mesmos favoritos e as mesmas crianças em vários celulares,
  com um código da família — sem e-mail nem senha.
- **Notificações** (opcional): lembrete dos rolês marcados (na véspera às 18h e no dia às 8h), rolês novos para a
  idade das crianças depois de cada atualização e, às sextas, aviso de chuva no fim de semana.

## Como funciona

```
GitHub Actions (seg e qui, 6h)            GitHub Pages
┌─────────────────────────────────┐       ┌──────────────────────────┐
│ 0. Lê as agendas fixas (Sympla, │       │                          │
│    teatros, centros culturais)  │       │                          │
│ 1. IA pesquisa na web           │       │ App no celular           │
│ 2. IA organiza em JSON          │       │ - perfil da família      │
│ 3. Script valida e junta        │──────▶│ - início, mapa, agenda,  │
│ 4. Foto e endereço no mapa      │ salva │   favoritos e perfil     │
│ 5. IA sugere combinações        │   e   │ - previsão de chuva      │
│    por faixa de idade           │publica│ - funciona offline       │
└─────────────────────────────────┘       └──────────────────────────┘
```

- **`scripts/update-events.mjs`**: para cada cidade de `web/data/cities.json`, o script primeiro lê as **fontes fixas**
  da cidade (páginas de agenda como a do Sympla infantil e de centros culturais; em sites de notícias, abre as matérias
  que falam de crianças). Depois o Kimi pesquisa outros eventos dos próximos 45 dias (com a ferramenta oficial de
  busca na web da Moonshot) e converte tudo em JSON, separando o que é para crianças. O script
  descarta eventos sem fonte, sem data, de anos anteriores ou que já passaram e junta com os que já existiam (sem
  duplicar). Em seguida, busca a foto de capa de cada evento na página de origem, encontra o endereço no mapa
  (OpenStreetMap), descobre o bairro e pede à IA sugestões de programa para cada faixa de idade. Tudo vai para
  `web/data/events/<cidade>.json`.
- **`web/`**: o app. HTML, CSS e JavaScript puros, sem etapa de build. Funciona offline depois da primeira visita e
  pode ser "instalado" na tela inicial do celular.
- **`.github/workflows/atualizar-e-publicar.yml`**: roda a atualização (segundas e quintas às 6h17, horário de
  Brasília, ou quando você mandar) e publica o app no GitHub Pages.

O perfil, as fotos das crianças, os favoritos e a agenda ficam salvos **no próprio celular**. Quem conecta a família
passa a ter as crianças, a cidade, os favoritos e a agenda guardados também no Supabase (veja abaixo), só acessíveis
pelos celulares da família; o nome e a foto do responsável continuam só no aparelho. Sem família conectada, trocar de
celular ou limpar os dados do navegador apaga essas informações.

## Colocando no ar (uma vez só)

A automação roda no branch principal do repositório (qualquer que seja o nome dele).

1. **Chave da API da Moonshot (Kimi)**: gere uma chave na plataforma da Moonshot
   ([platform.kimi.ai](https://platform.kimi.ai)) e confira se a conta tem saldo. No GitHub, vá em _Settings → Secrets
   and variables → Actions → New repository secret_, com nome `MOONSHOT_API_KEY` e a chave como valor. **Nunca coloque
   a chave no código**: o repositório é público.
2. **GitHub Pages**: em _Settings → Pages_, em _Build and deployment → Source_, escolha **GitHub Actions**.
3. **Primeira atualização**: em _Actions → Atualizar eventos e publicar → Run workflow_. Leva alguns minutos.
4. **Abra no celular**: `https://<seu-usuário>.github.io/<nome-do-repositório>/` (neste repositório,
   `https://cauearthur0.github.io/CC/`).
   - iPhone (Safari): botão compartilhar → _Adicionar à Tela de Início_.
   - Android (Chrome): menu ⋮ → _Instalar app_ / _Adicionar à tela inicial_.

## Família conectada e notificações (Supabase)

Usa um projeto gratuito do [Supabase](https://supabase.com). O endereço do projeto e a chave **publishable** ficam em
`web/lib/config.js` (são públicos por natureza; quem protege os dados são as regras de acesso do banco). Para ligar:

1. **Banco**: no Supabase, abra _SQL Editor_, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e
   clique em _Run_. Pode rodar de novo quando o arquivo mudar.
2. **Entrada sem e-mail**: em _Authentication → Sign In / Providers_, ligue **Allow anonymous sign-ins** e salve.
   (O e-mail de login do plano gratuito só chega para a equipe do projeto, por isso o app usa entrada anônima +
   código da família.)
3. **Notificações**: em _Settings → API Keys_, na parte **Secret keys**, crie uma chave (ex.: `github-actions`) e
   copie. No GitHub, crie o segredo `SUPABASE_SECRET_KEY` com ela (_Settings → Secrets and variables → Actions_).
   **Nunca coloque essa chave no código nem mande para ninguém.**
4. Rode uma vez _Actions → Notificações → Run workflow_: ele cria as chaves das notificações no banco. Depois ele
   roda sozinho todo dia às 8h07 e às 18h07 (horário de Brasília).

No app: _Perfil → Família → Criar família_ mostra o código; no outro celular, _Tenho um código_ (ou, na primeira
vez, "Entrar com o código da família" nas boas-vindas). As notificações se ligam em _Perfil → Notificações no
celular_. No iPhone, elas só funcionam com o app adicionado à Tela de Início (iOS 16.4 ou mais novo).

## Quanto custa

Hospedagem e automação no GitHub são gratuitas para repositórios públicos, e o plano gratuito do Supabase basta para
uma família (projetos gratuitos são pausados depois de uma semana sem uso; o robô de notificações, que consulta o banco
duas vezes por dia, ajuda a mantê-lo ativo). O custo é o uso da API da IA. O log
de cada execução (aba _Actions_) mostra quantas buscas foram feitas, quantos tokens foram usados e uma **estimativa em
dólares** (calculada com os preços de tabela do Kimi K3: US$ 3 por milhão de tokens de entrada, US$ 15 por milhão de
saída e US$ 0,005 por busca). Como referência grosseira, conte com US$ 1–2 por cidade a cada atualização, ou seja,
algo como US$ 8–16 por mês para uma cidade com duas atualizações por semana. Confira o valor real nos primeiros logs
e no painel da Moonshot.

Para gastar menos:

- rode menos vezes (mude o `cron` no workflow);
- diminua `MAX_SEARCH_ROUNDS` (padrão 8) ou `WINDOW_DAYS` (padrão 45);
- use outro modelo da Moonshot definindo a variável `KIMI_MODEL` no passo "Pesquisar e organizar eventos" do
  workflow. A qualidade da pesquisa pode cair.

### Limite de pedidos por minuto

Contas no [nível inicial da Moonshot](https://platform.kimi.ai/docs/pricing/limits.md) (recarga acumulada abaixo de
US$ 10) aceitam só **3 pedidos por minuto**. O script espaça os pedidos para respeitar esse limite, então cada
atualização leva alguns minutos. Se a sua conta subir de nível (com US$ 10 acumulados ela passa a aceitar 200 pedidos por
minuto), defina `MOONSHOT_RPM` no workflow com o novo limite para a atualização ficar mais rápida.

### Busca na web e modelo reserva

A busca usa a [ferramenta oficial de busca da Moonshot](https://platform.kimi.ai/docs/guide/use-official-tools)
(`moonshot/web-search:latest`). A busca embutida `$web_search` não é usada porque
[falha no `kimi-k3`](https://forum.moonshot.ai/t/bug-web-search-tool-result-echo-always-fails-with-400-tokenization-failed-identical-request-works-on-kimi-k2-6/481)
com o erro "tokenization failed".

Se a pesquisa com o `kimi-k3` for recusada pela API, o script refaz só essa etapa com o `kimi-k2.6` (mude com
`KIMI_SEARCH_FALLBACK_MODEL`, ou deixe vazia para desligar) e continua usando o `kimi-k3` para organizar os eventos. O
log avisa quando o modelo reserva foi usado.

Se a sua conta for da plataforma chinesa, o script tenta `api.moonshot.cn` automaticamente quando
`api.moonshot.ai` recusa a chave (ou defina `MOONSHOT_BASE_URL`).

## Adicionando uma cidade

Inclua um item em `web/data/cities.json`:

```json
{
  "slug": "florianopolis",
  "name": "Florianópolis",
  "state": "SC",
  "country": "Brasil",
  "country_code": "BR",
  "timezone": "America/Sao_Paulo",
  "hints": ["Sympla (sympla.com.br/eventos/florianopolis-sc/infantil)", "Teatro Ademir Rosa (CIC)", "Sesc SC"]
}
```

- `slug`: identificador sem acentos nem espaços (vira o nome do arquivo de eventos).
- `hints`: boas fontes locais. Ajudam a IA a achar mais eventos, mas não são obrigatórias.
- `sources` (opcional): páginas de agenda lidas diretamente a cada atualização, por exemplo
  `{"name": "Sympla – Infantil", "url": "https://www.sympla.com.br/eventos/florianopolis-sc/infantil"}`. Use
  `"follow": true` em páginas de notícias para abrir as matérias sobre crianças e `"maxChars"` para limitar páginas
  muito longas.
- `landmarks` (opcional): marcos desenhados no mapa, como
  `{"name": "Parque da Redenção", "lat": -30.0375, "lng": -51.2152, "icon": "tree", "tone": "green"}`.
- `bbox` (opcional): `[oeste, norte, leste, sul]`, para a busca de endereços não achar lugares de outras cidades.

Antes de incluir uma fonte, teste se dá para lê-la: _Actions → Verificar fontes → Run workflow_, com os endereços no
campo "urls" (ou `npm run check-sources -- --url https://...` no computador). Alguns sites bloqueiam leitura
automática (status 403) ou montam a página só no navegador; esses ficam de fora e a IA os encontra pela busca.

Na próxima atualização a cidade passa a aparecer no app. Cada cidade a mais aumenta o custo de cada atualização.

## Créditos

- Ilustrações em `web/assets/`: recortadas das telas de referência do projeto.
- Ícones: [Lucide](https://lucide.dev) (ISC). Mapa: [MapLibre GL JS](https://maplibre.org) (BSD-3), com mapas do
  [OpenFreeMap](https://openfreemap.org) ([OpenMapTiles](https://www.openmaptiles.org/), dados do
  [OpenStreetMap](https://www.openstreetmap.org/copyright)), gratuitos e sem chave. As cores ficam em
  `web/ui/map-style.js`.
- Fontes: Nunito, Baloo 2 e Caveat (SIL Open Font License). Licenças em `web/vendor/licenses/`.
- Família conectada: [supabase-js](https://github.com/supabase/supabase-js) (MIT). Notificações:
  [web-push](https://github.com/web-push-libs/web-push) (MPL-2.0).
- Previsão do tempo: [Open-Meteo](https://open-meteo.com). Endereços: [Nominatim](https://nominatim.org) (OpenStreetMap).

## Rodando no computador

Requer Node.js 20 ou mais novo.

```bash
npm install
npm test                       # testes automáticos
npm start                      # abre o app em http://localhost:4173
MOONSHOT_API_KEY=sk-... npm run update-events                        # atualiza todas as cidades
MOONSHOT_API_KEY=sk-... npm run update-events -- --city porto-alegre   # só uma cidade
npm run update-events -- --enrich-only        # só completa fotos e mapa, sem usar a IA
npm run build-icons                           # depois de incluir um ícone novo em scripts/build-icons.mjs
npm run check-sources                         # mostra o que dá para ler de cada fonte fixa
SUPABASE_SECRET_KEY=... node scripts/send-notifications.mjs --dry-run   # mostra as notificações sem enviar
```

Para ver as telas com o mapa de verdade sem abrir o celular, rode _Actions → Capturar telas → Run workflow_: as
imagens ficam nos artefatos da execução.

## Ajustes comuns

| O que mudar                   | Onde                                                   |
| ----------------------------- | ------------------------------------------------------ |
| Dias/horário da atualização   | `cron` em `.github/workflows/atualizar-e-publicar.yml` |
| O que a IA procura e como     | `scripts/lib/prompts.mjs`                              |
| Páginas lidas diretamente     | `sources` da cidade em `web/data/cities.json`          |
| Categorias (teatro, oficina…) | `web/lib/categories.js`                                |
| Cores e visual                | `web/styles.css`                                       |
| Cores do mapa                 | `web/ui/map-style.js`                                  |
| Telas                         | `web/views/` (uma por aba) e `web/ui/` (peças comuns)  |

## Limites conhecidos

- A IA pode errar ou deixar eventos de fora. Todo evento tem link para a fonte: confira antes de sair de casa.
- Muitos eventos pequenos são divulgados só no Instagram, que não aparece bem nas buscas.
- A faixa etária nem sempre é informada pelos organizadores. Quando a IA estima, o app mostra `~` antes da idade.
