import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { App } = await import('./App.js');
const { HISTORY_STORAGE_KEY } = await import('./history-store.js');
const { USER_STORAGE_KEY } = await import('./user-session.js');
const answer = {
  answer: 'Fire Pokémon are weak against Water, Ground, and Rock attacks.',
  abstained: false,
  sources: [{ pokemonId: 4, pokemonName: 'charmander', url: 'https://pokeapi.co/api/v2/pokemon/4/' }],
};

const testUser = { id: '00000000-0000-4000-8000-000000000001', name: 'Ash' };
beforeEach(() => {
  window.localStorage.setItem('pokedex-ai.language', 'pt');
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(testUser));
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async () => new Response(JSON.stringify({ conversations: [], nextCursor: null }), { status: 200 }) });
});
afterEach(() => { cleanup(); window.localStorage.clear(); });
after(() => dom.window.close());

test('renders the Portuguese page and accessible question controls by default', () => {
  render(<App ask={async () => answer} />);
  assert.ok(screen.getByRole('heading', { name: 'Uma pergunta. Novas descobertas.' }));
  assert.ok(screen.getByLabelText('Sua pergunta'));
  assert.ok(screen.getByRole('group', { name: 'Idioma da interface' }));
  assert.ok(screen.getByRole('button', { name: 'Portugu\u00eas' }));
  assert.ok(screen.getByRole('button', { name: 'English' }));
  assert.ok(screen.getByRole('link', { name: 'Pokédex AI home' }));
  assert.equal(screen.getAllByRole('button', { name: /Quais tipos são fortes contra fogo/ }).length, 2);
  assert.equal(document.querySelectorAll('.language-flag').length, 2);
  assert.ok(screen.getByRole('button', { name: /Perguntar/ }));
});

test('switches the interface to English, persists it, and restores it on a new render', () => {
  const first = render(<App ask={async () => answer} />);
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  assert.ok(screen.getByRole('heading', { name: 'One question. New discoveries.' }));
  assert.equal(window.localStorage.getItem('pokedex-ai.language'), 'en');
  first.unmount();
  render(<App ask={async () => answer} />);
  assert.ok(screen.getByRole('heading', { name: 'One question. New discoveries.' }));
});

test('sidebar suggested questions submit immediately', async () => {
  const asked: string[] = [];
  render(<App ask={async (question) => { asked.push(question); return answer; }} />);
  const suggestion = document.querySelector('.suggestions button:nth-child(2)');
  assert.ok(suggestion);
  const expectedQuestion = suggestion.childNodes[0]?.textContent?.trim() ?? '';
  fireEvent.click(suggestion);
  await waitFor(() => assert.equal(asked.length, 1));
  assert.equal(asked[0], expectedQuestion);
  await waitFor(() => assert.equal(document.querySelector('.asked-question')?.textContent, expectedQuestion));
});

test('suggested chips submit immediately', async () => {
  const asked: string[] = [];
  render(<App ask={async (question) => { asked.push(question); return answer; }} />);
  const suggestion = document.querySelector('.suggested-chips button:nth-child(1)');
  assert.ok(suggestion);
  const expectedQuestion = suggestion.lastChild?.textContent?.trim() ?? '';
  fireEvent.click(suggestion);
  await waitFor(() => assert.equal(asked.length, 1));
  assert.equal(asked[0], expectedQuestion);
  await waitFor(() => assert.equal(document.querySelector('.asked-question')?.textContent, expectedQuestion));
});

