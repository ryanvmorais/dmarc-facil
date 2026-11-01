/**
 * @file Textos fixos da interface que o script monta (rótulos dos selos, degraus da escada,
 * mensagens de falha, frases do `aria-live`).
 *
 * Os textos do HTML estático ficam no próprio HTML; os que o JavaScript escolhe ficam aqui,
 * fora da lógica, para se editar sem mexer em `selo.js`, `escada.js` e `apresentacao.js`. Em
 * texto com trecho de código, o trecho vai entre crases e a página o desenha em fonte
 * monoespaçada.
 *
 * É dado puro: sem DOM, sem rede, sem lógica.
 */

// @ts-check

/** @typedef {{ texto: string }} TextoFixo */
/** @typedef {{ titulo: string, resumo: string }} TextoDegrau */

// ---------------------------------------------------------------------------
// SELOS
// ---------------------------------------------------------------------------

// As quatro palavras fixas do selo (RF-07). O ícone e a cor vêm do CSS; a palavra é o que
// distingue os estados também para quem não vê a cor.
/** @type {Record<"ok" | "atencao" | "problema" | "nao-verificado", TextoFixo>} */
export const TEXTOS_SELO = {
  ok: { texto: "OK" },
  atencao: { texto: "Atenção" },
  problema: { texto: "Problema" },
  "nao-verificado": { texto: "Não verificado" },
};

// ---------------------------------------------------------------------------
// ESCADA DO DMARC
// ---------------------------------------------------------------------------

// O degrau fala do que a política faz; o que fazer para chegar nele está em `ACOES_PROXIMO`.
/** @type {Record<"none" | "quarantine" | "reject", TextoDegrau>} */
export const TEXTOS_DEGRAUS = {
  none: {
    titulo: "p=none",
    resumo: "Só monitora. Falsificação ainda chega à caixa de entrada.",
  },
  quarantine: {
    titulo: "p=quarantine",
    resumo: "Falsificação vai para o spam.",
  },
  reject: {
    titulo: "p=reject",
    resumo: "Falsificação é recusada. Proteção completa.",
  },
};

/** @type {Record<"atual" | "proximo", TextoFixo>} */
export const ETIQUETAS_DEGRAU = {
  atual: { texto: "você está aqui" },
  proximo: { texto: "Próximo passo" },
};

// O que fazer para chegar ao degrau seguinte, ou para publicar o registro. Só o degrau
// seguinte mostra o seu texto.
/**
 * @type {{
 *   quarantine: TextoFixo, reject: TextoFixo,
 *   publicar: Record<"ausente" | "invalido" | "multiplos", TextoFixo>
 * }}
 */
export const ACOES_PROXIMO = {
  quarantine: {
    texto:
      "Leia os relatórios por 2 a 4 semanas, confirme que seus remetentes passam no SPF ou no DKIM e então troque o `p=none` por `p=quarantine`.",
  },
  reject: {
    texto:
      "Continue lendo os relatórios por mais 2 a 4 semanas e confira se nenhum remetente seu está indo para o spam. Estando tudo certo, troque o `p=quarantine` por `p=reject`.",
  },
  publicar: {
    ausente: {
      texto:
        "Crie um registro TXT no nome `_dmarc` do seu domínio, com `v=DMARC1; p=none; rua=mailto:dmarc@seudominio.com.br`. Com `p=none` nada muda na entrega dos seus e-mails: você só passa a receber os relatórios.",
    },
    invalido: {
      texto:
        "O registro existe, mas está escrito de um jeito que quem recebe ignora. Corrija o registro do nome `_dmarc` (os achados abaixo dizem o quê) e comece por `p=none`.",
    },
    multiplos: {
      texto:
        "Há mais de um registro DMARC no nome `_dmarc`, e quem recebe ignora todos. Apague os extras e deixe um só, que comece por `v=DMARC1; p=none`.",
    },
  },
};

/** @type {{ final: TextoFixo, semAtual: TextoFixo }} */
export const TEXTOS_ESCADA = {
  final: { texto: "Você já está no degrau final." },
  semAtual: {
    texto: "Nenhum degrau vale ainda: não há um registro DMARC em uso.",
  },
};

// Ressalvas que o texto do degrau atual não pode calar (RF-03): a política vale para menos do
// que parece.
/** @type {Record<"subdominios-mais-fracos" | "aplicacao-parcial", TextoFixo>} */
export const RESSALVAS_ESCADA = {
  "subdominios-mais-fracos": {
    texto: "Os subdomínios seguem uma regra mais fraca (`sp=`) do que a do domínio.",
  },
  "aplicacao-parcial": {
    texto: "A política vale só para parte das mensagens (`pct=` abaixo de 100).",
  },
};

// ---------------------------------------------------------------------------
// SELETOR DIGITADO
// ---------------------------------------------------------------------------

