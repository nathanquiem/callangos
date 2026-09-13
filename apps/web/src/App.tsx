import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileAudio,
  Filter,
  Headphones,
  History,
  KeyRound,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  PhoneCall,
  Play,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react'
import { HourlyChart, SignalChart, StatusDonut } from './Charts'
import {
  apiRequest,
  externalDialing,
  filterQuery,
  initialFilters,
} from './api'
import type {
  ApiToken,
  AuthUser,
  CallRecord,
  DashboardData,
  FilterState,
  Page,
  RecordingRecord,
  SettingsData,
  TelephonyData,
  UserRecord,
  WebhookRecord,
} from './api'
import './App.css'

type ApiState = 'loading' | 'online' | 'offline'

const emptyDashboard: DashboardData = {
  summary: { total_calls: 0, answered_calls: 0, unanswered_calls: 0, inbound_calls: 0, outbound_calls: 0, recordings_available: 0, talk_seconds: 0, session_seconds: 0, average_talk_seconds: 0, unique_numbers: 0 },
  byStatus: [], byDay: [], byHour: [], byDuration: [], byUser: [],
}

const navItems = [
  { id: 'dialer', label: 'Discador', icon: Phone },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'recordings', label: 'Gravações', icon: FileAudio },
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'telephony', label: 'Telefonia', icon: Headphones },
  { id: 'api', label: 'API', icon: Code2 },
  { id: 'settings', label: 'Configurações', icon: Settings },
] as const

const statusMeta: Record<string, { label: string; tone: string }> = {
  created: { label: 'Criada', tone: 'blue' }, handed_off: { label: 'Enviada', tone: 'blue' }, ringing: { label: 'Chamando', tone: 'yellow' }, answered: { label: 'Atendida', tone: 'green' }, completed: { label: 'Concluída', tone: 'green' }, missed: { label: 'Não atendida', tone: 'gray' }, busy: { label: 'Ocupado', tone: 'yellow' }, voicemail: { label: 'Caixa postal', tone: 'violet' }, failed: { label: 'Falhou', tone: 'red' }, canceled: { label: 'Cancelada', tone: 'gray' }, pending: { label: 'Pendente', tone: 'yellow' }, available: { label: 'Disponível', tone: 'green' },
}

function BrandMark() {
  return <img className="brand-mark" src="/callangos-mark.png" alt="" aria-hidden="true" />
}

