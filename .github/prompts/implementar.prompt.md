---
mode: agent
description: Implementa as tarefas pendentes uma a uma, com testes.
---

Implemente as tarefas pendentes em `tasks.md` para a feature indicada pelo texto após o comando. O texto deve identificar o número ou o caminho da pasta `specs/<NNN>/`.

**Feature:** ${input:feature:Informe o número ou o caminho da feature}

Trabalhe em uma tarefa por vez:
1. Localize `specs/<NNN>/` e leia `<NNN>-<slug>.md`, `<NNN>-plan.md`, `tasks.md`, `specs/constitution.md` e as instruções aplicáveis do projeto.
2. Escolha a próxima tarefa marcada `- [ ]` cujas dependências estejam concluídas.
3. Implemente essa tarefa conforme o plano, a spec, as instruções e a constituição.
4. Escreva ou atualize os testes e execute `npm run test` e `npm run typecheck`.
5. Marque a tarefa como `- [x]` somente quando ambos os comandos terminarem sem erros.

Nunca desative testes ou verificações de tipos para fazê-los passar. Se a spec estiver incorreta ou contradizer o plano ou a constituição, pare sem implementar a tarefa afetada e informe o problema.

Pare depois de concluir uma fatia coesa de trabalho e peça revisão humana antes de continuar com outra fatia.
