---
mode: agent
description: Quebra o plano em tarefas pequenas, ordenadas e testáveis.
---

Gere `tasks.md` para a feature indicada pelo texto após o comando. O texto deve identificar o número ou o caminho da feature.

**Feature:** ${input:feature:Informe o número ou o caminho da feature}

Instruções:
- Localize e leia `<NNN>-<slug>.md` e `<NNN>-plan.md` na pasta `specs/<NNN>/` indicada.
- Crie `tasks.md` na mesma pasta desses documentos.
- Liste cada tarefa em ordem de dependência, numerada e com uma caixa de progresso no formato `- [ ]`.
- Mantenha cada tarefa pequena o suficiente para caber em um único commit.
- Defina para cada tarefa um critério claro de conclusão e verificável (por exemplo, um teste específico passa).
- Declare as dependências de cada tarefa quando houver.
- Não implemente nada; produza somente a lista de tarefas.
