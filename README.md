# Programinha — agenda infantil

App (web, instalável no celular) com eventos e programas para crianças na sua cidade: teatro, oficinas, shows, cinema,
exposições, festas e passeios, **filtrados pela idade das crianças**. A programação é buscada na internet e organizada
automaticamente por IA (Kimi K3, da Moonshot AI) duas vezes por semana.

Começa com **Porto Alegre**; dá para incluir outras cidades.

## Como funciona

```
GitHub Actions (seg e qui, 6h)          GitHub Pages
┌───────────────────────────────┐       ┌──────────────────────────┐
│ 1. IA pesquisa na web         │       │ App no celular           │
│ 2. IA organiza em JSON        │──────▶│ - escolhe cidade/idades  │
│ 3. Script valida e junta      │ salva │ - filtra por data,       │
│    com os eventos que já têm  │  e    │   grátis e tipo          │
└───────────────────────────────┘publica│ - compartilha / agenda   │
                                        └──────────────────────────┘
```

- **`scripts/update-events.mjs`**: para cada cidade de `web/data/cities.json`, o Kimi pesquisa eventos dos próximos
  45 dias (com a busca na web embutida da Moonshot, `$web_search`) e depois converte as anotações em JSON. O script
  descarta eventos sem fonte, sem data, de anos anteriores ou que já passaram, junta com os que já existiam (sem
  duplicar) e grava em `web/data/events/<cidade>.json`.
- **`web/`**: o app. HTML, CSS e JavaScript puros, sem etapa de build. Funciona offline depois da primeira visita e
  pode ser "instalado" na tela inicial do celular.
- **`.github/workflows/atualizar-e-publicar.yml`**: roda a atualização (segundas e quintas às 6h17, horário de
  Brasília, ou quando você mandar) e publica o app no GitHub Pages.

As preferências (cidade e idades) ficam salvas só no próprio celular. O app não tem login nem coleta dados.

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

## Quanto custa

Hospedagem e automação no GitHub são gratuitas para repositórios públicos. O custo é o uso da API da IA. O log
de cada execução (aba _Actions_) mostra quantas buscas foram feitas, quantos tokens foram usados e uma **estimativa em
dólares** (calculada com os preços de tabela do Kimi K3: US$ 3 por milhão de tokens de entrada, US$ 15 por milhão de
saída e US$ 0,005 por busca). Como referência grosseira, conte com US$ 1–2 por cidade a cada atualização, ou seja,
algo como US$ 8–16 por mês para uma cidade com duas atualizações por semana. Confira o valor real nos primeiros logs
e no painel da Moonshot.

Para gastar menos:

- rode menos vezes (mude o `cron` no workflow);
- diminua `MAX_SEARCH_ROUNDS` (padrão 12) ou `WINDOW_DAYS` (padrão 45);
- use outro modelo da Moonshot definindo a variável `KIMI_MODEL` no passo "Pesquisar e organizar eventos" do
  workflow. A qualidade da pesquisa pode cair.

### Modelo reserva para a busca

Há [relatos](https://forum.moonshot.ai/t/bug-web-search-tool-result-echo-always-fails-with-400-tokenization-failed-identical-request-works-on-kimi-k2-6/481)
de que a busca `$web_search` às vezes falha no `kimi-k3` com o erro "tokenization failed". Se isso acontecer, o script
refaz só a etapa de busca com o `kimi-k2.6` (mude com `KIMI_SEARCH_FALLBACK_MODEL`, ou deixe vazia para desligar) e
continua usando o `kimi-k3` para organizar os eventos. O log avisa quando o modelo reserva foi usado.

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

Na próxima atualização a cidade passa a aparecer no app. Cada cidade a mais aumenta o custo de cada atualização.

## Rodando no computador

Requer Node.js 20 ou mais novo.

```bash
npm install
npm test                       # testes automáticos
npm start                      # abre o app em http://localhost:4173
MOONSHOT_API_KEY=sk-... npm run update-events                        # atualiza todas as cidades
MOONSHOT_API_KEY=sk-... npm run update-events -- --city porto-alegre   # só uma cidade
```

## Ajustes comuns

| O que mudar                   | Onde                                                   |
| ----------------------------- | ------------------------------------------------------ |
| Dias/horário da atualização   | `cron` em `.github/workflows/atualizar-e-publicar.yml` |
| O que a IA procura e como     | `scripts/lib/prompts.mjs`                              |
| Categorias (teatro, oficina…) | `web/lib/categories.js`                                |
| Cores e visual                | `web/styles.css`                                       |

## Limites conhecidos

- A IA pode errar ou deixar eventos de fora. Todo evento tem link para a fonte: confira antes de sair de casa.
- Muitos eventos pequenos são divulgados só no Instagram, que não aparece bem nas buscas.
- A faixa etária nem sempre é informada pelos organizadores. Quando a IA estima, o app mostra `~` antes da idade.
