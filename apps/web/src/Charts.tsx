import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DashboardData } from './api'

type Metric = 'calls' | 'answered' | 'talk' | 'rate'

const metricLabels: Record<Metric, string> = {
  calls: 'Ligações',
  answered: 'Atendidas',
  talk: 'Tempo falado',
  rate: 'Taxa de atendimento',
}

export function SignalChart({ data }: { data: DashboardData['byDay'] }) {
  const [metric, setMetric] = useState<Metric>('calls')
  const chartData = useMemo(() => data.map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${item.day}T12:00:00`)).replace('.', ''),
    value: metric === 'calls'
      ? item.total
      : metric === 'answered'
        ? item.answered
        : metric === 'talk'
          ? Math.round(item.talk_seconds / 60)
          : item.total ? Math.round(item.answered / item.total * 100) : 0,
  })), [data, metric])

  const suffix = metric === 'talk' ? ' min' : metric === 'rate' ? '%' : ''
  const total = chartData.reduce((sum, item) => sum + item.value, 0)
  const headline = metric === 'rate' && chartData.length ? Math.round(total / chartData.length) : total

  return (
    <article className="signal-card">
      <div className="signal-heading">
        <div><span>SINAL DA OPERAÇÃO</span><h3>{metricLabels[metric]}</h3><strong>{headline}{suffix}</strong></div>
        <div className="metric-switch" aria-label="Métrica do gráfico">
          {(Object.keys(metricLabels) as Metric[]).map((item) => <button className={metric === item ? 'active' : ''} key={item} onClick={() => setMetric(item)}>{metricLabels[item]}</button>)}
        </div>
      </div>
      <div className="signal-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 8, left: -24, bottom: 2 }}>
            <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} strokeDasharray="3 7" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#aab2b8', fontSize: 11 }} dy={9} />
            <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: '#919ba2', fontSize: 10 }} />
            <Tooltip cursor={{ stroke: 'rgba(255,98,56,.35)', strokeDasharray: '4 5' }} contentStyle={{ background: '#181b1e', border: '1px solid #3c4247', borderRadius: 9, color: '#fff', fontSize: 12 }} formatter={(value) => [`${String(value)}${suffix}`, metricLabels[metric]]} />
            <Line isAnimationActive={false} type="monotone" dataKey="value" stroke="#ff6a42" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" dot={{ r: 3.5, fill: '#ff6a42', stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5, fill: '#ff6a42', stroke: '#fff', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

const statusColors: Record<string, string> = {
  completed: '#168c61',
  answered: '#35b984',
  missed: '#aeb5ba',
  busy: '#e8a52e',
  voicemail: '#8662b3',
  failed: '#d4473f',
  handed_off: '#5b99bd',
  created: '#86a5b8',
  canceled: '#7d858a',
}

export function StatusDonut({ data, total }: { data: DashboardData['byStatus']; total: number }) {
  return (
    <div className="donut-layout">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" innerRadius={60} outerRadius={78} paddingAngle={3} cornerRadius={4} stroke="none">
              {data.map((item) => <Cell key={item.status} fill={statusColors[item.status] ?? '#8d979e'} />)}
            </Pie>
            <Tooltip contentStyle={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--graphite)', fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
        <span><strong>{total}</strong><small>ligações</small></span>
      </div>
    </div>
  )
}

export function HourlyChart({ data }: { data: DashboardData['byHour'] }) {
  const complete = Array.from({ length: 13 }, (_, index) => {
    const hour = index + 8
    const match = data.find((item) => item.hour === hour)
    return { hour: `${String(hour).padStart(2, '0')}h`, total: match?.total ?? 0, answered: match?.answered ?? 0 }
  })
  return (
    <div className="hourly-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={complete} margin={{ top: 8, right: 2, left: -30, bottom: 0 }}>
          <CartesianGrid stroke="rgba(117,138,152,.15)" vertical={false} strokeDasharray="3 6" />
          <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#7c8c96', fontSize: 10 }} />
          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: '#94a1aa', fontSize: 9 }} />
          <Tooltip contentStyle={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--graphite)', fontSize: 11 }} />
          <Bar dataKey="total" name="Ligações" fill="#ffd3c5" radius={[4, 4, 1, 1]} />
          <Bar dataKey="answered" name="Atendidas" fill="#ff6238" radius={[4, 4, 1, 1]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
