import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Plus, Trash2, BookOpen, Shield, Flame, Award, Clock, TrendingUp, TrendingDown,
  MessageSquare, Loader2, AlertCircle, CheckCircle2, Download, Upload, Check, BarChart3, Sparkles, Bell
} from 'lucide-react';

/* ---------- palette: dark field-journal theme ---------- */
const BG = '#1B1F27';
const PANEL = '#242935';
const PANEL_SOFT = '#2B3140';
const BORDER = '#363D4D';
const INK = '#EDEAE2';
const INK_SOFT = '#9098A8';
const THEOLOGY = '#C75D52';
const CYBER = '#33B6AC';
const SPIRITUAL = '#D6AE52';
const GOOD = '#5BAE6A';
const WARN = '#E0954A';
const BAD = '#D9695F';

const CATEGORIES = ['Theology', 'Cybersecurity', 'Spiritual Growth', 'Business', 'Work', 'Personal Development', 'Health', 'Family', 'Administration', 'Recreation', 'Travel', 'Rest', 'Miscellaneous'];
const PILLARS = ['Theology', 'Cybersecurity', 'Spiritual Growth'];
const PRODUCTIVE_CATEGORIES = ['Theology', 'Cybersecurity', 'Spiritual Growth', 'Work', 'Business', 'Personal Development'];
const SPIRITUAL_SUBTYPES = ['Prayer', 'Bible Study', 'Devotional', 'Worship', 'Sermon', 'Ministry', 'Other'];

const CATEGORY_COLORS = {
  Theology: THEOLOGY, Cybersecurity: CYBER, 'Spiritual Growth': SPIRITUAL,
  Business: '#9A86B0', Work: '#7C8AAE', 'Personal Development': '#7FA8A0',
  Health: '#6FAE7C', Family: '#C98F6B', Administration: '#8C8C8C',
  Recreation: '#CC8B5C', Travel: '#6FA0AE', Rest: '#5C6B85', Miscellaneous: '#7A7A7A',
};

const PILLAR_ICONS = { Theology: BookOpen, Cybersecurity: Shield, 'Spiritual Growth': Flame };

/* ---------- Supabase connection ---------- */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const RECORD_ID = 'life-01065e96a642048693c3';

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function loadFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/life_dashboard_data?id=eq.${RECORD_ID}&select=payload`, { headers: SUPABASE_HEADERS });
  if (!res.ok) throw new Error(`Supabase load failed (HTTP ${res.status})`);
  const rows = await res.json();
  return rows && rows[0] ? rows[0].payload : null;
}
async function saveToSupabase(payload) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/life_dashboard_data?id=eq.${RECORD_ID}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ payload, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase save failed (HTTP ${res.status})`);
}

const EMPTY_DATA = { activities: [], milestones: [], reminders: [], targets: { Theology: 3, Cybersecurity: 3, 'Spiritual Growth': 3 }, wakingHours: 16 };

const SYSTEM_PROMPT = `You are a personal-development accountability coach for someone tracking three growth pillars (Theology, Cybersecurity, Spiritual Growth) plus general daily activity, all logged in minutes.
Voice rules: observational and encouraging, never prescriptive-sounding or shaming about missed targets — describe the pattern in the actual numbers, let the reader draw their own conclusions about what to change.
You will receive a JSON summary of recent activity, milestones, targets, and a performance score. Write a concise report (around 300-400 words) with this exact structure, using these exact headings on their own line:

## Key Wins
## Areas Requiring Attention
## Strategic Recommendations
## Next Actions

Use short bullet points (lines starting with "- ") under each heading. Reference real figures (hours, percentages) from the data provided. Keep it tight enough to fit the structure without padding.`;

const PARSER_PROMPT = `You convert one short, free-text personal-development note into a single JSON action. Output ONLY raw JSON, no markdown fences, no commentary.

Schema:
{
  "action": "add_activity" | "add_milestone" | "unclear",
  "category": string | null,
  "subtype": string | null,
  "name": string | null,
  "durationMinutes": number | null,
  "date": "YYYY-MM-DD" | null,
  "notes": string | null,
  "pillar": "Theology" | "Cybersecurity" | "Spiritual Growth" | null,
  "title": string | null,
  "clarification": string | null
}

Categories: Theology, Cybersecurity, Spiritual Growth, Business, Work, Personal Development, Health, Family, Administration, Recreation, Travel, Rest, Miscellaneous.
Spiritual Growth subtypes (use "subtype" only for this category): Prayer, Bible Study, Devotional, Worship, Sermon, Ministry, Other.

Rules:
- "add_activity" requires "category" and "durationMinutes" (convert hours to minutes). If a duration is genuinely not stated, do NOT guess a number — use action "unclear" with a clarification asking how long it took, UNLESS the note clearly reads as an achievement/completion with no natural duration (see next rule).
- Achievement-style completions with no natural duration ("completed a lab", "passed my exam", "finished the course", "completed [topic]") -> "add_milestone" with the matching pillar and a short "title". No duration needed.
- If no date is mentioned, leave "date" null (the app fills in today).
- If the note is genuinely ambiguous, use action "unclear" with a short, specific one-sentence question in "clarification".`;

const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';

