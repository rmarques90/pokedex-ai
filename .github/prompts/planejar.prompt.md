---
mode: agent
description: Gera o plano técnico (como) a partir de uma especificação existente.
---

Gere o plano técnico da feature indicada pelo texto após o comando. O texto deve identificar o número ou o caminho da especificação.

**Feature:** ${input:feature:Informe o número ou o caminho da spec}

Instruções:
- Localize a pasta `specs/<NNN>/` indicada e leia a spec `<NNN>-<slug>.md` e `specs/constitution.md`.
- Crie `specs/<NNN>/<NNN>-plan.md`, usando o mesmo número da pasta (por exemplo, `specs/001/001-plan.md`).
- O plano deve conter estes tópicos:
  1. **Arquitetura** — camadas e arquivos que serão criados ou alterados, respeitando o fluxo `http`/`cli` → `service` → `store`.
  2. **Modelo de dados** — tipos e schemas Zod necessários.
  3. **Contratos** — rotas HTTP e/ou comandos CLI, com entradas e saídas.
  4. **Decisões e trade-offs** — riscos e pontos que precisam de decisão humana.
  5. **Estratégia de testes** — testes com `node:test`.
- Não implemente nada: produza somente o plano técnico.
- Não invente decisões em aberto. Registre riscos e questões que precisam de decisão humana para revisão antes da implementação.
