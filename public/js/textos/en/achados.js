/**
 * @file Catálogo em inglês dos textos dos achados: o que explica cada código.
 *
 * Mesma forma do catálogo em português (`../pt/achados.js`), que é a referência: uma entrada por
 * código, com `titulo`, `explicacao` (o que o achado significa) e `acao` (o que fazer). As chaves
 * ficam em português porque são os nomes do código; só os valores estão em inglês. Trecho de
 * código vai entre crases e a página o desenha em fonte monoespaçada.
 *
 * Os textos não afirmam o que a ferramenta não sabe: nada de "you have no DKIM" nem de
 * "protected".
 *
 * É dado puro: sem DOM, sem rede, sem lógica.
 */

// @ts-check

/** @typedef {import("../tipos.js").TextoAchado} TextoAchado */

// ---------------------------------------------------------------------------
// POR CÓDIGO
// ---------------------------------------------------------------------------

/** @type {Record<string, TextoAchado>} */
const porCodigo = {
  // -------------------------------------------------------------------------
  // DMARC (dmarc.js)
  // -------------------------------------------------------------------------
  "aplicacao-parcial": {
    titulo: "The policy applies to only part of the messages",
    explicacao:
      "`pct=` is below 100: only that percentage of the messages that fail gets the policy. The rest gets a milder treatment.",
    acao: "Once the reports show that your legitimate senders pass, raise `pct` to 100 or remove the tag.",
  },
  "caixa-fora-do-padrao": {
    titulo: "Uppercase where the standard uses lowercase",
    explicacao:
      "Part of the record is written in a different case from the standard (for example `P=` instead of `p=`). Many receivers accept it, but not all of them read it the same way.",
    acao: "Rewrite the record the standard way, so it does not depend on how each receiver reads it.",
  },
  "endereco-invalido": {
    titulo: "Report address that is not valid",
    explicacao:
      "Some `rua=` or `ruf=` addresses are not in the `mailto:name@domain` format, and receivers ignore them.",
    acao: "Fix or remove those addresses. Each one starts with `mailto:`.",
  },
  "monitoramento-apenas": {
    titulo: "DMARC is only monitoring",
    explicacao:
      "With `p=none`, DMARC only observes. Messages spoofing your domain are still delivered as before.",
    acao: "Use the reports to find out who sends on behalf of the domain, then raise the policy, as the ladder above shows.",
  },
  "politica-ausente": {
    titulo: "The record does not state the policy (`p=`)",
    explicacao:
      "The `p=` tag is missing. If the record has `rua=`, receivers treat it as `p=none` (monitor only); without `rua=`, they ignore the whole record.",
    acao: "Add `p=none` to the record. Later, raise it to `quarantine` and `reject`.",
  },
  "politica-invalida": {
    titulo: "Policy that DMARC does not know",
    explicacao:
      "The value of `p=` is not `none`, `quarantine` or `reject`, so receivers ignore the record.",
    acao: "Replace the value with one of the three. To start, `p=none`.",
  },
  "registro-grande-demais": {
    titulo: "Record too large to read",
    explicacao:
      "The record is larger than this tool analyzes, so I did not read its tags. A record like this is usually text pasted twice.",
    acao: "Open your DNS panel, check whether the record was pasted wrong and keep only what is needed.",
  },
  "sem-relatorio-agregado": {
    titulo: "Nobody receives the reports",
    explicacao:
      "Without `rua=`, no address receives the reports that show who sends email on behalf of your domain, and without them there is no safe way to raise the policy.",
    acao: "Add `rua=mailto:dmarc@yourdomain.com`, with a mailbox you read or a service that reads the reports for you.",
  },
  "subdominios-mais-fracos": {
    titulo: "Subdomains with a weaker rule",
    explicacao:
      "`sp=` sets a weaker policy for subdomains than the one in `p=`. A subdomain of your domain can be spoofed with less of a barrier.",
    acao: "Remove `sp=` (subdomains then follow `p=`) or make the two equal.",
  },
  "tag-duplicada": {
    titulo: "Repeated tag",
    explicacao:
      "The same tag appears more than once in the record. This tool read the first one and ignored the others, but not every receiver does the same.",
    acao: "Keep each tag only once, with the value you want.",
  },
  "valor-invalido": {
    titulo: "Value that does not follow the format",
    explicacao:
      "The value of an optional tag (the one shown beside it) does not follow the expected format, so its default applies.",
    acao: "Fix the value or remove the tag.",
  },

  // -------------------------------------------------------------------------
  // SPF (spf.js)
  // -------------------------------------------------------------------------
  "all-libera-tudo": {
    titulo: "`+all`: any server can send",
    explicacao:
      "The record ends with `+all`, which authorizes any server in the world to send email on behalf of the domain. In practice, it is the same as having no SPF.",
    acao: "Replace it with `~all` or, once you know all your senders, with `-all`.",
  },
  "all-neutro": {
    titulo: "`?all`: SPF decides nothing",
    explicacao:
      "With `?all`, SPF does not say whether a server is allowed or not, so it does not help block spoofing.",
    acao: "Replace it with `~all` or with `-all`.",
  },
  "all-rigido": {
    titulo: "`-all`: only the listed servers",
    explicacao: "Whoever is not on the list fails SPF, and receivers may reject the message.",
    acao: "Keep it that way and check that every service that sends for you is on the list.",
  },
  "all-suave": {
    titulo: "`~all`: the rest is suspicious",
    explicacao:
      "Whoever is not on the list is marked as suspicious, but the message is usually accepted.",
    acao: "It is a good starting point. Move to `-all` once you are sure every sender is on the list.",
  },
  "modificador-repetido": {
    titulo: "`redirect` or `exp` repeated",
    explicacao:
      "`redirect` and `exp` can appear only once. When repeated, receivers return an error and the whole SPF stops working.",
    acao: "Keep only one of each.",
  },
  "ptr-em-uso": {
    titulo: "`ptr` is deprecated",
    explicacao:
      "The SPF standard discourages `ptr`: it is slow, it spends lookups and not every receiver evaluates it.",
    acao: "Replace it with `ip4`, `ip6` or `include`.",
  },
  "redirect-ignorado": {
    titulo: "`redirect` has no effect",
    explicacao:
      "`redirect` only applies when the record has no `all`. Since this one has it, receivers ignore the `redirect`.",
    acao: "Remove the `redirect` or the `all`, depending on which one you want to apply.",
  },
  "registro-grande": {
    titulo: "Long SPF record",
    explicacao:
      "The record is over 512 characters, the size the standard recommends so it fits in a common DNS response. Some receivers fail with larger records.",
    acao: "Trim the record: drop services you no longer use and replace repeated IP ranges with a single one.",
  },
  "sem-all": {
    titulo: "Record without `all` at the end",
    explicacao:
      "Without `all` (and without `redirect`), SPF does not say what to do with servers that are not on the list.",
    acao: "End the record with `~all` or `-all`.",
  },
  "termo-invalido": {
    titulo: "Term that SPF does not understand",
    explicacao:
      "A term in the record (the one shown beside it) does not follow the SPF syntax. Receivers return an error and the whole SPF stops working.",
    acao: "Fix or remove that term.",
  },
  "termo-repetido": {
    titulo: "Repeated term",
    explicacao:
      "The same term appears more than once. The repetition takes up space in the record and, in `include`, `a` and `mx`, spends lookups for nothing.",
    acao: "Remove the repetitions.",
  },
  "termos-apos-all": {
    titulo: "Terms after `all`",
    explicacao: "What comes after `all` is never evaluated.",
    acao: "Move those terms before `all` or remove them.",
  },

  // -------------------------------------------------------------------------
  // SPF, contagem de consultas (spf-consultas.js)
  // -------------------------------------------------------------------------
  "caminhada-interrompida": {
    titulo: "The count stopped halfway",
    explicacao:
      "I stopped following the `include` terms before finishing (network failures or too many terms), so the total is at least that number.",
    acao: "Try again. If the total is already over 10, reduce the `include` terms.",
  },
  ciclo: {
    titulo: "Records that include each other in a circle",
    explicacao:
      "One record includes another that, further down, includes the first one back. Receivers return an error.",
    acao: "Break the cycle: one of the two stops including the other.",
  },
  "consulta-falhou": {
    titulo: "I could not look up an included record",
    explicacao:
      "The lookup of a record pointed to by `include` or `redirect` failed, so the count may be higher than shown.",
    acao: "Try again. This says nothing about your record.",
  },
  "consultas-vazias": {
    titulo: "Terms that point to names with no answer",
    explicacao:
      "More than two SPF terms point to names that do not exist or have no record. The standard treats this as an error.",
    acao: "Remove the `include`, `a`, `mx` and `exists` terms that point to names with no record.",
  },
  "limite-de-consultas": {
    titulo: "Too many lookups: SPF will fail",
    explicacao:
      "The limit is 10 DNS lookups. Beyond that, receivers treat SPF as an error, even if the record is well written.",
    acao: "Remove the `include` terms of services you no longer use.",
  },
  "macro-nao-avaliada": {
    titulo: "Macro that this tool does not evaluate",
    explicacao:
      "The target of an `include` or `redirect` uses a macro (`%{...}`), whose value changes with every message. There is no way to count how many lookups it spends.",
    acao: "Nothing to fix. Just know that the total may be higher than shown.",
  },
  "perto-do-limite": {
    titulo: "Close to the lookup limit",
    explicacao:
      "SPF already uses 8 or 9 of the 10 allowed lookups. A new `include` could push it over the limit.",
    acao: "Before including one more service, remove one you no longer use.",
  },
  "include-sem-registro": {
    titulo: "The domain of an `include` has no SPF",
    explicacao:
      "An `include` points to a name with no SPF record, and that makes the whole SPF return an error.",
    acao: "Fix the domain name or remove that `include`.",
  },
  "redirect-sem-registro": {
    titulo: "The domain of the `redirect` has no SPF",
    explicacao:
      "The `redirect` points to a name with no SPF record, and that makes the whole SPF return an error.",
    acao: "Fix the domain name or remove the `redirect`.",
  },
  "include-com-varios-registros": {
    titulo: "The domain of an `include` has more than one SPF",
    explicacao:
      "The name pointed to by an `include` publishes more than one SPF record, and that makes the whole SPF return an error.",
    acao: "If the domain is yours, keep a single record. If it belongs to a service, tell the service or remove the `include`.",
  },
  "redirect-com-varios-registros": {
    titulo: "The domain of the `redirect` has more than one SPF",
    explicacao:
      "The name pointed to by the `redirect` publishes more than one SPF record, and that makes the whole SPF return an error.",
    acao: "If the domain is yours, keep a single record. If it belongs to a service, tell the service or remove the `redirect`.",
  },
  "include-invalido": {
    titulo: "The record of an `include` is invalid",
    explicacao:
      "The SPF record of the included domain has a syntax error, and that makes your SPF return an error too.",
    acao: "If the domain is yours, fix its record. If it belongs to a service, tell the service or remove the `include`.",
  },
  "redirect-invalido": {
    titulo: "The record of the `redirect` is invalid",
    explicacao:
      "The SPF record of the domain pointed to by the `redirect` has a syntax error, and that makes your SPF return an error too.",
    acao: "If the domain is yours, fix its record. If it belongs to a service, tell the service or remove the `redirect`.",
  },

  // -------------------------------------------------------------------------
  // DKIM (dkim.js)
  // -------------------------------------------------------------------------
  "chave-abaixo-do-recomendado": {
    titulo: "Key shorter than 2048 bits",
    explicacao:
      "1024-bit RSA keys still work, but the current recommendation is 2048 bits or more.",
    acao: "Generate a 2048-bit key in your email provider's panel and publish the new record.",
  },
  "chave-ausente": {
    titulo: "Record without the key (`p=`)",
    explicacao:
      "The DKIM record has no `p=` tag, which holds the public key. Without it, DKIM validates nothing.",
    acao: "Copy the full record again from your provider's panel.",
  },
  "chave-fraca": {
    titulo: "Key too weak",
    explicacao:
      "RSA keys shorter than 1024 bits are considered weak, and receivers may reject the signature.",
    acao: "Replace it with a 2048-bit key in your email provider's panel.",
  },
  "chave-ilegivel": {
    titulo: "I could not read the key",
    explicacao:
      "The content of `p=` is not a valid public key of the declared type. This is common when the key is pasted cut off or with extra characters.",
    acao: "Copy the key again from your provider's panel, without quotes and without extra spaces.",
  },
  "chave-maior-que-4096": {
    titulo: "Key larger than 4096 bits",
    explicacao:
      "Receivers only need to validate keys up to 4096 bits. Larger keys may be ignored or make validation slow.",
    acao: "Use a 2048-bit key (or, at most, 4096).",
  },
  "chave-revogada": {
    titulo: "Revoked key",
    explicacao:
      "`p=` is empty: the owner withdrew the key on purpose. Messages signed with this selector no longer pass DKIM.",
    acao: "If it was on purpose, that is fine. If it was not, publish the key again.",
  },
  "modo-de-teste": {
    titulo: "Key in test mode",
    explicacao:
      "The record has `t=y`, which marks DKIM as a test. Some receivers treat the signature as if it did not exist.",
    acao: "Once everything works, remove `t=y`.",
  },
  "registros-multiplos": {
    titulo: "More than one record on the same selector",
    explicacao:
      "The selector publishes more than one DKIM record, and the standard leaves the result undefined. That is why I read none of them.",
    acao: "Keep a single record per selector.",
  },
  "servico-nao-e-email": {
    titulo: "Key that is not valid for email",
    explicacao:
      "The `s=` tag limits the key to a service that is not `email`, so it is not valid for validating messages.",
    acao: "Remove `s=` or change it to `s=email`.",
  },
  "so-sha1": {
    titulo: "Only accepts SHA-1 signatures",
    explicacao:
      "The `h=` tag lists only `sha1`, a weak method that the current standard no longer accepts.",
    acao: "Remove `h=` or include `sha256`.",
  },
  "tag-repetida": {
    titulo: "Repeated tag in the DKIM record",
    explicacao:
      "The same tag appears more than once, and the standard says to ignore a record like this.",
    acao: "Keep each tag only once.",
  },
  "tipo-de-chave-desconhecido": {
    titulo: "Key type that I do not know",
    explicacao: "`k=` is neither `rsa` nor `ed25519`, so I did not measure the key.",
    acao: "Check that `k=` was typed correctly.",
  },
  "valor-grande-demais": {
    titulo: "Value too large in a tag",
    explicacao:
      "The value of a tag is over the size this tool reads. This is common when the value was pasted twice.",
    acao: "Check the value in your DNS panel and keep only one copy.",
  },
  "versao-invalida": {
    titulo: "Invalid DKIM version",
    explicacao:
      "The `v=` tag must be `DKIM1` and come first. Otherwise, receivers discard the record.",
    acao: "Start the record with `v=DKIM1`.",
  },

  // -------------------------------------------------------------------------
  // DKIM, busca nos seletores (dkim-busca.js)
  // -------------------------------------------------------------------------
  "busca-interrompida": {
    titulo: "The search stopped halfway",
    explicacao:
      "I stopped querying after several failures in a row, so part of the selectors was not checked.",
    acao: "Try again in a little while.",
  },
  "nenhum-seletor-encontrado": {
    titulo: "Not found in these selectors",
    explicacao:
      "I did not find a DKIM key in the selectors I tried. That does not mean the domain has none: whoever sends the email chooses the selector name.",
    acao: "Check your email provider's panel for its selector and search for it in the field below.",
  },
  "seletor-invalido": {
    titulo: "Selector that was not accepted",
    explicacao: "One of the selectors you typed is not valid and was left out.",
    acao: "Type only the selector (for example `google`), without `._domainkey` and without the domain.",
  },
  "seletores-demais": {
    titulo: "Too many selectors",
    explicacao: "The list went over the maximum of 40 selectors, and the last ones were left out.",
    acao: "Search fewer selectors at a time, the most likely ones first.",
  },
};

// ---------------------------------------------------------------------------
// CATÁLOGO
// ---------------------------------------------------------------------------

// `generico` é o texto do código que o catálogo não tem: o achado aparece, não some nem quebra
// a página, e o código vai em fonte monoespaçada para quem for reportar. `{codigo}` é trocado por
// `preencher`. Fica no catálogo para sair no idioma da página.
/** @type {{ porCodigo: Record<string, TextoAchado>, generico: TextoAchado }} */
export const achados = {
  porCodigo,
  generico: {
    titulo: "Finding without an explanation yet",
    explicacao:
      "The tool flagged something in the record that has no text in English yet. Code: `{codigo}`.",
    acao: "Check the record in your DNS panel.",
  },
};