/* ---------- helpers ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function aiText(json) {
  if (json?.error) {
    const message = typeof json.error === 'string' ? json.error : json.error.message;
    throw new Error(message || 'AI request failed');
  }
  return json?.content?.[0]?.text || '';
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function dateNDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function startOfMonthStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function formatHours(minutes) {
  const h = (Number(minutes) || 0) / 60;
  return `${h.toFixed(1)}h`;
}
function inRange(dateStr, from, to) { return dateStr >= from && dateStr <= to; }
function timeToMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}
function currentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
async function showDeviceNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker?.ready.catch(() => null);
  if (registration?.showNotification) {
    await registration.showNotification(title, {
      ...options,
    });
    return true;
  }
  new Notification(title, options);
  return true;
}

function byCategoryMinutes(activities) {
  const map = {};
  activities.forEach(a => { map[a.category] = (map[a.category] || 0) + Number(a.durationMinutes || 0); });
  return map;
}

function dailyScore(activities, date, targets, wakingHours) {
  const dayActs = activities.filter(a => a.date === date);
  const byCat = byCategoryMinutes(dayActs);
  const pillarRatios = PILLARS.map(p => Math.min(1, (byCat[p] || 0) / ((targets[p] || 3) * 60)));
  const goalCompletion = pillarRatios.reduce((s, r) => s + r, 0) / PILLARS.length;
  const productiveMinutes = PRODUCTIVE_CATEGORIES.reduce((s, c) => s + (byCat[c] || 0), 0);
  const recordedMinutes = Object.values(byCat).reduce((s, v) => s + v, 0);
  const wakingMinutes = (wakingHours || 16) * 60;
  const productiveRatio = Math.min(1, productiveMinutes / wakingMinutes);
  const pillarsTouched = PILLARS.filter(p => (byCat[p] || 0) > 0).length;
  const consistency = pillarsTouched / PILLARS.length;
  const accountability = Math.min(1, recordedMinutes / wakingMinutes);
  const score = (goalCompletion * 0.4 + productiveRatio * 0.3 + consistency * 0.15 + accountability * 0.15) * 100;
  return { score: Math.round(score), byCat, productiveMinutes, recordedMinutes, wakingMinutes, pillarRatios };
}

/* ---------- markdown renderer for the generated report ---------- */
function ReportBody({ text }) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const renderInline = (s) => {
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <React.Fragment key={i}>{p}</React.Fragment>));
  };
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h4 key={i} className="ld-report-heading">{line.replace('## ', '')}</h4>;
        if (line.startsWith('- ')) return <div key={i} className="ld-report-bullet">{renderInline(line.replace('- ', ''))}</div>;
        return <p key={i} className="ld-report-p">{renderInline(line)}</p>;
      })}
    </div>
  );
}

