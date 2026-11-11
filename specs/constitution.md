# Constitution - Pokedex AI

Princípios não negociáveis que toda spec, plano, tarefa e código devem seguir.

1. **Camadas explícitas** — Dependências fluem `http`/`cli` → `service` → `store`. O domínio não faz I/O.
2. **Validações na fronteira** — Toda entrada é validada com Zod antes de virar domínio.
3. **Erros de domínio** — Falhas previsíveis viram classes de erro, traduzidas em status ou saída na borda.
4. **Teste é parte da tarefa** — Nenhuma lógica nova entra sem teste. `typecheck` e `test` devem permanecer verdes.
5. **Segurança por padrão** — Sem segredos no repositório. Ações destrutivas passam por guardrails (deny list + pre-commit), não pela confiança no modelo.
6. **Spec antes de código** — Mudanças relevantes passam por spec → plan → task → implement, com revisão humana entre as fases.
7. **Pequeno e reversível** — Cada tarefa cabe em um commit.
8. **Proteção contra prompt injection** — Todo prompt do usuário deve passar por um guardrail contra prompt injection, adicionando uma camada no LangChain.

## Stack obrigatória

Node.js 22, TypeScript ESM strict, Zod, `node:test` via `tsx`, `node:http`, LanceDB, OpenRouter e LangChain.