// O `normalizarSeletor` devolve o motivo da recusa como código; aqui vira a frase que a página
// mostra ao lado do seletor recusado.
/** @type {Record<string, TextoFixo>} */
export const MOTIVOS_SELETOR = {
  vazio: { texto: "está vazio" },
  "parece-nome-completo": {
    texto: "parece o nome completo; digite só o seletor, que eu monto o resto",
  },
  "grande-demais": { texto: "é grande demais" },
  "componente-vazio": { texto: "tem um ponto sobrando" },
  "componente-grande-demais": { texto: "tem uma parte grande demais" },
  "caractere-invalido": {
    texto: "tem caractere que um seletor não aceita (use letras, números, hífen e sublinhado)",
  },
};

// ---------------------------------------------------------------------------
// CARTÕES
// ---------------------------------------------------------------------------

// `{nome}` marca o lugar de um valor; quem monta a frase troca com `preencher`
// (apresentacao.js). A frase inteira fica aqui, para quem revisa o texto lê-lo por inteiro.
/** @type {Record<"dmarc" | "spf" | "dkim", TextoFixo>} */
export const TITULOS_CARTAO = {
  dmarc: { texto: "DMARC" },
  spf: { texto: "SPF" },
  dkim: { texto: "DKIM" },
};

/** @type {Record<"dmarc" | "spf" | "dkim", TextoFixo>} */
export const TEXTOS_VERIFICANDO = {
  dmarc: { texto: "Consultando o registro DMARC…" },
  spf: { texto: "Seguindo os `include` e contando as consultas…" },
  dkim: { texto: "Procurando em {total} seletores comuns…" },
};

/** @type {{ semMotivo: TextoFixo, naoDiz: TextoFixo }} */
export const TEXTOS_FALHA = {
  semMotivo: { texto: "Não consegui consultar o DNS agora." },
  naoDiz: { texto: "Isso não diz nada sobre o seu {parte}." },
};

/** @type {Record<"ausente" | "invalido" | "multiplos", TextoFixo>} */
export const TEXTOS_DMARC = {
  ausente: {
    texto:
      "Este domínio não publica DMARC. Quem recebe não tem instrução do dono do domínio sobre mensagens falsificadas, e cada um decide por conta própria.",
  },
  invalido: {
    texto: "Há um registro DMARC, mas ele tem erro e quem recebe o ignora.",
  },
  multiplos: {
    texto:
      "Há {quantidade} registros DMARC no mesmo nome. Quem recebe ignora todos, e é como se não houvesse nenhum.",
  },
};

/**
 * @type {{
 *   ausente: TextoFixo, invalido: TextoFixo, multiplos: TextoFixo,
 *   consultas: TextoFixo, consultasPeloMenos: TextoFixo, passouDoLimite: TextoFixo,
 *   terminaEm: TextoFixo, semAll: TextoFixo, redirecionado: TextoFixo
 * }}
 */
export const TEXTOS_SPF = {
  ausente: {
    texto:
      "Este domínio não publica SPF. Quem recebe não sabe quais servidores podem enviar e-mail em nome dele.",
  },
  invalido: {
    texto: "Há um registro SPF, mas ele tem erro e, por isso, o SPF deixa de valer.",
  },
  multiplos: {
    texto:
      "Há {quantidade} registros SPF no mesmo nome. Isso é erro: quem recebe devolve `permerror` e o SPF deixa de valer.",
  },
  consultas: {
    texto: "{total} de {limite} consultas DNS, no pior caso.",
  },
  consultasPeloMenos: {
    texto:
      "Pelo menos {total} de {limite} consultas DNS. Não consegui seguir tudo, então o número pode ser maior.",
  },
  passouDoLimite: {
    texto: "O SPF vai falhar por passar do limite de consultas, e não por erro de sintaxe.",
  },
  terminaEm: { texto: "Termina em `{all}`." },
  semAll: { texto: "Não termina em `all`." },
  redirecionado: { texto: "Segue o `redirect` para outro domínio." },
};

/**
 * @type {{
 *   encontrado: TextoFixo, encontradoVarios: TextoFixo, naoEncontrado: TextoFixo,
 *   parcial: TextoFixo, chaveRsa: TextoFixo, chaveRsaSemTamanho: TextoFixo, chaveEd25519: TextoFixo, chaveOutra: TextoFixo,
 *   verTentados: TextoFixo, documentacao: TextoFixo, documentacaoDe: TextoFixo, seletorDigitado: TextoFixo,
 *   orientacaoTitulo: TextoFixo,
 *   orientacao: TextoFixo, recusado: TextoFixo
 * }}
 */