function SidebarBrand() {
  return <div className="brand brand-assets" aria-label="Callangos — Bora ligar parça?"><img className="brand-lockup brand-lockup-light" src="/callangos-logo-light.png" alt="Callangos — Bora ligar parça?" /><img className="brand-lockup brand-lockup-dark" src="/callangos-logo-dark.png" alt="Callangos — Bora ligar parça?" /><img className="brand-symbol" src="/callangos-mark.png" alt="Callangos" /></div>
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
  const rest = (seconds % 60).toString().padStart(2, '0')
  return hours ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`
}

function formatWhen(value: string, detailed = false) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('pt-BR', detailed ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date).replace('.', '')
}

function StatusPill({ status }: { status: string }) {
  const meta = statusMeta[status] ?? { label: status, tone: 'gray' }
  return <span className={`status-pill ${meta.tone}`}>{meta.label}</span>
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

function StatCard({ icon, label, value, helper, accent }: { icon: ReactNode; label: string; value: string; helper: string; accent?: boolean }) {
  return <article className={accent ? 'stat-card accent-card' : 'stat-card'}><div className="stat-card-top"><span className="stat-icon">{icon}</span><MoreHorizontal size={18} /></div><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-helper">{helper}</span></article>
}

function SettingToggleRow({ active, title, text, onToggle }: { active: boolean; title: string; text: string; onToggle: () => void }) {
  return <button className="setting-row" onClick={onToggle}><span><strong>{title}</strong><small>{text}</small></span><i className={active ? 'switch on' : 'switch'}><b /></i></button>
}

function AnalyticsFilters({ filters, users, telephony, onChange, onApply }: { filters: FilterState; users: UserRecord[]; telephony: TelephonyData | null; onChange: (filters: FilterState) => void; onApply: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const set = (key: keyof FilterState, value: string) => onChange({ ...filters, [key]: value })
  return (
    <section className="analytics-filters">
      <div className="filter-primary">
        <label><CalendarDays size={16} /><select value={filters.period} onChange={(event) => set('period', event.target.value)}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last_7_days">Últimos 7 dias</option><option value="last_30_days">Últimos 30 dias</option><option value="this_week">Esta semana</option><option value="this_month">Este mês</option><option value="custom">Personalizado</option><option value="all">Todo o período</option></select></label>
        <label><PhoneCall size={16} /><select value={filters.direction} onChange={(event) => set('direction', event.target.value)}><option value="">Entrada e saída</option><option value="outbound">Saída</option><option value="inbound">Entrada</option></select></label>
        <label><Activity size={16} /><select value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">Todos os status</option><option value="completed">Concluída</option><option value="missed">Não atendida</option><option value="busy">Ocupado</option><option value="voicemail">Caixa postal</option><option value="failed">Falhou</option></select></label>
        <button className={expanded ? 'filter-more active' : 'filter-more'} onClick={() => setExpanded((value) => !value)}><SlidersHorizontal size={16} /> Mais filtros</button>
        <button className="primary-button apply-filter" onClick={onApply}><Filter size={16} /> Aplicar</button>
      </div>
      {filters.period === 'custom' && <div className="custom-dates"><label>De<input type="date" value={filters.dateFrom} onChange={(event) => set('dateFrom', event.target.value)} /></label><label>Até<input type="date" value={filters.dateTo} onChange={(event) => set('dateTo', event.target.value)} /></label></div>}
      {expanded && <div className="filter-secondary">
        <label><span>Usuário</span><select value={filters.userId} onChange={(event) => set('userId', event.target.value)}><option value="">Todos</option>{users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label>
        <label><span>Número utilizado</span><select value={filters.phoneNumberId} onChange={(event) => set('phoneNumberId', event.target.value)}><option value="">Todos</option>{telephony?.numbers.map((number) => <option value={number.id} key={number.id}>{number.label} · {number.display_number}</option>)}</select></label>
        <label><span>Número discado</span><input value={filters.phone} onChange={(event) => set('phone', event.target.value)} placeholder="DDD ou telefone" /></label>
        <label><span>Duração</span><select value={filters.duration} onChange={(event) => set('duration', event.target.value)}><option value="">Qualquer duração</option><option value="0_60">0 a 1 minuto</option><option value="61_300">1 a 5 minutos</option><option value="301_600">5 a 10 minutos</option><option value="601_plus">Mais de 10 minutos</option></select></label>
      </div>}
    </section>
  )
}

function CallsTable({ rows, onRecording }: { rows: CallRecord[]; onRecording: (recordingId: string) => void }) {
  return <div className="table-wrap"><table className="calls-table"><thead><tr><th>Destino</th><th>Usuário</th><th>Número usado</th><th>Início</th><th>Tipo</th><th>Status</th><th>Sessão</th><th>Falado</th><th>Gravação</th><th>Fonte</th></tr></thead><tbody>{rows.map((call) => <tr key={call.id}>
    <td><div className="number-cell"><span className={call.direction === 'outbound' ? 'call-icon outbound' : 'call-icon inbound'}><PhoneCall size={16} /></span><span><strong>{call.remote_number_display}</strong><small>{call.remote_number_e164}</small></span></div></td>
    <td><span className="user-cell">{call.user_name ?? 'Sistema'}<small>{call.external_extension ? `Ramal ${call.external_extension}` : 'Sem ramal'}</small></span></td>
    <td>{call.local_number_display ?? 'Não informado'}</td><td>{formatWhen(call.started_at, true)}</td><td>{call.direction === 'outbound' ? 'Saída' : 'Entrada'}</td><td><StatusPill status={call.status} /></td><td className="mono">{formatDuration(call.session_duration_seconds)}</td><td className="mono">{formatDuration(call.talk_duration_seconds)}</td>
    <td>{call.recording_id ? <button className="recording-link" onClick={() => onRecording(call.recording_id!)}><Play size={14} /> Ouvir</button> : call.recording_status === 'pending' ? <span className="pending-label"><Clock3 size={13} /> Pendente</span> : '—'}</td><td><span className="source-badge">{call.data_source === 'provider' ? 'Operadora' : call.source === 'extension' ? 'Extensão' : 'App'}</span></td>
  </tr>)}</tbody></table>{rows.length === 0 && <div className="empty-state">Nenhuma ligação encontrada com estes filtros.</div>}</div>
}

function DialerPage({ calls, telephony, settings, onRefresh, onNavigate, onNotify }: { calls: CallRecord[]; telephony: TelephonyData | null; settings: SettingsData | null; onRefresh: () => Promise<void>; onNavigate: (page: Page) => void; onNotify: (message: string) => void }) {
  const activeNumbers = telephony?.numbers.filter((number) => number.active) ?? []
  const [phone, setPhone] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [dialing, setDialing] = useState(false)
  const valid = phone.replace(/\D/g, '').length >= 10
  const selectedPhoneNumberId = phoneNumberId || activeNumbers[0]?.id || ''

  async function handleDial(event: FormEvent) {
    event.preventDefault()
    if (!valid || dialing) return
    if (settings?.confirm_before_call && !window.confirm(`Ligar para ${formatPhone(phone)}?`)) return
    setDialing(true)
    try {
      const created = await apiRequest<{ data: { id: string; dialUrl: string; remoteDisplay: string } }>('/api/v1/calls', { method: 'POST', body: JSON.stringify({ phone, phoneNumberId: selectedPhoneNumberId || undefined, source: 'app', direction: 'outbound' }) })
      await apiRequest(`/api/v1/calls/${created.data.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'handed_off', dataSource: 'manual' }) })
      onNotify(`${created.data.remoteDisplay} registrado e enviado ao softphone.`); setPhone(''); await onRefresh()
      if (externalDialing) window.location.href = created.data.dialUrl
    } catch { onNotify('A API está indisponível. A ligação não foi registrada.') } finally { setDialing(false) }
  }

  return <><PageHeader eyebrow="Discador principal" title="Discar era fácil. Agora organizar também é." description="A ligação parte desta tela. A extensão é opcional e só será necessária para discar a partir de outros sistemas." />
    <section className="dialer-layout"><article className="dial-console"><div className="dial-console-copy"><span className="pixel-kicker">CHAMA AÍ</span><h2>Para quem vamos ligar?</h2><p>Digite ou cole um telefone com DDD.</p></div><form className="dial-form" onSubmit={handleDial}><label className="phone-field"><span>+55</span><input value={formatPhone(phone)} onChange={(event) => setPhone(event.target.value)} placeholder="(15) 99999-9999" inputMode="tel" autoFocus /></label>{activeNumbers.length > 0 && <label className="outgoing-number"><small>Registrar na linha</small><select value={selectedPhoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)}>{activeNumbers.map((number) => <option value={number.id} key={number.id}>{number.label} · {number.display_number}</option>)}</select></label>}<button className="primary-button dial-button" type="submit" disabled={!valid || dialing}><Phone size={20} />{dialing ? 'Registrando…' : 'Ligar agora'}<ArrowRight size={18} /></button></form><div className="dial-hint"><ShieldCheck size={17} /><span><strong>{externalDialing ? 'Softphone integrado ao protocolo tel:' : 'Modo seguro de interface'}</strong><small>{externalDialing ? 'O navegador abre o aplicativo de chamadas configurado no Windows.' : 'A ativação real acontece após configurar a BR DID.'}</small></span></div><div className="pixel-trail"><i /><i /><i /><i /></div></article>
      <article className="provider-mini-card"><div className="provider-mini-top"><span className="provider-logo">br.did</span><span className={telephony?.provider.status === 'connected' ? 'connection-dot online' : 'connection-dot'}>{telephony?.provider.status === 'connected' ? 'Conectada' : 'Aguardando'}</span></div><div><small>Linha de registro</small><strong>{activeNumbers[0]?.display_number ?? 'Aguardando configuração'}</strong></div><div className="mini-meta-grid"><span><small>Ramal</small><strong>{telephony?.extensions[0]?.external_extension ?? '2001'}</strong></span><span><small>Números</small><strong>{activeNumbers.length}</strong></span></div><button className="secondary-button full" onClick={() => onNavigate('telephony')}>Configurar telefonia <ChevronRight size={16} /></button></article></section>
    <section className="panel recent-panel"><div className="panel-heading"><div><span className="section-label">Últimas ligações</span><h3>Movimento mais recente.</h3></div><button className="secondary-button" onClick={() => onNavigate('history')}>Ver histórico <ArrowRight size={17} /></button></div><CallsTable rows={calls.slice(0, 5)} onRecording={() => onNavigate('recordings')} /></section></>
}

