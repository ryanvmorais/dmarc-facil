# Specs

O DMARC Fácil é construído com spec-driven development. Cada funcionalidade é desenhada como uma spec em `specs/NNN-nome/` antes de ser implementada, conduzida pela skill `/spec`. As specs são Markdown puro e continuam legíveis sem nenhuma ferramenta.

## Convenções

- **Numeração:** `NNN` sequencial, três dígitos (`001`, `002`, …), na ordem em que as specs são abertas. O nome é curto e em português (`001-fundacao`).
- **Arquivos:** cada spec tem `requirements.md` (o quê e por quê), `design.md` (como) e `tasks.md` (a quebra executável). Os três levam o mesmo frontmatter: `feature`, `status`, `date`, `related`, `origin`.
- **Fases e portões:** `requirements → design → tasks → implementação`. Cada fase termina com aprovação humana explícita antes de a próxima começar.
- **Status válidos:** `rascunho` → `aprovado` → `em andamento` → `concluído`. `origin: conception` para spec escrita antes da implementação; `reverse-engineering` só para documentar algo já terminado.
- **Critério de aceite:** Given / When / Then, um item por cenário.
- **Rastreabilidade:** requisitos são `RF-NN` (funcional) e `RNF-NN` (não funcional). Cada tarefa e cada decisão de design cita o requisito que atende.
- **Idioma:** as specs são em português, como o código.

## Como uma spec é testada

1. **A lógica tem teste unitário.** Validação, parsing e classificação são testados chamando a função com entradas montadas, nunca pela página inteira.
2. **Registro DNS em teste é sempre sintético**, montado no próprio teste. Nunca um registro de domínio real.
3. **Entrada hostil é testada, não presumida:** cada defesa (domínio malformado, registro TXT com marcação) tem pelo menos um teste que alimenta o ataque e espera a recusa.
4. **O portão de qualidade é a última tarefa de cada etapa**, com o resultado real registrado.

## Fluxo

```text
requirements → design → tasks → implementação
```

Nenhuma fase começa sem a aprovação explícita da anterior.

| Comando             | O que faz                                                        |
| ------------------- | ---------------------------------------------------------------- |
| `/spec nova <nome>` | Abre `specs/NNN-nome/` com o `requirements.md` em rascunho       |
| `/spec design`      | Escreve o `design.md` depois de os requisitos serem aprovados    |
| `/spec tasks`       | Escreve o `tasks.md` depois de o design ser aprovado             |
| `/spec implementar` | Executa as tarefas uma a uma e registra cada portão de qualidade |
| `/spec status`      | Resume o status e a fase de cada spec                            |

## Roadmap

A entrega é o marco da construção (`v0.x`), como no README. Nenhum marco foi publicado: o primeiro lançamento é a `1.0.0` e contém todos os marcos.

| Spec                                    | Escopo                                                                                                                           | Entrega | Status    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- |
| [`001-fundacao`](001-fundacao/)         | esqueleto sem build, validação do domínio digitado, portão de qualidade local, CI, cadeia de suprimentos, logo                   | `v0.1`  | concluído |
| [`002-consulta-doh`](002-consulta-doh/) | consulta de registros TXT por DNS-over-HTTPS, com fallback entre resolvedores, leitura defensiva da resposta e validação do nome | `v0.2`  | concluído |
| [`003-parser-dmarc`](003-parser-dmarc/) | escolha do registro DMARC entre os TXT, leitura das tags, política, destinos de relatório, estágio e achados com código estável  | `v0.3`  | concluído |

## Spec-ouro

Use `001-fundacao/` como padrão de formato até existir uma spec mais completa.
