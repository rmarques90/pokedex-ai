# pokedex-ai

## Coleta e banco vetorial

Ative o hook de segurança de pre-commit uma vez após instalar as dependências:

```bash
npm run hooks:install
```

Copie `.env.example` para `.env`, defina `LANCEDB_COLLECTION_NAME` e configure `OPENROUTER_API_KEY`. Os arquivos `.env`, `store/data/` e `store/lancedb/` são ignorados pelo Git.

- `npm run collect:data` coleta os dados dos 151 Pokémon iniciais e suas imagens.
- `npm run populate_db` gera embeddings com LangChain e OpenRouter (`qwen/qwen3-embedding-8b`) e popula o LanceDB local.
- `npm run collect:populate-db` executa a coleta e, se ela concluir, popula o banco.

As solicitações de embedding são enviadas ao OpenRouter; o banco fica em `store/lancedb/`.

**Idioma:** [English](README.md) | Português

Projeto Node.js e TypeScript para uma Pokédex com recursos de IA. A API e o frontend React ficam no mesmo repositório; os módulos do frontend ficam em `src/fe/`.

## Demonstração da interface

Esta captura estática da página inicial demonstra a interface do projeto:

![Exemplo estático da página inicial do Pokédex AI](homepage_sample.png)

## Requisitos

- Node.js 22 ou superior
- npm (incluído com o Node.js)

Dependências do projeto:

- **Execução:** React e React DOM para o frontend; [Zod](https://zod.dev/) para validação de dados; [LangChain](https://js.langchain.com/) e [OpenRouter](https://openrouter.ai/) para LLMs e embeddings; [LanceDB](https://lancedb.github.io/lancedb/) para armazenamento vetorial local; e o SDK oficial de TypeScript do MCP para o endpoint opcional de ferramentas remotas
- **Desenvolvimento:** TypeScript, `tsx`, Vite e `concurrently`; `@types/node` e definições de tipos do React

## Instalação

Na raiz do projeto, instale as dependências:

```bash
npm install
```

## Execução

Inicie a API em modo de desenvolvimento:

```bash
npm run dev
```

A API fica disponível em `http://localhost:3000`.

Inicie somente o frontend:

```bash
npm run dev:fe
```

Inicie a API e o frontend juntos:

```bash
npm run dev:full
```

O frontend fica disponível em `http://localhost:5173` e encaminha as solicitações `/ask` para a API.

### Perguntas e respostas

A API procura evidências no índice local primeiro. Quando os dados indexados não são suficientes, o modelo pode responder usando conhecimento geral do universo Pokémon; nesse caso, a interface identifica a resposta como conhecimento geral e não exibe referências do RAG.

- `POST /ask` mantém o fluxo JSON para a CLI e outros clientes.
- `POST /ask/stream` envia eventos SSE para a interface web mostrar o texto progressivamente. A interface permite cancelar a chamada e tenta novamente falhas transitórias até três vezes após a tentativa inicial.

### Servidor MCP para outras IAs

A API pode disponibilizar dados da Pokédex do RAG somente para leitura pelo Model Context Protocol (MCP), usando Streamable HTTP em `http://localhost:3000/mcp`. O MCP fica desativado por padrão. Para ativá-lo, copie `.env.example` para `.env`, defina `MCP_ENABLED=true` e configure `MCP_AUTH_TOKEN` com um segredo aleatório de pelo menos 32 bytes. A API falha ao iniciar com erro de configuração se o token estiver ausente ou tiver menos de 32 bytes. O comando abaixo gera um token de 256 bits representado por 64 caracteres hexadecimais:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mantenha o valor gerado somente no `.env` e na configuração privada do cliente MCP; nunca o versione nem o coloque em logs. Para trocar o token, altere a configuração e reinicie a API. A busca semântica também precisa de `OPENROUTER_API_KEY` e de uma coleção LanceDB populada.

Configure o cliente MCP para usar a URL acima e enviar `Authorization: Bearer <seu-token>` em todas as solicitações. Clientes que usam configuração JSON com URL e cabeçalhos podem seguir este formato:

```json
{
  "mcpServers": {
    "pokedex-ai": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <substitua-pelo-seu-token-privado>"
      }
    }
  }
}
```

O servidor oferece duas ferramentas somente de leitura:

- `lookup_pokemon` recebe exatamente uma destas entradas: `{ "id": 25 }`, `{ "name": "pikachu" }` ou `{ "type": "electric" }`. Retorna `{ "items": [...] }` com evidências indexadas e URLs das fontes. Sem resultados, `items` é um array vazio.
- `search_pokemon` recebe `{ "query": "Pokemon that can fly", "limit": 5 }`. `limit` é opcional, padrão 5 e aceita valores de 1 a 10. Retorna evidências recuperadas e URLs das fontes, sem gerar uma resposta por LLM.

A busca em linguagem natural executa o classificador de segurança existente antes de gerar embeddings. As duas ferramentas verificam as evidências com o guardrail de prompt injection; o texto retornado ainda deve ser tratado como entrada não confiável pela IA cliente. Falhas de autenticação retornam HTTP 401. O limitador em memória permite 30 solicitações HTTP MCP por endereço de rede a cada 60 segundos, incluindo inicialização, descoberta e chamadas das ferramentas; o excesso retorna HTTP 429 com `Retry-After`.

Este POC usa um token bearer compartilhado e um limitador em memória por processo. Ele não identifica cada cliente, não compartilha cotas entre instâncias da API e não confia em cabeçalhos encaminhados por proxy. Use em uma rede controlada; isso não substitui autenticação de produção nem proteção distribuída contra abuso.

Para executar a interface de linha de comando:

```bash
npm run cli
```

Esse comando executa a CLI de pergunta única. Os fluxos de dados usam os scripts internos abaixo.

## Compilação e validação

Compile os arquivos TypeScript para `dist/`:

```bash
npx tsc
```

Verifique os tipos sem gerar arquivos:

```bash
npm run typecheck
```

Gere a compilação de produção do frontend:

```bash
npm run build:fe
```

Execute os testes encontrados em `src/`:

```bash
npm test
```

## Estrutura atual

```text
src/index.ts      ponto de entrada da API
src/fe/           módulos do frontend React
src/http/         fronteira HTTP
src/domain/       tipos e schemas de validação
src/service/      regras de negócio e integração de embeddings
src/store/        persistência vetorial local com LanceDB
src/scripts/      comandos internos de coleta e população
specs/            especificações, planos e tarefas
```

O projeto usa módulos ES (`type: module`) e TypeScript com alvo ES2022 e resolução de módulos NodeNext.