function HistoryPage({ calls, filters, users, telephony, onFilters, onApply, onRecording, onDial }: { calls: CallRecord[]; filters: FilterState; users: UserRecord[]; telephony: TelephonyData | null; onFilters: (filters: FilterState) => void; onApply: () => void; onRecording: (id: string) => void; onDial: () => void }) {
  return <><PageHeader eyebrow="Histórico detalhado" title="Memória boa ajuda. Histórico completo resolve." description="Filtre por período, tipo, usuário, número utilizado, telefone discado e duração." action={<button className="primary-button" onClick={onDial}><Phone size={18} /> Nova ligação</button>} /><AnalyticsFilters filters={filters} users={users} telephony={telephony} onChange={onFilters} onApply={onApply} /><section className="panel history-panel"><div className="panel-heading"><div><span className="section-label">Resultado da busca</span><h3>{calls.length} ligações encontradas</h3></div><span className="manual-note"><CircleHelp size={15} /> Rolagem horizontal mostra todos os dados</span></div><CallsTable rows={calls} onRecording={onRecording} /></section></>
}

function RecordingsPage({ recordings, selectedId, onNotify }: { recordings: RecordingRecord[]; selectedId: string | null; onNotify: (message: string) => void }) {
  const [query, setQuery] = useState('')
  const digits = query.replace(/\D/g, '')
  const visibleRecordings = recordings.filter((recording) => {
    if (!query.trim()) return true
    if (digits) return `${recording.remote_number_e164}${recording.remote_number_display}`.replace(/\D/g, '').includes(digits)
    return recording.remote_number_display.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
  })
  return <><PageHeader eyebrow="Gravações disponíveis" title="Disse que ligou? Então dá o play." description="Chamadas atendidas com áudio confirmado pela operadora. Pendências continuam visíveis apenas no histórico." /><div className="recordings-toolbar"><label className="recording-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pelo número discado" inputMode="tel" aria-label="Buscar gravação pelo número" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca"><X size={15} /></button>}</label><span>{visibleRecordings.length} {visibleRecordings.length === 1 ? 'áudio encontrado' : 'áudios encontrados'}</span></div><section className="recordings-list">{visibleRecordings.map((recording) => <article className={selectedId === recording.id ? 'recording-card selected' : 'recording-card'} key={recording.id}><div className="recording-icon"><Volume2 size={22} /></div><div className="recording-copy"><div><strong>{recording.remote_number_display}</strong><StatusPill status="available" /></div><span>{formatWhen(recording.started_at, true)} · {formatDuration(recording.duration_seconds ?? recording.talk_duration_seconds)}</span><small>{recording.user_name ?? 'Sistema'} · saída por {recording.local_number_display ?? 'número não identificado'}</small></div><div className="waveform" aria-hidden="true">{[7,14,21,11,27,17,9,23,30,13,20,8].map((height, index) => <i style={{ height }} key={`${recording.id}-${index}`} />)}</div><div className="recording-actions"><button className="icon-button" aria-label={`Reproduzir gravação de ${recording.remote_number_display}`} onClick={() => onNotify('O player será conectado à URL real entregue pela BR DID.')}><Play size={17} /></button><button className="icon-button" aria-label={`Baixar gravação de ${recording.remote_number_display}`} onClick={() => onNotify('O download depende da URL autenticada da gravação.')}><Download size={17} /></button></div></article>)}{visibleRecordings.length === 0 && <div className="empty-card">Nenhuma gravação conversa com esse número.</div>}</section><aside className="info-strip"><Cloud size={19} /><span><strong>Sem áudio fantasma:</strong> esta tela recebe apenas registros com estado “disponível”.</span></aside></>
}

