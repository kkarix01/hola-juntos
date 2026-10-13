import { useEffect, useMemo, useState } from 'react'
import { isConfigured, supabase } from './supabase'

const ratings = [
  { value: 0, label: 'Nie umiem', short: 'Nie umiem' },
  { value: 1, label: 'Niezbyt umiem', short: 'Słabo' },
  { value: 2, label: 'Trochę umiem', short: 'Trochę' },
  { value: 3, label: 'Umiem dobrze', short: 'Dobrze' },
]
const boxNames = ['Nowe / trudne', 'Do utrwalenia', 'W trakcie nauki', 'Dobrze znane', 'Opanowane']

export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [group, setGroup] = useState(null)
  const [cards, setCards] = useState([])
  const [progress, setProgress] = useState({})
  const [tab, setTab] = useState('learn')
  const [current, setCurrent] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [form, setForm] = useState({ pl: '', es: '', phonetic: '', topic: 'Podstawowe' })
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) loadData() }, [session])

  async function loadData() {
    setMessage('')
    const { data: memberships, error: mErr } = await supabase.from('group_members').select('group_id, study_groups(id,name,invite_code)').limit(1)
    if (mErr) { setMessage('Nie udało się pobrać grupy. Sprawdź, czy wkleiłeś skrypt SQL z pliku supabase/schema.sql.'); return }
    const membership = memberships?.[0]
    if (!membership) { setGroup(null); return }
    const g = membership.study_groups
    setGroup(g)
    const { data: words, error: wErr } = await supabase.from('flashcards').select('*').eq('group_id', g.id).order('created_at', { ascending: false })
    if (wErr) { setMessage(wErr.message); return }
    setCards(words || [])
    const { data: pData, error: pErr } = await supabase.from('user_progress').select('*').eq('user_id', session.user.id)
    if (!pErr) setProgress(Object.fromEntries((pData || []).map(p => [p.flashcard_id, p])))
  }

  async function submitAuth(e) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setMessage('Sprawdź skrzynkę e-mail i potwierdź konto. Potem zaloguj się w aplikacji.')
        else setMessage('Konto utworzone!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) { setMessage(err.message || 'Wystąpił błąd logowania.') }
    finally { setBusy(false) }
  }

  async function createGroup() {
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('create_study_group', { group_name: 'Nasze fiszki' })
    if (error) setMessage(error.message)
    else await loadData()
    setBusy(false)
  }

  async function joinGroup(e) {
    e.preventDefault(); setBusy(true); setMessage('')
    const { error } = await supabase.rpc('join_study_group', { code_to_join: joinCode.trim() })
    if (error) setMessage(error.message)
    else { setJoinCode(''); await loadData() }
    setBusy(false)
  }

  async function saveCard(e) {
    e.preventDefault(); if (!group) return
    setBusy(true); setMessage('')
    const payload = { group_id: group.id, polish: form.pl.trim(), spanish: form.es.trim(), phonetic: form.phonetic.trim() || null, topic: form.topic.trim() || 'Ogólne', created_by: session.user.id }
    const result = editing
      ? await supabase.from('flashcards').update({ polish: payload.polish, spanish: payload.spanish, phonetic: payload.phonetic, topic: payload.topic }).eq('id', editing)
      : await supabase.from('flashcards').insert(payload)
    if (result.error) setMessage(result.error.message)
    else { setForm({ pl: '', es: '', phonetic: '', topic: 'Podstawowe' }); setEditing(null); await loadData(); setTab('cards') }
    setBusy(false)
  }

  async function deleteCard(id) {
    if (!confirm('Usunąć tę fiszkę dla Was obojga?')) return
    const { error } = await supabase.from('flashcards').delete().eq('id', id)
    if (error) setMessage(error.message); else await loadData()
  }

  function editCard(card) {
    setEditing(card.id); setForm({ pl: card.polish, es: card.spanish, phonetic: card.phonetic || '', topic: card.topic || 'Ogólne' }); setTab('add')
  }

  const dueCards = useMemo(() => cards.filter(c => {
    const p = progress[c.id]
    return !p || !p.due_at || new Date(p.due_at) <= new Date()
  }), [cards, progress])
  const learnCards = filter === 'all' ? dueCards : dueCards.filter(c => (progress[c.id]?.box ?? 1) === Number(filter))
  const activeCard = learnCards.length ? learnCards[current % learnCards.length] : null

  async function rateCard(rating) {
    if (!activeCard) return
    const previous = progress[activeCard.id]
    let box = previous?.box ?? 1
    if (rating === 0) box = 1
    else if (rating === 1) box = Math.max(1, box - 1)
    else if (rating === 2) box = Math.min(5, box + 1)
    else box = Math.min(5, box + 1)
    const days = rating === 0 ? 0 : rating === 1 ? 1 : rating === 2 ? [0, 1, 2, 4, 7, 14][box] : [0, 2, 4, 7, 14, 30][box]
    const due = new Date(Date.now() + (rating === 0 ? 10 * 60 * 1000 : days * 86400000)).toISOString()
    const { error } = await supabase.from('user_progress').upsert({ user_id: session.user.id, flashcard_id: activeCard.id, box, last_rating: rating, due_at: due, reviewed_at: new Date().toISOString() }, { onConflict: 'user_id,flashcard_id' })
    if (error) setMessage(error.message)
    else {
      setProgress(old => ({ ...old, [activeCard.id]: { user_id: session.user.id, flashcard_id: activeCard.id, box, last_rating: rating, due_at: due } }))
      setCurrent(0); setRevealed(false)
    }
  }

  if (!isConfigured) return <SetupScreen />
  if (authLoading) return <div className="center-screen">Ładuję Hola Juntos…</div>
  if (!session) return <main className="auth-shell"><div className="brand-mark">¡Hola!</div><p className="eyebrow">HISZPAŃSKI WE DWOJE</p><h1>Małe słówka.<br/>Duży progres.</h1><p className="muted">Wspólna biblioteka fiszek, osobne tempo nauki.</p><form className="panel auth-form" onSubmit={submitAuth}><h2>{authMode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</h2><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label><label>Hasło<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength="6" required autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} /></label><button className="primary" disabled={busy}>{busy ? 'Chwila…' : authMode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}</button><button type="button" className="text-button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setMessage('') }}>{authMode === 'login' ? 'Nie masz konta? Utwórz je' : 'Masz już konto? Zaloguj się'}</button>{message && <p className="notice">{message}</p>}</form><p className="tiny muted">Prywatna przestrzeń do nauki. Wasze konta i postępy są oddzielne.</p></main>

  return <div className="app-shell"><header className="topbar"><div className="brand-small"><span className="brand-dot">H!</span><span>hola <b>juntos</b></span></div><button className="avatar" title="Wyloguj" onClick={() => supabase.auth.signOut()}>{(session.user.email || '?')[0].toUpperCase()}</button></header>
    {!group ? <main className="content narrow"><p className="eyebrow">PIERWSZY KROK</p><h1>Stwórzcie swoją<br/>przestrzeń do nauki.</h1><p className="muted">Jedna osoba tworzy grupę i udostępnia kod drugiej. Słówka będą wspólne, postęp — osobny.</p><section className="panel"><h2>Utwórz wspólną bazę</h2><p className="muted">Załóż grupę „Nasze fiszki”. Kod zaproszenia pokaże się po utworzeniu.</p><button className="primary" onClick={createGroup} disabled={busy}>{busy ? 'Tworzę…' : 'Utwórz bazę'}</button></section><section className="panel"><h2>Dołącz do bazy</h2><form onSubmit={joinGroup}><label>Kod zaproszenia<input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Wklej kod od drugiej osoby" required /></label><button className="secondary" disabled={busy}>Dołącz do grupy</button></form></section>{message && <p className="notice">{message}</p>}</main> : <><main className="content"><section className="welcome"><div><p className="eyebrow">¡BUENOS DÍAS!</p><h1>¡Hola! <span>👋</span></h1><p className="muted">Każde słówko to mały krok naprzód.</p></div><div className="today-badge"><span>{dueCards.length}</span><small>do nauki</small></div></section>
      <section className="stats-grid"><div className="stat-card"><span className="stat-icon">📚</span><strong>{cards.length}</strong><small>fiszek w bazie</small></div><div className="stat-card"><span className="stat-icon">🧠</span><strong>{Object.values(progress).filter(p => p.box >= 4).length}</strong><small>dobrze znanych</small></div><div className="stat-card"><span className="stat-icon">✨</span><strong>{new Set(cards.map(c => c.topic)).size}</strong><small>tematów</small></div></section>
      <nav className="tabs"><button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>Nauka</button><button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>Fiszki</button><button className={tab === 'add' ? 'active' : ''} onClick={() => { setTab('add'); setEditing(null); setForm({ pl: '', es: '', phonetic: '', topic: 'Podstawowe' }) }}>+ Dodaj</button><button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>Grupa</button></nav>
      {tab === 'learn' && <section className="learn-section"><div className="section-heading"><div><p className="eyebrow">TWOJA SESJA</p><h2>Czas na powtórkę</h2></div><select value={filter} onChange={e => { setFilter(e.target.value); setCurrent(0); setRevealed(false) }}><option value="all">Wszystkie przeznaczone</option>{boxNames.map((n, i) => <option key={n} value={i + 1}>Przegródka {i + 1}</option>)}</select></div>{!activeCard ? <div className="empty-state"><div>🎉</div><h3>Na dziś wszystko!</h3><p className="muted">Dodajcie nowe słówka albo wróćcie później.</p><button className="secondary" onClick={() => setTab('add')}>Dodaj fiszkę</button></div> : <><div className="card-count">FISZKA {current + 1} / {learnCards.length} <span>• {activeCard.topic}</span></div><div className="flashcard"><span className="card-label">JAK POWIESZ PO HISZPAŃSKU?</span><h2>{activeCard.polish}</h2>{revealed ? <div className="answer"><div className="answer-divider"/><h3>{activeCard.spanish}</h3>{activeCard.phonetic && <p className="phonetic">/{activeCard.phonetic}/</p>}<button className="speak-button" onClick={() => { const utterance = new SpeechSynthesisUtterance(activeCard.spanish); utterance.lang = 'es-ES'; window.speechSynthesis.speak(utterance) }}>🔊 Posłuchaj wymowy</button></div> : <button className="reveal-button" onClick={() => setRevealed(true)}>Pokaż odpowiedź <span>↓</span></button>}</div>{revealed && <><p className="rate-prompt">Jak dobrze znasz to słowo?</p><div className="rating-grid">{ratings.map(r => <button key={r.value} className={`rating rating-${r.value}`} onClick={() => rateCard(r.value)}><span>{['😵','😕','🙂','😎'][r.value]}</span>{r.label}</button>)}</div></>}</>}</section>}
      {tab === 'cards' && <section><div className="section-heading"><div><p className="eyebrow">WSPÓLNA BIBLIOTEKA</p><h2>Wasze fiszki</h2></div><button className="primary compact" onClick={() => setTab('add')}>+ Dodaj</button></div>{cards.length === 0 ? <p className="muted">Na razie brak fiszek. Dodajcie pierwsze słówka!</p> : <div className="word-list">{cards.map(c => <article className="word-row" key={c.id}><div className="word-letters"><strong>{c.polish}</strong><span>{c.spanish}</span><small>{c.topic}{c.phonetic ? ` · ${c.phonetic}` : ''}</small></div><div className="word-actions"><button title="Edytuj" onClick={() => editCard(c)}>✎</button><button title="Usuń" onClick={() => deleteCard(c.id)}>×</button></div></article>)}</div>}</section>}
      {tab === 'add' && <section className="panel form-panel"><p className="eyebrow">NOWA FISZKA</p><h2>{editing ? 'Edytuj słówko' : 'Dodaj słówko do bazy'}</h2><p className="muted">Każde z Was może rozbudowywać wspólną bibliotekę.</p><form onSubmit={saveCard}><label>Po polsku<input value={form.pl} onChange={e => setForm({ ...form, pl: e.target.value })} placeholder="np. okno" required /></label><label>Po hiszpańsku<input value={form.es} onChange={e => setForm({ ...form, es: e.target.value })} placeholder="np. la ventana" required /></label><label>Fonetyka (opcjonalnie)<input value={form.phonetic} onChange={e => setForm({ ...form, phonetic: e.target.value })} placeholder="np. la ben-ta-na" /></label><label>Temat<input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="np. Dom, jedzenie, podróże" /></label><button className="primary" disabled={busy}>{busy ? 'Zapisuję…' : editing ? 'Zapisz zmiany' : 'Dodaj fiszkę'}</button>{editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setForm({ pl: '', es: '', phonetic: '', topic: 'Podstawowe' }) }}>Anuluj edycję</button>}</form></section>}
      {tab === 'group' && <section className="panel form-panel"><p className="eyebrow">WSPÓLNA PRZESTRZEŃ</p><h2>{group.name}</h2><p className="muted">Udostępnijcie ten kod drugiej osobie, aby dołączyła do tej samej biblioteki.</p><div className="invite-code">{group.invite_code}</div><button className="secondary" onClick={() => navigator.clipboard.writeText(group.invite_code).then(() => setMessage('Skopiowano kod zaproszenia.'))}>Kopiuj kod</button><div className="tip-box"><strong>Jak dołączyć?</strong><ol><li>Druga osoba tworzy konto w aplikacji.</li><li>Wybiera „Dołącz do bazy”.</li><li>Wkleja powyższy kod.</li></ol></div>{message && <p className="notice">{message}</p>}</section>}
      {message && <p className="notice global-notice">{message}</p>}
    </main><footer className="bottom-note">Hecho con cariño <span>♥</span> · Uczcie się we własnym tempie</footer></>}
  </div>
}

function SetupScreen() {
  return <main className="setup-shell"><div className="brand-mark">¡Hola!</div><p className="eyebrow">PIERWSZE URUCHOMIENIE</p><h1>Połączmy aplikację<br/>z Waszą bazą.</h1><p className="muted">Projekt działa lokalnie, ale potrzebuje konfiguracji Supabase, żeby zapisywać wspólne fiszki i konta.</p><div className="panel"><h2>Co teraz zrobić?</h2><ol className="setup-steps"><li>Utwórz projekt w <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Supabase</a>.</li><li>Otwórz SQL Editor i uruchom zawartość pliku <code>supabase/schema.sql</code>.</li><li>Skopiuj `.env.example` do `.env.local` i wpisz adres projektu oraz klucz publishable.</li><li>Uruchom ponownie serwer poleceniem <code>npm run dev</code>.</li></ol><p className="notice">Nie wpisuj do aplikacji klucza service_role ani klucza secret.</p></div></main>
}
