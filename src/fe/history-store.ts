import { BrowserHistoryDocumentSchema, MAX_HISTORY_ENTRIES, type BrowserHistoryDocument, type BrowserHistoryEntry } from '../domain/browser-history.js';

export const HISTORY_STORAGE_KEY = 'pokedex-ai.browser-history';
export interface HistoryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export interface HistoryStoreOptions { storage: HistoryStorage | null; now?: () => Date; createId?: () => string; }
export interface HistoryStore {
  load(): { document: BrowserHistoryDocument; persistent: boolean };
  append(input: Omit<BrowserHistoryEntry, 'id' | 'createdAt'>): { document: BrowserHistoryDocument; persistent: boolean };
  startConversation(): { document: BrowserHistoryDocument; persistent: boolean };
  deleteConversation(conversationId: string): { document: BrowserHistoryDocument; persistent: boolean };
  clear(): { document: BrowserHistoryDocument; persistent: boolean };
}

function emptyDocument(createId: () => string): BrowserHistoryDocument {
  return { version: 1, activeConversationId: createId(), entries: [] };
}

export function createHistoryStore({ storage, now = () => new Date(), createId = () => crypto.randomUUID() }: HistoryStoreOptions): HistoryStore {
  let document = emptyDocument(createId);
  let persistent = storage !== null;
  let loaded = false;

  function save(next: BrowserHistoryDocument): { document: BrowserHistoryDocument; persistent: boolean } {
    document = next;
    if (persistent && storage) {
      try { storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next)); }
      catch { persistent = false; }
    }
    return { document, persistent };
  }

  return {
    load() {
      if (!loaded) {
        loaded = true;
        if (persistent && storage) {
          try {
            const raw = storage.getItem(HISTORY_STORAGE_KEY);
            if (raw !== null) {
              const parsed: unknown = JSON.parse(raw);
              const validated = BrowserHistoryDocumentSchema.safeParse(parsed);
              if (validated.success) document = validated.data;
              else persistent = false;
            }
          } catch { persistent = false; }
        }
      }
      return { document, persistent };
    },
    append(input) {
      const { document: current } = this.load();
      const entry: BrowserHistoryEntry = { ...input, id: createId(), createdAt: now().toISOString() };
      const entries = [...current.entries, entry].slice(-MAX_HISTORY_ENTRIES);
      return save({ ...current, entries });
    },
    startConversation() {
      const { document: current } = this.load();
      return save({ ...current, activeConversationId: createId() });
    },
    deleteConversation(conversationId) {
      const { document: current } = this.load();
      const deletingActive = current.activeConversationId === conversationId;
      return save({
        ...current,
        activeConversationId: deletingActive ? createId() : current.activeConversationId,
        entries: current.entries.filter((entry) => entry.conversationId !== conversationId),
      });
    },
    clear() {
      document = emptyDocument(createId);
      loaded = true;
      persistent = storage !== null;
      if (storage) {
        try { storage.removeItem(HISTORY_STORAGE_KEY); }
        catch { persistent = false; }
      }
      if (persistent && storage) {
        try { storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(document)); }
        catch { persistent = false; }
      }
      return { document, persistent };
    },
  };
}
