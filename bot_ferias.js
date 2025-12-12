const { TwitterApi } = require('twitter-api-v2');
require('dotenv').config();

// ====================================================================
// CONFIGURAÇÕES – AJUSTE AQUI
// ====================================================================

// Nome da sua faculdade (como aparecerá no tweet)
const NOME_FACULDADE = 'FECAP';

// Definição dos períodos de férias (padrão anual)
// ATENÇÃO: mês começa em 0  → janeiro = 0, fevereiro = 1, ..., julho = 6, dezembro = 11
// Se o período atravessa o ano (ex: começa em dezembro e termina em fevereiro),
// marque cruzaAno: true e coloque o mês de fim conforme o ano seguinte (ex: fevereiro = 1).
const PERIODOS_FERIAS = [
  {
    nome: 'férias de meio de ano',
    inicio: { mes: 6, dia: 15 },  // 15 de julho **nao configurado**
    fim:    { mes: 7, dia: 1 },   // 1 de agosto (volta às aulas) **nao configurado**
    cruzaAno: false,
  },
  {
    nome: 'férias de fim de ano',
    inicio: { mes: 11, dia: 5 }, // 5 de dezembro
    fim:    { mes: 0, dia: 26 },  // 26 de janeiro (do ano seguinte)
    cruzaAno: true,
  },
];

// ====================================================================
// CLIENTE DA API DO X (Twitter)
// ====================================================================

const client = new TwitterApi({
  appKey: process.env.CONSUMER_KEY,
  appSecret: process.env.CONSUMER_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  accessSecret: process.env.ACCESS_TOKEN_SECRET,
});

// ====================================================================
// FUNÇÕES DE DATA
// ====================================================================

/**
 * Retorna a data de hoje considerando o fuso de São Paulo,
 * zerando horas/minutos/segundos (somente a data).
 */
function hojeBrasil() {
  const agora = new Date();
  const agoraSP = new Date(
    agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  return new Date(agoraSP.getFullYear(), agoraSP.getMonth(), agoraSP.getDate());
}

/**
 * Calcula diferença de dias entre hoje e uma data alvo.
 * Retorna inteiro (alvo - hoje) em dias.
 */
function diasRestantes(hoje, alvo) {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((alvo - hoje) / MS_POR_DIA);
}

/**
 * Gera todos os intervalos concretos (início/fim) de férias
 * para anos em torno do ano atual (ano-1, ano, ano+1),
 * para contemplar períodos que atravessam a virada do ano.
 */
function gerarIntervalos(anoReferencia) {
  const anosBase = [anoReferencia - 1, anoReferencia, anoReferencia + 1];
  const intervalos = [];

  for (const anoBase of anosBase) {
    for (const periodo of PERIODOS_FERIAS) {
      const anoInicio = anoBase;
      const anoFim = periodo.cruzaAno ? anoBase + 1 : anoBase;

      const inicio = new Date(
        anoInicio,
        periodo.inicio.mes,
        periodo.inicio.dia
      );
      const fim = new Date(
        anoFim,
        periodo.fim.mes,
        periodo.fim.dia
      );

      intervalos.push({
        nome: periodo.nome,
        inicio,
        fim,
      });
    }
  }

  return intervalos;
}

/**
 * Retorna:
 * - se hoje está dentro de algum período de férias: esse período
 * - se não está: o próximo período de férias (pelo início mais próximo)
 */
function obterContextoFerias(hoje) {
  const anoAtual = hoje.getFullYear();
  const intervalos = gerarIntervalos(anoAtual);

  // 1) Verificar se hoje está dentro de algum período de férias
  const emFerias = intervalos.filter(
    (int) => hoje >= int.inicio && hoje < int.fim
  );

  if (emFerias.length > 0) {
    // Em teoria, só um intervalo deve conter "hoje".
    // Mas, por segurança, pegamos o que termina mais cedo.
    const atual = emFerias.reduce((menor, int) =>
      int.fim < menor.fim ? int : menor
    );
    return { tipo: 'emFerias', periodo: atual };
  }

  // 2) Caso não esteja em férias, achar o próximo período
  const futuros = intervalos.filter((int) => int.inicio > hoje);

  if (futuros.length === 0) {
    // Na prática não deve acontecer porque geramos ano-1, ano, ano+1,
    // mas se acontecer, retornamos null.
    return { tipo: 'nenhum', periodo: null };
  }

  const proximo = futuros.reduce((maisProximo, int) =>
    int.inicio < maisProximo.inicio ? int : maisProximo
  );

  return { tipo: 'foraFerias', periodo: proximo };
}

/**
 * Monta o texto do tweet:
 *
 * - Se hoje está em férias  → conta até o FIM daquele período ("volta às aulas").
 * - Se hoje não está em férias → conta até o INÍCIO do próximo período de férias.
 */
function montarMensagem(hoje) {
  const contexto = obterContextoFerias(hoje);

  if (contexto.tipo === 'nenhum' || !contexto.periodo) {
    return 'Calendário de férias não configurado adequadamente.';
  }

  const { periodo } = contexto;

  if (contexto.tipo === 'emFerias') {
    // Contagem para o fim desse período (volta às aulas)
    const dias = diasRestantes(hoje, periodo.fim);

    if (dias > 1) {
      return `Faltam ${dias} dias para o início das aulas na ${NOME_FACULDADE} 💀`;
    } else if (dias === 1) {
      return `Falta ${dias} dia para o início das aulas na ${NOME_FACULDADE} 💀`;
    } else {
      return `Hoje começam as aulas na ${NOME_FACULDADE} 💀`;
    }

  } else if (contexto.tipo === 'foraFerias') {
    // Contagem para o início do próximo período de férias
    const dias = diasRestantes(hoje, periodo.inicio);

    // Se quiser mencionar qual período (meio de ano / fim de ano), use periodo.nome:
    // ex: `para as ${periodo.nome} da ${NOME_FACULDADE}`
    if (dias > 1) {
      return `Faltam ${dias} dias para as férias da ${NOME_FACULDADE}!`;
    } else if (dias === 1) {
      return `Falta ${dias} dia para as férias da ${NOME_FACULDADE}!`;
    } else {
      return `Hoje começam as férias da ${NOME_FACULDADE}!`;
    }
  }

  // fallback
  return 'Não foi possível determinar o estado das férias.';
}

// ====================================================================
// FUNÇÃO PRINCIPAL
// ====================================================================

async function main() {
  const hoje = hojeBrasil();
  console.log('Data de hoje (São Paulo):', hoje.toISOString().slice(0, 10));

  const texto = montarMensagem(hoje);
  console.log('Mensagem calculada:', texto);

  try {
    const resposta = await client.v2.tweet(texto);
    console.log('Tweet postado com sucesso.');
    console.log('ID:', resposta.data.id);
    console.log('Texto:', resposta.data.text);
  } catch (erro) {
    console.error('ERRO AO POSTAR O TWEET:');
    console.error(erro);
  }
}

main();