test('keyboard Enter submits the current text', async () => {
  const asked: string[] = [];
  render(<App ask={async (question) => { asked.push(question); return answer; }} />);
  const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
  fireEvent.change(input, { target: { value: '  Manual question?  ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => assert.equal(asked.length, 1));
  assert.equal(asked[0], 'Manual question?');
});

test('prevents empty submission without calling the API', () => {
  let calls = 0;
  render(<App ask={async () => { calls += 1; return answer; }} />);
  assert.equal((screen.getByRole('button', { name: /Perguntar/ }) as HTMLButtonElement).disabled, true);
  fireEvent.submit(screen.getByRole('button', { name: /Perguntar/ }).closest('form')!);
  assert.equal(calls, 0);
});

test('shows a loading status and prevents duplicate submits until the request finishes', async () => {
  let finish!: (value: typeof answer) => void;
  let calls = 0;
  render(<App ask={() => { calls += 1; return new Promise((resolve) => { finish = resolve; }); }} />);
  const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
  fireEvent.change(input, { target: { value: 'Tell me about Charmander' } });
  const form = screen.getByRole('button', { name: /Perguntar/ }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.ok(screen.getByRole('status'));
  assert.equal(calls, 1);
  finish(answer);
  await screen.findByText(answer.answer);
});

test('shows completed turns newest-first while keeping each answer, sources, and status with its question', async () => {
  render(<App ask={async (question) => question === 'First question'
    ? { ...answer, answer: 'First answer' }
    : { answer: 'Second answer', abstained: false, sources: [] }} />);
  const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
  const form = screen.getByRole('button', { name: /Perguntar/ }).closest('form')!;

  fireEvent.change(input, { target: { value: 'First question' } });
  fireEvent.submit(form);
  await screen.findByText('First answer');
  fireEvent.change(input, { target: { value: 'Second question' } });
  fireEvent.submit(form);
  await screen.findByText('Second answer');

  const turns = Array.from(document.querySelectorAll('.chat-turn'));
  assert.deepEqual(turns.map((turn) => turn.querySelector('.chat-question p')?.textContent), ['Second question', 'First question']);
  assert.ok(turns[0]?.textContent?.includes('Second answer'));
  assert.ok(turns[0]?.textContent?.includes('conhecimento geral do modelo'));
  assert.equal(turns[0]?.querySelector('.sources'), null);
  assert.ok(turns[1]?.textContent?.includes('First answer'));
  assert.ok(turns[1]?.querySelector(`a[href="${answer.sources[0].url}"]`));
});

test('keeps the submitted question and stream preview in the top pending turn, then replaces it once', async () => {
  let finish!: (value: typeof answer) => void;
  render(<App ask={(question, options) => {
    if (question === 'Earlier question') return Promise.resolve({ ...answer, answer: 'Earlier answer' });
    options?.onDelta?.('Streaming answer');
    return new Promise((resolve) => { finish = resolve; });
  }} />);
  const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
  const form = screen.getByRole('button', { name: /Perguntar/ }).closest('form')!;
  fireEvent.change(input, { target: { value: 'Earlier question' } });
  fireEvent.submit(form);
  await screen.findByText('Earlier answer');
  fireEvent.change(input, { target: { value: 'Latest question' } });
  fireEvent.submit(form);

  const pending = document.querySelector('.chat-turn.pending-turn');
  assert.ok(pending);
  assert.equal(pending.querySelector('.chat-question p')?.textContent, 'Latest question');
  assert.ok(pending.querySelector('[role="status"]'));
  assert.ok(pending.querySelector('.stream-preview')?.textContent?.includes('Streaming answer'));
  assert.equal(document.querySelectorAll('.chat-turn')[1]?.querySelector('.chat-question p')?.textContent, 'Earlier question');

  finish({ ...answer, answer: 'Latest final answer' });
  await screen.findByText('Latest final answer');
  assert.equal(document.querySelector('.pending-turn'), null);
  assert.deepEqual(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).map((node) => node.textContent), ['Latest question', 'Earlier question']);
  assert.equal(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).filter((node) => node.textContent === 'Latest question').length, 1);
});

test('loads API history in transcript/sidebar order and discards legacy localStorage conversations', async () => {
  const conversationId = '00000000-0000-4000-8000-000000000001';
  const timestamp = '2026-01-01T12:00:00.000Z';
  const entries = [
    { id: '00000000-0000-4000-8000-000000000002', conversationId, createdAt: timestamp, question: 'Earlier appended question', result: { ...answer, answer: 'Earlier appended answer' } },
    { id: '00000000-0000-4000-8000-000000000003', conversationId, createdAt: timestamp, question: 'Later appended question', result: { ...answer, answer: 'Later appended answer' } },
  ];
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, activeConversationId: conversationId, entries }));
  render(<App ask={async () => answer} loadHistoryPage={async () => ({ entries, cursor: null })} />);

  await screen.findByRole('button', { name: /Later appended question/ });
  fireEvent.click(screen.getByRole('button', { name: /Later appended question/ }));
  assert.deepEqual(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).map((node) => node.textContent), ['Later appended question', 'Earlier appended question']);
  assert.deepEqual(Array.from(document.querySelectorAll('.history-entry > span')).map((node) => node.textContent), ['Earlier appended question', 'Later appended question']);
  await waitFor(() => assert.equal(window.localStorage.getItem(HISTORY_STORAGE_KEY), null));
});

