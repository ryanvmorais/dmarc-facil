/**
 * @file Catálogo de textos dos achados: o português que explica cada código.
 *
 * As specs 003 a 005 devolvem códigos e dados, nunca frases. Aqui está uma entrada por código,
 * com `titulo`, `explicacao` (o que o achado significa) e `acao` (o que fazer), mais
 * `provisorio`: `true` enquanto o Ryan não revisou o texto, e `pnpm textos:provisorios` lista o
 * que falta antes da `1.0.0`. O teste de cobertura varre o código dos cinco módulos e falha se
 * faltar entrada ou sobrar entrada. Trecho de código vai entre crases e a página o desenha em
 * fonte monoespaçada.
 *
 * Os textos não afirmam o que a ferramenta não sabe: nada de "você não tem DKIM" nem de
 * "protegido". O código que dois módulos emitem (`registro-grande-demais`,
 * `caixa-fora-do-padrao`) tem uma entrada só, escrita para valer nos dois.
 *
 * É dado puro: sem DOM, sem rede, sem lógica além de `textoDoAchado`.
 */

// @ts-check

import { MOTIVOS_SELETOR } from "./textos-interface.js";

/** @typedef {{ titulo: string, explicacao: string, acao: string, provisorio: boolean }} TextoAchado */
/**
 * O achado como os módulos o devolvem (a união dos campos das specs 003 a 005).
 *
 * @typedef {{
 *   codigo: string, gravidade: "erro" | "aviso" | "info", tag?: string,
 *   detalhe?: number | string, seletor?: string, dominio?: string
 * }} AchadoLido
 */
/**
 * O achado pronto para a tela. `detalhe` já é texto (e, no `seletor-invalido`, já em português);
 * quem desenha o corta e o põe como texto puro.
 *
 * @typedef {{
 *   codigo: string, gravidade: "erro" | "aviso" | "info", titulo: string, explicacao: string,
 *   acao: string, tag?: string, detalhe?: string, seletor?: string, seletores?: string[],
 *   dominio?: string
 * }} AchadoVisivel
 */

// ---------------------------------------------------------------------------
// CATÁLOGO
// ---------------------------------------------------------------------------

