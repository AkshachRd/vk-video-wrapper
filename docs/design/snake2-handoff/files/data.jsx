/* data.jsx — sample content + minimal Swiss icon set for LUPA */

// ---- icons (stroke, currentColor) ----
const Ic = {
  play: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="currentColor" aria-hidden="true"><path d="M7 5l13 7-13 7z"/></svg>),
  pause: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>),
  vol: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 010 6"/><path d="M18.5 6.5a8 8 0 010 11"/></svg>),
  mute: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none"/><path d="M17 9l5 6M22 9l-5 6"/></svg>),
  captions: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14"/><path d="M8 11h2M8 14h3M14 11h2M14 14h2" strokeLinecap="round"/></svg>),
  gear: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>),
  expand: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>),
  collapse: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>),
  x: (p) => (<svg viewBox="0 0 24 24" className={p.cls||"ic-sm"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>),
};

// ---- recent videos ----
const RECENTS_SEED = [
  { id: "r1", title: "City of Tomorrow — Documentary", lang: "EN", dur: "12:40", when: "2 ч назад" },
  { id: "r2", title: "Daily Talk: ordering coffee", lang: "EN", dur: "08:15", when: "вчера" },
  { id: "r3", title: "Урбанистика: как устроен город", lang: "RU", dur: "21:03", when: "3 дня назад" },
  { id: "r4", title: "TED — The future of cities", lang: "EN", dur: "17:22", when: "неделю назад" },
  { id: "r5", title: "Morning News Digest", lang: "EN", dur: "05:48", when: "2 недели назад" },
  { id: "r6", title: "Интервью с архитектором", lang: "RU", dur: "33:10", when: "месяц назад" },
];

// ---- demo video subtitle cues (EN primary + RU reference) ----
// each cue: start/end seconds, EN words, RU reference
const CUES = [
  { id: "c0", start: 0,  end: 7,  en: "The city changed faster than anyone expected.", ru: "Город менялся быстрее, чем кто-либо ожидал." },
  { id: "c1", start: 7,  end: 14, en: "New towers replaced the old quarters.", ru: "Новые башни заменили старые кварталы." },
  { id: "c2", start: 14, end: 22, en: "People learned to move through it differently.", ru: "Люди научились перемещаться по нему иначе." },
  { id: "c3", start: 22, end: 30, en: "Still, the river remembered its original path.", ru: "И всё же река помнила свой первоначальный путь." },
  { id: "c4", start: 30, end: 38, en: "Maybe progress is just memory in motion.", ru: "Может быть, прогресс — это память в движении." },
];
const DEMO_DURATION = 38;

// ---- dictionary entries keyed by lowercased clean word ----
const DICT = {
  expected:    { hw: "expected", ipa: "ɪkˈspɛktɪd", meanings: ["ожидаемый, предполагаемый", "прош. вр. от expect — ожидал"], grammar: "verb · past tense / adjective" },
  towers:      { hw: "towers", ipa: "ˈtaʊəz", meanings: ["башни, вышки"], grammar: "noun · plural" },
  replaced:    { hw: "replaced", ipa: "rɪˈpleɪst", meanings: ["заменил, вытеснил"], grammar: "verb · past tense" },
  quarters:    { hw: "quarters", ipa: "ˈkwɔːtəz", meanings: ["кварталы", "жильё, помещения"], grammar: "noun · plural" },
  differently: { hw: "differently", ipa: "ˈdɪfrəntli", meanings: ["иначе, по-другому"], grammar: "adverb" },
  river:       { hw: "river", ipa: "ˈrɪvə", meanings: ["река"], grammar: "noun" },
  remembered:  { hw: "remembered", ipa: "rɪˈmɛmbəd", meanings: ["помнил; вспомнил"], grammar: "verb · past tense" },
  original:    { hw: "original", ipa: "əˈrɪdʒənəl", meanings: ["первоначальный, исходный", "оригинальный"], grammar: "adjective" },
  path:        { hw: "path", ipa: "pɑːθ", meanings: ["путь, тропа", "траектория"], grammar: "noun" },
  progress:    { hw: "progress", ipa: "ˈprəʊɡrɛs", meanings: ["прогресс, развитие"], grammar: "noun" },
  memory:      { hw: "memory", ipa: "ˈmɛm(ə)ri", meanings: ["память", "воспоминание"], grammar: "noun" },
  motion:      { hw: "motion", ipa: "ˈməʊʃən", meanings: ["движение"], grammar: "noun" },
  city:        { hw: "city", ipa: "ˈsɪti", meanings: ["город"], grammar: "noun" },
  changed:     { hw: "changed", ipa: "tʃeɪndʒd", meanings: ["изменился, менялся"], grammar: "verb · past tense" },
  faster:      { hw: "faster", ipa: "ˈfɑːstə", meanings: ["быстрее"], grammar: "adjective · comparative" },
  people:      { hw: "people", ipa: "ˈpiːpəl", meanings: ["люди"], grammar: "noun · plural" },
  learned:     { hw: "learned", ipa: "lɜːnd", meanings: ["научился, узнал"], grammar: "verb · past tense" },
  move:        { hw: "move", ipa: "muːv", meanings: ["двигаться, перемещаться"], grammar: "verb" },
};

const DICT_SOURCE = "WIKTIONARY · EN";
const DICT_URL = "https://en.wiktionary.org";

// ---- saved words seed ----
const SAVED_SEED = [
  { id: "s1", word: "downtown", lang: "EN", meaning: "центр города, деловой центр" },
  { id: "s2", word: "neighbourhood", lang: "EN", meaning: "район, окрестности" },
];

// ---- track menu options ----
const TRACKS_PRIMARY = ["English (auto)", "English", "Deutsch"];
const TRACKS_REFERENCE = ["Нет", "Русский", "Русский (auto)"];

Object.assign(window, { Ic, RECENTS_SEED, CUES, DEMO_DURATION, DICT, DICT_SOURCE, DICT_URL, SAVED_SEED, TRACKS_PRIMARY, TRACKS_REFERENCE });