test('failure, retry, and cancellation do not change previously completed turns', async () => {
  let calls = 0;
  let finishCancelled!: (value: typeof answer) => void;
  render(<App ask={(question) => {
    if (question === 'Saved question') return Promise.resolve({ ...answer, answer: 'Saved answer' });
    calls += 1;
    if (calls === 1) return Promise.reject(new Error('network'));
    if (calls === 2) return Promise.resolve({ ...answer, answer: 'Recovered answer' });
    return new Promise((resolve) => { finishCancelled = resolve; });
  }} />);
  const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
  const form = screen.getByRole('button', { name: /Perguntar/ }).closest('form')!;
  fireEvent.change(input, { target: { value: 'Saved question' } });
  fireEvent.submit(form);
  await screen.findByText('Saved answer');

  fireEvent.change(input, { target: { value: 'Retry question' } });
  fireEvent.submit(form);
  await screen.findByRole('alert');
  assert.deepEqual(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).map((node) => node.textContent), ['Saved question']);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Recovered answer');
  assert.deepEqual(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).map((node) => node.textContent), ['Retry question', 'Saved question']);

  fireEvent.change(input, { target: { value: 'Canceled question' } });
  fireEvent.submit(form);
  assert.deepEqual(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).map((node) => node.textContent), ['Canceled question', 'Retry question', 'Saved question']);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  assert.deepEqual(Array.from(document.querySelectorAll('.chat-turn .chat-question p')).map((node) => node.textContent), ['Retry question', 'Saved question']);
  assert.deepEqual(Array.from(document.querySelectorAll('.history-entry > span')).map((node) => node.textContent), ['Retry question', 'Saved question']);
  finishCancelled(answer);
  await waitFor(() => assert.equal(screen.queryByRole('status'), null));
});

