---
mode: agent
description: Cria a especificação (o quê e por quê) de uma feature, sem código.
---

Escreva uma especificação para a feature descrita a seguir:

**Feature:** ${input:feature:Descreva a feature}

Regras:
- Leia `specs/constitution.md` e respeite todos os princípios.
- Não escreva código nem defina decisões de implementação. Descreva o que o sistema deve fazer e por quê.
- Crie uma pasta `specs/<NNN>/` usando o próximo número livre entre as pastas de atividades, e salve a especificação como `<NNN>-<slug>.md` dentro dela (por exemplo, `specs/001/001-data_acquisition.md`).
- Organize a especificação nos tópicos numerados abaixo, sem lacunas ou números repetidos:
  1. Contexto e problema
  2. User stories, no formato: “Como <papel>, quero <objetivo>, para <benefício>.”
  3. Requisitos funcionais numerados sequencialmente (`RF-1`, `RF-2`, ...).
  4. Critérios de aceite no formato EARS: “Quando <evento>, o sistema deve <resposta>.”
  5. Fora de escopo
  6. Questões em aberto
- Não invente requisitos nem responda por conta própria a questões ambíguas. Faça perguntas ao usuário e aguarde as respostas antes de criar ou finalizar a especificação.
