# Política de segurança

## Versões suportadas

Só o site no ar recebe correção de segurança. Ele reflete a branch `main`, e a correção vai ao ar no deploy seguinte.

| O quê                   | Suportado |
| ----------------------- | --------- |
| o site no ar (a `main`) | sim       |
| cópias antigas e forks  | não       |

## Como relatar uma vulnerabilidade

Relate problemas de segurança no próprio DMARC Fácil **em privado**, pelos avisos de segurança do GitHub: abra a aba **Security** do repositório e escolha **Report a vulnerability**. Não abra issue nem pull request público para isso.

Inclua o necessário para reproduzir: o commit ou o endereço da página, o que você digitou na página, o que esperava e o que aconteceu, e o impacto que você enxerga. Monte você mesmo qualquer registro DNS de exemplo e use só domínios seus ou de documentação (`exemplo.com.br`, `example.com`).

Nós nos comprometemos a **confirmar o recebimento em até 7 dias** e a enviar uma primeira avaliação em até 14.

## Política de divulgação

Seguimos a divulgação coordenada. A correção é preparada em privado, publicada, e só então o aviso é divulgado; o prazo máximo é de **90 dias** a partir do relato, menos quando a correção ficar pronta antes. Damos o crédito ao relator no aviso, a menos que ele peça para não aparecer.

## Escopo

O DMARC Fácil é um site estático. Ele lê registros DNS públicos por DNS-over-HTTPS, direto do navegador de quem o abre, e mostra o resultado na página. Não tem servidor, banco de dados, conta de usuário nem formulário que envie dados a nós. Só consulta DNS público: não escaneia nem se conecta ao servidor do domínio verificado.

**Relate aqui** (vulnerabilidade no próprio DMARC Fácil): qualquer coisa que permita a um texto de fora virar o site contra quem o usa, ou que quebre uma das garantias dele. Por exemplo:

- um registro TXT (que é dado de terceiros) que consiga executar script ou injetar marcação na página;
- um texto digitado que chegue a uma URL de consulta sem passar pela validação do domínio;
- o domínio digitado indo para um destino que não seja o resolvedor DNS-over-HTTPS;
- qualquer requisição, script, fonte ou imagem de terceiros que a página passe a carregar;
- um log ou armazenamento do domínio consultado que não esteja documentado;
- uma falha na política de segurança de conteúdo (CSP) da página ou nos cabeçalhos de segurança da hospedagem;
- uma dependência de runtime que entre no site, que a promessa do projeto é não ter.

**Não é vulnerabilidade no DMARC Fácil**: o que o resultado diz sobre um domínio (um SPF sem `-all`, um DMARC em `p=none`, um seletor DKIM não encontrado: isso é assunto do dono do domínio), e uma explicação errada ou um próximo passo mal indicado (abra uma issue comum, com um registro de exemplo).

O resultado só é tão bom quanto o que o DNS devolve no momento da consulta. O DKIM, em especial, só é achado nos seletores que a página procura: não encontrar um seletor não prova que o domínio não assina e-mail.
