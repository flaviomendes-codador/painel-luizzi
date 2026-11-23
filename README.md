# Portal da Dra. Luizzi (versão simples)

Sem banco de dados. Três coisas:

| Arquivo | Para quê |
|---|---|
| `index.html` | A página inteira (visual + abas). Não precisa mexer. |
| `api/_dados.json` | **O conteúdo.** Você edita aqui: etapas e % do funil, registros, carrosséis, stories. |
| `api/meta.js` | Busca os dados da Meta em tempo real. O token fica só aqui. |
| `api/conteudo.js` | Entrega o conteúdo só para quem tem a chave do link. |

## Subir (10 min)
1. Coloque esta pasta num repositório e importe na Vercel (framework: *Other*).
2. Em Environment Variables:
   - `PORTAL_KEY` → uma chave longa e aleatória (mín. 12 caracteres). **Ela vira a senha do link.**
   - `META_ACCESS_TOKEN` → token de Usuário do Sistema com permissão `ads_read`
   - `META_AD_ACCOUNT_ID` → ID da conta de anúncios (com ou sem `act_`)
   - `META_API_VERSION` → `v26.0`
   - `META_RESULT_ACTION_TYPE` → deixe vazio na 1ª vez (veja abaixo)
   - `META_RESULT_LABEL` → ex.: `Conversas`
3. Deploy. O link da cliente é:
   `https://SEU-PROJETO.vercel.app/?k=SUA_PORTAL_KEY`
4. Abra a aba Resultados: ela lista os `action_type` que a Meta devolve. Copie o que representa o
   resultado dela para `META_RESULT_ACTION_TYPE` e faça redeploy.

## Dia a dia
- Atualizou algo? Edite `api/_dados.json`, dê commit. A Vercel republica em ~1 min.
- Imagens dos carrosséis: ponha em `img/` e use o caminho no JSON (`"img/c01-1.jpg"`).
  Use nomes difíceis de adivinhar (a pasta `img/` é pública para quem souber o endereço).
- Aprovação: o botão **Aprovar / Pedir ajustes** abre o WhatsApp com a mensagem pronta
  (número em `"whatsapp"`, só dígitos com DDI, ex.: o seu). Quando ela responder, você muda o `"status"` no JSON.

## Formato do `_dados.json`
```json
{
  "cliente": "Dra. Luizzi Di Moraes",
  "whatsapp": "55DDDNUMERO",
  "implantacao": {
    "etapas": [{ "nome": "…", "descricao": "…", "progresso": 0, "status": "pendente | em_andamento | concluido" }],
    "registros": [{ "data": "dd/mm/aaaa", "texto": "…" }]
  },
  "drive": {
    "itens": [{ "id": "c01", "titulo": "…", "pasta": "…", "tipo": "Carrossel",
      "status": "em_revisao | aprovado | ajustes", "legenda": "…", "slides": ["img/c01-1.jpg"] }]
  },
  "stories": [{ "titulo": "…", "objetivo": "…", "stories": ["texto do story 1", "texto do story 2"] }],
  "parecer": { "texto": "parecer sobre a qualidade dos seguidores", "atualizado": "dd/mm/aaaa" },
  "entregas": [{ "item": "…", "status": "entregue | em_andamento | prometido", "data": "dd/mm/aaaa (se entregue)", "previsao": "dd/mm/aaaa (se pendente)" }]
}
```
O % geral é a média do `progresso` das etapas.

## Visual
Layout, tipografia e componentes seguem a referência FinSet (sidebar, cards, gráfico de área, rosca, barras, modo claro/escuro). Só as cores foram trocadas para a paleta rosé + vinho.
Tipografia: Cormorant Garamond (títulos e números) e Jost (interface), hospedadas na pasta `fonts/`, sem depender do Google. As referências usam sans neutras; não dá para identificar a fonte exata só pela imagem, e a serifa foi escolha de design para o ar premium.
O sino mostra quantos criativos aguardam aprovação. O botão de tema (sol/lua) guarda a escolha no aparelho dela.

## Por que é rápido
- Duas fontes próprias (cerca de 64 KB no total), pré-carregadas e com `display=swap`: sem pedido externo ao Google.
- Conteúdo e Meta carregam ao mesmo tempo; a Meta consulta 3 coisas em paralelo.
- A API guarda a resposta por 20s na borda da Vercel: o 2º acesso em diante é quase instantâneo.
- O navegador guarda a última leitura: na volta, os números aparecem na hora, marcados com a data e hora do dado, e atualizam em seguida.

## Limites desta versão (honesto)
- Quem tiver o link completo (com `?k=`) entra. Trate como senha. Para trocar, mude `PORTAL_KEY` e envie o novo link.
- O botão de aprovar não grava nada sozinho: vira mensagem de WhatsApp.
- A Meta pode levar horas para consolidar resultados atribuídos; números de hoje podem mudar.


## Instagram (seguidores) — ainda não testado com token real
Função: `api/instagram.js`. Variável nova na Vercel: `META_IG_USER_ID` (ID da conta do Instagram, diferente do ID da conta de anúncios). Usa o mesmo `META_ACCESS_TOKEN`.
O token precisa de `instagram_basic`, `instagram_manage_insights`, `pages_show_list` e `pages_read_engagement`, e o perfil precisa estar atribuído ao usuário do sistema com a tarefa "Analisar".
Limites documentados pela Meta: `follower_count` só existe em contas com 100 seguidores ou mais, só dos últimos 30 dias e sem o dia de hoje. A função limita o recorte a 29 dias e o painel mostra "só N dias" quando isso acontece.
Por testar com token real: se o `follower_count` ainda é devolvido na versão da API em uso, e se o total (`followers_count`) vem no perfil. Se a Meta não devolver, o painel mostra "—" e um aviso, sem inventar número.
**Custo por novo seguidor** = investimento dos mesmos dias ÷ novos seguidores. Os novos seguidores incluem os orgânicos, não só os dos anúncios.
**Visualizações dos anúncios** = impressões da Meta Ads.
**Parecer:** texto livre em `parecer` no `_dados.json`. Vazio, o painel mostra "O parecer sobre os seguidores aparece aqui."

## Painel aberto (sem chave)
Com `PORTAL_PUBLIC=true` na Vercel (e novo deploy), o painel abre sem `?k=`. Qualquer pessoa com o endereço vê investimento, seguidores e entregas. Padrão: desligado.

## Carrosséis (aba Carrosséis)
1. Imagens em `carrosseis/<id>/01.jpg, 02.jpg…` (JPG 1080×1350, 200 a 400 KB).
2. Em `api/_dados.json`, dentro de `drive.itens`, um bloco por carrossel:
   `{ "id": "carrossel-07", "titulo": "Carrossel 07", "pasta": "Qualificadores", "tipo": "Carrossel", "status": "em_revisao", "legenda": "…", "slides": ["/carrosseis/carrossel-07/01.jpg"] }`
3. `status`: `em_revisao`, `aprovado` ou `ajustes`. A resposta dela vem pelo WhatsApp; quem muda o status é você.
4. Suba de novo no MESMO projeto (GitHub com deploy automático, ou `vercel --prod`). Não use o Vercel Drop de novo: ele cria um projeto novo.
