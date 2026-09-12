import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Delete,
  ExternalLink,
  FileAudio,
  History,
  MoreHorizontal,
  Phone,
  PhoneCall,
  PhoneOff,
  Settings,
  X,
} from 'lucide-react'
import './App.css'

type Stage = 'dial' | 'calling' | 'result'
type Connection = 'Atendida' | 'Não atendida' | 'Ocupado' | 'Caixa postal' | 'Falha'
type ApiState = 'loading' | 'online' | 'offline'

type CallRecord = {
  id: string
  remote_number_display: string
  status: string
  started_at: string
  talk_duration_seconds: number | null
  session_duration_seconds: number | null
}

const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'
const dialerMode = import.meta.env.VITE_DIALER_MODE === 'external' ? 'external' : 'mock'

const statusLabels: Record<string, string> = {
  created: 'Criada',
  handed_off: 'Enviada ao discador',
  completed: 'Atendida',
  missed: 'Não atendida',
  busy: 'Ocupado',
  voicemail: 'Caixa postal',
  failed: 'Falhou',
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const rest = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function ExtensionHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={compact ? 'extension-header compact' : 'extension-header'}>
      <div className="brand"><img className="brand-logo" src="/callangos-logo-light.png" alt="Callangos — Bora ligar parça?" /></div>
      <button className="icon-button" aria-label="Configurações"><Settings size={18} /></button>
    </header>
  )
}

function DialScreen({
  phone,
  setPhone,
  onCall,
  recentCalls,
  apiState,
  error,
}: {
  phone: string
  setPhone: (value: string) => void
  onCall: () => Promise<void>
  recentCalls: CallRecord[]
  apiState: ApiState
  error: string
}) {
  const [showKeypad, setShowKeypad] = useState(false)
  const [starting, setStarting] = useState(false)
  const valid = phone.replace(/\D/g, '').length >= 10

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || starting) return
    setStarting(true)
    await onCall()
    setStarting(false)
  }

  function appendDigit(digit: string) {
    setPhone(`${phone.replace(/\D/g, '')}${digit}`.slice(0, 11))
  }

  return (
    <main className="extension-content">
      <div className="mode-row">
        <span className={apiState === 'online' ? 'mode-chip ready' : 'mode-chip'}><i />{apiState === 'online' ? 'API CONECTADA' : apiState === 'loading' ? 'CONECTANDO' : 'API OFFLINE'}</span>
        <span className="ramal-label">Ramal 2001</span>
      </div>
      <section className="dial-hero"><span className="pixel-kicker">CHAMA AÍ</span><h1>O próximo “alô” vai para quem?</h1><p>Digite ou cole um telefone com DDD.</p></section>
      {error && <div className="error-banner"><AlertCircle size={15} />{error}</div>}
      <form className="dial-form" onSubmit={submit}>
        <label className="dial-field"><span>+55</span><input value={formatPhone(phone)} onChange={(event) => setPhone(event.target.value)} placeholder="(15) 99999-9999" inputMode="tel" autoFocus aria-label="Telefone com DDD" />{phone && <button type="button" onClick={() => setPhone('')} aria-label="Limpar telefone"><X size={16} /></button>}</label>
        <button className="keypad-toggle" type="button" onClick={() => setShowKeypad((current) => !current)}>{showKeypad ? 'Fechar teclado' : 'Abrir teclado'}<ChevronDown className={showKeypad ? 'rotated' : ''} size={15} /></button>
        {showKeypad && <div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => <button type="button" key={digit} onClick={() => appendDigit(digit)}>{digit}</button>)}<button className="delete-key" type="button" onClick={() => setPhone(phone.replace(/\D/g, '').slice(0, -1))}><Delete size={17} /></button></div>}
        <button className="call-button" type="submit" disabled={!valid || starting || apiState !== 'online'}><Phone size={19} />{starting ? 'Registrando…' : 'Ligar agora'}</button>
        <small className="dial-helper">{dialerMode === 'external' ? 'O número será entregue ao softphone padrão.' : 'Modo seguro: registra sem abrir uma chamada real.'}</small>
      </form>
      <section className="recent-section">
        <div className="section-heading"><span><History size={15} /> Recentes</span><small>Histórico técnico</small></div>
        <div className="recent-list">{recentCalls.slice(0, 3).map((call) => <button className="recent-call" key={call.id} onClick={() => setPhone(call.remote_number_display)}><span className="contact-avatar"><PhoneCall size={15} /></span><span className="recent-copy"><strong>{call.remote_number_display}</strong><small>{formatTime(call.started_at)} · {statusLabels[call.status] ?? call.status}</small></span><Phone size={16} /></button>)}</div>
      </section>
    </main>
  )
}

function CallingScreen({ phone, seconds, onFinish, onCancel }: { phone: string; seconds: number; onFinish: () => void; onCancel: () => void }) {
  return (
    <main className="calling-screen">
      <div className="calling-top"><button className="icon-button light" onClick={onCancel} aria-label="Cancelar"><ArrowLeft size={18} /></button><span className="session-label">SESSÃO REGISTRADA</span><button className="icon-button light" aria-label="Mais opções"><MoreHorizontal size={18} /></button></div>
      <div className="signal-animation" aria-hidden="true"><i /><i /><i /><span><PhoneCall size={26} /></span></div>
      <span className="calling-status"><i />Entregue ao softphone</span><h1>{formatPhone(phone)}</h1><p>Chamada vinculada ao histórico</p><strong className="timer">{formatTimer(seconds)}</strong><small>tempo da sessão · aguardando operadora</small>
      <div className="calling-note"><ExternalLink size={16} /><span><strong>O áudio acontece no softphone</strong><small>Finalize aqui depois de desligar por lá.</small></span></div>
      <button className="finish-button" onClick={onFinish}><PhoneOff size={19} />Finalizar e registrar status</button>
    </main>
  )
}