function DashboardPage({ dashboard, filters, users, telephony, onFilters, onApply }: { dashboard: DashboardData; filters: FilterState; users: UserRecord[]; telephony: TelephonyData | null; onFilters: (filters: FilterState) => void; onApply: () => void }) {
  const summary = dashboard.summary
  const rate = summary.total_calls ? Math.round(summary.answered_calls / summary.total_calls * 100) : 0
  const durationLabels: Record<string, string> = { '0_60': 'Até 1 min', '61_300': '1–5 min', '301_600': '5–10 min', '601_plus': '+10 min' }
  const durationMax = Math.max(1, ...dashboard.byDuration.map((item) => item.count))
  return <><PageHeader eyebrow="Painel de análise" title="Achismo não atende ligação." description="Cruze período, usuário, linha, duração e resultado. Cada gráfico responde aos mesmos filtros." /><AnalyticsFilters filters={filters} users={users} telephony={telephony} onChange={onFilters} onApply={onApply} />
    <section className="stats-grid pro-stats"><StatCard icon={<PhoneCall size={19} />} label="Ligações" value={String(summary.total_calls)} helper={`${summary.unique_numbers} números únicos`} accent /><StatCard icon={<Check size={19} />} label="Atendidas" value={String(summary.answered_calls)} helper={`${rate}% de atendimento`} /><StatCard icon={<Clock3 size={19} />} label="Tempo falado" value={formatDuration(summary.talk_seconds)} helper={`${formatDuration(summary.average_talk_seconds)} de média`} /><StatCard icon={<FileAudio size={19} />} label="Gravações" value={String(summary.recordings_available)} helper="Áudios disponíveis" /><StatCard icon={<Phone size={19} />} label="Saída" value={String(summary.outbound_calls)} helper={`${summary.inbound_calls} de entrada`} /><StatCard icon={<Activity size={19} />} label="Sem atendimento" value={String(summary.unanswered_calls)} helper="Inclui ocupado e falha" /></section>
    <SignalChart data={dashboard.byDay} />
    <section className="analysis-grid"><article className="panel donut-panel"><div className="panel-heading"><div><span className="section-label">Distribuição</span><h3>Status das chamadas</h3></div></div><StatusDonut data={dashboard.byStatus} total={summary.total_calls} /><div className="status-legend">{dashboard.byStatus.map((item) => <span key={item.status}><i className={`status-dot ${(statusMeta[item.status] ?? { tone: 'gray' }).tone}`} />{(statusMeta[item.status] ?? { label: item.status }).label}<strong>{item.count}</strong></span>)}</div></article>
      <article className="panel hourly-panel"><div className="panel-heading"><div><span className="section-label">Ligações por hora</span><h3>O ritmo do dia, sem chute.</h3></div><span className="tiny-legend"><i /> Atendidas</span></div><HourlyChart data={dashboard.byHour} /></article>
      <article className="panel duration-panel"><div className="panel-heading"><div><span className="section-label">Profundidade</span><h3>Duração das chamadas</h3></div></div><div className="duration-bars">{['0_60','61_300','301_600','601_plus'].map((bucket) => { const count = dashboard.byDuration.find((item) => item.bucket === bucket)?.count ?? 0; return <div key={bucket}><span>{durationLabels[bucket]}</span><div><i style={{ width: `${count / durationMax * 100}%` }} /></div><strong>{count}</strong></div> })}</div></article>
      <article className="panel operators-panel"><div className="panel-heading"><div><span className="section-label">Usuários</span><h3>Operação por pessoa</h3></div></div><div className="operator-list">{dashboard.byUser.map((user) => <div key={user.user_id}><span className="mini-avatar">{(user.user_name ?? 'S').split(' ').map((part) => part[0]).join('').slice(0,2)}</span><span><strong>{user.user_name ?? 'Sistema'}</strong><small>{user.total} ligações · {user.answered} atendidas</small></span><b>{formatDuration(user.talk_seconds)}</b></div>)}</div></article></section></>
}

