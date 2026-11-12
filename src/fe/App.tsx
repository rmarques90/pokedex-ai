import { useState, type FormEvent } from 'react';
import { askPokemon } from './api-client.js';
import type { AskResult } from '../domain/ask.js';
import { readLanguagePreference, saveLanguagePreference, UI_COPY, type Language } from './i18n.js';

export type AskAction = (question: string) => Promise<AskResult>;

export function App({ ask = askPokemon }: { ask?: AskAction }) {
  const [language, setLanguage] = useState<Language>(() => readLanguagePreference());
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const copy = UI_COPY[language];
  const suggestions = language === 'pt'
    ? ['Quais tipos são fortes contra fogo?', 'Qual é o Pokémon número 3?', 'Conte uma curiosidade sobre Charmander.']
    : ['Which types are strong against Fire?', 'Which Pokémon is number 3?', 'Tell me a fact about Charmander.'];

  function changeLanguage(next: Language) {
    setLanguage(next);
    saveLanguagePreference(next);
  }

  async function submit(event?: FormEvent, questionInput?: string) {
    event?.preventDefault();
    const normalized = (questionInput ?? question).trim();
    if (!normalized || loading) return;
    setQuestion(normalized);
    setSubmittedQuestion(normalized);
    setResult(null);
    setError(false);
    setLoading(true);
    try {
      setResult(await ask(normalized));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setQuestion('');
    setSubmittedQuestion('');
    setResult(null);
    setError(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={copy.assistantName}>
        <a className="brand" href="#home" aria-label="Pokédex AI home"><span className="brand-ball" /> <span><strong>Pokédex</strong><b>AI</b><small>{copy.brandTagline}</small></span></a>
        <button className="new-question" onClick={reset}><span>＋</span>{copy.newQuestion}</button>
        <div className="side-heading">{copy.journey}</div>
        <button className="nav-item active" onClick={reset}><span>✦</span>{copy.assistantName}</button>
        <div className="suggestion-title">{copy.suggestedQuestions}</div>
        <nav className="suggestions" aria-label={copy.suggestedQuestions}>
          {suggestions.map((item) => <button key={item} onClick={() => void submit(undefined, item)}>{item}<span>↗</span></button>)}
        </nav>
        <div className="trainer"><div className="trainer-avatar">✦</div><div><strong>{copy.trainer}</strong><small>Pokédex AI</small></div><span className="trainer-dot" /></div>
      </aside>

      <main className="main-panel" id="home">
        <header className="top-trim"><div className="trim-slot"/><div className="trim-slot"/><div className="trim-slot"/><div className="trim-light" aria-hidden="true"><span/></div><div className="trim-slot"/><div className="trim-slot"/><div className="trim-slot"/></header>
        <div className="content-wrap">
          <div className="toolbar"><div className="breadcrumb"><span>⌂</span> / {copy.breadcrumb}</div><div className="language-label" role="group" aria-label={copy.languageSelector}><button type="button" className="language-option" aria-pressed={language === 'pt'} onClick={() => changeLanguage('pt')}><LanguageFlag language="pt" /> <span>{'Portugu\u00eas'}</span></button><button type="button" className="language-option" aria-pressed={language === 'en'} onClick={() => changeLanguage('en')}><LanguageFlag language="en" /> <span>English</span></button></div></div>
          <section className="intro"><div><div className="eyebrow"><span/> {copy.assistantName}</div><h1>{copy.pageTitle}</h1><p>{copy.pageSubtitle}</p></div><div className="intro-mark" aria-hidden="true">✦</div></section>
          <section className="hero" aria-label={copy.heroTitle}>
            <div className="hero-copy"><span className="hero-kicker">POKÉDEX AI <i>✦</i></span><h2>{copy.heroTitle}</h2><p>{copy.heroSubtitle}</p><span className="pokemon-badge">{copy.pokemonBadge}</span></div>
            <div className="hero-art"><div className="sun-orb"/><div className="hero-circle"/><img src="/charmander.png" alt="Charmander"/><span className="sparkle sparkle-one">✦</span><span className="sparkle sparkle-two">✧</span></div>
          </section>
          <div className="suggested-chips" aria-label={copy.suggestedQuestions}>{suggestions.map((item, index) => <button key={item} onClick={() => setQuestion(item)}><span>{['✧', '◈', '⌁'][index]}</span>{item}</button>)}</div>
          <form className="question-form" onSubmit={submit}>
            <label htmlFor="question-input">{copy.questionLabel}</label>
            <div className="input-row"><textarea id="question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={copy.questionPlaceholder} rows={2} disabled={loading} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><button type="submit" disabled={loading || !question.trim()}>{loading ? <span className="spinner"/> : <span>✦</span>}{copy.ask}</button></div>
            <div className="form-hint"><span aria-hidden="true">{String.fromCodePoint(0x21b5)}</span> {copy.keyboardHint}</div>
          </form>
          {loading && <div className="state-card" role="status"><span className="spinner dark"/>{copy.loading}</div>}
          {error && <div className="state-card error-card" role="alert"><span>!</span><div><strong>{copy.requestError}</strong><button onClick={() => void submit()}>{copy.retry}</button></div></div>}
          {result && <section className="answer-card" aria-live="polite"><div className="answer-top"><div className="answer-icon">✦</div><div><span className="answer-brand">{copy.answerLabel}</span><p className="asked-question">{submittedQuestion}</p></div><button className="reset-button" onClick={reset} aria-label={copy.newQuestion}>↻</button></div><div className="answer-body">{result.abstained && <div className="evidence-note">ⓘ {copy.insufficientEvidence}</div>}<p>{result.answer}</p></div>{result.sources.length > 0 && <div className="sources"><strong>{copy.sourcesLabel}</strong><ul>{result.sources.map((source) => <li key={`${source.pokemonId}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer"><span className="source-id">#{String(source.pokemonId).padStart(3, '0')}</span>{source.pokemonName}<span className="source-host">{getSourceIdentity(source.url)}</span><span className="external-icon">{String.fromCodePoint(0x2197)}</span></a></li>)}</ul></div>}<footer className="answer-footer">{copy.footerNote}<span>✦</span></footer></section>}
          <footer className="page-footer"><span>Pokédex AI <b>·</b> {language === 'pt' ? 'Feito para curiosos' : 'Made for curious trainers'}</span><span>✦</span></footer>
        </div>
      </main>
    </div>
  );
}

function getSourceIdentity(sourceUrl: string): string {
  try {
    const source = new URL(sourceUrl);
    return `${source.host}${source.pathname}${source.search}${source.hash}`;
  } catch { return sourceUrl; }
}

function LanguageFlag({ language }: { language: Language }) {
  if (language === 'pt') {
    return (
      <svg className="language-flag" viewBox="0 0 28 20" aria-hidden="true">
        <rect width="28" height="20" rx="3" fill="#159447" />
        <path d="M14 3 24 10 14 17 4 10Z" fill="#ffdf35" />
        <circle cx="14" cy="10" r="4" fill="#2454a5" />
      </svg>
    );
  }

  return (
    <svg className="language-flag" viewBox="0 0 28 20" aria-hidden="true">
      <rect width="28" height="20" rx="3" fill="#fff" />
      <path d="M0 1.5h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v2H0zm0 4h28v1.5H0z" fill="#d92736" />
      <path d="M0 0h13v11H0z" fill="#24447d" />
      <path d="m2 2 1 .7L4 2l-.4 1.1.9.7H3.4L3 5l-.4-1.2H1.4l.9-.7L2 2zm5 0 1 .7L9 2l-.4 1.1.9.7H8.4L8 5l-.4-1.2H6.4l.9-.7L7 2zm5 0 1 .7 1-.7-.4 1.1.9.7h-1.1L13 5l-.4-1.2h-1.2l.9-.7L12 2zM4.5 6l1 .7 1-.7-.4 1.1.9.7H5.9l-.4 1.2-.4-1.2H4l.9-.7L4.5 6zm5 0 1 .7 1-.7-.4 1.1.9.7H10.9l-.4 1.2-.4-1.2H9l.9-.7L9.5 6z" fill="#fff" />
    </svg>
  );
}