/** @type {Record<string, TextoAchado>} */
export const TEXTOS_ACHADOS = {
  // -------------------------------------------------------------------------
  // DMARC (dmarc.js)
  // -------------------------------------------------------------------------
  "aplicacao-parcial": {
    titulo: "A política vale só para parte das mensagens",
    explicacao:
      "O `pct=` está abaixo de 100: só essa porcentagem das mensagens que falham recebe a política. O resto recebe um tratamento mais leve.",
    acao: "Quando os relatórios mostrarem que seus remetentes legítimos passam, suba o `pct` até 100 ou apague a tag.",
    provisorio: false,
  },
  "caixa-fora-do-padrao": {
    titulo: "Maiúsculas onde o padrão usa minúsculas",
    explicacao:
      "Uma parte do registro está escrita em caixa diferente da do padrão (por exemplo `P=` no lugar de `p=`). Muitos receptores aceitam, mas nem todos leem do mesmo jeito.",
    acao: "Reescreva o registro no padrão, para não depender de como cada receptor o lê.",
    provisorio: false,
  },
  "endereco-invalido": {
    titulo: "Endereço de relatório que não vale",
    explicacao:
      "Alguns endereços de `rua=` ou `ruf=` não têm o formato `mailto:nome@dominio`, e quem recebe os ignora.",
    acao: "Corrija ou apague esses endereços. Cada um começa com `mailto:`.",
    provisorio: false,
  },
  "monitoramento-apenas": {
    titulo: "O DMARC só monitora",
    explicacao:
      "Com `p=none`, o DMARC apenas observa. Mensagens falsificadas com o seu domínio continuam sendo entregues como antes.",
    acao: "Use os relatórios para descobrir quem envia em nome do domínio e depois suba a política, como mostra a escada acima.",
    provisorio: false,
  },
  "politica-ausente": {
    titulo: "O registro não diz a política (`p=`)",
    explicacao:
      "Falta a tag `p=`. Se o registro tem `rua=`, quem recebe trata como `p=none` (só monitorar); sem `rua=`, ignora o registro inteiro.",
    acao: "Acrescente `p=none` ao registro. Depois, suba para `quarantine` e `reject`.",
    provisorio: false,
  },
  "politica-invalida": {
    titulo: "Política que o DMARC não conhece",
    explicacao:
      "O valor de `p=` não é `none`, `quarantine` nem `reject`, e por isso quem recebe ignora o registro.",
    acao: "Troque o valor por um dos três. Para começar, `p=none`.",
    provisorio: false,
  },
  "registro-grande-demais": {
    titulo: "Registro grande demais para ler",
    explicacao:
      "O registro é maior do que esta ferramenta analisa, então não li as tags. Um registro assim costuma ser texto colado em dobro.",
    acao: "Abra o painel do seu DNS, confira se o registro foi colado errado e deixe só o necessário.",
    provisorio: false,
  },
  "sem-relatorio-agregado": {
    titulo: "Ninguém recebe os relatórios",
    explicacao:
      "Sem `rua=`, nenhum endereço recebe os relatórios que mostram quem envia e-mail em nome do seu domínio, e sem eles não há como subir a política com segurança.",
    acao: "Acrescente `rua=mailto:dmarc@seudominio.com.br`, com uma caixa que você leia ou um serviço que leia os relatórios por você.",
    provisorio: false,
  },
  "subdominios-mais-fracos": {
    titulo: "Subdomínios com regra mais fraca",
    explicacao:
      "O `sp=` define uma política mais fraca para os subdomínios do que a de `p=`. Um subdomínio do seu domínio pode ser falsificado com menos barreira.",
    acao: "Apague o `sp=` (os subdomínios passam a seguir o `p=`) ou iguale os dois.",
    provisorio: false,
  },
  "tag-duplicada": {
    titulo: "Tag repetida",
    explicacao:
      "A mesma tag aparece mais de uma vez no registro. Esta ferramenta leu a primeira e ignorou as outras, mas nem todo receptor faz o mesmo.",
    acao: "Deixe cada tag uma vez só, com o valor que você quer.",
    provisorio: false,
  },
  "valor-invalido": {
    titulo: "Valor que não segue o formato",
    explicacao:
      "O valor de uma tag opcional (a que aparece ao lado) não segue o formato esperado, então vale o padrão dela.",
    acao: "Corrija o valor ou apague a tag.",
    provisorio: false,
  },

  // -------------------------------------------------------------------------
  // SPF (spf.js)
  // -------------------------------------------------------------------------
  "all-libera-tudo": {
    titulo: "`+all`: qualquer servidor pode enviar",
    explicacao:
      "O registro termina com `+all`, que autoriza qualquer servidor do mundo a enviar e-mail em nome do domínio. Na prática, é como não ter SPF.",
    acao: "Troque por `~all` ou, quando souber todos os seus remetentes, por `-all`.",
    provisorio: false,
  },
  "all-neutro": {
    titulo: "`?all`: o SPF não decide nada",
    explicacao:
      "Com `?all`, o SPF não diz se um servidor é permitido ou não, então não ajuda a barrar falsificação.",
    acao: "Troque por `~all` ou por `-all`.",
    provisorio: false,
  },
  "all-rigido": {
    titulo: "`-all`: só os servidores listados",
    explicacao: "Quem não está na lista falha no SPF, e quem recebe pode recusar a mensagem.",
    acao: "Mantenha assim e confira que todo serviço que envia por você está na lista.",
    provisorio: false,
  },
  "all-suave": {
    titulo: "`~all`: o resto é suspeito",
    explicacao:
      "Quem não está na lista é marcado como suspeito, mas a mensagem costuma ser aceita.",
    acao: "É um bom ponto de partida. Passe para `-all` quando tiver certeza de que todos os remetentes estão na lista.",
    provisorio: false,
  },
  "modificador-repetido": {
    titulo: "`redirect` ou `exp` repetido",
    explicacao:
      "O `redirect` e o `exp` só podem aparecer uma vez. Repetidos, quem recebe devolve erro e o SPF inteiro deixa de valer.",
    acao: "Deixe só um de cada.",
    provisorio: false,
  },
  "ptr-em-uso": {
    titulo: "`ptr` está em desuso",
    explicacao:
      "A norma do SPF desaconselha o `ptr`: é lento, gasta consultas e nem todo receptor o avalia.",
    acao: "Troque por `ip4`, `ip6` ou `include`.",
    provisorio: false,
  },
  "redirect-ignorado": {
    titulo: "`redirect` sem efeito",
    explicacao:
      "O `redirect` só vale quando o registro não tem `all`. Como este tem, quem recebe ignora o `redirect`.",
    acao: "Apague o `redirect` ou o `all`, conforme o que você quer que valha.",
    provisorio: false,
  },
  "registro-grande": {
    titulo: "Registro SPF longo",
    explicacao:
      "O registro passa de 512 caracteres, o tamanho que a norma recomenda para caber numa resposta DNS comum. Alguns receptores falham com registros maiores.",
    acao: "Enxugue o registro: tire serviços que você não usa mais e troque faixas de IP repetidas por uma só.",
    provisorio: false,
  },
  "sem-all": {
    titulo: "Registro sem `all` no fim",
    explicacao:
      "Sem `all` (e sem `redirect`), o SPF não diz o que fazer com os servidores que não estão na lista.",
    acao: "Termine o registro com `~all` ou `-all`.",
    provisorio: false,
  },
  "termo-invalido": {
    titulo: "Termo que o SPF não entende",
    explicacao:
      "Um termo do registro (o que aparece ao lado) não segue a sintaxe do SPF. Quem recebe devolve erro e o SPF inteiro deixa de valer.",
    acao: "Corrija ou apague esse termo.",
    provisorio: false,
  },
  "termo-repetido": {
    titulo: "Termo repetido",
    explicacao:
      "O mesmo termo aparece mais de uma vez. A repetição ocupa espaço no registro e, em `include`, `a` e `mx`, gasta consultas à toa.",
    acao: "Apague as repetições.",
    provisorio: false,
  },
  "termos-apos-all": {
    titulo: "Termos depois do `all`",
    explicacao: "O que vem depois do `all` nunca é avaliado.",
    acao: "Mova esses termos para antes do `all` ou apague-os.",
    provisorio: false,
  },

  // -------------------------------------------------------------------------
  // SPF, contagem de consultas (spf-consultas.js)
  // -------------------------------------------------------------------------
  "caminhada-interrompida": {
    titulo: "A contagem parou no meio",
    explicacao:
      "Parei de seguir os `include` antes de terminar (falhas de rede ou muitos termos), então o total é de pelo menos esse número.",
    acao: "Tente de novo. Se o total já passou de 10, reduza os `include`.",
    provisorio: false,
  },
  ciclo: {
    titulo: "Registros que se incluem em círculo",
    explicacao:
      "Um registro inclui outro que, mais adiante, inclui o primeiro de volta. Quem recebe devolve erro.",
    acao: "Desfaça o ciclo: um dos dois deixa de incluir o outro.",
    provisorio: false,
  },
  "consulta-falhou": {
    titulo: "Não consegui consultar um registro incluído",
    explicacao:
      "A consulta de um registro apontado por `include` ou `redirect` falhou, então a contagem pode estar maior do que a mostrada.",
    acao: "Tente de novo. Isso não diz nada sobre o seu registro.",
    provisorio: false,
  },
  "consultas-vazias": {
    titulo: "Termos que apontam para nomes sem resposta",
    explicacao:
      "Mais de dois termos do SPF apontam para nomes que não existem ou não têm registro. A norma trata isso como erro.",
    acao: "Apague os `include`, `a`, `mx` e `exists` que apontam para nomes sem registro.",
    provisorio: false,
  },
  "limite-de-consultas": {
    titulo: "Consultas demais: o SPF vai falhar",
    explicacao:
      "O limite é 10 consultas DNS. Passando disso, quem recebe trata o SPF como erro, mesmo com o registro bem escrito.",
    acao: "Tire os `include` de serviços que você não usa mais.",
    provisorio: false,
  },
  "macro-nao-avaliada": {
    titulo: "Macro que esta ferramenta não avalia",
    explicacao:
      "O destino de um `include` ou `redirect` usa uma macro (`%{...}`), cujo valor muda a cada mensagem. Não dá para contar quantas consultas ele gasta.",
    acao: "Nada a corrigir. Só saiba que o total pode ser maior do que o mostrado.",
    provisorio: false,
  },
  "perto-do-limite": {
    titulo: "Perto do limite de consultas",
    explicacao:
      "O SPF já usa 8 ou 9 das 10 consultas permitidas. Um `include` novo pode fazê-lo passar do limite.",
    acao: "Antes de incluir mais um serviço, tire um que você não usa mais.",
    provisorio: false,
  },
  "include-sem-registro": {
    titulo: "O domínio de um `include` não tem SPF",
    explicacao:
      "Um `include` aponta para um nome sem registro SPF, e isso faz o SPF inteiro dar erro.",
    acao: "Corrija o nome do domínio ou apague esse `include`.",
    provisorio: false,
  },
  "redirect-sem-registro": {
    titulo: "O domínio do `redirect` não tem SPF",
    explicacao:
      "O `redirect` aponta para um nome sem registro SPF, e isso faz o SPF inteiro dar erro.",
    acao: "Corrija o nome do domínio ou apague o `redirect`.",
    provisorio: false,
  },
  "include-com-varios-registros": {
    titulo: "O domínio de um `include` tem mais de um SPF",
    explicacao:
      "O nome apontado por um `include` publica mais de um registro SPF, e isso faz o SPF inteiro dar erro.",
    acao: "Se o domínio é seu, deixe um registro só. Se é de um serviço, avise o serviço ou tire o `include`.",
    provisorio: false,
  },
  "redirect-com-varios-registros": {
    titulo: "O domínio do `redirect` tem mais de um SPF",
    explicacao:
      "O nome apontado pelo `redirect` publica mais de um registro SPF, e isso faz o SPF inteiro dar erro.",
    acao: "Se o domínio é seu, deixe um registro só. Se é de um serviço, avise o serviço ou tire o `redirect`.",
    provisorio: false,
  },
  "include-invalido": {
    titulo: "O registro de um `include` está inválido",
    explicacao:
      "O registro SPF do domínio incluído tem erro de sintaxe, e isso faz o seu SPF dar erro também.",
    acao: "Se o domínio é seu, corrija o registro dele. Se é de um serviço, avise o serviço ou tire o `include`.",
    provisorio: false,
  },
  "redirect-invalido": {
    titulo: "O registro do `redirect` está inválido",
    explicacao:
      "O registro SPF do domínio apontado pelo `redirect` tem erro de sintaxe, e isso faz o seu SPF dar erro também.",
    acao: "Se o domínio é seu, corrija o registro dele. Se é de um serviço, avise o serviço ou tire o `redirect`.",
    provisorio: false,
  },

  // -------------------------------------------------------------------------
  // DKIM (dkim.js)
  // -------------------------------------------------------------------------
  "chave-abaixo-do-recomendado": {
    titulo: "Chave com menos de 2048 bits",
    explicacao:
      "Chaves RSA de 1024 bits ainda funcionam, mas a recomendação atual é 2048 bits ou mais.",
    acao: "Gere uma chave de 2048 bits no painel do seu provedor de e-mail e publique o registro novo.",
    provisorio: false,
  },
  "chave-ausente": {
    titulo: "Registro sem a chave (`p=`)",
    explicacao:
      "O registro DKIM não tem a tag `p=`, que guarda a chave pública. Sem ela, o DKIM não valida nada.",
    acao: "Copie de novo o registro completo que o painel do seu provedor mostra.",
    provisorio: false,
  },
  "chave-fraca": {
    titulo: "Chave fraca demais",
    explicacao:
      "Chaves RSA com menos de 1024 bits são consideradas fracas, e quem recebe pode recusar a assinatura.",
    acao: "Troque por uma chave de 2048 bits no painel do seu provedor de e-mail.",
    provisorio: false,
  },
  "chave-ilegivel": {
    titulo: "Não consegui ler a chave",
    explicacao:
      "O conteúdo de `p=` não é uma chave pública válida do tipo informado. É comum quando a chave é colada cortada ou com caracteres a mais.",
    acao: "Copie de novo a chave que o painel do provedor mostra, sem aspas e sem espaços a mais.",
    provisorio: false,
  },
  "chave-maior-que-4096": {
    titulo: "Chave maior que 4096 bits",
    explicacao:
      "Quem recebe só precisa validar chaves de até 4096 bits. Chaves maiores podem ser ignoradas ou deixar a validação lenta.",
    acao: "Use uma chave de 2048 bits (ou, no máximo, 4096).",
    provisorio: false,
  },
  "chave-revogada": {
    titulo: "Chave revogada",
    explicacao:
      "O `p=` está vazio: o dono retirou a chave de propósito. Mensagens assinadas com esse seletor deixam de passar no DKIM.",
    acao: "Se foi de propósito, está certo. Se não foi, publique a chave de novo.",
    provisorio: false,
  },
  "modo-de-teste": {
    titulo: "Chave em modo de teste",
    explicacao:
      "O registro tem `t=y`, que marca o DKIM como teste. Alguns receptores tratam a assinatura como se ela não existisse.",
    acao: "Quando tudo estiver funcionando, apague o `t=y`.",
    provisorio: false,
  },
  "registros-multiplos": {
    titulo: "Mais de um registro no mesmo seletor",
    explicacao:
      "O seletor publica mais de um registro DKIM, e a norma deixa o resultado indefinido. Por isso não li nenhum.",
    acao: "Deixe um registro só por seletor.",
    provisorio: false,
  },
  "servico-nao-e-email": {
    titulo: "Chave que não vale para e-mail",
    explicacao:
      "A tag `s=` limita a chave a um serviço que não é `email`, então ela não vale para validar mensagens.",
    acao: "Apague o `s=` ou troque por `s=email`.",
    provisorio: false,
  },
  "so-sha1": {
    titulo: "Só aceita assinatura SHA-1",
    explicacao: "A tag `h=` lista só `sha1`, um método fraco que a norma atual não aceita mais.",
    acao: "Apague o `h=` ou inclua `sha256`.",
    provisorio: false,
  },
  "tag-repetida": {
    titulo: "Tag repetida no registro DKIM",
    explicacao: "A mesma tag aparece mais de uma vez, e a norma manda ignorar um registro assim.",
    acao: "Deixe cada tag uma vez só.",
    provisorio: false,
  },
  "tipo-de-chave-desconhecido": {
    titulo: "Tipo de chave que não conheço",
    explicacao: "O `k=` não é `rsa` nem `ed25519`, então não medi a chave.",
    acao: "Confira se o `k=` foi digitado certo.",
    provisorio: false,
  },
  "valor-grande-demais": {
    titulo: "Valor grande demais numa tag",
    explicacao:
      "O valor de uma tag passa do tamanho que esta ferramenta lê. É comum quando o valor foi colado em dobro.",
    acao: "Confira o valor no painel do seu DNS e deixe só uma cópia.",
    provisorio: false,
  },
  "versao-invalida": {
    titulo: "Versão do DKIM inválida",
    explicacao:
      "A tag `v=` precisa ser `DKIM1` e vir primeiro. Senão, quem recebe descarta o registro.",
    acao: "Comece o registro com `v=DKIM1`.",
    provisorio: false,
  },

  // -------------------------------------------------------------------------
  // DKIM, busca nos seletores (dkim-busca.js)
  // -------------------------------------------------------------------------
  "busca-interrompida": {
    titulo: "A busca parou no meio",
    explicacao:
      "Parei de consultar depois de várias falhas seguidas, então parte dos seletores não foi verificada.",
    acao: "Tente de novo daqui a pouco.",
    provisorio: false,
  },
  "nenhum-seletor-encontrado": {
    titulo: "Não encontrei nesses seletores",
    explicacao:
      "Não achei chave DKIM nos seletores que tentei. Isso não quer dizer que o domínio não tenha: quem envia o e-mail escolhe o nome do seletor.",
    acao: "Veja no painel do seu provedor de e-mail qual é o seletor dele e procure por ele no campo abaixo.",
    provisorio: false,
  },
  "seletor-invalido": {
    titulo: "Seletor que não foi aceito",
    explicacao: "Um dos seletores que você digitou não é válido e foi deixado de fora.",
    acao: "Digite só o seletor (por exemplo `google`), sem `._domainkey` e sem o domínio.",
    provisorio: false,
  },
  "seletores-demais": {
    titulo: "Seletores demais",
    explicacao: "A lista passou do máximo de 40 seletores, e os últimos ficaram de fora.",
    acao: "Procure por menos seletores de cada vez, os mais prováveis primeiro.",
    provisorio: false,
  },
};

