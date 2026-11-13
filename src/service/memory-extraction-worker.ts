import { MemoryCandidateSchema, type MemoryCandidate } from '../domain/conversation.js';
import type { ClaimedMemoryJob, ConversationStore } from '../store/sqlite-user-store.js';

export interface ConversationMemoryExtractor {
  extract(input: { question: string; answer: string }): Promise<MemoryCandidate[]>;
}

export interface MemoryExtractionWorker {
  start(): void;
  stop(): Promise<void>;
}

const PRIVATE_OR_UNSAFE_FACT = /\b(?:\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\S+@\S+\.\S+|address|phone|email|location|live in|lives in|age|years old|health|medical|diagnos|endereço|telefone|e-mail|moro em|mora em|idade|anos de idade|saúde|médic|diagnóstic|ignore (?:all )?(?:previous|system) instructions)\b/i;

export function filterMemoryCandidates(value: unknown, question: string, answer: string): MemoryCandidate[] {
  if (!Array.isArray(value)) return [];
  const source = normalize(question + ' ' + answer);
  return value.slice(0, 5).flatMap((item) => {
    const parsed = MemoryCandidateSchema.safeParse(item);
    if (!parsed.success) return [];
    const candidate = parsed.data;
    if (PRIVATE_OR_UNSAFE_FACT.test(candidate.fact)) return [];
    const terms = normalize(candidate.fact).split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 3);
    return terms.some((term) => source.includes(term)) ? [candidate] : [];
  });
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function createMemoryExtractionWorker(options: {
  store: ConversationStore;
  extractor: ConversationMemoryExtractor;
  pollIntervalMilliseconds?: number;
  maxAttempts?: number;
  onError?: (error: unknown) => void;
}): MemoryExtractionWorker {
  const pollInterval = options.pollIntervalMilliseconds ?? 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;

  async function processOne(): Promise<boolean> {
    let job: ClaimedMemoryJob | null;
    try { job = options.store.claimMemoryExtractionJob(); }
    catch (error) { options.onError?.(error); return false; }
    if (!job) return false;
    try {
      const output = await options.extractor.extract({ question: job.question, answer: job.answer });
      options.store.completeMemoryExtractionJob(job, filterMemoryCandidates(output, job.question, job.answer));
    } catch (error) {
      options.onError?.(error);
      options.store.failMemoryExtractionJob(job, classifyError(error), maxAttempts);
    }
    return true;
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    active = (async () => {
      while (!stopped && await processOne()) { /* Drain currently due work. */ }
    })();
    await active;
    active = undefined;
    if (!stopped) timer = setTimeout(() => { void tick(); }, pollInterval);
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      void tick();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await active;
    },
  };
}

function classifyError(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'extraction_timeout';
  return 'extraction_failed';
}