test('renders streamed text immediately and cancels the active request', async () => {
  let receivedSignal: AbortSignal | undefined;
  let finish!: (value: typeof answer) => void;
  render(<App ask={(_question, options) => {
    receivedSignal = options?.signal;
    options?.onDelta?.('Bulbasaur is ');
    return new Promise((resolve) => { finish = resolve; });
  }} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Who is Bulbasaur?' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  assert.ok(screen.getByText(/Bulbasaur is/));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(screen.queryByText(/Bulbasaur is/), null);
  assert.equal(screen.queryByRole('alert'), null);
  assert.equal(document.querySelector('.history-entry'), null);
  finish(answer);
});

test('shows an error and allows retry after request failure', async () => {
  let calls = 0;
  render(<App ask={async () => { calls += 1; if (calls === 1) throw new Error('network'); return answer; }} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByRole('alert');
  assert.equal(document.querySelector('.history-entry'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText(answer.answer);
  assert.equal(calls, 2);
});

test('renders grounded answer and safe source links', async () => {
  render(<App ask={async () => answer} />);
  // The result is supplied from the same API contract through a resolved request.
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'What is Charmander?' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText(answer.answer);
  const source = screen.getByRole('link', { name: /#004charmander/i });
  assert.equal(source.getAttribute('href'), answer.sources[0].url);
  assert.equal(source.getAttribute('target'), '_blank');
  assert.equal(source.getAttribute('rel'), 'noreferrer');
});

test('labels answers that have no indexed sources as general model knowledge', async () => {
  render(<App ask={async () => ({ answer: 'Pikachu evolves into Raichu.', abstained: false, sources: [] })} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Who does Pikachu evolve into?' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText('Pikachu evolves into Raichu.');
  assert.ok(screen.getByText(/conhecimento geral do modelo/));
  assert.equal(document.querySelector('.sources'), null);
});

test('labels an abstained response as insufficient evidence', async () => {
  render(<App ask={async () => ({ answer: 'Insufficient evidence.', abstained: true, sources: [] })} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText('Insufficient evidence.');
  assert.ok(screen.getByText(/Os dados indexados não contêm informação suficiente/));
});

test('reload preserves language preference and starts with a fresh conversation', () => {
  const view = render(<App ask={async () => answer} />);
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  view.unmount();
  render(<App ask={async () => answer} />);
  assert.equal((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value, '');
  assert.equal(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed'), 'true');
});

test('saved history opens a result modal without changing the active transcript', async () => {
  render(<App ask={async () => answer} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'What is Charmander?' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText(answer.answer);
  const historyButton = document.querySelector('.history-entry') as HTMLButtonElement;
  fireEvent.click(historyButton);
  const dialog = screen.getByRole('dialog', { name: 'Resposta salva' });
  assert.ok(dialog);
  assert.equal(document.activeElement, dialog);
  assert.equal(screen.getAllByText(answer.answer).length, 2);
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(document.activeElement, historyButton);
  assert.equal(screen.getAllByText(answer.answer).length, 1);
});

test('deleting a confirmed conversation removes its history and clears the active transcript', async () => {
  render(<App ask={async () => answer} removeConversation={async () => {}} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Delete this conversation' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText(answer.answer);
  fireEvent.click(screen.getByRole('button', { name: /Excluir conversa: Delete this conversation/ }));
  assert.ok(screen.getByRole('alertdialog'));
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(screen.queryByText(answer.answer), null);
  assert.equal(screen.queryByRole('button', { name: /Delete this conversation/ }), null);
});

test('canceling conversation deletion preserves the saved conversation', async () => {
  render(<App ask={async () => answer} removeConversation={async () => {}} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Keep this conversation' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText(answer.answer);
  fireEvent.click(screen.getByRole('button', { name: /Excluir conversa: Keep this conversation/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Manter' }));
  assert.ok(document.querySelector('.history-entry'));
  assert.ok(screen.getByText(answer.answer));
});

test('starting a new conversation clears the transcript while keeping prior questions accessible', async () => {
  render(<App ask={async () => answer} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Previous conversation' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText(answer.answer);
  fireEvent.click(screen.getByRole('button', { name: /Nova pergunta/ }));
  assert.equal(screen.queryByText(answer.answer), null);
  assert.ok(document.querySelector('.history-entry'));
  assert.equal((screen.getByRole('textbox', { name: 'Sua pergunta' }) as HTMLTextAreaElement).value, '');
});

test('clear history requires confirmation and removes saved conversations', async () => {
  render(<App ask={async () => answer} clearHistory={async () => {}} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Clear this history' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByText(answer.answer);
  fireEvent.click(screen.getByRole('button', { name: 'Limpar histórico' }));
  assert.ok(screen.getByRole('alertdialog'));
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(screen.queryByText(answer.answer), null);
  assert.equal(document.querySelector('.history-entry'), null);
});

test('gates users on localized login and keeps the entered name after request failure', async () => {
  window.localStorage.removeItem(USER_STORAGE_KEY);
  render(<App login={async () => { throw new Error('network'); }} />);
  assert.ok(screen.getByRole('heading', { name: 'Entre com seu nome' }));
  const name = screen.getByRole('textbox', { name: 'Seu nome' });
  fireEvent.change(name, { target: { value: 'Misty' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByRole('alert');
  assert.equal((name as HTMLInputElement).value, 'Misty');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  assert.ok(screen.getByRole('heading', { name: 'Enter your name' }));
});

test('logs in, persists the identity, and restores it after reload', async () => {
  window.localStorage.removeItem(USER_STORAGE_KEY);
  const view = render(<App login={async () => testUser} ask={async () => answer} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu nome' }), { target: { value: 'Ash' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByRole('textbox', { name: 'Sua pergunta' });
  assert.deepEqual(JSON.parse(window.localStorage.getItem(USER_STORAGE_KEY)!), testUser);
  assert.ok(screen.getByText('Ash'));
  view.unmount();
  render(<App ask={async () => answer} />);
  assert.ok(screen.getByRole('textbox', { name: 'Sua pergunta' }));
  assert.ok(screen.getByText('Ash'));
});

test('logout aborts active work, removes all local conversation history, and preserves language', async () => {
  let askCount = 0;
  let receivedSignal: AbortSignal | undefined;
  let finishPending!: (value: typeof answer) => void;
  render(<App ask={(_question, options) => {
    askCount += 1;
    if (askCount === 1) return Promise.resolve(answer);
    receivedSignal = options?.signal;
    return new Promise((resolve) => { finishPending = resolve; });
  }} />);
  const input = screen.getByRole('textbox', { name: 'Sua pergunta' });
  const form = screen.getByRole('button', { name: /Perguntar/ }).closest('form')!;
  fireEvent.change(input, { target: { value: 'Saved conversation' } });
  fireEvent.submit(form);
  await screen.findByText(answer.answer);
  assert.equal(window.localStorage.getItem(HISTORY_STORAGE_KEY), null);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Pending question' } });
  fireEvent.submit(screen.getByRole('button', { name: /Perguntar/ }).closest('form')!);
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(window.localStorage.getItem(USER_STORAGE_KEY), null);
  assert.equal(window.localStorage.getItem(HISTORY_STORAGE_KEY), null);
  assert.equal(window.localStorage.getItem('pokedex-ai.language'), 'pt');
  assert.ok(screen.getByRole('heading', { name: 'Entre com seu nome' }));
  finishPending(answer);
});
