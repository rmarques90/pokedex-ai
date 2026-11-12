import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: dom.window.HTMLElement });
Object.defineProperty(globalThis, 'Node', { configurable: true, value: dom.window.Node });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { App } = await import('./App.js');
const answer = {
  answer: 'Fire Pokémon are weak against Water, Ground, and Rock attacks.',
  abstained: false,
  sources: [{ pokemonId: 4, pokemonName: 'charmander', url: 'https://pokeapi.co/api/v2/pokemon/4/' }],
};

afterEach(() => { cleanup(); window.localStorage.clear(); });
after(() => dom.window.close());

test('renders the Portuguese page and accessible question controls by default', () => {
  render(<App ask={async () => answer} />);
  assert.ok(screen.getByRole('heading', { name: 'Uma pergunta. Novas descobertas.' }));
  assert.ok(screen.getByLabelText('Sua pergunta'));
  assert.ok(screen.getByRole('group', { name: 'Idioma da interface' }));
  assert.ok(screen.getByRole('button', { name: 'Portugu\u00eas' }));
  assert.ok(screen.getByRole('button', { name: 'English' }));
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
  finish(answer);
});

test('shows an error and allows retry after request failure', async () => {
  let calls = 0;
  render(<App ask={async () => { calls += 1; if (calls === 1) throw new Error('network'); return answer; }} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sua pergunta' }), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: /Perguntar/ }));
  await screen.findByRole('alert');
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

test('reload starts without prior query/result but keeps language preference', async () => {
  const view = render(<App ask={async () => answer} />);
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Question' } });
  fireEvent.click(screen.getByRole('button', { name: /Ask/ }));
  await screen.findByText(answer.answer);
  view.unmount();
  render(<App ask={async () => answer} />);
  assert.equal((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value, '');
  assert.equal(screen.queryByText(answer.answer), null);
  assert.equal(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed'), 'true');
});
