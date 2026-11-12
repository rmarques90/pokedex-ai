import { AskQuestionSchema, AskResultSchema, type AskResult } from '../domain/ask.js';

export type AskResponse = Pick<Response, 'ok' | 'status' | 'json'>;
export type AskFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<AskResponse>;

export class AskApiError extends Error {
  constructor(readonly status?: number, options?: ErrorOptions) {
    super('The Pokémon question request failed.', options);
    this.name = new.target.name;
  }
}

export async function askPokemon(questionInput: unknown, fetcher: AskFetcher = fetch): Promise<AskResult> {
  const question = AskQuestionSchema.parse(questionInput);
  let response: AskResponse;
  try {
    response = await fetcher('/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  } catch (error) {
    throw new AskApiError(undefined, { cause: error });
  }

  if (!response.ok) throw new AskApiError(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new AskApiError(response.status, { cause: error });
  }

  const parsed = AskResultSchema.safeParse(payload);
  if (!parsed.success) throw new AskApiError(response.status, { cause: parsed.error });
  return parsed.data;
}
