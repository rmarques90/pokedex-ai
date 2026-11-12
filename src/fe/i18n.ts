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
}

export const UI_COPY: Readonly<Record<Language, UiCopy>> = {
  pt: {
    cancel: 'Cancelar', retrying: 'Tentativa {attempt} de 3; tentando novamente...',
    history: 'Conversas anteriores', historyEmpty: 'Suas perguntas concluídas aparecerão aqui.',
    clearHistory: 'Limpar histórico', deleteConversation: 'Excluir conversa',
    confirmDeleteTitle: 'Excluir esta conversa?', confirmDeleteMessage: 'Todas as perguntas e respostas desta conversa serão removidas deste navegador.',
    confirmClearTitle: 'Limpar todo o histórico?', confirmClearMessage: 'Todas as conversas salvas serão removidas deste navegador.',
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
    sourcesLabel: 'Referências', footerNote: 'Confira os detalhes nas fontes.', languageSelector: '\u0049dioma da interface', keyboardHint: 'Enter para perguntar \u00b7 Shift+Enter para pular linha',
  },
  en: {
    cancel: 'Cancel', retrying: 'Retry {attempt} of 3; trying again...',
    history: 'Previous conversations', historyEmpty: 'Your completed questions will appear here.',
    clearHistory: 'Clear history', deleteConversation: 'Delete conversation',
    confirmDeleteTitle: 'Delete this conversation?', confirmDeleteMessage: 'All questions and answers in this conversation will be removed from this browser.',
    confirmClearTitle: 'Clear all history?', confirmClearMessage: 'All saved conversations will be removed from this browser.',
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
    sourcesLabel: 'References', footerNote: 'Check the sources for details.', languageSelector: 'Interface language', keyboardHint: 'Enter to ask \u00b7 Shift+Enter for a new line',
  },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.some((language) => language === value);
}

export function readLanguagePreference(storage: Pick<LanguageStorage, 'getItem'> | null = getBrowserStorage()): Language {
  try {
    const value = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : 'pt';
  } catch { return 'pt'; }
}

export function saveLanguagePreference(language: Language, storage: Pick<LanguageStorage, 'setItem'> | null = getBrowserStorage()): void {
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage can be unavailable in restricted browsers. */ }
}

function getBrowserStorage(): LanguageStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
