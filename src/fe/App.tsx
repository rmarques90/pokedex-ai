import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { askPokemonStream, type AskStreamOptions } from './api-client.js';
import type { AskResult } from '../domain/ask.js';
import type { BrowserHistoryDocument, BrowserHistoryEntry } from '../domain/browser-history.js';
import { createHistoryStore, type HistoryStore } from './history-store.js';
import { readLanguagePreference, saveLanguagePreference, UI_COPY, type Language } from './i18n.js';

export type AskAction = (question: string, options?: AskStreamOptions) => Promise<AskResult>;
type Confirmation = { kind: 'clear' } | { kind: 'delete'; conversationId: string };

export function App({ ask = askPokemonStream }: { ask?: AskAction }) {
  const [language, setLanguage] = useState<Language>(() => readLanguagePreference());
  const storeRef = useRef<HistoryStore | null>(null);
  if (!storeRef.current) {
    let storage: Storage | null = null;
    try { storage = typeof window === 'undefined' ? null : window.localStorage; } catch { storage = null; }
    storeRef.current = createHistoryStore({ storage });
  }
  const store = storeRef.current;
  const initial = useMemo(() => store.load(), [store]);
  const [history, setHistory] = useState<BrowserHistoryDocument>(initial.document);
  const [storageWarning, setStorageWarning] = useState(!initial.persistent);
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<BrowserHistoryEntry | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const modalOpener = useRef<HTMLElement | null>(null);
  const copy = UI_COPY[language];
  const suggestions = language === 'pt'
    ? ['Quais tipos s\u00e3o fortes contra fogo?', 'Qual \u00e9 o Pok\u00e9mon n\u00famero 3?', 'Conte uma curiosidade sobre Charmander.']
    : ['Which types are strong against Fire?', 'Which Pok\u00e9mon is number 3?', 'Tell me a fact about Charmander.'];

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (!selectedEntry) return;
    modalRef.current?.focus();
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { setSelectedEntry(null); return; }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]'));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); modalOpener.current?.focus(); };
  }, [selectedEntry]);

  function changeLanguage(next: Language) { setLanguage(next); saveLanguagePreference(next); }
  function updateHistory(next: { document: BrowserHistoryDocument; persistent: boolean }) {
    setHistory(next.document);
    setStorageWarning(!next.persistent);
  }

  async function submit(event?: FormEvent, questionInput?: string) {
    event?.preventDefault();
    const normalized = (questionInput ?? question).trim();
    if (!normalized || loading) return;
    setQuestion(normalized);
    setSubmittedQuestion(normalized);
    setError(false); setStreamingAnswer(''); setRetryAttempt(0); setLoading(true);
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const conversationId = history.activeConversationId;
    try {
      const answer = await ask(normalized, {
        signal: controller.signal,
        onDelta: (text) => { if (activeRequest.current === controller) setStreamingAnswer((current) => current + text); },
        onReplace: (text) => { if (activeRequest.current === controller) setStreamingAnswer(text); },
        onRetry: (attempt) => { if (activeRequest.current === controller) setRetryAttempt(attempt); },
      });
      if (activeRequest.current === controller) {
        updateHistory(store.append({ conversationId, question: normalized, result: answer }));
        setQuestion('');
      }
    } catch {
      if (!controller.signal.aborted && activeRequest.current === controller) setError(true);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null; setLoading(false); setRetryAttempt(0); setStreamingAnswer('');
      }
    }
  }

  function cancel() {
    activeRequest.current?.abort(); activeRequest.current = null;
    setLoading(false); setStreamingAnswer(''); setRetryAttempt(0); setError(false);
  }
  function startNewConversation() {
    cancel(); setQuestion(''); setSubmittedQuestion(''); setError(false);
    updateHistory(store.startConversation());
  }
  function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === 'clear') { cancel(); setQuestion(''); setSubmittedQuestion(''); updateHistory(store.clear()); }
    else {
      if (confirmation.conversationId === history.activeConversationId) { cancel(); setQuestion(''); setSubmittedQuestion(''); }
      updateHistory(store.deleteConversation(confirmation.conversationId));
    }
    setSelectedEntry(null); setConfirmation(null);
  }

  const conversations = useMemo(() => {
    const groups = new Map<string, BrowserHistoryEntry[]>();
    for (const entry of history.entries) groups.set(entry.conversationId, [...(groups.get(entry.conversationId) ?? []), entry]);
    return [...groups.entries()].map(([id, entries]) => ({ id, entries: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), latest: entries.reduce((latest, entry) => entry.createdAt > latest ? entry.createdAt : latest, '') }))
      .sort((a, b) => b.latest.localeCompare(a.latest));
  }, [history.entries]);
  const transcript = history.entries.filter((entry) => entry.conversationId === history.activeConversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={copy.assistantName}>
        <a className="brand" href="#home" aria-label={'Pok\u00e9dex AI home'}><span className="brand-ball" /> <span><strong>{'Pok\u00e9dex'}</strong><b>AI</b><small>{copy.brandTagline}</small></span></a>
        <button type="button" className="mobile-history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>{copy.history}</button>
        <button className="new-question" onClick={startNewConversation}><span>+</span>{copy.newQuestion}</button>
        <div className="side-heading">{copy.journey}</div>
        <button className="nav-item active" onClick={startNewConversation}><span>{'\u2726'}</span>{copy.assistantName}</button>
        <section className={`history-panel${historyOpen ? ' history-open' : ''}`} aria-label={copy.history}>
          <div className="history-heading"><span>{copy.history}</span><button type="button" onClick={() => setConfirmation({ kind: 'clear' })} disabled={history.entries.length === 0 && !storageWarning} aria-label={copy.clearHistory} title={copy.clearHistory}>{'\u00d7'}</button></div>
          {conversations.length === 0 ? <p className="history-empty">{copy.historyEmpty}</p> : <div className="history-groups">{conversations.map((conversation) => <section className="history-group" key={conversation.id}>
            <div className="history-group-heading"><span>{formatTimestamp(conversation.latest, language)}</span><button type="button" onClick={() => setConfirmation({ kind: 'delete', conversationId: conversation.id })} aria-label={`${copy.deleteConversation}: ${conversation.entries[0]?.question ?? ''}`} title={copy.deleteConversation}>{'\u2715'}</button></div>
            {conversation.entries.map((entry) => <button className="history-entry" key={entry.id} onClick={(event) => { modalOpener.current = event.currentTarget; setSelectedEntry(entry); setHistoryOpen(false); }}><span>{entry.question}</span><time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt, language)}</time></button>)}
          </section>)}</div>}
        </section>
        <div className="suggestion-title">{copy.suggestedQuestions}</div>
        <nav className="suggestions" aria-label={copy.suggestedQuestions}>{suggestions.map((item) => <button key={item} onClick={() => void submit(undefined, item)}>{item}<span>{'\u2197'}</span></button>)}</nav>
        <div className="trainer"><div className="trainer-avatar">{'\u2726'}</div><div><strong>{copy.trainer}</strong><small>{'Pok\u00e9dex AI'}</small></div><span className="trainer-dot" /></div>
      </aside>

      <main className="main-panel" id="home">
        <header className="top-trim"><div className="trim-slot"/><div className="trim-slot"/><div className="trim-slot"/><div className="trim-light" aria-hidden="true"><span/></div><div className="trim-slot"/><div className="trim-slot"/><div className="trim-slot"/></header>
        <div className="content-wrap">
          <div className="toolbar"><div className="breadcrumb"><span>{'\u2302'}</span> / {copy.breadcrumb}</div><div className="language-label" role="group" aria-label={copy.languageSelector}><button type="button" className="language-option" aria-pressed={language === 'pt'} onClick={() => changeLanguage('pt')}><LanguageFlag language="pt" /> <span>Português</span></button><button type="button" className="language-option" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}><LanguageFlag language="en" /> <span>English</span></button></div></div>
          <section className="intro"><div><div className="eyebrow"><span/> {copy.assistantName}</div><h1>{copy.pageTitle}</h1><p>{copy.pageSubtitle}</p></div><div className="intro-mark" aria-hidden="true">{'\u2726'}</div></section>
          {transcript.length === 0 && <>
            <section className="hero" aria-label={copy.heroTitle}><div className="hero-copy"><span className="hero-kicker">{'POK\u00c9DEX AI'} <i>{'\u2726'}</i></span><h2>{copy.heroTitle}</h2><p>{copy.heroSubtitle}</p><span className="pokemon-badge">#004 {'\u00b7'} CHARMANDER</span></div><div className="hero-art"><div className="sun-orb"/><div className="hero-circle"/><img src="/charmander.png" alt="Charmander"/><span className="sparkle sparkle-one">{'\u2726'}</span><span className="sparkle sparkle-two">{'\u2727'}</span></div></section>
            <div className="suggested-chips" aria-label={copy.suggestedQuestions}>{suggestions.map((item, index) => <button key={item} onClick={() => void submit(undefined, item)}><span>{['\u2727', '\u25c8', '\u2301'][index]}</span>{item}</button>)}</div>
          </>}
          <form className="question-form" onSubmit={submit}>
            <label htmlFor="question-input">{copy.questionLabel}</label>
            <div className="input-row"><textarea id="question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={copy.questionPlaceholder} rows={2} disabled={loading} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><button type="submit" disabled={loading || !question.trim()}>{loading ? <span className="spinner"/> : <span>{'\u2726'}</span>}{copy.ask}</button></div>
            <div className="form-hint"><span aria-hidden="true">{String.fromCodePoint(0x21b5)}</span> {copy.keyboardHint}</div>
          </form>
          {storageWarning && <div className="storage-warning" role="status">{copy.storageWarning}</div>}
          {transcript.map((entry) => <article className="chat-turn" key={entry.id}>
            <div className="chat-question"><span className="chat-avatar">{language === 'pt' ? 'Voc\u00ea' : 'You'}</span><p>{entry.question}</p></div>
            <AnswerCard entry={entry} copy={copy} />
          </article>)}
          {loading && <div className="state-card" role="status"><span className="spinner dark"/>{retryAttempt > 0 ? copy.retrying.replace('{attempt}', String(retryAttempt)) : copy.loading}<button className="cancel-button" type="button" onClick={cancel}>{copy.cancel}</button></div>}
          {loading && streamingAnswer.length > 0 && <section className="answer-card stream-preview" aria-live="polite"><div className="answer-top"><div className="answer-icon">{'\u2726'}</div><div><span className="answer-brand">{copy.answerLabel}</span><p className="asked-question">{submittedQuestion}</p></div></div><div className="answer-body"><p>{streamingAnswer}</p></div></section>}
          {error && <div className="state-card error-card" role="alert"><span>!</span><div><strong>{copy.requestError}</strong><button onClick={() => void submit()}>{copy.retry}</button></div></div>}
          <footer className="page-footer"><span>{'Pok\u00e9dex AI'} <b>{'\u00b7'}</b> {language === 'pt' ? 'Feito para curiosos' : 'Made for curious trainers'}</span><span>{'\u2726'}</span></footer>
        </div>
      </main>

      {selectedEntry && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEntry(null); }}>
        <div className="history-dialog" role="dialog" aria-modal="true" aria-label={copy.savedAnswer} tabIndex={-1} ref={modalRef}>
          <div className="dialog-heading"><h2>{copy.savedAnswer}</h2><button type="button" onClick={() => setSelectedEntry(null)} aria-label={copy.close}>{'\u00d7'}</button></div>
          <div className="chat-question modal-question"><span className="chat-avatar">{language === 'pt' ? 'Voc\u00ea' : 'You'}</span><p>{selectedEntry.question}</p></div>
          <AnswerCard entry={selectedEntry} copy={copy} />
        </div>
      </div>}
      {confirmation && <div className="dialog-backdrop"><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">{confirmation.kind === 'clear' ? copy.confirmClearTitle : copy.confirmDeleteTitle}</h2>
        <p id="confirm-message">{confirmation.kind === 'clear' ? copy.confirmClearMessage : copy.confirmDeleteMessage}</p>
        <div className="confirm-actions"><button type="button" onClick={() => setConfirmation(null)}>{copy.dismiss}</button><button type="button" className="danger-action" onClick={confirmAction}>{copy.confirm}</button></div>
      </div></div>}
    </div>
  );
}

