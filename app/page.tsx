'use client'

import { useState, useEffect } from 'react'
import { Upload, BookOpen, Play, Plus, Trash2 } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type Card = {
  id: string
  front: string
  back: string
  interval: number
  repetitions: number
  easeFactor: number
  nextReview: number
  lastRating?: number
}

type Deck = {
  id: string
  name: string
  source: string
  cards: Card[]
  createdAt: number
  color: string
}

type View = 'home' | 'decks' | 'mode-select' | 'flashcard' | 'quiz' | 'results' | 'quiz-results'

const DECK_COLORS = ['#7c6af7', '#4ade80', '#f472b6', '#fb923c', '#38bdf8', '#a78bfa']

// ─── SM-2 ────────────────────────────────────────────────────────────────────

function sm2(card: Card, quality: number): Card {
  const q = [0, 2, 4, 5][quality]
  let { interval, repetitions, easeFactor } = card
  if (q < 3) { repetitions = 0; interval = 1 }
  else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)
    repetitions += 1
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  return { ...card, interval, repetitions, easeFactor, nextReview: Date.now() + interval * 86400000, lastRating: quality }
}

function isDue(card: Card) { return card.nextReview <= Date.now() }
function getMastery(card: Card) {
  if (card.repetitions === 0) return 'new'
  if (card.interval >= 21) return 'mastered'
  return 'learning'
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadDecks(): Deck[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('flashforge_decks') || '[]') } catch { return [] }
}
function saveDecks(decks: Deck[]) { localStorage.setItem('flashforge_decks', JSON.stringify(decks)) }

// ─── Quiz option generator ────────────────────────────────────────────────────

function generateOptions(cards: Card[], correctCard: Card): string[] {
  const wrong = cards
    .filter(c => c.id !== correctCard.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(c => c.back)
  return [...wrong, correctCard.back].sort(() => Math.random() - 0.5)
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ value, size = 44, stroke = 3, color = '#7c6af7' }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2e2e2e" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.5s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  )
}

// ─── Upload View ──────────────────────────────────────────────────────────────

function UploadView({ onDeckCreated }: { onDeckCreated: (deck: Deck) => void }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [deckName, setDeckName] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.pdf')) { setError('Please upload a PDF file.'); return }
    setFile(f); setDeckName(f.name.replace('.pdf', '')); setError('')
  }

  const generate = async () => {
    if (!file) return
    setLoading(true); setError(''); setProgress('Reading PDF...')
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('deckName', deckName || file.name.replace('.pdf', ''))
      setProgress('Claude is writing your flashcards...')
      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Generation failed') }
      const data = await res.json()
      const color = DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)]
      const deck: Deck = {
        id: Date.now().toString(),
        name: deckName || file.name.replace('.pdf', ''),
        source: file.name,
        cards: data.cards.map((c: { front: string; back: string }, i: number) => ({
          id: `${Date.now()}-${i}`, front: c.front, back: c.back,
          interval: 0, repetitions: 0, easeFactor: 2.5, nextReview: Date.now(),
        })),
        createdAt: Date.now(), color,
      }
      onDeckCreated(deck)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setLoading(false); setProgress('') }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', background: 'linear-gradient(135deg, #7c6af7, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          FlashForge
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Drop a PDF. Get smart flashcards. Master anything.</p>
      </div>

      <div
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => document.getElementById('pdf-input')?.click()}
        style={{
          border: `2px dashed ${dragging ? '#7c6af7' : file ? '#4ade80' : 'var(--border)'}`,
          borderRadius: 16, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
          background: dragging ? 'var(--accent-soft)' : file ? '#052e16' : 'var(--surface)',
          transition: 'all 0.2s ease', marginBottom: 20,
        }}
      >
        <input id="pdf-input" type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <Upload size={32} style={{ color: file ? '#4ade80' : 'var(--text-muted)', margin: '0 auto 12px', display: 'block' }} />
        {file ? (
          <><div style={{ fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>✓ {file.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB · Click to change</div></>
        ) : (
          <><div style={{ fontWeight: 500, marginBottom: 4 }}>Drop your PDF here</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>or click to browse</div></>
        )}
      </div>

      {file && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Deck name</label>
          <input value={deckName} onChange={e => setDeckName(e.target.value)}
            placeholder="e.g. Chapter 5 — Quadratic Equations"
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', background: 'var(--red-soft)', border: '1px solid #7f1d1d', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>{error}</div>}

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          <div style={{ marginBottom: 8 }}>{progress}</div>
          <div style={{ width: '100%', height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: '60%' }} />
          </div>
        </div>
      )}

      <button className="btn-primary" onClick={generate} disabled={!file || loading}
        style={{ width: '100%', padding: '14px', fontSize: 15, opacity: (!file || loading) ? 0.5 : 1 }}>
        {loading ? 'Generating cards...' : '✨ Generate Flashcards'}
      </button>
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        Powered by Claude AI · Typically 15–25 cards per PDF
      </p>
    </div>
  )
}

