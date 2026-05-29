export type BaselineRiskPattern = {
  code: string;
  score: number;
  patterns: RegExp[];
};

export const BASELINE_RISK_PATTERNS: BaselineRiskPattern[] = [
  {
    code: 'external_contact_redirect',
    score: 3,
    patterns: [
      /\b(dm|pm)\s+me\b/i,
      /\bmessage\s+me\b/i,
      /\btext\s+me\b/i,
      /\bwrite\s+me\b/i,
      /\bcontact\s+me\b/i,
      /\bprivate\s+message\b/i,

      /напиши\s+(мені|мне)/i,
      /пиши\s+(мені|мне)/i,
      /зв['ʼ’]?яжись\s+зі\s+мною/i,
      /свяжись\s+со\s+мной/i,
      /в\s+личку/i,
      /в\s+приват/i,

      /napisz\s+do\s+mnie/i,
      /napisz\s+na\s+priv/i,
      /wiadomo[śs][ćc]\s+prywatna/i,
      /skontaktuj\s+si[eę]\s+ze\s+mn[ąa]/i,

      /schreib\s+mir/i,
      /kontaktiere\s+mich/i,
      /private\s+nachricht/i,
      /pn\s+an\s+mich/i,
    ],
  },

  {
    code: 'external_messenger_mention',
    score: 2,
    patterns: [
      /\btelegram\b/i,
      /\btg\b/i,
      /\bwhats\s?app\b/i,
      /\bviber\b/i,
      /\bsignal\b/i,
      /\bdiscord\b/i,
      /\binstagram\b/i,
      /\binsta\b/i,

      /телеграм/i,
      /телега/i,
      /тг/i,
      /ватсап/i,
      /вайбер/i,
      /інстаграм/i,
      /инстаграм/i,
    ],
  },

  {
    code: 'money_crypto_scam',
    score: 3,
    patterns: [
      /\bmake\s+money\b/i,
      /\beasy\s+money\b/i,
      /\bpassive\s+income\b/i,
      /\bquick\s+profit\b/i,
      /\bearn\s+\$?\d+/i,
      /\binvest(ment|ing)?\b/i,
      /\bcrypto\b/i,
      /\bbitcoin\b/i,
      /\bbtc\b/i,
      /\beth\b/i,
      /\bforex\b/i,
      /\bcasino\b/i,
      /\bbetting\b/i,
      /\bloan\b/i,
      /\bpromo\s+code\b/i,

      /зароб(и|ляй|іток)/i,
      /зараб(отай|оток)/i,
      /легк[іи]\s+гроші/i,
      /легкие\s+деньги/i,
      /пасивн(ий|ый)\s+дохід/i,
      /пассивн(ый|ого)\s+доход/i,
      /швидк(ий|о)\s+прибуток/i,
      /быстр(ый|о)\s+доход/i,
      /інвест(иц|уй|ування)/i,
      /инвест(иц|ируй)/i,
      /крипт(а|о)/i,
      /біткоїн/i,
      /биткоин/i,
      /казино/i,
      /ставк(и|ах)/i,
      /промокод/i,
      /кредит/i,

      /zarabiaj/i,
      /łatwe\s+pieni[ąa]dze/i,
      /doch[oó]d\s+pasywny/i,
      /szybki\s+zysk/i,
      /inwest(ycja|uj)/i,
      /krypto/i,
      /kasyno/i,
      /zak[łl]ady/i,
      /po[żz]yczka/i,
      /kod\s+promocyjny/i,

      /geld\s+verdienen/i,
      /leichtes\s+geld/i,
      /passives\s+einkommen/i,
      /schneller\s+gewinn/i,
      /invest(ition|ieren)/i,
      /krypto/i,
      /casino/i,
      /wetten/i,
      /kredit/i,
      /promo\s?code/i,
    ],
  },

  {
    code: 'adult_promo',
    score: 3,
    patterns: [
      /\bonlyfans\b/i,
      /\bnudes?\b/i,
      /\bxxx\b/i,
      /\b18\+\b/i,
      /\bnsfw\b/i,
      /\bescort\b/i,

      /нюдс(и|ы)/i,
      /інтим/i,
      /интим/i,
      /еротик/i,
      /18\+/i,
      /ескорт/i,
      /эскорт/i,

      /nagie\s+zdj[eę]cia/i,
      /intymne\s+zdj[eę]cia/i,
      /eroty/i,
      /eskort/i,

      /nacktbilder/i,
      /intime\s+bilder/i,
      /erotik/i,
      /escort/i,
    ],
  },

  {
    code: 'direct_insult',
    score: 2,
    patterns: [
      /\byou\s+are\s+(an\s+)?(idiot|moron|stupid|dumb|loser)\b/i,
      /\bu\s+(are|r)\s+(an\s+)?(idiot|moron|stupid|dumb|loser)\b/i,
      /\bshut\s+up\b/i,
      /\bfuck\s+you\b/i,

      /ти\s+(ідіот|идиот|дурень|дурак|тупий|тупой|дебіл|дебил|лох)/i,
      /ви\s+(ідіоти|идиоты|дурні|дураки|тупі|тупые)/i,
      /заткнись/i,
      /пішов\s+ти/i,
      /пош[её]л\s+ты/i,

      /jeste[śs]\s+(idiot[aą]?|g[łl]upi|debil|frajer)/i,
      /zamknij\s+si[eę]/i,
      /spierdalaj/i,

      /du\s+bist\s+(ein\s+)?(idiot|dumm|depp|verlierer)/i,
      /halt\s+die\s+klappe/i,
      /fick\s+dich/i,
    ],
  },

  {
    code: 'threat_like_language',
    score: 4,
    patterns: [
      /\bi\s+will\s+(kill|hurt|destroy)\s+you\b/i,
      /\bi['’]?m\s+going\s+to\s+(kill|hurt|destroy)\s+you\b/i,
      /\byou\s+deserve\s+to\s+die\b/i,

      /я\s+тебе\s+(вб'ю|убью|знищу|уничтожу)/i,
      /тобі\s+кінець/i,
      /тебе\s+треба\s+(вбити|убить)/i,

      /zabij[eę]\s+ci[eę]/i,
      /zniszcz[eę]\s+ci[eę]/i,
      /powiniene[śs]\s+umrze[ćc]/i,

      /ich\s+werde\s+dich\s+(töten|verletzen|zerstören)/i,
      /du\s+solltest\s+sterben/i,
    ],
  },

  {
    code: 'self_harm_signal',
    score: 4,
    patterns: [
      /\bi\s+want\s+to\s+die\b/i,
      /\bi\s+want\s+to\s+kill\s+myself\b/i,
      /\bsuicide\b/i,

      /я\s+хочу\s+померти/i,
      /я\s+хочу\s+умереть/i,
      /хочу\s+вбити\s+себе/i,
      /хочу\s+убить\s+себя/i,
      /суїцид/i,
      /суицид/i,

      /chc[eę]\s+umrze[ćc]/i,
      /chc[eę]\s+si[eę]\s+zabi[ćc]/i,
      /samob[oó]jstwo/i,

      /ich\s+will\s+sterben/i,
      /ich\s+will\s+mich\s+umbringen/i,
      /suizid/i,
    ],
  },

  {
    code: 'personal_data_sharing',
    score: 2,
    patterns: [
      /\b\d{10,15}\b/i,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /\bmy\s+phone\s+number\b/i,
      /\bcall\s+me\b/i,

      /мій\s+номер/i,
      /мой\s+номер/i,
      /подзвони\s+мені/i,
      /позвони\s+мне/i,

      /m[oó]j\s+numer/i,
      /zadzwo[ńn]\s+do\s+mnie/i,

      /meine\s+nummer/i,
      /ruf\s+mich\s+an/i,
    ],
  },
];