function AnswerCard({ entry, copy }: { entry: BrowserHistoryEntry; copy: (typeof UI_COPY)[Language] }) {
  const { result } = entry;
  return <section className="answer-card" aria-live="polite"><div className="answer-top"><div className="answer-icon">{'\u2726'}</div><div><span className="answer-brand">{copy.answerLabel}</span><p className="asked-question">{entry.question}</p></div></div>
    <div className="answer-body">{result.abstained && <div className="evidence-note">{'\u24d8'} {copy.insufficientEvidence}</div>}{!result.abstained && result.sources.length === 0 && <div className="evidence-note">{copy.generalKnowledge}</div>}<p>{result.answer}</p></div>
    {result.sources.length > 0 && <div className="sources"><strong>{copy.sourcesLabel}</strong><ul>{result.sources.map((source) => <li key={`${source.pokemonId}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer"><span className="source-id">#{String(source.pokemonId).padStart(3, '0')}</span>{source.pokemonName}<span className="source-host">{getSourceIdentity(source.url)}</span><span className="external-icon">{String.fromCodePoint(0x2197)}</span></a></li>)}</ul></div>}
    <footer className="answer-footer">{copy.footerNote}<span>{'\u2726'}</span></footer>
  </section>;
}

function formatTimestamp(value: string, language: Language) {
  try { return new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}
function getSourceIdentity(sourceUrl: string): string {
  try { const source = new URL(sourceUrl); return `${source.host}${source.pathname}${source.search}${source.hash}`; }
  catch { return sourceUrl; }
}
function LanguageFlag({ language }: { language: Language }) {
  if (language === 'pt') return <svg className="language-flag" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="3" fill="#159447"/><path d="M14 3 24 10 14 17 4 10Z" fill="#ffdf35"/><circle cx="14" cy="10" r="4" fill="#2454a5"/></svg>;
  return <svg className="language-flag" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="3" fill="#fff"/><path d="M0 1.5h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v1.5H0z" fill="#d92736"/><path d="M0 0h13v11H0z" fill="#24447d"/><path d="m2 2 1 .7L4 2l-.4 1.1.9.7H3.4L3 5l-.4-1.2H1.4l.9-.7L2 2zm5 0 1 .7L9 2l-.4 1.1.9.7H8.4L8 5l-.4-1.2H6.4l.9-.7L7 2z" fill="#fff"/></svg>;
}
