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
  requestError: string; retry: string; answerLabel: string; insufficientEvidence: string;
  sourcesLabel: string; footerNote: string;
}

export const UI_COPY: Readonly<Record<Language, UiCopy>> = {
  pt: {
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
    sourcesLabel: 'Referências', footerNote: 'Confira os detalhes nas fontes.',
  },
  en: {
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
    sourcesLabel: 'References', footerNote: 'Check the sources for details.',
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