// ─── Mode Select ──────────────────────────────────────────────────────────────

function ModeSelectView({ deck, onSelectMode, onBack }: {
  deck: Deck; onSelectMode: (mode: 'flashcard' | 'quiz') => void; onBack: () => void
}) {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>{deck.name}</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Choose your mode</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 40, fontSize: 15 }}>{deck.cards.length} cards ready</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {[
          { mode: 'flashcard' as const, emoji: '🃏', title: 'Flashcard', desc: 'Flip cards, rate yourself. Spaced repetition schedules your reviews.', tag: 'SM-2 Algorithm', tagColor: '#7c6af7', hoverBorder: '#7c6af7', hoverBg: 'var(--accent-soft)' },
          { mode: 'quiz' as const, emoji: '🎯', title: 'Quiz', desc: '4 options per question. Instant feedback. Track your score and streak.', tag: 'Multiple Choice', tagColor: '#4ade80', hoverBorder: '#4ade80', hoverBg: '#052e16' },
        ].map(m => (
          <button key={m.mode} onClick={() => onSelectMode(m.mode)} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '28px 20px', cursor: 'pointer', textAlign: 'center', color: 'var(--text)', transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${m.hoverBorder}`; e.currentTarget.style.background = m.hoverBg }}
            onMouseLeave={e => { e.currentTarget.style.border = '1px solid var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>{m.emoji}</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{m.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>{m.desc}</div>
            <div style={{ fontSize: 11, color: m.tagColor, fontWeight: 500 }}>{m.tag}</div>
          </button>
        ))}
      </div>
      <button className="btn-ghost" onClick={onBack}>← Back to decks</button>
    </div>
  )
}

// ─── Flashcard View ───────────────────────────────────────────────────────────

function FlashcardView({ deck, onFinish, onUpdateDeck }: {
  deck: Deck; onFinish: (r: { correct: number; total: number }) => void; onUpdateDeck: (d: Deck) => void
}) {
  const queue = deck.cards.filter(isDue).length > 0 ? deck.cards.filter(isDue) : deck.cards.slice(0, 10)
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [answered, setAnswered] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')

  const current = queue[idx]
  if (!current) { onFinish({ correct: 0, total: 0 }); return null }

  const rate = (quality: number) => {
    const updated = sm2(current, quality)
    onUpdateDeck({ ...deck, cards: deck.cards.map(c => c.id === current.id ? updated : c) })
    const correct = answered + (quality >= 2 ? 1 : 0)
    if (idx + 1 >= queue.length) { onFinish({ correct, total: queue.length }) }
    else { setIdx(i => i + 1); setFlipped(false); setUserAnswer('') }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{deck.name} · 🃏 Flashcard</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{idx + 1} / {queue.length}</div>
        </div>
        <button className="btn-ghost" onClick={() => onFinish({ correct: answered, total: idx })} style={{ padding: '6px 12px', fontSize: 13 }}>End session</button>
      </div>

      <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(idx / queue.length) * 100}%`, background: deck.color, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>

      {/* Card */}
      <div className="card-flip" style={{ height: 220, marginBottom: 20 }} onClick={() => !flipped && setFlipped(true)}>
        <div className={`card-inner ${flipped ? 'flipped' : ''}`}>
          <div className="card-face" style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: flipped ? 'default' : 'pointer' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 16 }}>Question</div>
              <div style={{ fontSize: 18, lineHeight: 1.5, fontWeight: 500 }}>{current.front}</div>
              {!flipped && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>Click to reveal</div>}
            </div>
          </div>
          <div className="card-face card-back" style={{ background: `${deck.color}11`, border: `1px solid ${deck.color}44` }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: deck.color, marginBottom: 16, opacity: 0.8 }}>Answer</div>
              <div style={{ fontSize: 18, lineHeight: 1.5 }}>{current.back}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Type answer (optional) */}
      {!flipped && (
        <div style={{ marginBottom: 16 }}>
          <input value={userAnswer} onChange={e => setUserAnswer(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setFlipped(true)}
            placeholder="Type your answer (optional), then press Enter..."
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Answer comparison */}
      {flipped && userAnswer && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#3d0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#f87171', marginBottom: 4 }}>YOUR ANSWER</div>
            <div style={{ fontSize: 13, color: '#fca5a5' }}>{userAnswer}</div>
          </div>
          <div style={{ background: '#052e16', border: '1px solid #14532d', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: '#4ade80', marginBottom: 4 }}>CORRECT ANSWER</div>
            <div style={{ fontSize: 13, color: '#86efac' }}>{current.back}</div>
          </div>
        </div>
      )}

      {/* Rating buttons */}
      {flipped ? (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 10 }}>How well did you know this?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Again', sub: '<1d', color: '#f87171', bg: '#3d0a0a', q: 0 },
              { label: 'Hard', sub: '~1d', color: '#fbbf24', bg: '#3d2200', q: 1 },
              { label: 'Good', sub: `~${Math.max(1, Math.round(current.interval * current.easeFactor))}d`, color: '#4ade80', bg: '#052e16', q: 2 },
              { label: 'Easy', sub: `~${Math.max(4, Math.round(current.interval * current.easeFactor * 1.5))}d`, color: '#7c6af7', bg: '#1e1b4b', q: 3 },
            ].map(btn => (
              <button key={btn.q} onClick={() => rate(btn.q)} style={{
                background: btn.bg, border: `1px solid ${btn.color}44`, borderRadius: 12,
                padding: '12px 8px', cursor: 'pointer', color: btn.color, textAlign: 'center', transition: 'all 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{btn.label}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{btn.sub}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className="btn-primary" onClick={() => setFlipped(true)} style={{ width: '100%', padding: '12px' }}>Show Answer</button>
      )}
    </div>
  )
}