/* ---------- progress ring ---------- */
function ProgressRing({ pct, color, label, sublabel }) {
  const r = 30, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="74" height="74" viewBox="0 0 74 74">
        <circle cx="37" cy="37" r={r} fill="none" stroke={BORDER} strokeWidth="6" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${c}`} strokeDashoffset={`${c - (clamped / 100) * c}`} strokeLinecap="round" transform="rotate(-90 37 37)" />
        <text x="37" y="41" textAnchor="middle" fontSize="13" fill={INK} fontFamily="IBM Plex Mono, monospace">{Math.round(clamped)}%</text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: INK }}>{label}</div>
      {sublabel && <div style={{ fontSize: 11, color: INK_SOFT }}>{sublabel}</div>}
    </div>
  );
}

/* ---------- day allocation bar ---------- */
function DayAllocationBar({ byCat }) {
  const total = Object.values(byCat).reduce((s, v) => s + v, 0) || 1;
  const present = CATEGORIES.filter(c => byCat[c] > 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: BORDER }}>
        {present.map(c => <div key={c} title={`${c}: ${formatHours(byCat[c])}`} style={{ width: `${(byCat[c] / total) * 100}%`, background: CATEGORY_COLORS[c] }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {present.map(c => (
          <span key={c} style={{ fontSize: 11, color: INK_SOFT, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[c], display: 'inline-block' }} /> {c} <span className="ld-mono">{formatHours(byCat[c])}</span>
          </span>
        ))}
        {present.length === 0 && <span style={{ fontSize: 12, color: INK_SOFT }}>Nothing logged today yet.</span>}
      </div>
    </div>
  );
}

/* ---------- Quick Entry (natural language) ---------- */
function QuickEntry({ onParsed }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/.netlify/functions/anthropic-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 300, system: PARSER_PROMPT, messages: [{ role: 'user', content: text.trim() }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `AI request failed (${res.status})`);
      const raw = aiText(json).trim();
      const cleaned = raw.replace(/^```json|```$/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const outcome = onParsed(parsed);
      setResult(outcome);
      if (outcome.ok) setText('');
    } catch (e) {
      setResult({ ok: false, message: "Couldn't process that just now — try again, or use the form below." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ld-panel">
      <h3 className="ld-panel-title"><MessageSquare size={14} style={{ verticalAlign: -2 }} /> Quick entry — say what you did</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="ld-input" style={{ flex: 1 }}
          placeholder="e.g. studied theology for 2 hours, or prayed for 30 minutes"
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <button className="ld-btn" onClick={submit} disabled={loading}>{loading ? <Loader2 size={14} className="ld-spin" /> : 'Process'}</button>
      </div>
      {result && <div style={{ fontSize: 12, marginTop: 8, color: result.ok ? GOOD : BAD }}>{result.message}</div>}
    </div>
  );
}

/* ---------- main app ---------- */
export default function App({ onNavigate }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [dbStatus, setDbStatus] = useState('checking');
  const [loadNote, setLoadNote] = useState('');
  const [saveError, setSaveError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const importInputRef = useRef(null);
  const [report, setReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [notificationPermission, setNotificationPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let payload = null, succeeded = false, lastError = null;
      for (let attempt = 0; attempt < 4 && !succeeded; attempt++) {
        try { payload = await loadFromSupabase(); succeeded = true; }
        catch (e) { lastError = e; if (attempt < 3) await new Promise(r => setTimeout(r, 450)); }
      }
      if (cancelled) return;
      if (succeeded && payload) {
        setDbStatus('connected');
        setData({
          activities: payload.activities || [],
          milestones: payload.milestones || [],
          reminders: payload.reminders || [],
          targets: payload.targets || EMPTY_DATA.targets,
          wakingHours: payload.wakingHours || 16,
        });
      } else if (succeeded) {
        setDbStatus('connected');
      } else {
        setDbStatus('error');
        setLoadNote(`Couldn't reach the database (${lastError ? lastError.message : 'unknown error'}). If you expected existing entries, use Import to restore from a backup before adding anything new.`);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = async (next) => {
    setData(next);
    try {
      await saveToSupabase(next);
      setDbStatus('connected');
      if (saveError) setSaveError('');
    } catch (e) {
      setDbStatus('error');
      setSaveError(`Last change could not be saved to the database (${e.message}). It's only in this browser tab right now — export a backup before closing.`);
    }
  };

  /* ---- backup ---- */
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `life-dashboard-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportMessage('Backup file downloaded.');
  };
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        setPendingImport({
          activities: parsed.activities || [], milestones: parsed.milestones || [],
          reminders: parsed.reminders || [],
          targets: parsed.targets || EMPTY_DATA.targets, wakingHours: parsed.wakingHours || 16,
        });
        setImportMessage('');
      } catch (err) { setImportMessage("That file couldn't be read as a valid backup."); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const confirmImport = () => { if (pendingImport) { persist(pendingImport); setPendingImport(null); setLoadNote(''); setImportMessage('Backup imported successfully.'); } };
  const cancelImport = () => setPendingImport(null);

  /* ---- mutations ---- */
  const addActivity = (a) => persist({ ...data, activities: [{ ...a, id: uid() }, ...data.activities] });
  const deleteActivity = (id) => persist({ ...data, activities: data.activities.filter(a => a.id !== id) });
  const addMilestone = (m) => persist({ ...data, milestones: [{ ...m, id: uid() }, ...data.milestones] });
  const deleteMilestone = (id) => persist({ ...data, milestones: data.milestones.filter(m => m.id !== id) });
  const addReminder = (reminder) => persist({ ...data, reminders: [{ ...reminder, id: uid(), enabled: true, lastNotifiedDate: null }, ...(data.reminders || [])] });
  const updateReminder = (id, updates) => persist({ ...data, reminders: (data.reminders || []).map(r => (r.id === id ? { ...r, ...updates } : r)) });
  const deleteReminder = (id) => persist({ ...data, reminders: (data.reminders || []).filter(r => r.id !== id) });
  const updateTargets = (targets) => persist({ ...data, targets });
  const updateWakingHours = (wakingHours) => persist({ ...data, wakingHours });

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      await showDeviceNotification('Development reminders enabled', {
        body: 'I can now remind you to perform your scheduled tasks.',
        tag: 'development-reminders-enabled',
      });
    }
    return permission;
  };

  useEffect(() => {
    if (!loaded || !('Notification' in window) || Notification.permission !== 'granted') return undefined;
    const tick = async () => {
      const activeReminders = data.reminders || [];
      const todayKey = todayStr();
      const nowMinutes = currentTimeMinutes();
      const due = activeReminders.filter(r => r.enabled !== false && r.time && r.lastNotifiedDate !== todayKey && timeToMinutes(r.time) <= nowMinutes);
      if (due.length === 0) return;
      for (const reminder of due) {
        await showDeviceNotification(reminder.title || 'Development task reminder', {
          body: reminder.description || `Time for ${reminder.category || 'your planned task'}.`,
          tag: `development-reminder-${reminder.id}`,
        });
      }
      persist({
        ...data,
        reminders: activeReminders.map(r => due.some(d => d.id === r.id) ? { ...r, lastNotifiedDate: todayKey } : r),
      });
    };
    tick();
    const interval = window.setInterval(tick, 60000);
    return () => window.clearInterval(interval);
  }, [loaded, data, notificationPermission]);

  const applyParsedAction = (parsed) => {
    const date = parsed.date || todayStr();
    if (parsed.action === 'add_activity') {
      if (!parsed.category || !parsed.durationMinutes) return { ok: false, message: "I need a category and a duration — try the form below." };
      addActivity({ date, category: parsed.category, subtype: parsed.subtype || null, name: parsed.name || parsed.category, durationMinutes: parsed.durationMinutes, notes: parsed.notes || '' });
      return { ok: true, message: `Logged: ${formatHours(parsed.durationMinutes)} of ${parsed.category}${parsed.subtype ? ` (${parsed.subtype})` : ''} on ${date}.` };
    }
    if (parsed.action === 'add_milestone') {
      if (!parsed.pillar || !(parsed.title || parsed.name)) return { ok: false, message: "I need a pillar and a short title — try the form below." };
      addMilestone({ pillar: parsed.pillar, title: parsed.title || parsed.name, dateCompleted: date, notes: parsed.notes || '' });
      return { ok: true, message: `Added milestone for ${parsed.pillar}: "${parsed.title || parsed.name}".` };
    }
    return { ok: false, message: parsed.clarification || "I'm not sure what to do with that — try the form below." };
  };

  /* ---- derived figures ---- */
  const today = todayStr();
  const weekStart = dateNDaysAgo(6);
  const monthStart = startOfMonthStr();

  const todayInfo = useMemo(() => dailyScore(data.activities, today, data.targets, data.wakingHours), [data.activities, today, data.targets, data.wakingHours]);

  const last14Scores = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = dateNDaysAgo(i);
      const info = dailyScore(data.activities, d, data.targets, data.wakingHours);
      out.push({ date: d.slice(5), score: info.score });
    }
    return out;
  }, [data.activities, data.targets, data.wakingHours]);

  const weekByCat = useMemo(() => byCategoryMinutes(data.activities.filter(a => inRange(a.date, weekStart, today))), [data.activities, weekStart, today]);
  const monthByCat = useMemo(() => byCategoryMinutes(data.activities.filter(a => inRange(a.date, monthStart, today))), [data.activities, monthStart, today]);

  const generateReport = async () => {
    setReportLoading(true); setReportError(''); setReport('');
    try {
      const summary = {
        today: { date: today, score: todayInfo.score, byCategory: todayInfo.byCat, productiveMinutes: todayInfo.productiveMinutes, recordedMinutes: todayInfo.recordedMinutes, wakingMinutes: todayInfo.wakingMinutes },
        last14DayScores: last14Scores,
        weekByCategory: weekByCat,
        monthByCategory: monthByCat,
        targets: data.targets,
        recentMilestones: data.milestones.slice(0, 15),
        recentActivities: data.activities.slice(0, 30),
      };
      const res = await fetch('/.netlify/functions/anthropic-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 650, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: JSON.stringify(summary) }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `AI request failed (${res.status})`);
      const t = aiText(json);
      if (!t) throw new Error('empty response');
      setReport(t);
    } catch (e) {
      setReportError('Could not generate the report right now. Please try again.');
    } finally {
      setReportLoading(false);
    }
  };

  if (!loaded) {
    return <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="ld-spin" size={28} style={{ color: SPIRITUAL }} /></div>;
  }

  return (
    <div className="ld-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .ld-root { background: ${BG}; min-height: 100vh; font-family: 'Inter', sans-serif; color: ${INK}; }
        .ld-mono { font-family: 'IBM Plex Mono', monospace; }
        .ld-display { font-family: 'Space Grotesk', sans-serif; }
        .ld-header { padding: 26px 24px 16px; border-bottom: 1px solid ${BORDER}; }
        .ld-header-row { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; max-width: 1100px; margin: 0 auto; }
        .ld-brand { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: ${SPIRITUAL}; font-weight: 600; margin-bottom: 6px; }
        .ld-title { font-size: 25px; font-weight: 600; color: ${INK}; margin: 0; }
        .ld-sub { font-size: 13px; color: ${INK_SOFT}; margin-top: 4px; }
        .ld-score-label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${INK_SOFT}; text-align: right; }
        .ld-score-figure { font-size: 30px; font-weight: 600; text-align: right; }
        .ld-backup-row { display: flex; align-items: center; gap: 10px; max-width: 1100px; margin: 14px auto 0; flex-wrap: wrap; }
        .ld-load-banner { display: flex; align-items: flex-start; gap: 10px; max-width: 1100px; margin: 14px auto 0; padding: 12px 24px; background: #3A2E1F; border: 1px solid #6B5230; border-radius: 4px; font-size: 13px; color: ${INK}; line-height: 1.5; box-sizing: border-box; }
        .ld-tabs { display: flex; gap: 4px; max-width: 1100px; margin: 0 auto; padding: 0 24px; border-bottom: 1px solid ${BORDER}; overflow-x: auto; }
        .ld-tab { padding: 12px 14px; font-size: 13px; font-weight: 500; color: ${INK_SOFT}; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; background: none; border-left: none; border-right: none; border-top: none; display: flex; align-items: center; gap: 6px; }
        .ld-tab.active { color: ${INK}; border-bottom: 2px solid ${SPIRITUAL}; }
        .ld-body { max-width: 1100px; margin: 0 auto; padding: 22px 24px 60px; }
        .ld-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
        .ld-card { background: ${PANEL}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 14px 16px; }
        .ld-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; color: ${INK_SOFT}; display: flex; align-items: center; gap: 6px; }
        .ld-card-value { font-size: 19px; font-weight: 600; margin-top: 6px; }
        .ld-panel { background: ${PANEL}; border: 1px solid ${BORDER}; border-radius: 6px; padding: 18px; margin-bottom: 16px; }
        .ld-panel-title { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: ${INK}; display: flex; align-items: center; gap: 6px; }
        .ld-line { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed ${BORDER}; gap: 10px; }
        .ld-line:last-child { border-bottom: none; }
        .ld-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: ${PANEL_SOFT}; color: ${INK_SOFT}; white-space: nowrap; }
        .ld-btn { background: ${SPIRITUAL}; color: #1B1F27; border: none; padding: 9px 14px; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .ld-btn:hover { opacity: 0.9; }
        .ld-btn-ghost { background: transparent; border: 1px solid ${BORDER}; color: ${INK}; padding: 8px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .ld-input, .ld-select { border: 1px solid ${BORDER}; border-radius: 4px; padding: 8px 10px; font-size: 13px; font-family: inherit; background: ${PANEL_SOFT}; color: ${INK}; }
        .ld-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; align-items: end; }
        .ld-progress { height: 8px; background: ${PANEL_SOFT}; border-radius: 4px; overflow: hidden; margin-top: 6px; }
        .ld-progress-fill { height: 100%; border-radius: 4px; }
        .ld-empty { color: ${INK_SOFT}; font-size: 13px; padding: 18px 0; text-align: center; }
        .ld-spin { animation: ld-spin 1s linear infinite; }
        @keyframes ld-spin { to { transform: rotate(360deg); } }
        .ld-report-heading { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: ${SPIRITUAL}; margin: 18px 0 8px; }
        .ld-report-heading:first-child { margin-top: 0; }
        .ld-report-bullet { font-size: 14px; padding-left: 14px; position: relative; margin: 4px 0; line-height: 1.5; }
        .ld-report-bullet:before { content: '—'; position: absolute; left: 0; color: ${SPIRITUAL}; }
        .ld-report-p { font-size: 14px; line-height: 1.5; margin: 6px 0; }
        .ld-pillar-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 760px) { .ld-pillar-grid { grid-template-columns: repeat(3, 1fr); } }
      `}</style>

      <div className="ld-header">
        <div className="ld-header-row">
          <div>
            <div className="ld-brand">Life Dashboard</div>
            <h1 className="ld-display ld-title">Kehinde Phillip Oyekunle</h1>
            <div className="ld-sub">Theology · Cybersecurity · Spiritual Growth · daily accountability</div>
          </div>
          <div>
            <div className="ld-score-label">Today's Score</div>
            <div className="ld-score-figure ld-mono" style={{ color: todayInfo.score >= 70 ? GOOD : todayInfo.score >= 40 ? WARN : BAD }}>{todayInfo.score}</div>
            {onNavigate && (
              <button className="ld-btn-ghost" style={{ marginTop: 8 }} onClick={() => onNavigate('finance')}>
                Personal finance
              </button>
            )}
          </div>
        </div>
        <div className="ld-backup-row">
          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: dbStatus === 'connected' ? GOOD : dbStatus === 'error' ? BAD : INK_SOFT }}>
            {dbStatus === 'checking' && <Loader2 size={12} className="ld-spin" />}
            {dbStatus === 'connected' && <CheckCircle2 size={12} />}
            {dbStatus === 'error' && <AlertCircle size={12} />}
            {dbStatus === 'checking' ? 'Connecting to database…' : dbStatus === 'connected' ? 'Database connected' : 'Database unreachable'}
          </span>
          <button className="ld-btn-ghost" onClick={exportData}><Download size={13} /> Export backup</button>
          <button className="ld-btn-ghost" onClick={() => importInputRef.current && importInputRef.current.click()}><Upload size={13} /> Import backup</button>
          <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          {importMessage && <span style={{ fontSize: 12, color: INK_SOFT }}>{importMessage}</span>}
        </div>
      </div>

      {loadNote && (
        <div className="ld-load-banner">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{loadNote}</span>
          <button className="ld-btn-ghost" style={{ flexShrink: 0 }} onClick={() => setLoadNote('')}>Dismiss</button>
        </div>
      )}
      {saveError && (
        <div className="ld-load-banner" style={{ background: '#3A2424', border: `1px solid ${BAD}` }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{saveError}</span>
          <button className="ld-btn-ghost" style={{ flexShrink: 0 }} onClick={() => setSaveError('')}>Dismiss</button>
        </div>
      )}
      {pendingImport && (
        <div className="ld-load-banner" style={{ background: '#3A3424' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>This backup has {pendingImport.activities.length} activities, {pendingImport.milestones.length} milestones, and {(pendingImport.reminders || []).length} reminders. Importing will replace everything currently on this dashboard. Are you sure?</span>
          <button className="ld-btn" style={{ flexShrink: 0 }} onClick={confirmImport}>Replace with backup</button>
          <button className="ld-btn-ghost" style={{ flexShrink: 0 }} onClick={cancelImport}>Cancel</button>
        </div>
      )}

      <div className="ld-tabs">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'log', label: 'Log' },
          { id: 'theology', label: 'Theology' },
          { id: 'cybersecurity', label: 'Cybersecurity' },
          { id: 'spiritual', label: 'Spiritual' },
          { id: 'time', label: 'Time' },
          { id: 'reminders', label: 'Reminders' },
          { id: 'insights', label: 'Insights' },
        ].map(t => (
          <button key={t.id} className={`ld-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="ld-body">
        {tab === 'dashboard' && (
          <DashboardTab todayInfo={todayInfo} last14Scores={last14Scores} targets={data.targets} onUpdateTargets={updateTargets} wakingHours={data.wakingHours} onUpdateWakingHours={updateWakingHours} />
        )}
        {tab === 'log' && (
          <LogTab activities={data.activities} onAdd={addActivity} onDelete={deleteActivity} onParsed={applyParsedAction} />
        )}
        {tab === 'theology' && (
          <PillarTab pillar="Theology" color={THEOLOGY} icon={BookOpen} activities={data.activities} milestones={data.milestones} targets={data.targets} onAddMilestone={addMilestone} onDeleteMilestone={deleteMilestone} today={today} weekStart={weekStart} monthStart={monthStart} />
        )}
        {tab === 'cybersecurity' && (
          <PillarTab pillar="Cybersecurity" color={CYBER} icon={Shield} activities={data.activities} milestones={data.milestones} targets={data.targets} onAddMilestone={addMilestone} onDeleteMilestone={deleteMilestone} today={today} weekStart={weekStart} monthStart={monthStart} />
        )}
        {tab === 'spiritual' && (
          <SpiritualTab activities={data.activities} targets={data.targets} today={today} weekStart={weekStart} monthStart={monthStart} />
        )}
        {tab === 'time' && (
          <TimeTab activities={data.activities} today={today} weekStart={weekStart} monthStart={monthStart} />
        )}
        {tab === 'reminders' && (
          <RemindersTab
            reminders={data.reminders || []}
            permission={notificationPermission}
            onRequestPermission={requestNotificationPermission}
            onAdd={addReminder}
            onUpdate={updateReminder}
            onDelete={deleteReminder}
          />
        )}
        {tab === 'insights' && (
          <InsightsTab report={report} reportLoading={reportLoading} reportError={reportError} onGenerate={generateReport} />
        )}
      </div>
    </div>
  );
}

/* ---------- shared helpers for tabs ---------- */
function minutesForRange(activities, category, from, to) {
  return activities.filter(a => a.category === category && inRange(a.date, from, to)).reduce((s, a) => s + Number(a.durationMinutes || 0), 0);
}
function pillarDailyTrend(activities, pillar, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dateNDaysAgo(i);
    const minutes = activities.filter(a => a.category === pillar && a.date === d).reduce((s, a) => s + Number(a.durationMinutes || 0), 0);
    out.push({ date: d.slice(5), hours: Math.round((minutes / 60) * 10) / 10 });
  }
  return out;
}
function topicsForPillar(activities, pillar) {
  const map = {};
  activities.filter(a => a.category === pillar).forEach(a => { map[a.name] = (map[a.name] || 0) + Number(a.durationMinutes || 0); });
  return Object.entries(map).map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, 8);
}
function consistencyStreak(activities, category) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = dateNDaysAgo(i);
    const has = activities.some(a => a.category === category && a.date === d);
    if (has) streak++;
    else break;
  }
  return streak;
}
function pillarAchievementRate(activities, pillar, targetHoursPerDay, from, to, totalDays) {
  const minutes = minutesForRange(activities, pillar, from, to);
  const targetMinutes = targetHoursPerDay * 60 * totalDays;
  const volumeRatio = Math.min(1, minutes / Math.max(1, targetMinutes));
  let daysWithActivity = 0;
  for (let i = 0; i < totalDays; i++) {
    const d = dateNDaysAgo(i);
    if (d < from) break;
    if (activities.some(a => a.category === pillar && a.date === d)) daysWithActivity++;
  }
  const consistencyRatio = daysWithActivity / totalDays;
  return Math.round((volumeRatio * 0.7 + consistencyRatio * 0.3) * 100);
}

/* ---------- Dashboard ---------- */
function DashboardTab({ todayInfo, last14Scores, targets, onUpdateTargets, wakingHours, onUpdateWakingHours }) {
  const [editingTargets, setEditingTargets] = useState(false);
  const [localTargets, setLocalTargets] = useState(targets);
  const [localWaking, setLocalWaking] = useState(wakingHours);
  const unaccounted = Math.max(0, todayInfo.wakingMinutes - todayInfo.recordedMinutes);

  return (
    <div>
      <div className="ld-cards">
        <div className="ld-card">
          <div className="ld-card-label"><TrendingUp size={13} /> Productive today</div>
          <div className="ld-card-value ld-mono" style={{ color: GOOD }}>{formatHours(todayInfo.productiveMinutes)}</div>
        </div>
        <div className="ld-card">
          <div className="ld-card-label"><Clock size={13} /> Recorded today</div>
          <div className="ld-card-value ld-mono">{formatHours(todayInfo.recordedMinutes)}</div>
        </div>
        <div className="ld-card">
          <div className="ld-card-label"><AlertCircle size={13} /> Unaccounted today</div>
          <div className="ld-card-value ld-mono" style={{ color: unaccounted > 180 ? WARN : INK_SOFT }}>{formatHours(unaccounted)}</div>
        </div>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">Today's allocation</h3>
        <DayAllocationBar byCat={todayInfo.byCat} />
      </div>

      <div className="ld-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className="ld-panel-title" style={{ margin: 0 }}>Pillars vs. daily target</h3>
          <button className="ld-btn-ghost" onClick={() => setEditingTargets(!editingTargets)}>Edit targets</button>
        </div>
        {editingTargets ? (
          <div className="ld-form-grid" style={{ marginBottom: 10 }}>
            {PILLARS.map(p => (
              <div key={p}>
                <div style={{ fontSize: 11, color: INK_SOFT, marginBottom: 4 }}>{p} (h/day)</div>
                <input className="ld-input ld-mono" type="number" min="0" step="0.5" value={localTargets[p]} onChange={e => setLocalTargets({ ...localTargets, [p]: Number(e.target.value) })} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, color: INK_SOFT, marginBottom: 4 }}>Waking hours/day</div>
              <input className="ld-input ld-mono" type="number" min="1" max="24" value={localWaking} onChange={e => setLocalWaking(Number(e.target.value))} />
            </div>
            <button className="ld-btn" onClick={() => { onUpdateTargets(localTargets); onUpdateWakingHours(localWaking); setEditingTargets(false); }}>Save</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 24, justifyContent: 'space-around', flexWrap: 'wrap' }}>
            {PILLARS.map(p => {
              const minutes = todayInfo.byCat[p] || 0;
              const pct = Math.min(100, (minutes / ((targets[p] || 3) * 60)) * 100);
              const color = p === 'Theology' ? THEOLOGY : p === 'Cybersecurity' ? CYBER : SPIRITUAL;
              return <ProgressRing key={p} pct={pct} color={color} label={p} sublabel={`${formatHours(minutes)} / ${targets[p]}h`} />;
            })}
          </div>
        )}
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">Performance score — last 14 days</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={last14Scores}>
            <CartesianGrid stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: PANEL, border: `1px solid ${BORDER}`, color: INK }} />
            <Line type="monotone" dataKey="score" stroke={SPIRITUAL} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Log ---------- */
function LogTab({ activities, onAdd, onDelete, onParsed }) {
  const [category, setCategory] = useState('Theology');
  const [subtype, setSubtype] = useState('');
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!hours || Number(hours) <= 0) return;
    onAdd({ date, category, subtype: category === 'Spiritual Growth' ? (subtype || null) : null, name: name || category, durationMinutes: Math.round(Number(hours) * 60), notes });
    setName(''); setHours(''); setNotes('');
  };

  return (
    <div>
      <QuickEntry onParsed={onParsed} />

      <div className="ld-panel">
        <h3 className="ld-panel-title">Add an activity</h3>
        <div className="ld-form-grid">
          <select className="ld-select" value={category} onChange={e => { setCategory(e.target.value); setSubtype(''); }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {category === 'Spiritual Growth' && (
            <select className="ld-select" value={subtype} onChange={e => setSubtype(e.target.value)}>
              <option value="">Subtype (optional)</option>
              {SPIRITUAL_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <input className="ld-input" placeholder="Activity name" value={name} onChange={e => setName(e.target.value)} />
          <input className="ld-input ld-mono" type="number" min="0" step="0.25" placeholder="Hours" value={hours} onChange={e => setHours(e.target.value)} />
          <input className="ld-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <input className="ld-input" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          <button className="ld-btn" onClick={submit}><Plus size={14} /> Add</button>
        </div>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">Activity log ({activities.length})</h3>
        {activities.length === 0 && <div className="ld-empty">No entries yet.</div>}
        {activities.slice(0, 100).map(a => (
          <div className="ld-line" key={a.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span className="ld-mono" style={{ fontSize: 12, color: INK_SOFT, flexShrink: 0 }}>{a.date}</span>
              <span className="ld-badge" style={{ background: `${CATEGORY_COLORS[a.category]}26`, color: CATEGORY_COLORS[a.category] }}>{a.category}{a.subtype ? ` · ${a.subtype}` : ''}</span>
              <span style={{ fontSize: 13, color: INK_SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span className="ld-mono" style={{ fontWeight: 600 }}>{formatHours(a.durationMinutes)}</span>
              <Trash2 size={14} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(a.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Pillar tab (Theology / Cybersecurity) ---------- */
function PillarTab({ pillar, color, icon: Icon, activities, milestones, targets, onAddMilestone, onDeleteMilestone, today, weekStart, monthStart }) {
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneNotes, setMilestoneNotes] = useState('');

  const todayMin = minutesForRange(activities, pillar, today, today);
  const weekMin = minutesForRange(activities, pillar, weekStart, today);
  const monthMin = minutesForRange(activities, pillar, monthStart, today);
  const trend = useMemo(() => pillarDailyTrend(activities, pillar), [activities, pillar]);
  const topics = useMemo(() => topicsForPillar(activities, pillar), [activities, pillar]);
  const weeklyRate = pillarAchievementRate(activities, pillar, targets[pillar] || 3, weekStart, today, 7);
  const monthDays = Math.max(1, Math.round((new Date(today) - new Date(monthStart)) / 86400000) + 1);
  const monthlyRate = pillarAchievementRate(activities, pillar, targets[pillar] || 3, monthStart, today, monthDays);
  const pillarMilestones = milestones.filter(m => m.pillar === pillar);

  const submitMilestone = () => {
    if (!milestoneTitle) return;
    onAddMilestone({ pillar, title: milestoneTitle, dateCompleted: today, notes: milestoneNotes });
    setMilestoneTitle(''); setMilestoneNotes('');
  };

  return (
    <div>
      <div className="ld-cards">
        <div className="ld-card"><div className="ld-card-label"><Icon size={13} /> Today</div><div className="ld-card-value ld-mono" style={{ color }}>{formatHours(todayMin)}</div></div>
        <div className="ld-card"><div className="ld-card-label"><Icon size={13} /> This week</div><div className="ld-card-value ld-mono" style={{ color }}>{formatHours(weekMin)}</div></div>
        <div className="ld-card"><div className="ld-card-label"><Icon size={13} /> This month</div><div className="ld-card-value ld-mono" style={{ color }}>{formatHours(monthMin)}</div></div>
        <div className="ld-card"><div className="ld-card-label">Weekly goal rate</div><div className="ld-card-value ld-mono">{weeklyRate}%</div></div>
        <div className="ld-card"><div className="ld-card-label">Monthly goal rate</div><div className="ld-card-value ld-mono">{monthlyRate}%</div></div>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">14-day trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={trend}>
            <CartesianGrid stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: PANEL, border: `1px solid ${BORDER}`, color: INK }} formatter={(v) => `${v}h`} />
            <Line type="monotone" dataKey="hours" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">Topics & activity breakdown</h3>
        {topics.length === 0 && <div className="ld-empty">Nothing logged yet.</div>}
        {topics.map(t => {
          const pct = topics[0] ? (t.minutes / topics[0].minutes) * 100 : 0;
          return (
            <div key={t.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{t.name}</span><span className="ld-mono" style={{ color: INK_SOFT }}>{formatHours(t.minutes)}</span>
              </div>
              <div className="ld-progress"><div className="ld-progress-fill" style={{ width: `${pct}%`, background: color }} /></div>
            </div>
          );
        })}
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title"><Award size={14} /> Milestones</h3>
        <div className="ld-form-grid" style={{ marginBottom: 12 }}>
          <input className="ld-input" placeholder="Milestone title" value={milestoneTitle} onChange={e => setMilestoneTitle(e.target.value)} />
          <input className="ld-input" placeholder="Notes (optional)" value={milestoneNotes} onChange={e => setMilestoneNotes(e.target.value)} />
          <button className="ld-btn" onClick={submitMilestone}><Plus size={14} /> Add</button>
        </div>
        {pillarMilestones.length === 0 && <div className="ld-empty">No milestones logged yet.</div>}
        {pillarMilestones.map(m => (
          <div className="ld-line" key={m.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Award size={14} style={{ color, flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{m.title}</span>
              <span className="ld-mono" style={{ fontSize: 11, color: INK_SOFT }}>{m.dateCompleted}</span>
            </div>
            <Trash2 size={14} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDeleteMilestone(m.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Spiritual tab ---------- */
function SpiritualTab({ activities, targets, today, weekStart, monthStart }) {
  const todayMin = minutesForRange(activities, 'Spiritual Growth', today, today);
  const weekMin = minutesForRange(activities, 'Spiritual Growth', weekStart, today);
  const monthMin = minutesForRange(activities, 'Spiritual Growth', monthStart, today);
  const trend = useMemo(() => pillarDailyTrend(activities, 'Spiritual Growth'), [activities]);
  const streak = useMemo(() => consistencyStreak(activities, 'Spiritual Growth'), [activities]);

  const subtypeMinutes = useMemo(() => {
    const map = {};
    activities.filter(a => a.category === 'Spiritual Growth' && inRange(a.date, weekStart, today)).forEach(a => {
      const key = a.subtype || 'Other';
      map[key] = (map[key] || 0) + Number(a.durationMinutes || 0);
    });
    return SPIRITUAL_SUBTYPES.map(s => ({ name: s, minutes: map[s] || 0 })).filter(s => s.minutes > 0);
  }, [activities, weekStart, today]);

  const maxSubtype = Math.max(1, ...subtypeMinutes.map(s => s.minutes));

  return (
    <div>
      <div className="ld-cards">
        <div className="ld-card"><div className="ld-card-label"><Flame size={13} /> Today</div><div className="ld-card-value ld-mono" style={{ color: SPIRITUAL }}>{formatHours(todayMin)}</div></div>
        <div className="ld-card"><div className="ld-card-label"><Flame size={13} /> This week</div><div className="ld-card-value ld-mono" style={{ color: SPIRITUAL }}>{formatHours(weekMin)}</div></div>
        <div className="ld-card"><div className="ld-card-label"><Flame size={13} /> This month</div><div className="ld-card-value ld-mono" style={{ color: SPIRITUAL }}>{formatHours(monthMin)}</div></div>
        <div className="ld-card"><div className="ld-card-label">Consistency streak</div><div className="ld-card-value ld-mono" style={{ color: streak > 0 ? GOOD : INK_SOFT }}>{streak}d</div></div>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">14-day trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={trend}>
            <CartesianGrid stroke={BORDER} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: PANEL, border: `1px solid ${BORDER}`, color: INK }} formatter={(v) => `${v}h`} />
            <Line type="monotone" dataKey="hours" stroke={SPIRITUAL} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">This week by type (Prayer, Bible Study, etc.)</h3>
        {subtypeMinutes.length === 0 && <div className="ld-empty">No spiritual activity logged this week yet.</div>}
        {subtypeMinutes.map(s => (
          <div key={s.name} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{s.name}</span><span className="ld-mono" style={{ color: INK_SOFT }}>{formatHours(s.minutes)}</span>
            </div>
            <div className="ld-progress"><div className="ld-progress-fill" style={{ width: `${(s.minutes / maxSubtype) * 100}%`, background: SPIRITUAL }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Time tab ---------- */
function TimeTab({ activities, today, weekStart, monthStart }) {
  const [period, setPeriod] = useState('week');
  const from = period === 'today' ? today : period === 'week' ? weekStart : monthStart;
  const byCat = useMemo(() => byCategoryMinutes(activities.filter(a => inRange(a.date, from, today))), [activities, from, today]);
  const rows = CATEGORIES.map(c => ({ category: c, minutes: byCat[c] || 0 })).filter(r => r.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const total = rows.reduce((s, r) => s + r.minutes, 0) || 1;
  const productive = PRODUCTIVE_CATEGORIES.reduce((s, c) => s + (byCat[c] || 0), 0);
  const goalFocused = PILLARS.reduce((s, p) => s + (byCat[p] || 0), 0);
  const max = rows[0] ? rows[0].minutes : 1;

  return (
    <div>
      <div className="ld-form-grid" style={{ maxWidth: 360, marginBottom: 16 }}>
        <select className="ld-select" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
      </div>

      <div className="ld-cards">
        <div className="ld-card"><div className="ld-card-label"><BarChart3 size={13} /> Total recorded</div><div className="ld-card-value ld-mono">{formatHours(total === 1 && rows.length === 0 ? 0 : total)}</div></div>
        <div className="ld-card"><div className="ld-card-label"><TrendingUp size={13} /> Productive</div><div className="ld-card-value ld-mono" style={{ color: GOOD }}>{formatHours(productive)} ({Math.round((productive / total) * 100)}%)</div></div>
        <div className="ld-card"><div className="ld-card-label">Goal-focused (pillars)</div><div className="ld-card-value ld-mono" style={{ color: SPIRITUAL }}>{formatHours(goalFocused)} ({Math.round((goalFocused / total) * 100)}%)</div></div>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">Category breakdown</h3>
        {rows.length === 0 && <div className="ld-empty">Nothing logged in this period yet.</div>}
        {rows.map(r => (
          <div key={r.category} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{r.category}</span><span className="ld-mono" style={{ color: INK_SOFT }}>{formatHours(r.minutes)}</span>
            </div>
            <div className="ld-progress"><div className="ld-progress-fill" style={{ width: `${(r.minutes / max) * 100}%`, background: CATEGORY_COLORS[r.category] }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Reminders ---------- */
function RemindersTab({ reminders, permission, onRequestPermission, onAdd, onUpdate, onDelete }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Theology');
  const [time, setTime] = useState('07:00');
  const [description, setDescription] = useState('');

  const submit = async () => {
    if (!title || !time) return;
    if (permission === 'default') await onRequestPermission();
    onAdd({ title, category, time, description });
    setTitle('');
    setDescription('');
  };

  const permissionLabel = permission === 'granted'
    ? 'Device notifications enabled'
    : permission === 'denied'
      ? 'Device notifications blocked in this browser'
      : permission === 'unsupported'
        ? 'Device notifications are not supported here'
        : 'Device notifications not enabled';

  return (
    <div>
      <div className="ld-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 className="ld-panel-title" style={{ margin: 0 }}><Bell size={14} /> Task reminders</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: permission === 'granted' ? GOOD : INK_SOFT }}>{permissionLabel}</span>
            {permission === 'default' && (
              <button className="ld-btn" onClick={onRequestPermission}><Bell size={14} /> Enable</button>
            )}
          </div>
        </div>
        <div className="ld-form-grid">
          <input className="ld-input" placeholder="Task title" value={title} onChange={e => setTitle(e.target.value)} />
          <select className="ld-select" value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="ld-input ld-mono" type="time" value={time} onChange={e => setTime(e.target.value)} />
          <input className="ld-input" placeholder="Short note" value={description} onChange={e => setDescription(e.target.value)} />
          <button className="ld-btn" onClick={submit}><Plus size={14} /> Add reminder</button>
        </div>
      </div>

      <div className="ld-panel">
        <h3 className="ld-panel-title">Scheduled tasks ({reminders.length})</h3>
        {reminders.length === 0 && <div className="ld-empty">No reminders yet.</div>}
        {reminders.map(reminder => (
          <div className="ld-line" key={reminder.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
              <Bell size={14} style={{ color: reminder.enabled === false ? INK_SOFT : CATEGORY_COLORS[reminder.category] || SPIRITUAL, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{reminder.title}</span>
              <span className="ld-badge" style={{ background: `${CATEGORY_COLORS[reminder.category] || SPIRITUAL}26`, color: CATEGORY_COLORS[reminder.category] || SPIRITUAL }}>{reminder.category}</span>
              <span className="ld-mono" style={{ fontSize: 12, color: INK_SOFT }}>{reminder.time}</span>
              {reminder.description && <span style={{ fontSize: 12, color: INK_SOFT }}>{reminder.description}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button className="ld-btn-ghost" onClick={() => onUpdate(reminder.id, { enabled: reminder.enabled === false })}>
                {reminder.enabled === false ? 'Enable' : 'Pause'}
              </button>
              <Trash2 size={14} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(reminder.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Insights ---------- */
function InsightsTab({ report, reportLoading, reportError, onGenerate }) {
  return (
    <div className="ld-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 className="ld-panel-title" style={{ margin: 0 }}>Recommendations &amp; Next Steps</h3>
        <button className="ld-btn" onClick={onGenerate} disabled={reportLoading}>
          {reportLoading ? <Loader2 size={14} className="ld-spin" /> : <Sparkles size={14} />}
          {reportLoading ? 'Generating…' : 'Generate report'}
        </button>
      </div>
      {reportError && <div style={{ color: BAD, fontSize: 12, marginTop: 8 }}>{reportError}</div>}
      {!report && !reportLoading && !reportError && (
        <div className="ld-empty">Generate a full report — Key Wins, Areas Requiring Attention, Strategic Recommendations, and Next Actions — based on your logged activity.</div>
      )}
      {report && <div style={{ marginTop: 10 }}><ReportBody text={report} /></div>}
    </div>
  );
}
