export const LANGUAGE_STORAGE_KEY = 'pokedex-ai.language';

export const SUPPORTED_LANGUAGES = ['pt', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export interface LanguageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface UiCopy {
  brandTagline: string; newQuestion: string; assistantName: string; suggestedQuestions: string;
  trainer: string; journey: string; breadcrumb: string; pageTitle: string; pageSubtitle: string;
  heroTitle: string; heroSubtitle: string; pokemonBadge: string; questionLabel: string;
  questionPlaceholder: string; ask: string; emptyQuestion: string; loading: string;
  requestError: string; retry: string; answerLabel: string; insufficientEvidence: string; generalKnowledge: string;
  sourcesLabel: string; footerNote: string; languageSelector: string; keyboardHint: string;
  cancel: string; retrying: string;
  history: string; historyEmpty: string; clearHistory: string; deleteConversation: string;
  confirmDeleteTitle: string; confirmDeleteMessage: string; confirmClearTitle: string; confirmClearMessage: string;
  confirm: string; dismiss: string; savedAnswer: string; storageWarning: string; close: string;
  historyError: string; loadMoreHistory: string;
  loginTitle: string; loginSubtitle: string; nameLabel: string; namePlaceholder: string; loginAction: string;
  loginError: string; logout: string;
}

export const UI_COPY: Readonly<Record<Language, UiCopy>> = {
  pt: {
    loginTitle: 'Entre com seu nome', loginSubtitle: 'Use um nome para identificar esta sessão.', nameLabel: 'Seu nome', namePlaceholder: 'Digite seu nome', loginAction: 'Continuar', loginError: 'Não foi possível entrar. Confira o nome e tente novamente.', logout: 'Sair',
    cancel: 'Cancelar', retrying: 'Tentativa {attempt} de 3; tentando novamente...',
    history: 'Conversas anteriores', historyEmpty: 'Suas perguntas concluídas aparecerão aqui.',
    clearHistory: 'Limpar histórico', deleteConversation: 'Excluir conversa',
    confirmDeleteTitle: 'Excluir esta conversa?', confirmDeleteMessage: 'Todas as perguntas, respostas e memórias desta conversa serão excluídas.',
    confirmClearTitle: 'Limpar todo o histórico?', confirmClearMessage: 'Todas as conversas, respostas e memórias desta conta serão excluídas.',
    confirm: 'Excluir', dismiss: 'Manter', savedAnswer: 'Resposta salva', storageWarning: 'O histórico não pode ser salvo neste navegador. A conversa ficará disponível enquanto esta página estiver aberta.', close: 'Fechar',
    brandTagline: 'Sua Pokédex inteligente', newQuestion: 'Nova pergunta', assistantName: 'Assistente Pokémon',
    suggestedQuestions: 'Perguntas sugeridas', trainer: 'Treinador(a)', journey: 'Sua jornada Pokémon',
    breadcrumb: 'Seu espaço', pageTitle: 'Uma pergunta. Novas descobertas.',
    pageSubtitle: 'Explore o universo Pokémon com respostas e fontes para continuar sua jornada.',
    heroTitle: 'Uma pequena chama. Grandes descobertas.', heroSubtitle: 'Tipos, evoluções e curiosidades, em um só lugar.',
    pokemonBadge: '#004 · CHARMANDER', questionLabel: 'Sua pergunta',
    questionPlaceholder: 'O que você quer descobrir sobre Pokémon?', ask: 'Perguntar',
    emptyQuestion: 'Digite uma pergunta para continuar.', loading: 'Consultando a Pokédex…',
    requestError: 'Não foi possível consultar a Pokédex. Tente novamente.', retry: 'Tentar novamente',
    answerLabel: 'Pokédex AI', insufficientEvidence: 'Os dados indexados não contêm informação suficiente para responder a esta pergunta.',
    generalKnowledge: 'Resposta baseada no conhecimento geral do modelo, sem refer\u00eancias do\u0020\u00edndice.',
    historyError: 'N\u00e3o foi poss\u00edvel atualizar o hist\u00f3rico. Tente novamente.',
    loadMoreHistory: 'Carregar mais conversas',
    sourcesLabel: 'Referências', footerNote: 'Confira os detalhes nas fontes.', languageSelector: '\u0049dioma da interface', keyboardHint: 'Enter para perguntar \u00b7 Shift+Enter para pular linha',
  },
  en: {
    loginTitle: 'Enter your name', loginSubtitle: 'Choose a name to identify this session.', nameLabel: 'Your name', namePlaceholder: 'Enter your name', loginAction: 'Continue', loginError: 'Could not sign in. Check the name and try again.', logout: 'Log out',
    cancel: 'Cancel', retrying: 'Retry {attempt} of 3; trying again...',
    history: 'Previous conversations', historyEmpty: 'Your completed questions will appear here.',
    clearHistory: 'Clear history', deleteConversation: 'Delete conversation',
    confirmDeleteTitle: 'Delete this conversation?', confirmDeleteMessage: 'All questions, answers, and memories in this conversation will be deleted.',
    confirmClearTitle: 'Clear all history?', confirmClearMessage: 'All conversations, answers, and memories for this account will be deleted.',
    confirm: 'Delete', dismiss: 'Keep', savedAnswer: 'Saved answer', storageWarning: 'History cannot be saved in this browser. This conversation will remain available while this page is open.', close: 'Close',
    brandTagline: 'Your intelligent Pokédex', newQuestion: 'New question', assistantName: 'Pokémon Assistant',
    suggestedQuestions: 'Suggested questions', trainer: 'Trainer', journey: 'Your Pokémon journey',
    breadcrumb: 'Your space', pageTitle: 'One question. New discoveries.',
    pageSubtitle: 'Explore the Pokémon world with answers and sources to continue your journey.',
    heroTitle: 'A little flame. Big discoveries.', heroSubtitle: 'Types, evolutions, and trivia, all in one place.',
    pokemonBadge: '#004 · CHARMANDER', questionLabel: 'Your question',
    questionPlaceholder: 'What would you like to discover about Pokémon?', ask: 'Ask',
    emptyQuestion: 'Enter a question to continue.', loading: 'Checking the Pokédex…',
    requestError: 'The Pokédex could not be reached. Please try again.', retry: 'Try again',
    answerLabel: 'Pokédex AI', insufficientEvidence: 'The indexed data does not contain enough information to answer this question.',
    generalKnowledge: 'Answer based on the model\'s general knowledge; no indexed references were used.',
    historyError: 'Conversation history could not be updated. Please try again.',
    loadMoreHistory: 'Load more conversations',
    sourcesLabel: 'References', footerNote: 'Check the sources for details.', languageSelector: 'Interface language', keyboardHint: 'Enter to ask \u00b7 Shift+Enter for a new line',
  },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.some((language) => language === value);
}

export interface BrowserLanguagePreferences {
  languages?: readonly string[] | null;
  language?: string | null;
}

export function detectBrowserLanguage(preferences: BrowserLanguagePreferences | null = getBrowserLanguagePreferences()): Language {
  if (!preferences) return 'pt';

  const preferredLanguages = preferences.languages?.length
    ? preferences.languages
    : preferences.language ? [preferences.language] : [];

  for (const tag of preferredLanguages) {
    if (typeof tag !== 'string') continue;
    const normalizedTag = tag.trim();
    if (!/^(pt|en)(?:-[a-z0-9]{1,8})*$/i.test(normalizedTag)) continue;
    const primarySubtag = normalizedTag.split('-', 1)[0]?.toLowerCase();
    if (primarySubtag === 'pt' || primarySubtag === 'en') return primarySubtag;
  }

  return 'pt';
}

export function readLanguagePreference(
  storage: Pick<LanguageStorage, 'getItem'> | null = getBrowserStorage(),
  browserPreferences: BrowserLanguagePreferences | null = getBrowserLanguagePreferences(),
): Language {
  try {
    const value = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(value)) return value;
  } catch { /* Use the browser language when storage is unavailable. */ }
  return detectBrowserLanguage(browserPreferences);
}

export function saveLanguagePreference(language: Language, storage: Pick<LanguageStorage, 'setItem'> | null = getBrowserStorage()): void {
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage can be unavailable in restricted browsers. */ }
}

function getBrowserStorage(): LanguageStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

function getBrowserLanguagePreferences(): BrowserLanguagePreferences | null {
  try {
    return typeof navigator === 'undefined'
      ? null
      : { languages: navigator.languages, language: navigator.language };
  } catch { return null; }
}
