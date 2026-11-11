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

Projeto Node.js e TypeScript para uma Pokédex com recursos de IA. O repositório está preparado para crescer como um projeto multimódulo, com módulos separados para a API (`api/`) e o frontend (`fe/`).

## Requisitos

- Node.js 22 ou superior
- npm (incluído com o Node.js)

Dependências do projeto:

- **Execução:** [Zod](https://zod.dev/) para validação de dados
- **Desenvolvimento:** TypeScript, `tsx` para executar TypeScript durante o desenvolvimento e `@types/node` para as definições de tipos do Node.js

## Instalação

Na raiz do projeto, instale as dependências:

```bash
npm install
```

## Execução

Inicie a aplicação em modo de desenvolvimento:

```bash
npm run dev
```

Esse comando executa `src/index.ts`. O ponto de entrada é atualmente um placeholder.

Para executar a interface de linha de comando:

```bash
npm run cli
```

Esse comando espera o arquivo `src/cli.ts`, que ainda não foi criado.

## Compilação e validação

Compile os arquivos TypeScript para `dist/`:

```bash
npx tsc
```

Verifique os tipos sem gerar arquivos:

```bash
npm run typecheck
```

Execute os testes encontrados em `src/`:

```bash
npm test
```

## Estrutura atual

```text
api/              reservado para o módulo da API
fe/               reservado para o módulo do frontend
src/index.ts      ponto de entrada TypeScript (placeholder)
```

O projeto usa módulos ES (`type: module`) e TypeScript com alvo ES2022 e resolução de módulos NodeNext.
