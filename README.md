# Programinha — agenda infantil

App (web, instalável no celular) com eventos e programas para crianças na sua cidade: teatro, oficinas, shows, cinema,
exposições, festas e passeios, **filtrados pela idade das crianças**. A programação é buscada na internet e organizada
automaticamente por IA (Claude, da Anthropic) duas vezes por semana.

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

- **`scripts/update-events.mjs`**: para cada cidade de `web/data/cities.json`, a IA pesquisa eventos dos próximos 45
  dias (com busca e leitura de páginas na web) e depois converte as anotações em JSON. O script descarta eventos sem
  fonte, sem data, de anos anteriores ou que já passaram, junta com os que já existiam (sem duplicar) e grava em
  `web/data/events/<cidade>.json`.
- **`web/`**: o app. HTML, CSS e JavaScript puros, sem etapa de build. Funciona offline depois da primeira visita e
  pode ser "instalado" na tela inicial do celular.
- **`.github/workflows/atualizar-e-publicar.yml`**: roda a atualização (segundas e quintas às 6h17, horário de
  Brasília, ou quando você mandar) e publica o app no GitHub Pages.

As preferências (cidade e idades) ficam salvas só no próprio celular. O app não tem login nem coleta dados.

## Colocando no ar (uma vez só)

1. **Branch `main`**: o fluxo automático roda a partir do branch `main`. Junte este código no `main` (por pull request,
   ou renomeando o branch em _Settings → Branches_).
2. **Chave da API da Anthropic**: crie uma conta em [console.anthropic.com](https://console.anthropic.com), adicione
   créditos e gere uma chave em _API Keys_. No GitHub, vá em _Settings → Secrets and variables → Actions → New
   repository secret_, com nome `ANTHROPIC_API_KEY` e a chave como valor.
3. **GitHub Pages**: em _Settings → Pages_, em _Build and deployment → Source_, escolha **GitHub Actions**.
4. **Primeira atualização**: em _Actions → Atualizar eventos e publicar → Run workflow_. Leva alguns minutos.
5. **Abra no celular**: `https://<seu-usuário>.github.io/<nome-do-repositório>/` (neste repositório,
   `https://cauearthur0.github.io/CC/`).
   - iPhone (Safari): botão compartilhar → _Adicionar à Tela de Início_.
   - Android (Chrome): menu ⋮ → _Instalar app_ / _Adicionar à tela inicial_.

## Quanto custa

Hospedagem e automação no GitHub são gratuitas para repositórios públicos. O custo é o uso da API da IA. O log
de cada execução (aba _Actions_) mostra quantas buscas foram feitas, quantos tokens foram usados e uma **estimativa em
dólares**. Como referência grosseira, conte com algo na casa de US$ 1 por cidade a cada atualização, ou seja, perto
de US$ 8–10 por mês para uma cidade com duas atualizações por semana. Confira o valor real nos primeiros logs.

Para gastar menos:

- rode menos vezes (mude o `cron` no workflow);
- diminua `MAX_SEARCHES` (padrão 15) ou `WINDOW_DAYS` (padrão 45);
- use um modelo mais barato definindo a variável `CLAUDE_MODEL` (por exemplo, `claude-sonnet-5-5`) no passo
  "Pesquisar e organizar eventos" do workflow. A qualidade da pesquisa pode cair.

Dica: em [console.anthropic.com](https://console.anthropic.com) dá para definir um limite mensal de gastos.

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
ANTHROPIC_API_KEY=sk-ant-... npm run update-events                       # atualiza todas as cidades
ANTHROPIC_API_KEY=sk-ant-... npm run update-events -- --city porto-alegre  # só uma cidade
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
