/* ===========================================================================
   NÚCLEO COMPARTILHADO · CORE-2026-08-24
   ---------------------------------------------------------------------------
   FONTE ÚNICA das regras que o widget do Mac e o app do iPhone precisam
   calcular IGUAL. Nasceu da auditoria de 2026-08-18/19, que mostrou que TODO
   bug sério de sincronia veio da mesma causa: a mesma regra escrita duas ou
   três vezes, divergindo com o tempo. Exemplos que aconteceram de verdade:
     · streak de leitura zerava pelo celular e não zerava no Mac (carência de 1 dia)
     · "marcar tudo" do skincare no celular registrava o retinoide semanal todo dia
     · humor da criatura calculado em Lua e em JS, com fontes de treino diferentes
     · resumo do financeiro escrito em 3 lugares

   COMO É CONSUMIDO (o mesmo arquivo, dois jeitos — por isso NÃO usa import/export):
     · app do iPhone → `import './_shared/regras.js'` (roda como módulo, seta o global)
     · widget do Mac → injetado como <script> inline pelo companheiro.lua
       (o WKWebView carrega o HTML em about:blank e BLOQUEIA <script src> externo,
        então injetar o conteúdo é a única via)

   REGRA DE OURO: só funções PURAS aqui (entra dado, sai dado). Nada de DOM, de
   estado global, de rede. Assim os dois lados podem chamar sem efeito colateral
   e o guarda de divergência (_scripts/guarda-regras.js) consegue testar.

   Se uma regra também é calculada em LUA (companheiro_sync.lua / _inbox.lua),
   ela NÃO pode ser importada daqui — Lua não lê JS. Nesses casos o contrato é
   mantido pelo guarda de divergência, que roda os mesmos vetores nos dois e
   falha se discordarem.
   =========================================================================== */
(function (raiz) {
  'use strict';

  /* ---------- dia lógico (corte configurável, padrão 4h) ---------------------
     O dia só "vira" às N horas porque o Lucas fica acordado depois da meia-noite
     fazendo coisas que ainda são de hoje (jantar, skincare, fechar o dia). */
  function ymdDe(dt) {
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }
  function hoje(corteH, agoraMs) {
    var c = (corteH == null ? 4 : corteH);
    return ymdDe(new Date((agoraMs == null ? Date.now() : agoraMs) - c * 3600000));
  }
  function diasEntre(a, b) {   // b - a, em dias inteiros (aceita "YYYY-MM-DD")
    if (!a || !b) return 0;
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  /* ---------- streak com carência ------------------------------------------
     O Mac perdoa 1 dia de folga (gap de 2 dias ainda soma). O handler do celular
     só aceitava gap==1 e ZERAVA um streak que o Mac preservaria — bug real,
     corrigido em LEIT-FIX-2026-08-18. `carencia` = quantos dias de gap ainda somam
     (1 = só ontem; 2 = ontem ou anteontem). */
  function proximoStreak(streakAtual, ultimaData, dataHoje, carencia) {
    var g = (carencia == null ? 2 : carencia);
    if (ultimaData === dataHoje) return streakAtual || 0;      // já contou hoje
    if (!ultimaData) return 1;                                  // primeira vez
    var gap = diasEntre(ultimaData, dataHoje);
    return (gap >= 1 && gap <= g) ? (streakAtual || 0) + 1 : 1;
  }

  /* ---------- skincare: o que conta como passo do dia ----------------------
     O anel/streak só contam passos DIÁRIOS (freq >= 7). Passo de frequência
     semanal (retinoide, freq 2) é marcável individualmente mas NUNCA entra no
     "marcar tudo" nem no total — senão falseia a dose do ativo. */
  function freqDoPasso(passo) {
    var f = passo && passo.freq;
    f = (f == null ? null : Number(f));
    return (f == null || isNaN(f)) ? 7 : f;   // sem freq declarada = diário
  }
  function ehDiario(passo) { return freqDoPasso(passo) >= 7; }
  function passosDoDia(passos) {              // habilitados E diários
    return (passos || []).filter(function (p) {
      return p && p.title && p.enabled !== false && ehDiario(p);
    });
  }

  /* ---------- financeiro: resumo de um conjunto de linhas -------------------
     Estava escrito em 3 lugares (financeiro.lua, financeiro.html, app.js).
     "Pago" sai do pendente (virou realizado); "Cancelado" não conta.
     `livres` = linhas de Variável cujo rótulo contém "livre" (null se não houver). */
  var CATS_PENDENTES = ['Receber', 'Fixo', 'Variável', 'Cartão', 'Investir'];
  function resumoFinanceiro(linhas) {
    var tenho = 0, livres = null;
    var pend = { Receber: 0, Fixo: 0, 'Variável': 0, 'Cartão': 0, Investir: 0 };
    (linhas || []).forEach(function (r) {
      if (!r) return;
      if (r.cat === 'Tenho') tenho += r.valor || 0;
      else if (r.status === 'Pago') { /* realizado — fora do pendente */ }
      else if (r.status !== 'Cancelado' && CATS_PENDENTES.indexOf(r.cat) >= 0) pend[r.cat] += r.valor || 0;
      if (r.cat === 'Variável' && String(r.label || '').toLowerCase().indexOf('livre') >= 0) {
        livres = (livres || 0) + (r.valor || 0);
      }
    });
    var previsto = pend.Fixo + pend['Variável'] + pend['Cartão'];
    return {
      tenho: tenho, receber: pend.Receber, previsto: previsto, investir: pend.Investir,
      sobra: tenho + pend.Receber - previsto - pend.Investir, livres: livres
    };
  }

  raiz.Regras = {
    versao: '2026-08-24',
    ymdDe: ymdDe, hoje: hoje, diasEntre: diasEntre,
    proximoStreak: proximoStreak,
    freqDoPasso: freqDoPasso, ehDiario: ehDiario, passosDoDia: passosDoDia,
    resumoFinanceiro: resumoFinanceiro
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
