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

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const normalized = question.trim();
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
          {suggestions.map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}<span>↗</span></button>)}
        </nav>
        <div className="trainer"><div className="trainer-avatar">✦</div><div><strong>{copy.trainer}</strong><small>Pokédex AI</small></div><span className="trainer-dot" /></div>
      </aside>

      <main className="main-panel" id="home">
        <header className="top-trim"><div className="trim-slot"/><div className="trim-slot"/><div className="trim-slot"/><div className="trim-light" aria-hidden="true"><span/></div><div className="trim-slot"/><div className="trim-slot"/><div className="trim-slot"/></header>
        <div className="content-wrap">
          <div className="toolbar"><div className="breadcrumb"><span>⌂</span> / {copy.breadcrumb}</div><label className="language-label">◉ <span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => changeLanguage(event.target.value as Language)}><option value="pt">🇧🇷 PT</option><option value="en">🇺🇸 EN</option></select><span>⌄</span></label></div>
          <section className="intro"><div><div className="eyebrow"><span/> {copy.assistantName}</div><h1>{copy.pageTitle}</h1><p>{copy.pageSubtitle}</p></div><div className="intro-mark" aria-hidden="true">✦</div></section>
          <section className="hero" aria-label={copy.heroTitle}>
            <div className="hero-copy"><span className="hero-kicker">POKÉDEX AI <i>✦</i></span><h2>{copy.heroTitle}</h2><p>{copy.heroSubtitle}</p><span className="pokemon-badge">{copy.pokemonBadge}</span></div>
            <div className="hero-art"><div className="sun-orb"/><div className="hero-circle"/><img src="/charmander.png" alt="Charmander"/><span className="sparkle sparkle-one">✦</span><span className="sparkle sparkle-two">✧</span></div>
          </section>
          <div className="suggested-chips" aria-label={copy.suggestedQuestions}>{suggestions.map((item, index) => <button key={item} onClick={() => setQuestion(item)}><span>{['✧', '◈', '⌁'][index]}</span>{item}</button>)}</div>
          <form className="question-form" onSubmit={submit}>
            <label htmlFor="question-input">{copy.questionLabel}</label>
            <div className="input-row"><textarea id="question-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={copy.questionPlaceholder} rows={2} disabled={loading} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><button type="submit" disabled={loading || !question.trim()}>{loading ? <span className="spinner"/> : <span>✦</span>}{copy.ask}</button></div>
            <div className="form-hint"><span>↵</span> {language === 'pt' ? 'Pressione Enter para perguntar' : 'Press Enter to ask'} <span className="hint-divider">·</span> {language === 'pt' ? 'Sua resposta vem dos dados da Pokédex' : 'Answers are grounded in Pokédex data'}</div>
          </form>
          {loading && <div className="state-card" role="status"><span className="spinner dark"/>{copy.loading}</div>}
          {error && <div className="state-card error-card" role="alert"><span>!</span><div><strong>{copy.requestError}</strong><button onClick={() => void submit()}>{copy.retry}</button></div></div>}
          {result && <section className="answer-card" aria-live="polite"><div className="answer-top"><div className="answer-icon">✦</div><div><span className="answer-brand">{copy.answerLabel}</span><p className="asked-question">{submittedQuestion}</p></div><button className="reset-button" onClick={reset} aria-label={copy.newQuestion}>↻</button></div><div className="answer-body">{result.abstained && <div className="evidence-note">ⓘ {copy.insufficientEvidence}</div>}<p>{result.answer}</p></div>{result.sources.length > 0 && <div className="sources"><strong>{copy.sourcesLabel}</strong><ul>{result.sources.map((source) => <li key={`${source.pokemonId}-${source.url}`}><a href={source.url} target="_blank" rel="noreferrer"><span className="source-id">#{String(source.pokemonId).padStart(3, '0')}</span>{source.pokemonName}<span className="external-icon">↗</span></a></li>)}</ul></div>}<footer className="answer-footer">{copy.footerNote}<span>✦</span></footer></section>}
          <footer className="page-footer"><span>Pokédex AI <b>·</b> {language === 'pt' ? 'Feito para curiosos' : 'Made for curious trainers'}</span><span>✦</span></footer>
        </div>
      </main>
    </div>
  );
}