function ResultScreen({ phone, seconds, saving, onSave, onBack }: { phone: string; seconds: number; saving: boolean; onSave: (connection: Connection, note: string) => Promise<void>; onBack: () => void }) {
  const [connection, setConnection] = useState<Connection | ''>('')
  const [note, setNote] = useState('')
  return (
    <main className="result-screen">
      <div className="result-heading"><button className="icon-button" onClick={onBack} aria-label="Voltar"><ArrowLeft size={18} /></button><div><span className="pixel-kicker">PÓS-LIGAÇÃO</span><h1>Como terminou?</h1></div><span className="result-duration"><Clock3 size={14} /> {formatTimer(seconds)}</span></div>
      <div className="result-contact"><span><PhoneCall size={19} /></span><div><strong>{formatPhone(phone)}</strong><small>Ligação de saída · registro manual</small></div></div>
      <section className="form-section"><label>Status da ligação</label><div className="connection-options">{(['Atendida', 'Não atendida', 'Ocupado', 'Caixa postal', 'Falha'] as Connection[]).map((option) => <button className={connection === option ? 'selected' : ''} key={option} onClick={() => setConnection(option)}>{connection === option && <Check size={13} />}{option}</button>)}</div></section>
      <section className="form-section"><label htmlFor="note">Observação técnica <em>opcional</em></label><textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: áudio baixo, chamada caiu, número inválido…" rows={3} /></section>
      <div className="recording-notice"><FileAudio size={17} /><span><strong>Gravação pela operadora</strong><small>O Callangos tentará sincronizar quando a BR DID disponibilizar.</small></span></div>
      <button className="save-button" disabled={!connection || saving} onClick={() => connection && onSave(connection, note)}><Check size={18} />{saving ? 'Salvando…' : 'Salvar ligação'}</button>
    </main>
  )
}

function App() {
  const [stage, setStage] = useState<Stage>('dial')
  const [phone, setPhone] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [callId, setCallId] = useState<string | null>(null)
  const [apiState, setApiState] = useState<ApiState>('loading')
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([])
  const [error, setError] = useState('')

  async function loadRecentCalls() {
    try {
      const response = await apiRequest<{ data: CallRecord[] }>('/api/v1/calls?limit=3')
      setRecentCalls(response.data)
      setApiState('online')
    } catch {
      setApiState('offline')
    }
  }

  // A primeira leitura sincroniza o painel com a API compartilhada.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadRecentCalls() }, [])
  useEffect(() => { if (stage !== 'calling') return; const interval = window.setInterval(() => setSeconds((current) => current + 1), 1000); return () => window.clearInterval(interval) }, [stage])

  const dialUrl = useMemo(() => `tel:+55${phone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')}`, [phone])

  async function startCall() {
    setError('')
    try {
      const created = await apiRequest<{ data: { id: string; dialUrl: string } }>('/api/v1/calls', { method: 'POST', body: JSON.stringify({ phone, source: 'extension', direction: 'outbound' }) })
      await apiRequest(`/api/v1/calls/${created.data.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'handed_off', dataSource: 'manual' }) })
      setCallId(created.data.id)
      setSeconds(0)
      setStage('calling')
      if (dialerMode === 'external') window.location.href = created.data.dialUrl || dialUrl
    } catch {
      setError('Não foi possível registrar. Confirme se a API está ligada.')
      setApiState('offline')
    }
  }

  function reset() {
    setPhone(''); setSeconds(0); setSaved(false); setCallId(null); setError(''); setStage('dial'); void loadRecentCalls()
  }

  async function saveResult(connection: Connection, note: string) {
    if (!callId) return
    const statuses: Record<Connection, string> = { Atendida: 'completed', 'Não atendida': 'missed', Ocupado: 'busy', 'Caixa postal': 'voicemail', Falha: 'failed' }
    setSaving(true)
    try {
      await apiRequest(`/api/v1/calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ status: statuses[connection], sessionDurationSeconds: seconds, talkDurationSeconds: connection === 'Atendida' ? seconds : 0, notes: note || null, dataSource: 'manual' }) })
      setSaved(true)
      window.setTimeout(reset, 1500)
    } catch {
      setError('Não foi possível salvar o status da ligação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={stage === 'calling' ? 'extension-shell dark' : 'extension-shell'}>
      {stage !== 'calling' && <ExtensionHeader compact={stage === 'result'} />}
      {stage === 'dial' && <DialScreen phone={phone} setPhone={setPhone} onCall={startCall} recentCalls={recentCalls} apiState={apiState} error={error} />}
      {stage === 'calling' && <CallingScreen phone={phone} seconds={seconds} onFinish={() => setStage('result')} onCancel={reset} />}
      {stage === 'result' && <ResultScreen phone={phone} seconds={seconds} saving={saving} onSave={saveResult} onBack={() => setStage('calling')} />}
      {saved && <div className="saved-overlay"><span><Check size={26} /></span><strong>Registrado!</strong><small>A ligação já está no histórico.</small></div>}
    </div>
  )
}

export default App
