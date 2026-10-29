import {
  composeNumbers,
  contactCleaner,
  fixed,
  lookup,
  messageArgs,
  NumberWords,
  percent,
  speedRate,
  toSeconds,
  unquote,
  withApp,
} from './helpers';
import type { Groups, LanguagePack, RuleArgs } from './types';

const numbers = new NumberWords(
  composeNumbers({
    units: ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'],
    teens: ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'],
    tens: ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'],
    compose: (ten, unit) => [`${ten} e ${unit}`],
    extra: [
      ['uma', 1],
      ['duas', 2],
      ['quatorze', 14],
      ['cem', 100],
      ['meio', 0.5],
    ],
  }),
);

const SEND = '(?:mand[ae]r?|envi[ae]r?|escrev[ae]r?|escreve)';
const TO = '(?:para|pra|pro|ao|à|a)';
const ON = '(?:no|na|pelo|pela|via)';
const BARE_MESSAGE = /^(?:uma )?(?:mensagem|msg)$/iu;
const cleanContact = contactCleaner(/^(?:meu|minha|o|a)\s+/iu);
const sendArgs = (g: Groups) => messageArgs(g, cleanContact, BARE_MESSAGE);

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^(?:cima|sobe|subir|suba)$/iu, 'up'],
  [/^(?:baixo|desce|descer|des[çc]a)$/iu, 'down'],
  [/^esquerda$/iu, 'left'],
  [/^direita$/iu, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:toque|campainha|chamada|celular|telefone)/iu, 'ring'],
  [/^(?:alarme|despertador)/iu, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  if (!g.stream) return {};
  const value = lookup<'media' | 'ring' | 'alarm'>(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (/^m[áa]x/iu.test(g.extreme) ? 100 : 0) : percent(numbers.parse(g.level));
  if (level === null) return null;
  return { action: 'set', level, ...(tool === 'volume' ? stream(g) : {}) };
}

function seek(direction: 'forward' | 'back') {
  return (g: Groups): RuleArgs | null => {
    const seconds = toSeconds(numbers.parse(g.n), g.unit, /^min/iu);
    return seconds === null ? null : { direction, seconds };
  };
}

function rate(g: Groups): RuleArgs | null {
  if (g.named) {
    return { rate: /^normal$/iu.test(g.named) ? 1 : /^(?:dupla|dobro|o dobro)$/iu.test(g.named) ? 2 : 0.5 };
  }
  const value = speedRate(numbers.parse(g.rate));
  return value === null ? null : { rate: value };
}

const UP = '(?:aumenta|aumentar|aumente|sobe|subir|suba|levanta|levantar|levante)';
const DOWN = '(?:diminui|diminuir|diminua|abaixa|abaixar|abaixe|baixa|baixar|baixe|reduz|reduzir|reduza)';

export const pt: LanguagePack = {
  id: 'pt',
  code: 'pt',
  vocab: {
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| por cento)',
    UNIT: '(?<unit>segundos?|minutos?)',
    STREAM: '(?:d[oa] )?(?<stream>toque|campainha|chamada|alarme|despertador)',
  },
  rules: [
    {
      id: 'send-on-app-saying',
      tool: 'send_message',
      source: `^${SEND}(?: uma)?(?: mensagem)?(?: ${TO})? (?<contact>.+?) ${ON} (?<app>APPS)(?: dizendo que| dizendo| falando que| falando| com o texto| que|:|,)\\s*(?<text>.+)$`,
      build: sendArgs,
    },
    {
      id: 'send-saying',
      tool: 'send_message',
      source: `^${SEND}(?: uma)?(?: mensagem)?(?: ${TO})? (?<contact>.+?)(?: dizendo que| dizendo| falando que| falando| com o texto| que|:|,)\\s*(?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'tell',
      tool: 'send_message',
      source: `^(?:diz|diga|fala|fale|avisa|avise)(?: ${TO})? (?<contact>.+?) que (?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: `^(?:mand[ae]r?|envi[ae]r?)(?: uma)? mensagem(?: ${TO})? (?<contact>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: (g) => ({ question: pt.askMessageText(cleanContact(unquote(g.contact ?? ''))) }),
    },
    {
      id: 'post',
      tool: 'create_post',
      source: '^(?:post[ae]r?|publi(?:ca|car|que))(?: uma)?(?: foto| vídeo)? no (?<app>APPS)(?: com a legenda| dizendo| escrito|:|,)\\s*(?<caption>.+)$',
      build: (g) => ({ app: (g.app ?? '').trim(), caption: unquote(g.caption ?? '') }),
    },
    {
      id: 'post-caption-first',
      tool: 'create_post',
      source: '^(?:post[ae]r?|publi(?:ca|car|que)) (?<caption>.+?) no (?<app>APPS)$',
      build: (g) => ({ app: (g.app ?? '').trim(), caption: unquote(g.caption ?? '') }),
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:toc[ae]r?|toca|coloc[ae]r?|coloca|coloque|bot[ae]r?|bota|assistir|ver) (?<query>.+?) no (?<app>APPS)$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: '^(?:pesquis[ae]r?|pesquisa|procur[ae]r?|procura|busc[ae]r?|busca|busque)(?: por)? (?<query>.+?)(?: (?:no|na) (?<app>APPS))?$',
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: [
        '^(?:(?:coloca|coloque|colocar|põe|ponha|pôr|bota|deixa|deixe|muda|mude|ajusta|ajuste) )?(?:o )?volume(?: STREAM)? (?:em |no |para |pra |a |pro )?(?:(?<level>NUM)PCT?|(?<extreme>máximo|mínimo))$',
        '^(?<extreme>máximo|mínimo) de volume$',
      ],
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: o)? volume(?: STREAM)?$`,
        '^(?:volume(?: STREAM)? )?(?<word>mais alto|mais baixo)$',
        '^(?<word>aumenta|abaixa) o som$',
      ],
      build: (g) => ({
        action: new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^(?:mais alto|aumenta)$/iu.test(g.word ?? '') ? 'up' : 'down',
        ...stream(g),
      }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: [
        '^(?:(?:coloca|coloque|põe|ativa|ativar|ative|liga|ligar|deixa) (?:o |no |em )?)?(?:modo )?mudo$',
        '^(?:silencia|silenciar|silencie|desliga|desligar|desligue|corta|cortar)(?: o)? (?:som|áudio|volume)$',
        '^(?:silencia|silenciar|silencie)(?: o)?(?: (?<stream>celular|telefone|toque))?$',
      ],
      build: (g) => ({ action: 'mute', ...stream(g) }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: [
        '^(?:tira|tirar|tire|desativa|desativar|desative|desliga|desligar|desligue)(?: o| do)? (?:modo )?mudo$',
        '^(?:liga|ligar|ligue|volta|voltar|volte)(?: o)? som$',
        '^(?:dessilencia|dessilenciar)$',
      ],
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: [
        '^(?:(?:coloca|coloque|colocar|põe|ponha|bota|deixa|deixe|muda|mude|ajusta|ajuste) )?(?:o )?brilho(?: da tela)? (?:em |no |para |pra |a |pro )?(?:(?<level>NUM)PCT?|(?<extreme>máximo|mínimo))$',
      ],
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: o)? brilho(?: da tela)?$`,
        '^(?<verb2>clareia|clarear|clareie|escurece|escurecer|escureça)(?: a)? tela$',
        '^(?:tela )?(?<word>mais clara|mais escura)$',
      ],
      build: (g) => ({
        action:
          new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^clare/iu.test(g.verb2 ?? '') || /clara$/iu.test(g.word ?? '')
            ? 'up'
            : 'down',
      }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: '^(?:avança|avançar|avance|adianta|adiantar|adiante|pula|pular|pule|passa|passar)(?: mais)? (?<n>NUM) UNIT(?: para frente| pra frente)?$',
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: [
        '^(?:volta|voltar|volte|retrocede|retroceder|retroceda|recua|recuar|recue|atrasa|atrasar)(?: mais)? (?<n>NUM) UNIT(?: para trás| pra trás)?$',
      ],
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:(?:coloca|coloque|põe|muda|mude|deixa|deixe|ajusta) )?(?:a )?velocidade(?: de reprodução)? (?:em |para |pra |no |de )?(?<rate>NUM) ?(?:x|vezes)?$',
        '^(?:toca|tocar|reproduz|reproduzir|assistir)(?: em| na velocidade)? (?<rate>NUM) ?x$',
        '^(?<rate>NUM) ?x$',
      ],
      build: rate,
    },
    {
      id: 'speed-named',
      tool: 'playback_speed',
      source: '^(?:(?:coloca|coloque|põe|volta|volte|deixa|deixe) (?:na |a |em )?)?(?:velocidade (?<named>normal|dupla)|(?<named2>o dobro|metade) da velocidade)$',
      build: (g) => rate({ ...g, named: g.named ?? g.named2 }),
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        '^(?:curte|curtir|curta)(?: (?:isso|esse|essa|este|esta|o|a))?(?: (?:vídeo|post|foto|publicação|reel|música))?(?: no (?<app>APPS))?$',
        '^(?:dá|dar|dê|deixa|deixar|deixe|manda|mandar) (?:um )?(?:like|curtir)(?: (?:nisso|nesse vídeo|nessa foto|nesse post))?(?: no (?<app>APPS))?$',
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:(?<verb>abre|abrir|abra|mostra|mostrar|mostre|fecha|fechar|feche|esconde|esconder|esconda) )?(?:a )?esfera(?: de controle)?$',
      build: (g) => ({ action: /^(?:fech|escond)/iu.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:(?:liga|ligar|ligue|ativa|ativar|ative|desliga|desligar|desligue|desativa|desativar|abre|abrir|abra|mostra) (?:o )?)?(?:configurações (?:de |do )?)?wi-?fi$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:(?:liga|ligar|ligue|ativa|ativar|ative|desliga|desligar|desligue|desativa|desativar|abre|abrir|abra|mostra) (?:o )?)?(?:configurações (?:de |do )?)?bluetooth$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:(?:liga|ligar|ligue|ativa|ativar|ative|desliga|desligar|desligue|desativa|desativar|abre|abrir|abra|coloca|põe) (?:o |no |em )?)?(?:modo )?não perturbe$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    { id: 'back', tool: 'navigate', source: '^volt[ae]r?$|^volta$|^voltar para trás$', build: fixed({ action: 'back' }) },
    {
      id: 'home',
      tool: 'navigate',
      source: '^(?:(?:ir|vai|volta|voltar|volte) (?:para|pra) a )?tela inicial$|^início$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|abra|mostra|mostrar|mostre) )?(?:os )?(?:apps |aplicativos )?recentes$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|abra|mostra|mostrar|mostre) )?(?:as )?notificações$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|abra|mostra) )?(?:as )?configurações rápidas$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^bloque(?:ar|ie|ia)(?: a tela| o celular| o telefone)?$|^trava(?:r)?(?: a tela| o celular)?$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:tir[ae]r?|tira|faz(?:er)?|faça) (?:um |uma )?(?:print|captura de tela)(?: da tela)?$|^print(?: da tela)?$|^captura de tela$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|abra|mostra|mostrar) )?(?:o )?menu (?:de energia|de desligar|para desligar|de ligar e desligar)$',
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:paus[ae]r?|pausa|parar?)(?: o vídeo| a música| a reprodução)?$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:continu[ae]r?|continua|retom[ae]r?|retoma|despaus[ae]r?|toca|tocar|dá play|dar play|play)(?: o vídeo| a música)?$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:próxim[ao]|pul[ae]r?|pula|passa|passar)(?: música| vídeo| faixa)?$|^(?:toca a )?próxima(?: música)?$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:(?:música|vídeo|faixa) )?anterior$|^volta (?:a|o) (?:música|vídeo|faixa)$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: '^(?:abr(?:a|e|ir)|inici[ae]r?|entr[ae]r? (?:no|na)|vai (?:no|na|para o|para a|pro|pra)|ir (?:para o|para a|pro|pra))(?: o| a)? (?<app>.+?)$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: [
        '^(?:rol(?:a|ar|e)|desliz(?:a|ar|e))(?: (?:para|pra))?(?: (?:a |o )?(?<direction>cima|baixo|esquerda|direita))?$',
        '^(?<direction>desce|descer|desça|sobe|subir|suba)$',
      ],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
    {
      id: 'tap',
      tool: 'tap',
      source: '^(?:toqu?e|toca|tocar|clic(?:a|ar|que)|aperte|aperta|apertar|pressione|selecione|seleciona)(?: (?:em|no|na))?(?: o| a)? (?<label>.+?)(?: bot[aã]o)?$',
      build: (g) => ({ label: unquote(g.label ?? '') }),
    },
    {
      id: 'type',
      tool: 'type_text',
      source: '^(?:digit[ae]r?|digita|escrev[ae]r?|escreve)(?: a[ií])? (?<text>.+)$',
      build: (g) => ({ text: unquote(g.text ?? '') }),
    },
  ],
  prefixes: [
    /^(?:(?:oi|olá|ola|e a[ií]|ei|ok)\s+)?sigil[\s,:!.]*/iu,
    /^(?:por favor|você pode|voce pode|pode|poderia|dá pra|da pra)\s+/iu,
  ],
  suffixes: [/[\s,]+por favor$/iu],
  yes: ['sim', 'pode', 'pode mandar', 'pode enviar', 'pode postar', 'manda', 'envia', 'confirma', 'confirmo', 'isso', 'claro', 'ok', 'beleza', 'certo'],
  no: ['não', 'nao', 'cancela', 'cancelar', 'cancele', 'para', 'pare', 'espera', 'espere', 'agora não', 'deixa pra lá', 'nem'],
  sensitive: [
    'enviar',
    'envia',
    'postar',
    'publicar',
    'compartilhar',
    'ligar',
    'excluir',
    'apagar',
    'remover',
    'pagar',
    'comprar',
    'assinar',
    'transferir',
    'confirmar',
    'desinstalar',
  ],
  bulk: [
    /(?:^|\s)(?:todos|todas)\s+(?:os\s+|as\s+)?(?:meus\s+|minhas\s+)?(?:contatos|amigos|seguidores|grupos|conversas|pessoas|posts|fotos|vídeos|comentários|mensagens)(?:\s|$)/iu,
    /(?:^|\s)todo mundo(?:\s|$)/iu,
    /(?:^|\s)\d+\s*vezes(?:\s|$)/iu,
    /(?:^|\s)(?:a cada|todo|toda)\s+(?:\d+\s+)?(?:segundo|minuto|hora|dia|manhã|noite)s?(?:\s|$)/iu,
    /(?:^|\s)em massa(?:\s|$)/iu,
  ],
  severalPeople: [/,|\s(?:e|&|\+)\s/iu],
  askMessageText: (contact) => `O que a mensagem para ${contact} deve dizer?`,
};