// ---------------------------------------------------------------------------
// TEXTO GENÉRICO
// ---------------------------------------------------------------------------

// Para o código que o catálogo não tem: o achado aparece, não some nem quebra a página
// (RF-08). O código vai em fonte monoespaçada para quem for reportar.
/**
 * @param {string} codigo - Código do achado sem entrada.
 * @returns {TextoAchado} O texto genérico.
 */
const textoGenerico = (codigo) => ({
  titulo: "Achado sem explicação ainda",
  explicacao: `A ferramenta apontou algo no registro que ainda não tem texto em português. Código: \`${codigo}\`.`,
  acao: "Confira o registro no painel do seu DNS.",
  provisorio: true,
});

// ---------------------------------------------------------------------------
// ESCOLHA DO TEXTO
// ---------------------------------------------------------------------------

/**
 * Junta o achado ao texto dele.
 *
 * O `detalhe` do `seletor-invalido` é o motivo da recusa, que o módulo devolve como código
 * (`caractere-invalido`); aqui vira a frase. Os demais detalhes (números, o termo SPF que
 * falhou) passam como texto.
 *
 * @param {AchadoLido} achado - O achado como o módulo o devolveu.
 * @returns {AchadoVisivel} O achado com título, explicação e ação.
 */
export const textoDoAchado = (achado) => {
  const { titulo, explicacao, acao } = Object.hasOwn(TEXTOS_ACHADOS, achado.codigo)
    ? /** @type {TextoAchado} */ (TEXTOS_ACHADOS[achado.codigo])
    : textoGenerico(String(achado.codigo));

  const bruto = achado.detalhe;
  const detalhe =
    achado.codigo === "seletor-invalido" && typeof bruto === "string"
      ? (MOTIVOS_SELETOR[bruto]?.texto ?? bruto)
      : bruto === undefined
        ? undefined
        : String(bruto);

  return {
    codigo: String(achado.codigo),
    gravidade: achado.gravidade,
    titulo,
    explicacao,
    acao,
    ...(achado.tag === undefined ? {} : { tag: achado.tag }),
    ...(detalhe === undefined ? {} : { detalhe }),
    ...(achado.seletor === undefined ? {} : { seletor: achado.seletor }),
    ...(achado.dominio === undefined ? {} : { dominio: achado.dominio }),
  };
};