function TelephonyPage({ telephony, onRefresh, onNotify }: { telephony: TelephonyData | null; onRefresh: () => Promise<void>; onNotify: (message: string) => void }) {
  const provider = telephony?.provider
  const extension = telephony?.extensions[0]
  const [draft, setDraft] = useState({ status: provider?.status ?? 'pending', registrarServer: provider?.public_config.registrarServer ?? '', sipPort: String(provider?.public_config.sipPort ?? 5060), transport: provider?.public_config.transport ?? 'UDP', externalExtension: extension?.external_extension ?? '2001', outboundPrefix: provider?.public_config.outboundPrefix ?? '', dialFormat: provider?.public_config.dialFormat ?? 'e164_digits', protocolHandler: provider?.public_config.protocolHandler ?? 'tel', cdrMode: provider?.public_config.cdrMode ?? 'manual', cdrEndpoint: provider?.public_config.cdrEndpoint ?? '', recordingMode: provider?.public_config.recordingMode ?? 'provider' })
  const [newNumber, setNewNumber] = useState('')
  const [newLabel, setNewLabel] = useState('Principal')
  const set = (key: keyof typeof draft, value: string) => setDraft({ ...draft, [key]: value })

  async function save() {
    try { await apiRequest('/api/v1/telephony', { method: 'PATCH', body: JSON.stringify({ status: draft.status, integrationMode: 'external_protocol', publicConfig: { registrarServer: draft.registrarServer, sipPort: Number(draft.sipPort), transport: draft.transport, outboundPrefix: draft.outboundPrefix, dialFormat: draft.dialFormat, protocolHandler: draft.protocolHandler, cdrMode: draft.cdrMode, cdrEndpoint: draft.cdrEndpoint, recordingMode: draft.recordingMode }, extension: { externalExtension: draft.externalExtension, label: 'Ramal principal', dialerMode: 'external_protocol', active: true } }) }); await onRefresh(); onNotify('Configuração da BR DID salva.') } catch { onNotify('Não foi possível salvar a telefonia.') }
  }
  async function addNumber(event: FormEvent) { event.preventDefault(); try { await apiRequest('/api/v1/telephony/numbers', { method: 'POST', body: JSON.stringify({ number: newNumber, label: newLabel }) }); setNewNumber(''); await onRefresh(); onNotify('Número adicionado à telefonia.') } catch { onNotify('Revise o número ou confirme se ele já existe.') } }
  async function toggleNumber(id: string, active: boolean) { await apiRequest(`/api/v1/telephony/numbers/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }); await onRefresh() }

  return <><PageHeader eyebrow="Telefonia" title="Telefonia configurada. Sem ritual técnico." description="O Callangos controla linhas, ramal e integração; o softphone continua responsável pelo áudio e pela senha SIP." action={<button className="primary-button" onClick={save}><Check size={18} /> Salvar telefonia</button>} />
    <section className="telephony-config-grid"><article className="panel config-panel"><div className="config-title"><span className="provider-logo">br.did</span><StatusPill status={draft.status === 'connected' ? 'completed' : 'pending'} /></div><div className="form-grid"><label><span>Estado da conexão</span><select value={draft.status} onChange={(event) => set('status', event.target.value)}><option value="pending">Aguardando</option><option value="connected">Conectada</option><option value="degraded">Instável</option><option value="offline">Offline</option></select></label><label><span>Servidor SIP / registrar</span><input value={draft.registrarServer} onChange={(event) => set('registrarServer', event.target.value)} placeholder="sip.provedor.com.br" /></label><label><span>Porta SIP</span><input value={draft.sipPort} onChange={(event) => set('sipPort', event.target.value.replace(/\D/g,''))} /></label><label><span>Transporte</span><select value={draft.transport} onChange={(event) => set('transport', event.target.value)}><option>UDP</option><option>TCP</option><option>TLS</option></select></label><label><span>Ramal / usuário SIP</span><input value={draft.externalExtension} onChange={(event) => set('externalExtension', event.target.value)} /></label><label><span>Prefixo de saída</span><input value={draft.outboundPrefix} onChange={(event) => set('outboundPrefix', event.target.value)} placeholder="Opcional" /></label><label><span>Formato enviado ao softphone</span><select value={draft.dialFormat} onChange={(event) => set('dialFormat', event.target.value)}><option value="e164_digits">55 + DDD + número</option><option value="e164_plus">+55 + DDD + número</option><option value="national">DDD + número</option></select></label><label><span>Protocolo do discador</span><select value={draft.protocolHandler} onChange={(event) => set('protocolHandler', event.target.value)}><option value="tel">tel:</option><option value="callto">callto:</option><option value="sip">sip:</option></select></label><label><span>Origem dos CDRs</span><select value={draft.cdrMode} onChange={(event) => set('cdrMode', event.target.value)}><option value="manual">Manual</option><option value="api">API</option><option value="webhook">Webhook</option></select></label><label className="span-two"><span>Endpoint de CDR, se fornecido</span><input value={draft.cdrEndpoint} onChange={(event) => set('cdrEndpoint', event.target.value)} placeholder="https://..." /></label><label><span>Gravações</span><select value={draft.recordingMode} onChange={(event) => set('recordingMode', event.target.value)}><option value="provider">Gerenciadas pela BR DID</option><option value="disabled">Desativadas</option></select></label></div><div className="security-note"><ShieldCheck size={18} /><span><strong>Senha SIP não é armazenada aqui.</strong><small>Ela será usada apenas no softphone instalado no computador.</small></span></div></article>
      <article className="panel numbers-panel"><div className="panel-heading"><div><span className="section-label">Linhas</span><h3>Números disponíveis</h3></div><span className="count-badge">{telephony?.numbers.length ?? 0}</span></div><div className="numbers-list">{telephony?.numbers.map((number) => <div key={number.id}><span><Radio size={16} /></span><div><strong>{number.display_number}</strong><small>{number.label}</small></div><button className={number.active ? 'mini-switch on' : 'mini-switch'} onClick={() => void toggleNumber(number.id, !number.active)}><i /></button></div>)}</div><form className="add-number-form" onSubmit={addNumber}><label><span>Nome da linha</span><input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} /></label><label><span>Número com DDD</span><input value={formatPhone(newNumber)} onChange={(event) => setNewNumber(event.target.value)} placeholder="(11) 3333-4444" /></label><button className="secondary-button full" type="submit" disabled={newNumber.replace(/\D/g,'').length < 10}><Plus size={16} /> Adicionar número</button></form></article></section>
    <aside className="info-strip"><ExternalLink size={19} /><span><strong>Discagem principal pelo app:</strong> depois de configurar o ramal no softphone e associar o protocolo escolhido no Windows, o botão “Ligar agora” fará a ponte.</span></aside></>
}

function SettingsPage({ settings, onSaved, onNotify }: { settings: SettingsData | null; onSaved: (settings: SettingsData) => void; onNotify: (message: string) => void }) {
  const [draft, setDraft] = useState<SettingsData | null>(settings)
  // Sincroniza o formulário quando as preferências chegam da API.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setDraft(settings), [settings])
  if (!draft) return <div className="empty-card">Carregando configurações…</div>
  const toggle = (key: 'confirm_before_call' | 'auto_open_call_details' | 'show_manual_data_badge' | 'desktop_notifications' | 'compact_tables' | 'recording_autoplay') => setDraft({ ...draft, [key]: !draft[key] })
  async function save() { const current = draft; if (!current) return; try { const response = await apiRequest<{ data: SettingsData }>('/api/v1/settings', { method: 'PATCH', body: JSON.stringify({ confirmBeforeCall: current.confirm_before_call, autoOpenCallDetails: current.auto_open_call_details, defaultCountryCode: current.default_country_code, showManualDataBadge: current.show_manual_data_badge, theme: current.theme, desktopNotifications: current.desktop_notifications, compactTables: current.compact_tables, recordingAutoplay: current.recording_autoplay, defaultHistoryPeriod: current.default_history_period, timezone: current.timezone }) }); onSaved(response.data); onNotify('Preferências salvas.') } catch (error) { onNotify(error instanceof Error ? `Falha ao salvar: ${error.message}` : 'Não foi possível salvar as preferências.') } }
  return <><PageHeader eyebrow="Configurações" title="Do seu jeito. Porque padrão demais cansa." description="Preferências úteis para discagem, dados, gravação e experiência visual." action={<button className="primary-button" onClick={save}><Check size={18} /> Salvar alterações</button>} /><section className="theme-picker"><div><span className="section-label">Aparência</span><h3>Tema da interface</h3></div>{(['light','dark','system'] as const).map((theme) => <button className={draft.theme === theme ? `theme-option ${theme} active` : `theme-option ${theme}`} key={theme} onClick={() => setDraft({ ...draft, theme })}><i /><span><strong>{theme === 'light' ? 'Claro' : theme === 'dark' ? 'Escuro' : 'Sistema'}</strong><small>{theme === 'system' ? 'Segue o Windows' : `Sempre ${theme === 'light' ? 'claro' : 'escuro'}`}</small></span><Check size={15} /></button>)}</section>
    <section className="settings-layout"><article className="panel settings-card"><div className="settings-heading"><span><Phone size={19} /></span><div><h3>Discagem</h3><p>Comportamento de cada ligação.</p></div></div><SettingToggleRow active={draft.confirm_before_call} title="Confirmar antes de ligar" text="Evita chamadas por engano." onToggle={() => toggle('confirm_before_call')} /><SettingToggleRow active={draft.auto_open_call_details} title="Abrir detalhes ao finalizar" text="Exibe o registro criado." onToggle={() => toggle('auto_open_call_details')} /><label className="setting-row"><span><strong>Código do país</strong><small>Normalização de números nacionais.</small></span><input className="small-input" value={draft.default_country_code} onChange={(event) => setDraft({ ...draft, default_country_code: event.target.value.replace(/\D/g,'').slice(0,4) })} /></label><label className="setting-row"><span><strong>Período padrão</strong><small>Usado no Histórico e Painel.</small></span><select value={draft.default_history_period} onChange={(event) => setDraft({ ...draft, default_history_period: event.target.value as SettingsData['default_history_period'] })}><option value="today">Hoje</option><option value="last_7_days">7 dias</option><option value="last_30_days">30 dias</option><option value="this_week">Esta semana</option><option value="this_month">Este mês</option></select></label></article>
      <article className="panel settings-card"><div className="settings-heading"><span><BarChart3 size={19} /></span><div><h3>Dados e interface</h3><p>Leitura e transparência operacional.</p></div></div><SettingToggleRow active={draft.show_manual_data_badge} title="Identificar dados manuais" text="Diferencia app e operadora." onToggle={() => toggle('show_manual_data_badge')} /><SettingToggleRow active={draft.compact_tables} title="Tabelas compactas" text="Mostra mais linhas por tela." onToggle={() => toggle('compact_tables')} /><SettingToggleRow active={draft.desktop_notifications} title="Notificações no desktop" text="Avisa falhas e sincronizações." onToggle={() => toggle('desktop_notifications')} /><SettingToggleRow active={draft.recording_autoplay} title="Reproduzir gravação ao abrir" text="Começa o áudio automaticamente." onToggle={() => toggle('recording_autoplay')} /><label className="setting-row"><span><strong>Fuso horário</strong><small>Usado nos relatórios.</small></span><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option value="America/Sao_Paulo">Brasília</option><option value="America/Manaus">Manaus</option><option value="America/Rio_Branco">Rio Branco</option></select></label></article></section></>
}

function ApiPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([])
  const [tokenName, setTokenName] = useState('Integração interna')
  const [revealed, setRevealed] = useState<{ label: string; value: string } | null>(null)
  const [webhookForm, setWebhookForm] = useState({ name: 'Chamadas concluídas', url: '', events: ['call.completed'] })
  const eventOptions = [{ id: 'call.created', label: 'Ligação criada' }, { id: 'call.updated', label: 'Ligação atualizada' }, { id: 'call.completed', label: 'Ligação finalizada' }, { id: 'recording.available', label: 'Gravação disponível' }]
  async function load() { try { const [tokenResponse, webhookResponse] = await Promise.all([apiRequest<{ data: ApiToken[] }>('/api/v1/api-tokens'), apiRequest<{ data: WebhookRecord[] }>('/api/v1/webhooks')]); setTokens(tokenResponse.data); setWebhooks(webhookResponse.data) } catch { onNotify('Não foi possível carregar as integrações.') } }
  // Busca as credenciais administrativas ao abrir a aba.
  // oxlint-disable-next-line react/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])
  async function createToken(event: FormEvent) { event.preventDefault(); const response = await apiRequest<{ data: ApiToken }>('/api/v1/api-tokens', { method: 'POST', body: JSON.stringify({ name: tokenName }) }); setRevealed({ label: 'Token da API', value: response.data.token! }); await load() }
  async function revokeToken(id: string) { await apiRequest(`/api/v1/api-tokens/${id}`, { method: 'DELETE' }); await load(); onNotify('Token removido.') }
  async function createWebhook(event: FormEvent) { event.preventDefault(); const response = await apiRequest<{ data: WebhookRecord }>('/api/v1/webhooks', { method: 'POST', body: JSON.stringify(webhookForm) }); setRevealed({ label: 'Segredo de assinatura', value: response.data.signingSecret! }); setWebhookForm({ ...webhookForm, url: '' }); await load() }
  async function testWebhook(id: string) { const response = await apiRequest<{ data: { delivered: boolean; status?: number } }>(`/api/v1/webhooks/${id}/test`, { method: 'POST' }); onNotify(response.data.delivered ? `Webhook entregue (${response.data.status}).` : 'O teste falhou; confira a URL.') ; await load() }
  async function deleteWebhook(id: string) { await apiRequest(`/api/v1/webhooks/${id}`, { method: 'DELETE' }); await load(); onNotify('Webhook removido.') }
  async function copy(value: string) { await navigator.clipboard.writeText(value); onNotify('Copiado para a área de transferência.') }
  return <><PageHeader eyebrow="API e eventos" title="Até os outros sistemas ficam por dentro." description="Tokens autenticam consultas externas; webhooks entregam eventos assinados em tempo real." />{revealed && <div className="secret-banner"><KeyRound size={20} /><span><strong>{revealed.label} — copie agora</strong><code>{revealed.value}</code><small>Este valor não será mostrado novamente.</small></span><button className="icon-button" aria-label="Copiar segredo" onClick={() => void copy(revealed.value)}><Copy size={17} /></button><button className="icon-button" aria-label="Ocultar segredo" onClick={() => setRevealed(null)}><X size={17} /></button></div>}
    <section className="api-grid"><article className="panel integration-card"><div className="panel-heading"><div><span className="section-label">Acesso externo</span><h3>Tokens da API</h3></div><KeyRound size={21} /></div><form className="inline-create" onSubmit={createToken}><input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="Nome do token" aria-label="Nome do token" /><button className="primary-button" type="submit"><Plus size={16} /> Gerar token</button></form><div className="integration-list">{tokens.map((token) => <div className={token.active ? '' : 'inactive'} key={token.id}><span className="integration-icon"><KeyRound size={16} /></span><span><strong>{token.name}</strong><code>{token.token_prefix}••••••••</code><small>{token.active ? token.last_used_at ? `Ativo · usado em ${formatWhen(token.last_used_at)}` : 'Ativo · nunca utilizado' : 'Revogado'}</small></span><button className="icon-button danger" aria-label={`Revogar token ${token.name}`} disabled={!token.active} onClick={() => void revokeToken(token.id)}><Trash2 size={16} /></button></div>)}</div><div className="endpoint-box"><span>Endpoint autenticado</span><code>GET /api/v1/external/calls</code><small>Authorization: Bearer clg_live_...</small></div></article>
      <article className="panel integration-card"><div className="panel-heading"><div><span className="section-label">Eventos de saída</span><h3>Webhooks</h3></div><Link2 size={21} /></div><form className="webhook-form" onSubmit={createWebhook}><label><span>Nome</span><input value={webhookForm.name} onChange={(event) => setWebhookForm({ ...webhookForm, name: event.target.value })} /></label><label><span>URL HTTPS</span><input type="url" required value={webhookForm.url} onChange={(event) => setWebhookForm({ ...webhookForm, url: event.target.value })} placeholder="https://seu-sistema.com/webhooks/callangos" /></label><div className="event-checks">{eventOptions.map((option) => <button type="button" className={webhookForm.events.includes(option.id) ? 'selected' : ''} key={option.id} onClick={() => setWebhookForm({ ...webhookForm, events: webhookForm.events.includes(option.id) ? webhookForm.events.filter((item) => item !== option.id) : [...webhookForm.events, option.id] })}><Check size={13} />{option.label}</button>)}</div><button className="secondary-button full" type="submit" disabled={!webhookForm.url || webhookForm.events.length === 0}><Plus size={16} /> Criar webhook</button></form><div className="integration-list webhook-list">{webhooks.map((webhook) => <div key={webhook.id}><span className="integration-icon"><Link2 size={16} /></span><span><strong>{webhook.name}</strong><code>{webhook.url}</code><small>{webhook.last_status ? `Último envio: ${webhook.last_status} ${webhook.last_http_status ?? ''}` : 'Aguardando primeiro envio'}</small></span><button className="text-action" onClick={() => void testWebhook(webhook.id)}>Testar</button><button className="icon-button danger" onClick={() => void deleteWebhook(webhook.id)}><Trash2 size={16} /></button></div>)}</div></article></section><aside className="info-strip"><ShieldCheck size={19} /><span>Webhooks recebem <code>x-callangos-signature</code> com HMAC SHA-256. Tokens são armazenados somente como hash.</span></aside></>
}

function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try { await onLogin(email, password) } catch { setError('E-mail ou senha inválidos.') } finally { setLoading(false) }
  }
  return <main className="login-shell"><section className="login-brand"><img className="login-logo" src="/callangos-logo-dark.png" alt="Callangos — Bora ligar parça?" /><span>Telefonia com controle, sem ruído.</span></section><section className="login-card"><div className="login-icon"><LockKeyhole size={22} /></div><span className="eyebrow">Acesso interno</span><h1>Entra aí. As ligações não se organizam sozinhas.</h1><p>Use o acesso criado pelo administrador.</p><form onSubmit={submit}><label><span>E-mail</span><input autoFocus required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label><label><span>Senha</span><input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" /></label>{error && <div className="login-error">{error}</div>}<button className="primary-button full" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}<ArrowRight size={17} /></button></form></section></main>
}

function UserDrawer({ users, onClose, onRefresh, onNotify, onLogout }: { users: UserRecord[]; onClose: () => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void; onLogout: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  async function create(event: FormEvent) { event.preventDefault(); try { const response = await apiRequest<{ data: UserRecord }>('/api/v1/users', { method: 'POST', body: JSON.stringify({ name, email }) }); setTemporaryPassword(response.data.temporaryPassword ?? ''); setName(''); setEmail(''); await onRefresh(); onNotify('Usuário operador criado.') } catch { onNotify('Revise o e-mail ou confirme se ele já existe.') } }
  async function toggle(user: UserRecord) { if (user.role === 'admin') return; await apiRequest(`/api/v1/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) }); await onRefresh() }
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="user-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-heading"><div><span className="section-label">Administração</span><h2>Usuários</h2><p>Um administrador, quantos operadores forem necessários.</p></div><button className="icon-button" aria-label="Fechar usuários" onClick={onClose}><X size={18} /></button></div>{temporaryPassword && <div className="temporary-password"><KeyRound size={17} /><span><strong>Senha temporária</strong><code>{temporaryPassword}</code></span><button className="icon-button" aria-label="Copiar senha temporária" onClick={() => void navigator.clipboard.writeText(temporaryPassword)}><Copy size={16} /></button></div>}<div className="users-list">{users.map((user) => <div key={user.id}><span className="mini-avatar">{user.name.split(' ').map((part) => part[0]).join('').slice(0,2)}</span><span><strong>{user.name}</strong><small>{user.email} · {user.role === 'admin' ? 'Administrador' : 'Operador'}</small></span>{user.role === 'admin' ? <span className="owner-badge">Principal</span> : <button className={user.active ? 'mini-switch on' : 'mini-switch'} aria-label={`${user.active ? 'Desativar' : 'Ativar'} ${user.name}`} onClick={() => void toggle(user)}><i /></button>}</div>)}</div><form className="new-user-form" onSubmit={create}><div><UserPlus size={18} /><span><strong>Novo operador</strong><small>A senha temporária aparece uma única vez.</small></span></div><label><span>Nome</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>E-mail</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="primary-button full" type="submit"><UserPlus size={16} /> Criar usuário</button></form><button className="logout-button" onClick={() => void onLogout()}><LogOut size={16} /> Encerrar sessão</button></aside></div>
}