export const TEXTOS_DKIM = {
  encontrado: {
    texto: "Encontrei a chave no seletor `{seletor}` ({chave}). Procurei em {total} seletores.",
  },
  encontradoVarios: {
    texto:
      "Encontrei chaves em {quantidade} seletores: {seletores}. Procurei em {total} seletores.",
  },
  naoEncontrado: {
    texto:
      "Não encontrei chave DKIM nesses {total} seletores. Isso não quer dizer que o domínio não tenha: quem envia o e-mail escolhe o nome do seletor.",
  },
  parcial: {
    texto:
      "Parte das consultas falhou e a lista não foi toda verificada: consegui olhar {verificados} de {total} seletores.",
  },
  chaveRsa: { texto: "RSA de {bits} bits" },
  chaveRsaSemTamanho: { texto: "RSA, tamanho não lido" },
  chaveEd25519: { texto: "Ed25519" },
  chaveOutra: { texto: "tipo de chave que não conheço" },
  verTentados: { texto: "Ver os {total} seletores tentados" },
  documentacao: { texto: "documentação" },
  // Nome acessível do link: o leitor de tela lista os links fora do contexto da linha.
  documentacaoDe: { texto: "documentação de {provedor}" },
  seletorDigitado: { texto: "digitado por você" },
  orientacaoTitulo: {
    texto: "Provedores em que o seletor depende da sua conta",
  },
  orientacao: {
    texto: "{provedor}: digite o seletor que o painel do provedor mostra.",
  },
  recusado: { texto: "Não aceitei `{texto}`: {motivo}." },
};

// ---------------------------------------------------------------------------
// ACHADOS
// ---------------------------------------------------------------------------

// A gravidade em texto: a cor do achado nunca é a única diferença (RF-08).
/** @type {Record<"erro" | "aviso" | "info", TextoFixo>} */
export const ROTULOS_GRAVIDADE = {
  erro: { texto: "Erro" },
  aviso: { texto: "Aviso" },
  info: { texto: "Informação" },
};

// Os rótulos das linhas de dado que acompanham um achado (onde ele foi achado).
/** @type {Record<"seletor" | "seletores" | "dominio" | "tag" | "detalhe", TextoFixo>} */
export const ROTULOS_DADO_DO_ACHADO = {
  seletor: { texto: "Seletor" },
  seletores: { texto: "Seletores" },
  dominio: { texto: "Domínio" },
  tag: { texto: "Tag" },
  detalhe: { texto: "Detalhe" },
};

// ---------------------------------------------------------------------------
// RESULTADO E FORMULÁRIO
// ---------------------------------------------------------------------------

/** @type {Record<"titulo" | "escada" | "inexistenteTitulo" | "inexistenteTexto" | "resolvedores" | "resolvedorCloudflare" | "resolvedorGoogle" | "resolvedorAmbos" | "mailvigilTitulo" | "mailvigilTexto" | "mailvigilBotao", TextoFixo>} */
export const TEXTOS_RESULTADO = {
  titulo: { texto: "Resultado para {dominio}" },
  escada: { texto: "Em que degrau do DMARC você está" },
  inexistenteTitulo: { texto: "Não encontrei esse domínio" },
  inexistenteTexto: {
    texto: "O DNS não conhece `{dominio}`. Confira se digitou certo e tente de novo.",
  },
  resolvedores: {
    texto: "Quem viu o domínio nesta verificação: DNS público {quem}.",
  },
  resolvedorCloudflare: { texto: "da Cloudflare" },
  resolvedorGoogle: { texto: "do Google" },
  resolvedorAmbos: { texto: "da Cloudflare e do Google" },
  mailvigilTitulo: { texto: "Quer ler esses relatórios sem abrir XML?" },
  mailvigilTexto: { texto: "O MailVigil lê os relatórios por você." },
  mailvigilBotao: { texto: "Conhecer o MailVigil" },
};

/** @type {Record<"botao" | "botaoOcupado" | "tentarDeNovo" | "seletoresRotulo" | "seletoresExemplo" | "seletoresAjuda" | "seletoresBotao", TextoFixo>} */
export const TEXTOS_FORMULARIO = {
  botao: { texto: "Verificar" },
  botaoOcupado: { texto: "Verificando…" },
  tentarDeNovo: { texto: "Tentar de novo" },
  seletoresRotulo: { texto: "Seletores extras (separe por vírgula)" },
  seletoresExemplo: { texto: "ex.: k1, meuprovedor" },
  seletoresAjuda: {
    texto:
      "Seu provedor de e-mail mostra o nome do seletor no painel dele. Mailgun, Mailchimp e HubSpot usam nomes por conta.",
  },
  seletoresBotao: { texto: "Procurar nesses seletores" },
};

// ---------------------------------------------------------------------------
// ANÚNCIOS PARA LEITOR DE TELA
// ---------------------------------------------------------------------------

// Frases curtas da região `aria-live` (ADR-12). O resumo falado usa só a palavra do selo, para
// não afirmar mais do que ele.
/** @type {Record<"inicio" | "fim" | "inexistente", TextoFixo>} */
export const TEXTOS_ANUNCIO = {
  inicio: { texto: "Verificando {dominio}." },
  fim: {
    texto: "Resultado pronto para {dominio}. DMARC: {dmarc}. SPF: {spf}. DKIM: {dkim}.",
  },
  inexistente: { texto: "Não encontrei o domínio {dominio}." },
};