// ─── Quiz View ────────────────────────────────────────────────────────────────

type WrongAnswer = { question: string; correct: string; chosen: string }

function QuizView({ deck, onFinish }: {
  deck: Deck; onFinish: (r: { correct: number; total: number; wrong: WrongAnswer[] }) => void
}) {
  const cards = [...deck.cards].sort(() => Math.random() - 0.5)
  const [idx, setIdx] = useState(0)
  const [options, setOptions] = useState<string[]>(() => generateOptions(deck.cards, cards[0]))
  const [selected, setSelected] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [wrong, setWrong] = useState<WrongAnswer[]>([])
  const [showStreak, setShowStreak] = useState(false)

  const current = cards[idx]

  useEffect(() => {
    if (current) setOptions(generateOptions(deck.cards, current))
  }, [idx])

  const choose = (option: string) => {
    if (selected) return
    setSelected(option)
    const isCorrect = option === current.back
    let newScore = score
    let newWrong = wrong

    if (isCorrect) {
      newScore = score + 1
      setScore(newScore)
      const newStreak = streak + 1
      setStreak(newStreak)
      if (newStreak > bestStreak) setBestStreak(newStreak)
      if (newStreak > 1) { setShowStreak(true) }
    } else {
      setStreak(0)
      setShowStreak(false)
      newWrong = [...wrong, { question: current.front, correct: current.back, chosen: option }]
      setWrong(newWrong)
    }

    setTimeout(() => {
      setShowStreak(false)
      if (idx + 1 >= cards.length) {
        onFinish({ correct: newScore, total: cards.length, wrong: newWrong })
      } else {
        setIdx(i => i + 1)
        setSelected(null)
      }
    }, 1200)
  }

  if (!current || options.length === 0) return null

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{deck.name} · 🎯 Quiz</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{idx + 1} / {cards.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>{score}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>STREAK</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>🔥 {streak}</div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, marginBottom: 32, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(idx / cards.length) * 100}%`, background: deck.color, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>

      {/* Streak toast */}
      {showStreak && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>🔥 {streak} in a row! Keep going!</span>
        </div>
      )}

      {/* Question */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 24px', marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 12 }}>Question {idx + 1}</div>
        <div style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.5 }}>{current.front}</div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((opt, i) => {
          const isCorrect = opt === current.back
          const isSelected = opt === selected
          let bg = 'var(--surface)'
          let border = '1px solid var(--border)'
          let color = 'var(--text)'

          if (selected) {
            if (isCorrect) { bg = '#052e16'; border = '2px solid #4ade80'; color = '#4ade80' }
            else if (isSelected) { bg = '#3d0a0a'; border = '2px solid #f87171'; color = '#f87171' }
            else { color = 'var(--text-muted)' }
          }

          return (
            <button key={i} onClick={() => choose(opt)} style={{
              background: bg, border, borderRadius: 12, padding: '14px 18px',
              cursor: selected ? 'default' : 'pointer', color, fontSize: 15,
              textAlign: 'left', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 12,
            }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.border = `1px solid ${deck.color}` }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.border = '1px solid var(--border)' }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: selected ? 'transparent' : 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
                color: selected && isCorrect ? '#4ade80' : selected && isSelected ? '#f87171' : 'var(--text-muted)',
              }}>
                {selected ? (isCorrect ? '✓' : isSelected ? '✗' : ['A', 'B', 'C', 'D'][i]) : ['A', 'B', 'C', 'D'][i]}
              </span>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Deck List View ───────────────────────────────────────────────────────────

function DeckListView({ decks, onStudy, onDelete, onNew }: {
  decks: Deck[]; onStudy: (d: Deck) => void; onDelete: (id: string) => void; onNew: () => void
}) {
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px' }}>Your Decks</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>{decks.length} deck{decks.length !== 1 ? 's' : ''} · {decks.reduce((a, d) => a + d.cards.length, 0)} total cards</p>
        </div>
        <button className="btn-primary" onClick={onNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> New Deck
        </button>
      </div>

      {decks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
          <BookOpen size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
          <p>No decks yet. Upload a PDF to get started.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {decks.map(deck => {
          const dueCount = deck.cards.filter(isDue).length
          const mastered = deck.cards.filter(c => getMastery(c) === 'mastered').length
          const masteryPct = deck.cards.length ? Math.round((mastered / deck.cards.length) * 100) : 0
          return (
            <div key={deck.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: deck.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: deck.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span>{deck.cards.length} cards</span>
                  <span style={{ color: masteryPct === 100 ? '#4ade80' : 'var(--text-muted)' }}>{masteryPct}% mastered</span>
                  {dueCount > 0 && <span style={{ color: '#fbbf24' }}>{dueCount} due today</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <ProgressRing value={masteryPct} color={deck.color} />
                <button className="btn-primary" onClick={() => onStudy(deck)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
                  <Play size={14} /> Study
                </button>
                <button onClick={() => onDelete(deck.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Flashcard Results ────────────────────────────────────────────────────────

function FlashcardResults({ results, deck, onContinue }: {
  results: { correct: number; total: number }; deck: Deck; onContinue: () => void
}) {
  const pct = results.total ? Math.round((results.correct / results.total) * 100) : 0
  const mastered = deck.cards.filter(c => getMastery(c) === 'mastered').length
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>{pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📚'}</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Session complete!</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>You answered {results.correct} of {results.total} correctly</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Score', value: `${pct}%`, color: pct >= 80 ? '#4ade80' : '#fbbf24' },
          { label: 'Mastered', value: `${mastered}/${deck.cards.length}`, color: '#7c6af7' },
          { label: 'New', value: deck.cards.filter(c => getMastery(c) === 'new').length, color: '#38bdf8' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: 'var(--text-muted)' }}>Overall mastery</span>
          <span style={{ color: deck.color }}>{Math.round((mastered / deck.cards.length) * 100)}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(mastered / deck.cards.length) * 100}%`, background: deck.color, borderRadius: 3 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>🔵 {deck.cards.filter(c => getMastery(c) === 'new').length} new</span>
          <span>🟡 {deck.cards.filter(c => getMastery(c) === 'learning').length} learning</span>
          <span>🟢 {mastered} mastered</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={onContinue}>Back to decks</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={onContinue}>Study again</button>
      </div>
    </div>
  )
}