function App() {
  const [page, setPage] = useState<Page>('dialer')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('callangos_sidebar') === 'collapsed')
  const [apiState, setApiState] = useState<ApiState>('loading')
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [recordings, setRecordings] = useState<RecordingRecord[]>([])
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard)
  const [telephony, setTelephony] = useState<TelephonyData | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [historyFilters, setHistoryFilters] = useState<FilterState>(initialFilters)
  const [dashboardFilters, setDashboardFilters] = useState<FilterState>(initialFilters)
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null)
  const [userDrawer, setUserDrawer] = useState(false)
  const [toast, setToast] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  async function loadCore(user = authUser) {
    try {
      const [telephonyResponse, settingsResponse, recordingsResponse] = await Promise.all([apiRequest<{ data: TelephonyData }>('/api/v1/telephony'), apiRequest<{ data: SettingsData }>('/api/v1/settings'), apiRequest<{ data: RecordingRecord[] }>('/api/v1/recordings')])
      setTelephony(telephonyResponse.data); setSettings(settingsResponse.data); setRecordings(recordingsResponse.data)
      if (user?.role === 'admin') { const usersResponse = await apiRequest<{ data: UserRecord[] }>('/api/v1/users'); setUsers(usersResponse.data) } else setUsers([])
      setApiState('online')
    } catch { setApiState('offline') }
  }
  async function loadCalls(filters = historyFilters) { try { const response = await apiRequest<{ data: CallRecord[] }>(`/api/v1/calls?limit=100&${filterQuery(filters)}`); setCalls(response.data); setApiState('online') } catch { setApiState('offline') } }
  async function loadDashboard(filters = dashboardFilters) { try { const response = await apiRequest<{ data: DashboardData }>(`/api/v1/dashboard?${filterQuery(filters)}`); setDashboard(response.data) } catch { setApiState('offline') } }
  async function refreshAll(user = authUser) { await Promise.all([loadCore(user), loadCalls(), loadDashboard()]) }
  async function login(email: string, password: string) { const response = await apiRequest<{ data: { token: string; user: AuthUser } }>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem('callangos_session', response.data.token); setAuthUser(response.data.user); await refreshAll(response.data.user) }
  async function logout() { try { await apiRequest('/api/v1/auth/logout', { method: 'POST' }) } finally { localStorage.removeItem('callangos_session'); setAuthUser(null); setUserDrawer(false); setPage('dialer') } }

  // Valida a sessão antes de carregar dados administrativos.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void (async () => { try { const response = await apiRequest<{ data: AuthUser }>('/api/v1/auth/me'); setAuthUser(response.data); await refreshAll(response.data) } catch { localStorage.removeItem('callangos_session'); setAuthUser(null) } finally { setAuthReady(true) } })() }, [])
  useEffect(() => { if (!settings) return; const apply = () => { const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light' }; apply(); const media = window.matchMedia('(prefers-color-scheme: dark)'); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply) }, [settings])
  useEffect(() => { localStorage.setItem('callangos_sidebar', collapsed ? 'collapsed' : 'expanded') }, [collapsed])
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3300) }
  function openRecording(id: string) { setSelectedRecording(id); setPage('recordings') }

  if (!authReady) return <main className="login-shell"><section className="login-card loading-card"><BrandMark /><strong>Preparando o Callangos…</strong></section></main>
  if (!authUser) return <LoginPage onLogin={login} />

  const visibleNavItems = navItems.filter((item) => item.id !== 'api' || authUser.role === 'admin')
  const initials = authUser.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const currentPage = {
    dialer: <DialerPage calls={calls} telephony={telephony} settings={settings} onRefresh={() => loadCalls()} onNavigate={setPage} onNotify={notify} />,
    history: <HistoryPage calls={calls} filters={historyFilters} users={users} telephony={telephony} onFilters={setHistoryFilters} onApply={() => void loadCalls(historyFilters)} onRecording={openRecording} onDial={() => setPage('dialer')} />,
    recordings: <RecordingsPage recordings={recordings} selectedId={selectedRecording} onNotify={notify} />,
    dashboard: <DashboardPage dashboard={dashboard} filters={dashboardFilters} users={users} telephony={telephony} onFilters={setDashboardFilters} onApply={() => void loadDashboard(dashboardFilters)} />,
    telephony: <TelephonyPage telephony={telephony} onRefresh={loadCore} onNotify={notify} />,
    api: <ApiPage onNotify={notify} />,
    settings: <SettingsPage settings={settings} onSaved={setSettings} onNotify={notify} />,
  }[page]

  return <div className={collapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
    <aside className="sidebar"><SidebarBrand /><button className="collapse-button" title={collapsed ? 'Expandir menu' : 'Recolher menu'} onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><nav>{visibleNavItems.map((item) => { const Icon = item.icon; return <button className={page === item.id ? 'nav-item active' : 'nav-item'} title={collapsed ? item.label : undefined} key={item.id} onClick={() => setPage(item.id)}><Icon size={18} /><span>{item.label}</span></button> })}</nav><div className="sidebar-foot"><div className="database-state"><span className={apiState === 'online' ? 'api-dot online' : apiState === 'offline' ? 'api-dot offline' : 'api-dot'} /><span><strong>{apiState === 'online' ? 'Banco conectado' : apiState === 'offline' ? 'API indisponível' : 'Conectando…'}</strong><small>{apiState === 'online' ? 'PostgreSQL local' : 'localhost:3333'}</small></span></div><button className="profile" onClick={() => authUser.role === 'admin' ? setUserDrawer(true) : void logout()}><span>{initials}</span><div><strong>{authUser.name}</strong><small>{authUser.role === 'admin' ? 'Gerenciar usuários' : 'Encerrar sessão'}</small></div>{authUser.role === 'admin' ? <Users size={17} /> : <LogOut size={17} />}</button></div></aside>
    <div className="workspace"><header className="topbar"><button className="mobile-collapse" onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><div className="topbar-motto"><span aria-hidden="true"><i /><i /><i /><i /></span><strong>Vencer na vida não pede sorte. Pede disciplina até nos dias sem vontade.</strong></div><div className="sync-state"><Cloud size={15} />{apiState === 'online' ? 'Tudo sincronizado' : 'Modo sem conexão'}</div><button className="icon-button"><Bell size={18} /></button></header><main className={settings?.compact_tables ? 'content compact-tables' : 'content'}>{currentPage}</main></div>
    {userDrawer && authUser.role === 'admin' && <UserDrawer users={users} onClose={() => setUserDrawer(false)} onRefresh={() => loadCore(authUser)} onNotify={notify} onLogout={logout} />}{toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>
}

export default App