// ─── Quiz Results ─────────────────────────────────────────────────────────────

function QuizResults({ results, deck, onContinue }: {
  results: { correct: number; total: number; wrong: WrongAnswer[] }; deck: Deck; onContinue: () => void
}) {
  const pct = Math.round((results.correct / results.total) * 100)
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '60px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>{pct === 100 ? '🏆' : pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📚'}</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Quiz complete!</h2>
        <div style={{ fontSize: 48, fontWeight: 800, color: pct >= 80 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171', marginBottom: 4 }}>{pct}%</div>
        <p style={{ color: 'var(--text-muted)' }}>{results.correct} correct out of {results.total} questions</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Correct', value: results.correct, color: '#4ade80' },
          { label: 'Wrong', value: results.total - results.correct, color: '#f87171' },
          { label: 'Accuracy', value: `${pct}%`, color: deck.color },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {results.wrong.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-muted)' }}>Review your mistakes ({results.wrong.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.wrong.map((w, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{w.question}</div>
                <div style={{ fontSize: 13, color: '#f87171', marginBottom: 4 }}>✗ You chose: {w.chosen}</div>
                <div style={{ fontSize: 13, color: '#4ade80' }}>✓ Correct: {w.correct}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={onContinue}>Back to decks</button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={onContinue}>Try again</button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('home')
  const [decks, setDecks] = useState<Deck[]>([])
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null)
  const [flashcardResults, setFlashcardResults] = useState<{ correct: number; total: number } | null>(null)
  const [quizResults, setQuizResults] = useState<{ correct: number; total: number; wrong: WrongAnswer[] } | null>(null)

  useEffect(() => {
    const saved = loadDecks()
    setDecks(saved)
    if (saved.length > 0) setView('decks')
  }, [])

  const handleDeckCreated = (deck: Deck) => {
    const newDecks = [...decks, deck]
    setDecks(newDecks); saveDecks(newDecks); setActiveDeck(deck); setView('mode-select')
  }

  const handleUpdateDeck = (updated: Deck) => {
    const newDecks = decks.map(d => d.id === updated.id ? updated : d)
    setDecks(newDecks); saveDecks(newDecks); setActiveDeck(updated)
  }

  const totalDue = decks.reduce((a, d) => a + d.cards.filter(isDue).length, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {view !== 'flashcard' && view !== 'quiz' && (
        <nav style={{ borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center', height: 56, gap: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 16, cursor: 'pointer', color: 'var(--accent)' }}
            onClick={() => setView(decks.length > 0 ? 'decks' : 'home')}>⚡ FlashForge</div>
          <div style={{ flex: 1 }} />
          {decks.length > 0 && (
            <>
              <button onClick={() => setView('decks')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={15} /> Decks
                {totalDue > 0 && <span style={{ background: '#fbbf24', color: '#000', borderRadius: 99, fontSize: 11, padding: '1px 6px', fontWeight: 600 }}>{totalDue}</span>}
              </button>
              <button onClick={() => setView('home')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={15} /> Upload
              </button>
            </>
          )}
        </nav>
      )}

      {view === 'home' && <UploadView onDeckCreated={handleDeckCreated} />}
      {view === 'decks' && <DeckListView decks={decks} onStudy={deck => { setActiveDeck(deck); setView('mode-select') }} onDelete={id => { const n = decks.filter(d => d.id !== id); setDecks(n); saveDecks(n) }} onNew={() => setView('home')} />}
      {view === 'mode-select' && activeDeck && <ModeSelectView deck={activeDeck} onSelectMode={mode => setView(mode)} onBack={() => setView('decks')} />}
      {view === 'flashcard' && activeDeck && <FlashcardView deck={activeDeck} onFinish={r => { setFlashcardResults(r); setView('results') }} onUpdateDeck={handleUpdateDeck} />}
      {view === 'quiz' && activeDeck && <QuizView deck={activeDeck} onFinish={r => { setQuizResults(r); setView('quiz-results') }} />}
      {view === 'results' && activeDeck && flashcardResults && <FlashcardResults results={flashcardResults} deck={activeDeck} onContinue={() => setView('decks')} />}
      {view === 'quiz-results' && activeDeck && quizResults && <QuizResults results={quizResults} deck={activeDeck} onContinue={() => setView('decks')} />}
    </div>
  )
}
