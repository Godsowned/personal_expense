import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Plus, Trash2, TrendingUp, TrendingDown, Wallet, Landmark,
  Sparkles, Loader2, ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2,
  Repeat, MessageSquare, Check, CalendarClock, Download, Upload
} from 'lucide-react';

/* ---------- palette & constants ---------- */
const PAPER = '#FAF6EC';
const PAPER_DARK = '#F1EADA';
const INK = '#1E2B22';
const INK_SOFT = '#5B6B5E';
const BRASS = '#B8862E';
const BRASS_SOFT = '#E4C98A';
const FOREST = '#3F7150';
const RUST = '#A33B2B';
const INDIGO = '#41507A';
const HAIRLINE = '#D8CFB8';

// --- Supabase connection ---
// Configure these in Netlify Site settings > Environment variables.
// The anon key is designed to be public/client-side safe — never put the
// service_role/secret key here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// Must exactly match the id used in the SQL setup script's RLS policy.
const RECORD_ID = 'ledger-d97bfe19437ef215838a';

const SUPABASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

async function loadFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ledger_data?id=eq.${RECORD_ID}&select=payload`, {
    headers: SUPABASE_HEADERS,
  });
  if (!res.ok) throw new Error(`Supabase load failed (HTTP ${res.status})`);
  const rows = await res.json();
  return rows && rows[0] ? rows[0].payload : null;
}

async function saveToSupabase(payload) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ledger_data?id=eq.${RECORD_ID}`, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ payload, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase save failed (HTTP ${res.status})`);
}

const EXPENSE_CATS = ['Transportation', 'Food', 'Airtime/Data', 'Rent', 'Utilities', 'Giving/Ministry', 'Business', 'Savings', 'Debt Repayment', 'Gifts', 'Miscellaneous'];
const INCOME_CATS = ['Salary', 'Project Payment', 'Gift Received', 'Contribution', 'Refund', 'Other Income'];

const EMPTY_DATA = { transactions: [], budgets: [], debts: [], recurringExpenses: [], expectedIncome: [], advisorChats: [], advisorPlans: [] };

const SYSTEM_PROMPT = `You are a supportive personal finance and money-psychology coach for a Nigerian Naira (NGN) household ledger.
Voice rules: warm, specific, never shaming, never use clinical or diagnostic mental-health language. Describe patterns in the actual numbers given, do not invent figures.
You are not a licensed financial advisor — for major decisions (debt restructuring, investing, large loans) say a licensed professional should be consulted.
You will receive a JSON summary of someone's recent income, expenses, budgets, and debts (amounts in NGN).
Write a concise report (around 300-400 words) with this exact structure, using these exact headings on their own line:

## Key Observations
## Financial Strengths
## Areas of Concern
## Immediate Actions
## Medium-Term Improvement Strategies
## Long-Term Financial Growth Suggestions

Use short bullet points (lines starting with "- ") under each heading. Reference real NGN figures from the data provided. Keep the whole report tight enough to fit the structure above without padding.`;

const ADVISOR_SYSTEM_PROMPT = `You are a warm, knowledgeable personal finance advisor for someone in Nigeria using NGN (Nigerian Naira).
Your role: 
- Review and discuss their financial performance based on real transaction data you're shown
- Research relevant financial topics (market trends, investment strategies, saving methods, debt management) online if asked
- Link findings back to their specific financial situation
- Ask clarifying questions to better understand their goals and constraints
- Help them create actionable financial plans
- Remember previous parts of the conversation and build upon them
- Never shame them; be encouraging and specific with numbers

You are NOT a licensed financial advisor — for major decisions (loans, investments, restructuring debt), recommend they consult a licensed professional.

When discussing their finances, always:
1. Reference real figures from their ledger (transactions, debts, budgets)
2. Ask follow-up questions to clarify their goals
3. Suggest practical, small steps they can take now
4. Be specific and honest about trade-offs
5. Maintain context from earlier in the conversation

When they ask to research topics, share what you find and explicitly link it to their situation.`;

const PARSER_PROMPT = `You convert one short, free-text personal-finance note (Nigerian Naira) into a single JSON action. Output ONLY raw JSON, no markdown fences, no commentary.

Schema:
{
  "action": "add_expense" | "add_income" | "add_debt" | "settle_debt" | "add_repayment" | "pay_installment" | "add_expected_income" | "mark_expected_received" | "add_recurring_expense" | "mark_recurring_paid" | "unclear",
  "amount": number | null,
  "category": string | null,
  "description": string | null,
  "date": "YYYY-MM-DD" | null,
  "person": string | null,
  "direction": "i_owe" | "owed_to_me" | null,
  "dueDay": number | null,
  "label": string | null,
  "targetName": string | null,
  "clarification": string | null
}

Rules:
- If no date is mentioned, leave "date" null (the app fills in today).
- "targetName" is used to match an EXISTING debt person, expected-income description, or recurring-bill label given to you in context — use it for settle_debt, add_repayment, pay_installment, mark_expected_received, mark_recurring_paid.
- "I borrowed/owe X from/to PERSON" -> add_debt, direction i_owe. "PERSON owes me" / "I lent PERSON" -> add_debt, direction owed_to_me.
- "paid off / cleared / settled my debt to PERSON" -> settle_debt (no amount needed).
- "paid PERSON ₦N off my debt" with a partial amount -> add_repayment.
- "pay this month's [loan/installment] to PERSON" -> pay_installment.
- "expecting ₦N from X [on DATE]" -> add_expected_income.
- "the ₦N from X came in" / "received the payment from X" -> mark_expected_received (amount only if a different actual figure is stated, else null).
- "I pay ₦N for [rent/subscription/etc] every month" -> add_recurring_expense.
- "paid this month's rent / paid the [bill]" -> mark_recurring_paid.
- If the note is genuinely ambiguous (no clear match, missing required info), use action "unclear" and put a short, specific one-sentence question in "clarification".
- Never invent a targetName that isn't a close match to something in the provided context list.`;

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

/* ---------- helpers ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function aiText(json) {
  if (json?.error) {
    const message = typeof json.error === 'string' ? json.error : json.error.message;
    throw new Error(message || 'AI request failed');
  }
  return json?.choices?.[0]?.message?.content || '';
}

function formatNaira(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  return `${sign}\u20a6${abs.toLocaleString('en-NG', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthKeyOf(dateStr) { return (dateStr || '').slice(0, 7); }
function monthLabel(key) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function debtOutstanding(debt) {
  const repaid = (debt.repayments || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  return Math.max(0, Number(debt.principal || 0) - repaid);
}

function findOneMatch(list, nameField, query) {
  if (!query) return null;
  const q = query.toLowerCase();
  const matches = list.filter(item => String(item[nameField] || '').toLowerCase().includes(q) || q.includes(String(item[nameField] || '').toLowerCase()));
  return matches.length === 1 ? matches[0] : null;
}

/* ---------- tiny markdown renderer for the generated report ---------- */
function ReportBody({ text }) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const renderInline = (s) => {
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <React.Fragment key={i}>{p}</React.Fragment>));
  };
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h4 key={i} className="lf-report-heading">{line.replace('## ', '')}</h4>;
        }
        if (line.startsWith('- ')) {
          return <div key={i} className="lf-report-bullet">{renderInline(line.replace('- ', ''))}</div>;
        }
        return <p key={i} className="lf-report-p">{renderInline(line)}</p>;
      })}
    </div>
  );
}

/* ---------- main component ---------- */
export default function App({ onNavigate }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [report, setReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  const [dbStatus, setDbStatus] = useState('checking');
  const [loadNote, setLoadNote] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [pendingImport, setPendingImport] = useState(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let payload = null;
      let succeeded = false;
      let lastError = null;
      // Retry a few times before concluding "no data" — a single failed fetch
      // must never be treated as "start empty," because that previously let a
      // save silently overwrite real data with an empty blob.
      for (let attempt = 0; attempt < 4 && !succeeded; attempt++) {
        try {
          payload = await loadFromSupabase();
          succeeded = true;
        } catch (e) {
          lastError = e;
          if (attempt < 3) await new Promise(r => setTimeout(r, 450));
        }
      }
      if (cancelled) return;
      if (succeeded && payload) {
        setDbStatus('connected');
        setData({
          transactions: payload.transactions || [],
          budgets: payload.budgets || [],
          debts: payload.debts || [],
          recurringExpenses: payload.recurringExpenses || [],
          expectedIncome: payload.expectedIncome || [],
          advisorChats: payload.advisorChats || [],
          advisorPlans: payload.advisorPlans || [],
        });
      } else if (succeeded) {
        setDbStatus('connected');
      } else {
        setDbStatus('error');
        setLoadNote(`Couldn't reach the database (${lastError ? lastError.message : 'unknown error'}). If you expected existing entries, please use Import to restore from a backup before adding anything new — that way nothing gets overwritten. Check that the Supabase URL/key in the code are filled in correctly, and check your browser console for a CORS or network error.`);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [saveError, setSaveError] = useState('');
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

  /* ---- backup: export / import ---- */
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
        const next = {
          transactions: parsed.transactions || [],
          budgets: parsed.budgets || [],
          debts: parsed.debts || [],
          recurringExpenses: parsed.recurringExpenses || [],
          expectedIncome: parsed.expectedIncome || [],
          advisorChats: parsed.advisorChats || [],
          advisorPlans: parsed.advisorPlans || [],
        };
        setPendingImport(next);
        setImportMessage('');
      } catch (err) {
        setImportMessage("That file couldn't be read as a valid backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    persist(pendingImport);
    setPendingImport(null);
    setLoadNote('');
    setImportMessage('Backup imported successfully.');
  };
  const cancelImport = () => setPendingImport(null);

  /* ---- mutations ---- */
  const addTransaction = (tx) => persist({ ...data, transactions: [{ ...tx, id: uid() }, ...data.transactions] });
  const deleteTransaction = (id) => persist({ ...data, transactions: data.transactions.filter(t => t.id !== id) });

  const addAdvisorChat = (chatId, initialMessage) => {
    const newChat = { id: chatId, createdAt: new Date().toISOString(), messages: [{ role: 'user', content: initialMessage, timestamp: new Date().toISOString() }] };
    persist({ ...data, advisorChats: [newChat, ...data.advisorChats] });
    return chatId;
  };
  
  const addAdvisorMessage = (chatId, message) => {
    const chats = data.advisorChats.map(c => {
      if (c.id === chatId) {
        return { ...c, messages: [...c.messages, { role: message.role, content: message.content, timestamp: new Date().toISOString() }] };
      }
      return c;
    });
    persist({ ...data, advisorChats: chats });
  };

  const addAdvisorPlan = (plan) => {
    persist({ ...data, advisorPlans: [{ ...plan, id: uid(), createdAt: new Date().toISOString(), status: 'active' }, ...data.advisorPlans] });
  };

  const updateAdvisorPlan = (planId, updates) => {
    const plans = data.advisorPlans.map(p => (p.id === planId ? { ...p, ...updates } : p));
    persist({ ...data, advisorPlans: plans });
  };

  const deleteAdvisorPlan = (planId) => {
    persist({ ...data, advisorPlans: data.advisorPlans.filter(p => p.id !== planId) });
  };

  const upsertBudget = (category, monthlyLimit) => {
    const exists = data.budgets.some(b => b.category === category);
    const budgets = exists
      ? data.budgets.map(b => (b.category === category ? { ...b, monthlyLimit } : b))
      : [...data.budgets, { category, monthlyLimit }];
    persist({ ...data, budgets });
  };
  const deleteBudget = (category) => persist({ ...data, budgets: data.budgets.filter(b => b.category !== category) });

  const addDebt = (debt) => persist({ ...data, debts: [{ ...debt, id: uid(), repayments: [] }, ...data.debts] });
  const addRepayment = (debtId, amount, date) => {
    const debts = data.debts.map(d => {
      if (d.id !== debtId) return d;
      const repayments = [...(d.repayments || []), { amount, date }];
      const outstanding = debtOutstanding({ ...d, repayments });
      return { ...d, repayments, status: outstanding <= 0 ? 'settled' : 'open' };
    });
    persist({ ...data, debts });
  };
  const deleteDebt = (id) => persist({ ...data, debts: data.debts.filter(d => d.id !== id) });

  const settleDebtFull = (debtId, date = todayStr()) => {
    const debts = data.debts.map(d => {
      if (d.id !== debtId) return d;
      const remaining = debtOutstanding(d);
      if (remaining <= 0) return d;
      const repayments = [...(d.repayments || []), { amount: remaining, date }];
      return { ...d, repayments, status: 'settled' };
    });
    persist({ ...data, debts });
  };

  const setDebtRecurring = (debtId, recurringInstallment) => {
    const debts = data.debts.map(d => (d.id === debtId ? { ...d, recurringInstallment } : d));
    persist({ ...data, debts });
  };

  const payDebtInstallment = (debtId, date = todayStr()) => {
    const debts = data.debts.map(d => {
      if (d.id !== debtId || !d.recurringInstallment) return d;
      const amount = Math.min(Number(d.recurringInstallment.amount), debtOutstanding(d));
      if (amount <= 0) return d;
      const repayments = [...(d.repayments || []), { amount, date }];
      const outstanding = debtOutstanding({ ...d, repayments });
      return { ...d, repayments, status: outstanding <= 0 ? 'settled' : 'open', lastInstallmentMonth: monthKeyOf(date) };
    });
    persist({ ...data, debts });
  };

  const addRecurringExpense = (item) => persist({ ...data, recurringExpenses: [{ ...item, id: uid(), lastPaidMonth: null }, ...data.recurringExpenses] });
  const deleteRecurringExpense = (id) => persist({ ...data, recurringExpenses: data.recurringExpenses.filter(r => r.id !== id) });
  const markRecurringPaid = (id, date = todayStr()) => {
    const item = data.recurringExpenses.find(r => r.id === id);
    if (!item) return;
    const transactions = [{ id: uid(), type: 'expense', amount: Number(item.amount), category: item.category, description: `${item.label} (recurring)`, date, recurringId: id }, ...data.transactions];
    const recurringExpenses = data.recurringExpenses.map(r => (r.id === id ? { ...r, lastPaidMonth: monthKeyOf(date) } : r));
    persist({ ...data, transactions, recurringExpenses });
  };

  const addExpectedIncome = (item) => persist({ ...data, expectedIncome: [{ ...item, id: uid(), status: 'pending' }, ...data.expectedIncome] });
  const deleteExpectedIncome = (id) => persist({ ...data, expectedIncome: data.expectedIncome.filter(e => e.id !== id) });
  const markExpectedReceived = (id, actualAmount, date = todayStr()) => {
    const item = data.expectedIncome.find(e => e.id === id);
    if (!item) return;
    const transactions = [{ id: uid(), type: 'income', amount: Number(actualAmount), category: 'Project Payment', description: item.description, date, expectedId: id }, ...data.transactions];
    const expectedIncome = data.expectedIncome.filter(e => e.id !== id);
    persist({ ...data, transactions, expectedIncome });
  };

  /* ---- quick-entry dispatcher (used by the natural-language box) ---- */
  const applyParsedAction = (parsed) => {
    const date = parsed.date || todayStr();
    switch (parsed.action) {
      case 'add_expense':
      case 'add_income': {
        if (!parsed.amount) return { ok: false, message: "I caught the note but couldn't find an amount — try the form below." };
        addTransaction({ type: parsed.action === 'add_income' ? 'income' : 'expense', amount: parsed.amount, category: parsed.category || (parsed.action === 'add_income' ? 'Other Income' : 'Miscellaneous'), description: parsed.description || '', date });
        return { ok: true, message: `Logged: ${parsed.action === 'add_income' ? '+' : '-'}${formatNaira(parsed.amount)} ${parsed.category || ''} on ${date}.` };
      }
      case 'add_debt': {
        if (!parsed.amount || !parsed.person || !parsed.direction) return { ok: false, message: "I need a person, an amount, and the direction — try the form below." };
        addDebt({ person: parsed.person, principal: parsed.amount, direction: parsed.direction, dateIncurred: date, status: 'open' });
        return { ok: true, message: `Added debt: ${parsed.direction === 'i_owe' ? 'you owe' : 'owed to you by'} ${parsed.person}, ${formatNaira(parsed.amount)}.` };
      }
      case 'settle_debt': {
        const match = findOneMatch(data.debts.filter(d => debtOutstanding(d) > 0), 'person', parsed.targetName || parsed.person);
        if (!match) return { ok: false, message: "I couldn't find exactly one matching open debt — settle it from the Debts tab instead." };
        settleDebtFull(match.id, date);
        return { ok: true, message: `Marked the debt with ${match.person} as fully paid.` };
      }
      case 'add_repayment': {
        const match = findOneMatch(data.debts.filter(d => debtOutstanding(d) > 0), 'person', parsed.targetName || parsed.person);
        if (!match || !parsed.amount) return { ok: false, message: "I couldn't match that to one open debt with an amount — use the Debts tab instead." };
        addRepayment(match.id, parsed.amount, date);
        return { ok: true, message: `Logged a repayment of ${formatNaira(parsed.amount)} to ${match.person}.` };
      }
      case 'pay_installment': {
        const match = findOneMatch(data.debts.filter(d => d.recurringInstallment && debtOutstanding(d) > 0), 'person', parsed.targetName || parsed.person);
        if (!match) return { ok: false, message: "I couldn't find a matching recurring installment — set one up on the Debts tab." };
        payDebtInstallment(match.id, date);
        return { ok: true, message: `Logged this month's installment to ${match.person}.` };
      }
      case 'add_expected_income': {
        if (!parsed.amount) return { ok: false, message: "I need an amount for that expected income — try the form below." };
        addExpectedIncome({ description: parsed.description || parsed.targetName || 'Expected income', expectedAmount: parsed.amount, expectedDate: date });
        return { ok: true, message: `Added expected income: ${formatNaira(parsed.amount)} (${parsed.description || 'pending'}).` };
      }
      case 'mark_expected_received': {
        const match = findOneMatch(data.expectedIncome, 'description', parsed.targetName || parsed.description);
        if (!match) return { ok: false, message: "I couldn't find exactly one matching pending income — mark it received from the Upcoming tab." };
        markExpectedReceived(match.id, parsed.amount || match.expectedAmount, date);
        return { ok: true, message: `Marked "${match.description}" as received (${formatNaira(parsed.amount || match.expectedAmount)}).` };
      }
      case 'add_recurring_expense': {
        if (!parsed.amount) return { ok: false, message: "I need an amount for that recurring bill — try the form below." };
        addRecurringExpense({ label: parsed.label || parsed.description || parsed.category || 'Recurring bill', category: parsed.category || 'Miscellaneous', amount: parsed.amount, dueDay: parsed.dueDay || 1 });
        return { ok: true, message: `Added recurring bill: ${parsed.label || parsed.description} — ${formatNaira(parsed.amount)}/month.` };
      }
      case 'mark_recurring_paid': {
        const match = findOneMatch(data.recurringExpenses, 'label', parsed.targetName || parsed.label);
        if (!match) return { ok: false, message: "I couldn't find exactly one matching recurring bill — mark it paid from the Upcoming tab." };
        markRecurringPaid(match.id, date);
        return { ok: true, message: `Marked "${match.label}" paid for this month.` };
      }
      case 'unclear':
      default:
        return { ok: false, message: parsed.clarification || "I'm not sure what to do with that — try the form below." };
    }
  };

  /* ---- derived figures ---- */
  const currentMonthKey = todayStr().slice(0, 7);

  const monthTx = useMemo(() => data.transactions.filter(t => monthKeyOf(t.date) === currentMonthKey), [data.transactions, currentMonthKey]);
  const monthIncome = useMemo(() => monthTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), [monthTx]);
  const monthExpense = useMemo(() => monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0), [monthTx]);
  const netFlow = monthIncome - monthExpense;

  const totalIOwe = useMemo(() => data.debts.filter(d => d.direction === 'i_owe').reduce((s, d) => s + debtOutstanding(d), 0), [data.debts]);
  const totalOwedToMe = useMemo(() => data.debts.filter(d => d.direction === 'owed_to_me').reduce((s, d) => s + debtOutstanding(d), 0), [data.debts]);

  const netPosition = useMemo(() => {
    const allIncome = data.transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const allExpense = data.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return allIncome - allExpense + totalOwedToMe - totalIOwe;
  }, [data.transactions, totalIOwe, totalOwedToMe]);

  const trendSpark = useMemo(() => {
    const sorted = [...data.transactions].sort((a, b) => (a.date > b.date ? 1 : -1));
    let running = 0;
    return sorted.map(t => {
      running += t.type === 'income' ? Number(t.amount) : -Number(t.amount);
      return { date: t.date, balance: running };
    });
  }, [data.transactions]);

  const expenseByCategory = useMemo(() => {
    const map = {};
    monthTx.filter(t => t.type === 'expense').forEach(t => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const sixMonthTrend = useMemo(() => {
    const keys = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      keys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys.map(key => {
      const tx = data.transactions.filter(t => monthKeyOf(t.date) === key);
      return {
        month: monthLabel(key),
        income: tx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
        expense: tx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [data.transactions]);

  const budgetPerformance = useMemo(() => data.budgets.map(b => {
    const actual = monthTx.filter(t => t.type === 'expense' && t.category === b.category).reduce((s, t) => s + Number(t.amount), 0);
    return { category: b.category, limit: Number(b.monthlyLimit), actual };
  }), [data.budgets, monthTx]);

  const pieColors = [BRASS, FOREST, INDIGO, RUST, INK_SOFT, '#7A8C5E', '#C97B3D', '#5C7A8A'];

  const dueRecurring = useMemo(() => data.recurringExpenses.filter(r => r.lastPaidMonth !== currentMonthKey), [data.recurringExpenses, currentMonthKey]);
  const dueInstallments = useMemo(() => data.debts.filter(d => d.recurringInstallment && debtOutstanding(d) > 0 && d.lastInstallmentMonth !== currentMonthKey), [data.debts, currentMonthKey]);
  const totalPendingIncome = useMemo(() => data.expectedIncome.reduce((s, e) => s + Number(e.expectedAmount || 0), 0), [data.expectedIncome]);

  /* ---- insight generation ---- */
  const generateReport = async () => {
    setReportLoading(true);
    setReportError('');
    setReport('');
    try {
      const summary = {
        currentMonth: currentMonthKey,
        monthIncomeNGN: monthIncome,
        monthExpenseNGN: monthExpense,
        netFlowNGN: netFlow,
        expenseByCategoryThisMonth: expenseByCategory,
        budgetPerformanceThisMonth: budgetPerformance,
        sixMonthTrend,
        totalIOweNGN: totalIOwe,
        totalOwedToMeNGN: totalOwedToMe,
        recentTransactions: data.transactions.slice(0, 25),
      };
      const res = await fetch('/.netlify/functions/anthropic-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          max_tokens: 650,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: JSON.stringify(summary) }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `AI request failed (${res.status})`);
      const text = aiText(json);
      if (!text) throw new Error('empty response');
      setReport(text);
    } catch (e) {
      setReportError('Could not generate the report right now. Please try again.');
    } finally {
      setReportLoading(false);
    }
  };

  if (!loaded) {
    return (
      <div style={{ background: PAPER, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="lf-spin" size={28} style={{ color: BRASS }} />
      </div>
    );
  }

  return (
    <div className="lf-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .lf-root { background: ${PAPER}; min-height: 100vh; font-family: 'IBM Plex Sans', sans-serif; color: ${INK}; }
        .lf-mono { font-family: 'IBM Plex Mono', monospace; }
        .lf-display { font-family: 'Fraunces', serif; }
        .lf-header { padding: 28px 24px 18px; border-bottom: 1px solid ${HAIRLINE}; background: ${PAPER}; }
        .lf-header-row { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; max-width: 1080px; margin: 0 auto; }
        .lf-brand { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRASS}; font-weight: 600; margin-bottom: 6px; }
        .lf-title { font-size: 26px; font-weight: 600; color: ${INK}; margin: 0; }
        .lf-sub { font-size: 13px; color: ${INK_SOFT}; margin-top: 4px; }
        .lf-net-label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: ${INK_SOFT}; text-align: right; }
        .lf-net-figure { font-size: 30px; font-weight: 600; text-align: right; }
        .lf-spark { max-width: 1080px; margin: 10px auto 0; height: 32px; }
        .lf-tabs { display: flex; gap: 4px; max-width: 1080px; margin: 0 auto; padding: 0 24px; border-bottom: 1px solid ${HAIRLINE}; overflow-x: auto; }
        .lf-backup-row { display: flex; align-items: center; gap: 10px; max-width: 1080px; margin: 14px auto 0; flex-wrap: wrap; }
        .lf-load-banner { display: flex; align-items: flex-start; gap: 10px; max-width: 1080px; margin: 14px auto 0; padding: 12px 24px; background: #FBEFE2; border: 1px solid ${BRASS_SOFT}; border-radius: 4px; font-size: 13px; color: ${INK}; line-height: 1.5; box-sizing: border-box; }
        .lf-tab { padding: 12px 16px; font-size: 14px; font-weight: 500; color: ${INK_SOFT}; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; background: none; border-left: none; border-right: none; border-top: none; }
        .lf-tab.active { color: ${INK}; border-bottom: 2px solid ${BRASS}; }
        .lf-body { max-width: 1080px; margin: 0 auto; padding: 22px 24px 60px; }
        .lf-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 22px; }
        .lf-card { background: white; border: 1px solid ${HAIRLINE}; border-radius: 4px; padding: 14px 16px; }
        .lf-card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: ${INK_SOFT}; display: flex; align-items: center; gap: 6px; }
        .lf-card-value { font-size: 20px; font-weight: 600; margin-top: 6px; }
        .lf-panel { background: white; border: 1px solid ${HAIRLINE}; border-radius: 4px; padding: 18px; margin-bottom: 18px; }
        .lf-panel-title { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: ${INK}; }
        .lf-ledger-line { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed ${HAIRLINE}; gap: 10px; }
        .lf-ledger-line:last-child { border-bottom: none; }
        .lf-cat-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: ${PAPER_DARK}; color: ${INK_SOFT}; white-space: nowrap; }
        .lf-btn { background: ${INK}; color: white; border: none; padding: 9px 14px; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .lf-btn:hover { background: #16201A; }
        .lf-btn-ghost { background: transparent; border: 1px solid ${HAIRLINE}; color: ${INK}; padding: 8px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .lf-input, .lf-select { border: 1px solid ${HAIRLINE}; border-radius: 4px; padding: 8px 10px; font-size: 13px; font-family: inherit; background: white; color: ${INK}; }
        .lf-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; align-items: end; }
        .lf-toggle { display: inline-flex; border: 1px solid ${HAIRLINE}; border-radius: 4px; overflow: hidden; }
        .lf-toggle button { padding: 8px 16px; font-size: 13px; border: none; background: white; cursor: pointer; color: ${INK_SOFT}; }
        .lf-toggle button.active.income { background: ${FOREST}; color: white; }
        .lf-toggle button.active.expense { background: ${RUST}; color: white; }
        .lf-progress { height: 8px; background: ${PAPER_DARK}; border-radius: 4px; overflow: hidden; margin-top: 6px; }
        .lf-progress-fill { height: 100%; border-radius: 4px; }
        .lf-empty { color: ${INK_SOFT}; font-size: 13px; padding: 20px 0; text-align: center; }
        .lf-spin { animation: lf-spin 1s linear infinite; }
        @keyframes lf-spin { to { transform: rotate(360deg); } }
        .lf-report-heading { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: ${BRASS}; margin: 18px 0 8px; }
        .lf-report-heading:first-child { margin-top: 0; }
        .lf-report-bullet { font-size: 14px; padding-left: 14px; position: relative; margin: 4px 0; line-height: 1.5; }
        .lf-report-bullet:before { content: '—'; position: absolute; left: 0; color: ${BRASS}; }
        .lf-report-p { font-size: 14px; line-height: 1.5; margin: 6px 0; }
        .lf-debt-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 760px) { .lf-debt-grid { grid-template-columns: 1fr 1fr; } }
        textarea.lf-input { resize: vertical; }
        .lf-advisor-layout { display: grid; grid-template-columns: minmax(280px, 25%) 1fr; gap: 20px; min-height: calc(100vh - 300px); }
        @media (max-width: 900px) { .lf-advisor-layout { grid-template-columns: 1fr; } }
      `}</style>

      {/* header */}
      <div className="lf-header">
        <div className="lf-header-row">
          <div>
            <div className="lf-brand">Personal Ledger</div>
            <h1 className="lf-display lf-title">Kehinde Phillip Oyekunle</h1>
            <div className="lf-sub">Budget &amp; expense tracking · debt register · money psychology</div>
          </div>
          <div>
            <div className="lf-net-label">Net Position</div>
            <div className="lf-net-figure lf-mono" style={{ color: netPosition >= 0 ? FOREST : RUST }}>{formatNaira(netPosition)}</div>
            {onNavigate && (
              <button className="lf-btn-ghost" style={{ marginTop: 8 }} onClick={() => onNavigate('development')}>
                Personal development
              </button>
            )}
          </div>
        </div>
        {trendSpark.length > 1 && (
          <div className="lf-spark">
            <ResponsiveContainer width="100%" height={32}>
              <LineChart data={trendSpark}>
                <Line type="monotone" dataKey="balance" stroke={BRASS} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="lf-backup-row">
          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: dbStatus === 'connected' ? FOREST : dbStatus === 'error' ? RUST : INK_SOFT }}>
            {dbStatus === 'checking' && <Loader2 size={12} className="lf-spin" />}
            {dbStatus === 'connected' && <CheckCircle2 size={12} />}
            {dbStatus === 'error' && <AlertCircle size={12} />}
            {dbStatus === 'checking' ? 'Connecting to database…' : dbStatus === 'connected' ? 'Database connected' : 'Database unreachable'}
          </span>
          <button className="lf-btn-ghost" onClick={exportData}><Download size={13} /> Export backup</button>
          <button className="lf-btn-ghost" onClick={() => importInputRef.current && importInputRef.current.click()}><Upload size={13} /> Import backup</button>
          <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          {importMessage && <span style={{ fontSize: 12, color: INK_SOFT }}>{importMessage}</span>}
        </div>
      </div>

      {loadNote && (
        <div className="lf-load-banner">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{loadNote}</span>
          <button className="lf-btn-ghost" style={{ flexShrink: 0 }} onClick={() => setLoadNote('')}>Dismiss</button>
        </div>
      )}

      {saveError && (
        <div className="lf-load-banner" style={{ background: '#FBE2E2' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{saveError}</span>
          <button className="lf-btn-ghost" style={{ flexShrink: 0 }} onClick={() => setSaveError('')}>Dismiss</button>
        </div>
      )}

      {pendingImport && (
        <div className="lf-load-banner" style={{ background: '#FFF7E6' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            This backup has {pendingImport.transactions.length} transactions, {pendingImport.debts.length} debts, {pendingImport.recurringExpenses.length} recurring bills,
            and {pendingImport.expectedIncome.length} pending income entries. Importing will replace everything currently on this dashboard. Are you sure?
          </span>
          <button className="lf-btn" style={{ flexShrink: 0 }} onClick={confirmImport}>Replace with backup</button>
          <button className="lf-btn-ghost" style={{ flexShrink: 0 }} onClick={cancelImport}>Cancel</button>
        </div>
      )}

      {/* tabs */}
      <div className="lf-tabs">
        {['dashboard', 'transactions', 'upcoming', 'budgets', 'debts', 'insights'].map(t => (
          <button key={t} className={`lf-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'advisor' ? '✨ Financial Advisor' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="lf-body">
        {tab === 'dashboard' && (
          <Dashboard
            monthIncome={monthIncome} monthExpense={monthExpense} netFlow={netFlow}
            totalIOwe={totalIOwe} totalOwedToMe={totalOwedToMe}
            expenseByCategory={expenseByCategory} sixMonthTrend={sixMonthTrend}
            budgetPerformance={budgetPerformance} pieColors={pieColors}
            dueRecurring={dueRecurring} dueInstallments={dueInstallments} totalPendingIncome={totalPendingIncome}
            onMarkRecurringPaid={markRecurringPaid} onPayInstallment={payDebtInstallment}
          />
        )}
        {tab === 'transactions' && (
          <TransactionsTab
            transactions={data.transactions} onAdd={addTransaction} onDelete={deleteTransaction}
            debts={data.debts} expectedIncome={data.expectedIncome} recurringExpenses={data.recurringExpenses}
            onParsed={applyParsedAction}
          />
        )}
        {tab === 'upcoming' && (
          <UpcomingTab
            recurringExpenses={data.recurringExpenses} onAddRecurring={addRecurringExpense}
            onMarkRecurringPaid={markRecurringPaid} onDeleteRecurring={deleteRecurringExpense}
            currentMonthKey={currentMonthKey}
            expectedIncome={data.expectedIncome} onAddExpected={addExpectedIncome}
            onMarkReceived={markExpectedReceived} onDeleteExpected={deleteExpectedIncome}
          />
        )}
        {tab === 'budgets' && (
          <BudgetsTab budgetPerformance={budgetPerformance} onUpsert={upsertBudget} onDelete={deleteBudget} usedCategories={data.budgets.map(b => b.category)} />
        )}
        {tab === 'debts' && (
          <DebtsTab
            debts={data.debts} onAdd={addDebt} onRepay={addRepayment} onDelete={deleteDebt}
            onSettleFull={settleDebtFull} onSetRecurring={setDebtRecurring} onPayInstallment={payDebtInstallment}
            currentMonthKey={currentMonthKey}
          />
        )}
        {tab === 'insights' && (
          <InsightsTab
            expenseByCategory={expenseByCategory} transactions={data.transactions}
            report={report} reportLoading={reportLoading} reportError={reportError} onGenerate={generateReport}
          />
        )}
        {/* Financial Advisor is hidden for now. Insights and recommendations remain available.
        {tab === 'advisor' && (
          <AdvisorTab
            financialData={{
              transactions: data.transactions,
              debts: data.debts,
              budgets: data.budgets,
              recurringExpenses: data.recurringExpenses,
              expectedIncome: data.expectedIncome,
              monthIncome, monthExpense, netFlow, totalIOwe, totalOwedToMe,
            }}
            chats={data.advisorChats}
            plans={data.advisorPlans}
            onAddChat={addAdvisorChat}
            onAddMessage={addAdvisorMessage}
            onAddPlan={addAdvisorPlan}
            onUpdatePlan={updateAdvisorPlan}
            onDeletePlan={deleteAdvisorPlan}
          />
        )} */}
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ monthIncome, monthExpense, netFlow, totalIOwe, totalOwedToMe, expenseByCategory, sixMonthTrend, budgetPerformance, pieColors, dueRecurring, dueInstallments, totalPendingIncome, onMarkRecurringPaid, onPayInstallment }) {
  const dueCount = dueRecurring.length + dueInstallments.length;
  return (
    <div>
      <div className="lf-cards">
        <div className="lf-card">
          <div className="lf-card-label"><TrendingUp size={13} /> Income this month</div>
          <div className="lf-card-value lf-mono" style={{ color: FOREST }}>{formatNaira(monthIncome)}</div>
        </div>
        <div className="lf-card">
          <div className="lf-card-label"><TrendingDown size={13} /> Expense this month</div>
          <div className="lf-card-value lf-mono" style={{ color: RUST }}>{formatNaira(monthExpense)}</div>
        </div>
        <div className="lf-card">
          <div className="lf-card-label"><Wallet size={13} /> Net cash flow</div>
          <div className="lf-card-value lf-mono" style={{ color: netFlow >= 0 ? FOREST : RUST }}>{formatNaira(netFlow)}</div>
        </div>
        <div className="lf-card">
          <div className="lf-card-label"><Landmark size={13} /> I owe</div>
          <div className="lf-card-value lf-mono" style={{ color: RUST }}>{formatNaira(totalIOwe)}</div>
        </div>
        <div className="lf-card">
          <div className="lf-card-label"><Landmark size={13} /> Owed to me</div>
          <div className="lf-card-value lf-mono" style={{ color: FOREST }}>{formatNaira(totalOwedToMe)}</div>
        </div>
        <div className="lf-card">
          <div className="lf-card-label"><CalendarClock size={13} /> Pending income</div>
          <div className="lf-card-value lf-mono" style={{ color: BRASS }}>{formatNaira(totalPendingIncome)}</div>
        </div>
      </div>

      {dueCount > 0 && (
        <div className="lf-panel">
          <h3 className="lf-panel-title">Due this month ({dueCount})</h3>
          {dueRecurring.map(r => (
            <div className="lf-ledger-line" key={r.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Repeat size={14} style={{ color: INK_SOFT, flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>{r.label}</span>
                <span className="lf-cat-badge">{r.category}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="lf-mono" style={{ fontWeight: 600 }}>{formatNaira(r.amount)}</span>
                <button className="lf-btn-ghost" onClick={() => onMarkRecurringPaid(r.id)}><Check size={13} /> Paid</button>
              </div>
            </div>
          ))}
          {dueInstallments.map(d => (
            <div className="lf-ledger-line" key={d.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Repeat size={14} style={{ color: INK_SOFT, flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>Installment — {d.person}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="lf-mono" style={{ fontWeight: 600 }}>{formatNaira(d.recurringInstallment.amount)}</span>
                <button className="lf-btn-ghost" onClick={() => onPayInstallment(d.id)}><Check size={13} /> Paid</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="lf-panel">
        <h3 className="lf-panel-title">Income vs. expense — last 6 months</h3>
        {sixMonthTrend.some(m => m.income || m.expense) ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sixMonthTrend}>
              <CartesianGrid stroke={HAIRLINE} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: INK_SOFT }} axisLine={{ stroke: HAIRLINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `\u20a6${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatNaira(v)} />
              <Line type="monotone" dataKey="income" stroke={FOREST} strokeWidth={2} dot={{ r: 3 }} name="Income" />
              <Line type="monotone" dataKey="expense" stroke={RUST} strokeWidth={2} dot={{ r: 3 }} name="Expense" />
            </LineChart>
          </ResponsiveContainer>
        ) : <div className="lf-empty">No transactions logged yet. Add one in the Transactions tab.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
        <div className="lf-panel">
          <h3 className="lf-panel-title">Expense breakdown — this month</h3>
          {expenseByCategory.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {expenseByCategory.map((entry, i) => <Cell key={entry.name} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatNaira(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="lf-empty">No expenses logged this month yet.</div>}
        </div>

        <div className="lf-panel">
          <h3 className="lf-panel-title">Budget vs. actual — this month</h3>
          {budgetPerformance.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, budgetPerformance.length * 46)}>
              <BarChart data={budgetPerformance} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke={HAIRLINE} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: INK_SOFT }} tickFormatter={(v) => `\u20a6${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: INK }} width={120} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatNaira(v)} />
                <Bar dataKey="limit" fill={PAPER_DARK} name="Budget" radius={[2, 2, 2, 2]} />
                <Bar dataKey="actual" fill={BRASS} name="Actual" radius={[2, 2, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="lf-empty">No budgets set yet. Add categories in the Budgets tab.</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Quick Entry (natural language) ---------- */
function QuickEntry({ debts, expectedIncome, recurringExpenses, onParsed }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const context = {
        knownDebtPersons: debts.filter(d => debtOutstanding(d) > 0).map(d => d.person),
        knownExpectedIncome: expectedIncome.map(e => e.description),
        knownRecurringBills: recurringExpenses.map(r => r.label),
        note: text.trim(),
      };
      const res = await fetch('/.netlify/functions/anthropic-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OPENROUTER_MODEL, max_tokens: 300, system: PARSER_PROMPT, messages: [{ role: 'user', content: JSON.stringify(context) }] }),
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
    <div className="lf-panel">
      <h3 className="lf-panel-title"><MessageSquare size={14} style={{ verticalAlign: -2 }} /> Quick entry — say what happened</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="lf-input" style={{ flex: 1 }}
          placeholder="e.g. paid off my debt to John, or spent 5k on fuel"
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <button className="lf-btn" onClick={submit} disabled={loading}>{loading ? <Loader2 size={14} className="lf-spin" /> : 'Process'}</button>
      </div>
      {result && (
        <div style={{ fontSize: 12, marginTop: 8, color: result.ok ? FOREST : RUST }}>{result.message}</div>
      )}
    </div>
  );
}

/* ---------- Transactions ---------- */
function TransactionsTab({ transactions, onAdd, onDelete, debts, expectedIncome, recurringExpenses, onParsed }) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayStr());
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;

  const submit = () => {
    if (!amount || Number(amount) <= 0 || !category) return;
    onAdd({ type, amount: Number(amount), category, description, date });
    setAmount(''); setDescription('');
  };

  return (
    <div>
      <QuickEntry debts={debts} expectedIncome={expectedIncome} recurringExpenses={recurringExpenses} onParsed={onParsed} />

      <div className="lf-panel">
        <h3 className="lf-panel-title">Add a transaction</h3>
        <div style={{ marginBottom: 12 }}>
          <div className="lf-toggle">
            <button className={type === 'income' ? 'active income' : ''} onClick={() => { setType('income'); setCategory(''); }}>Income</button>
            <button className={type === 'expense' ? 'active expense' : ''} onClick={() => { setType('expense'); setCategory(''); }}>Expense</button>
          </div>
        </div>
        <div className="lf-form-grid">
          <input className="lf-input lf-mono" type="number" min="0" placeholder="Amount (\u20a6)" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="lf-input" list="lf-cat-list" placeholder="Category" value={category} onChange={e => setCategory(e.target.value)} />
          <datalist id="lf-cat-list">{cats.map(c => <option key={c} value={c} />)}</datalist>
          <input className="lf-input" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
          <input className="lf-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="lf-btn" onClick={submit}><Plus size={14} /> Add</button>
        </div>
      </div>

      <div className="lf-panel">
        <h3 className="lf-panel-title">Ledger ({transactions.length})</h3>
        {transactions.length === 0 && <div className="lf-empty">No entries yet — your ledger starts here.</div>}
        {transactions.map(t => (
          <div className="lf-ledger-line" key={t.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {t.type === 'income' ? <ArrowUpRight size={15} style={{ color: FOREST, flexShrink: 0 }} /> : <ArrowDownRight size={15} style={{ color: RUST, flexShrink: 0 }} />}
              <span className="lf-mono" style={{ fontSize: 12, color: INK_SOFT, flexShrink: 0 }}>{t.date}</span>
              <span className="lf-cat-badge">{t.category}</span>
              <span style={{ fontSize: 13, color: INK_SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span className="lf-mono" style={{ fontWeight: 600, color: t.type === 'income' ? FOREST : RUST }}>{t.type === 'income' ? '+' : '-'}{formatNaira(t.amount)}</span>
              <Trash2 size={14} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(t.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Budgets ---------- */
function BudgetsTab({ budgetPerformance, onUpsert, onDelete, usedCategories }) {
  const [newCat, setNewCat] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const available = EXPENSE_CATS.filter(c => !usedCategories.includes(c));

  return (
    <div>
      <div className="lf-panel">
        <h3 className="lf-panel-title">Add a budget category</h3>
        <div className="lf-form-grid">
          <input className="lf-input" list="lf-budget-cats" placeholder="Category" value={newCat} onChange={e => setNewCat(e.target.value)} />
          <datalist id="lf-budget-cats">{available.map(c => <option key={c} value={c} />)}</datalist>
          <input className="lf-input lf-mono" type="number" min="0" placeholder="Monthly limit (\u20a6)" value={newLimit} onChange={e => setNewLimit(e.target.value)} />
          <button className="lf-btn" onClick={() => { if (newCat && newLimit) { onUpsert(newCat, Number(newLimit)); setNewCat(''); setNewLimit(''); } }}><Plus size={14} /> Add</button>
        </div>
      </div>

      <div className="lf-panel">
        <h3 className="lf-panel-title">This month's budgets</h3>
        {budgetPerformance.length === 0 && <div className="lf-empty">No budgets set yet.</div>}
        {budgetPerformance.map(b => {
          const pct = b.limit > 0 ? Math.min(150, (b.actual / b.limit) * 100) : 0;
          const over = b.actual > b.limit;
          return (
            <div key={b.category} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{b.category}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="lf-mono" style={{ fontSize: 12, color: over ? RUST : INK_SOFT }}>{formatNaira(b.actual)} / {formatNaira(b.limit)}</span>
                  <Trash2 size={13} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(b.category)} />
                </span>
              </div>
              <div className="lf-progress">
                <div className="lf-progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: over ? RUST : BRASS }} />
              </div>
              {over && <div style={{ fontSize: 11, color: RUST, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={11} /> Over budget by {formatNaira(b.actual - b.limit)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Debts ---------- */
function DebtsTab({ debts, onAdd, onRepay, onDelete, onSettleFull, onSetRecurring, onPayInstallment, currentMonthKey }) {
  const [direction, setDirection] = useState('i_owe');
  const [person, setPerson] = useState('');
  const [principal, setPrincipal] = useState('');
  const [date, setDate] = useState(todayStr());

  const submit = () => {
    if (!person || !principal) return;
    onAdd({ person, principal: Number(principal), direction, dateIncurred: date, status: 'open' });
    setPerson(''); setPrincipal('');
  };

  const iOwe = debts.filter(d => d.direction === 'i_owe');
  const owedToMe = debts.filter(d => d.direction === 'owed_to_me');

  return (
    <div>
      <div className="lf-panel">
        <h3 className="lf-panel-title">Add a debt</h3>
        <div style={{ marginBottom: 12 }}>
          <div className="lf-toggle">
            <button className={direction === 'i_owe' ? 'active expense' : ''} onClick={() => setDirection('i_owe')}>I owe</button>
            <button className={direction === 'owed_to_me' ? 'active income' : ''} onClick={() => setDirection('owed_to_me')}>Owed to me</button>
          </div>
        </div>
        <div className="lf-form-grid">
          <input className="lf-input" placeholder="Person" value={person} onChange={e => setPerson(e.target.value)} />
          <input className="lf-input lf-mono" type="number" min="0" placeholder="Amount (\u20a6)" value={principal} onChange={e => setPrincipal(e.target.value)} />
          <input className="lf-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="lf-btn" onClick={submit}><Plus size={14} /> Add</button>
        </div>
      </div>

      <div className="lf-debt-grid">
        <DebtColumn title="I Owe" color={RUST} debts={iOwe} onRepay={onRepay} onDelete={onDelete} onSettleFull={onSettleFull} onSetRecurring={onSetRecurring} onPayInstallment={onPayInstallment} currentMonthKey={currentMonthKey} />
        <DebtColumn title="Owed To Me" color={FOREST} debts={owedToMe} onRepay={onRepay} onDelete={onDelete} onSettleFull={onSettleFull} onSetRecurring={onSetRecurring} onPayInstallment={onPayInstallment} currentMonthKey={currentMonthKey} />
      </div>
    </div>
  );
}

function DebtColumn({ title, color, debts, onRepay, onDelete, onSettleFull, onSetRecurring, onPayInstallment, currentMonthKey }) {
  return (
    <div className="lf-panel">
      <h3 className="lf-panel-title" style={{ color }}>{title}</h3>
      {debts.length === 0 && <div className="lf-empty">Nothing here.</div>}
      {debts.map(d => <DebtCard key={d.id} debt={d} color={color} onRepay={onRepay} onDelete={onDelete} onSettleFull={onSettleFull} onSetRecurring={onSetRecurring} onPayInstallment={onPayInstallment} currentMonthKey={currentMonthKey} />)}
    </div>
  );
}

function DebtCard({ debt, color, onRepay, onDelete, onSettleFull, onSetRecurring, onPayInstallment, currentMonthKey }) {
  const [amount, setAmount] = useState('');
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [installmentAmount, setInstallmentAmount] = useState(debt.recurringInstallment ? debt.recurringInstallment.amount : '');
  const [installmentDay, setInstallmentDay] = useState(debt.recurringInstallment ? debt.recurringInstallment.dueDay : 1);
  const outstanding = debtOutstanding(debt);
  const settled = outstanding <= 0;
  const installmentDueThisMonth = debt.recurringInstallment && debt.lastInstallmentMonth !== currentMonthKey;

  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 4, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{debt.person}</div>
          <div style={{ fontSize: 11, color: INK_SOFT }}>since {debt.dateIncurred} · principal {formatNaira(debt.principal)}</div>
        </div>
        <Trash2 size={14} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(debt.id)} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {settled ? (
          <span style={{ fontSize: 12, color: FOREST, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={13} /> Settled</span>
        ) : (
          <span className="lf-mono" style={{ fontSize: 14, fontWeight: 600, color }}>{formatNaira(outstanding)} outstanding</span>
        )}
      </div>
      {debt.recurringInstallment && (
        <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Repeat size={11} /> {formatNaira(debt.recurringInstallment.amount)}/month, due day {debt.recurringInstallment.dueDay}
        </div>
      )}
      {(debt.repayments || []).length > 0 && (
        <div style={{ marginTop: 6 }}>
          {debt.repayments.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: INK_SOFT, display: 'flex', justifyContent: 'space-between' }}>
              <span>repaid {r.date}</span><span className="lf-mono">{formatNaira(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {!settled && (
        <>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <input className="lf-input lf-mono" style={{ flex: 1, minWidth: 100 }} type="number" min="0" placeholder="Repayment amount" value={amount} onChange={e => setAmount(e.target.value)} />
            <button className="lf-btn-ghost" onClick={() => { if (amount) { onRepay(debt.id, Number(amount), todayStr()); setAmount(''); } }}>Log</button>
            <button className="lf-btn-ghost" onClick={() => onSettleFull(debt.id)}><Check size={13} /> Mark Paid</button>
          </div>
          {installmentDueThisMonth && (
            <button className="lf-btn-ghost" style={{ marginTop: 8 }} onClick={() => onPayInstallment(debt.id)}><Repeat size={13} /> Pay this month's installment ({formatNaira(debt.recurringInstallment.amount)})</button>
          )}
          <div style={{ marginTop: 8 }}>
            {!showRecurringForm ? (
              <button className="lf-btn-ghost" onClick={() => setShowRecurringForm(true)}>
                <Repeat size={13} /> {debt.recurringInstallment ? 'Edit recurring installment' : 'Set up monthly installment'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="lf-input lf-mono" style={{ width: 110 }} type="number" min="0" placeholder="Amount/month" value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)} />
                <input className="lf-input lf-mono" style={{ width: 80 }} type="number" min="1" max="31" placeholder="Due day" value={installmentDay} onChange={e => setInstallmentDay(e.target.value)} />
                <button className="lf-btn-ghost" onClick={() => { onSetRecurring(debt.id, installmentAmount ? { amount: Number(installmentAmount), dueDay: Number(installmentDay) || 1 } : null); setShowRecurringForm(false); }}>Save</button>
                {debt.recurringInstallment && <button className="lf-btn-ghost" onClick={() => { onSetRecurring(debt.id, null); setShowRecurringForm(false); }}>Remove</button>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Insights ---------- */
function InsightsTab({ expenseByCategory, transactions, report, reportLoading, reportError, onGenerate }) {
  const topCategory = expenseByCategory[0];
  const total = expenseByCategory.reduce((s, c) => s + c.value, 0);
  const topShare = topCategory && total ? Math.round((topCategory.value / total) * 100) : 0;

  const weekendSpend = transactions.filter(t => t.type === 'expense' && [0, 6].includes(new Date(t.date).getDay())).reduce((s, t) => s + Number(t.amount), 0);
  const weekdaySpend = transactions.filter(t => t.type === 'expense' && ![0, 6].includes(new Date(t.date).getDay())).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      <div className="lf-panel">
        <h3 className="lf-panel-title">Observed patterns</h3>
        {topCategory ? (
          <p style={{ fontSize: 13, color: INK_SOFT, lineHeight: 1.6 }}>
            <strong style={{ color: INK }}>{topCategory.name}</strong> is your largest expense category this month at {topShare}% of total spend ({formatNaira(topCategory.value)}).
            {' '}Weekend spending is {formatNaira(weekendSpend)} versus {formatNaira(weekdaySpend)} on weekdays so far on record.
          </p>
        ) : <div className="lf-empty">Log a few transactions to start seeing patterns here.</div>}
      </div>

      <div className="lf-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 className="lf-panel-title" style={{ margin: 0 }}>Recommendations &amp; Next Steps</h3>
          <button className="lf-btn" onClick={onGenerate} disabled={reportLoading}>
            {reportLoading ? <Loader2 size={14} className="lf-spin" /> : <Sparkles size={14} />}
            {reportLoading ? 'Generating…' : 'Generate report'}
          </button>
        </div>
        {reportError && <div style={{ color: RUST, fontSize: 12, marginTop: 8 }}>{reportError}</div>}
        {!report && !reportLoading && !reportError && (
          <div className="lf-empty">Generate a full advisory report — key observations, strengths, concerns, and action steps — based on your current ledger.</div>
        )}
        {report && <div style={{ marginTop: 10 }}><ReportBody text={report} /></div>}
        <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 16, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
          This is informational coaching, not licensed financial advice. For major debt or investment decisions, consult a licensed professional.
        </div>
      </div>
    </div>
  );
}

/* ---------- Upcoming: recurring bills + expected income ---------- */
function UpcomingTab({ recurringExpenses, onAddRecurring, onMarkRecurringPaid, onDeleteRecurring, currentMonthKey, expectedIncome, onAddExpected, onMarkReceived, onDeleteExpected }) {
  return (
    <div>
      <RecurringBillsPanel
        items={recurringExpenses} onAdd={onAddRecurring} onMarkPaid={onMarkRecurringPaid} onDelete={onDeleteRecurring} currentMonthKey={currentMonthKey}
      />
      <ExpectedIncomePanel
        items={expectedIncome} onAdd={onAddExpected} onMarkReceived={onMarkReceived} onDelete={onDeleteExpected}
      />
    </div>
  );
}

function RecurringBillsPanel({ items, onAdd, onMarkPaid, onDelete, currentMonthKey }) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');

  const submit = () => {
    if (!label || !amount) return;
    onAdd({ label, category: category || 'Miscellaneous', amount: Number(amount), dueDay: Number(dueDay) || 1 });
    setLabel(''); setCategory(''); setAmount('');
  };

  return (
    <div className="lf-panel">
      <h3 className="lf-panel-title"><Repeat size={14} style={{ verticalAlign: -2 }} /> Recurring bills</h3>
      <div className="lf-form-grid" style={{ marginBottom: 14 }}>
        <input className="lf-input" placeholder="Label (e.g. Rent)" value={label} onChange={e => setLabel(e.target.value)} />
        <input className="lf-input" list="lf-recurring-cats" placeholder="Category" value={category} onChange={e => setCategory(e.target.value)} />
        <datalist id="lf-recurring-cats">{EXPENSE_CATS.map(c => <option key={c} value={c} />)}</datalist>
        <input className="lf-input lf-mono" type="number" min="0" placeholder="Amount/month" value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="lf-input lf-mono" type="number" min="1" max="31" placeholder="Due day" value={dueDay} onChange={e => setDueDay(e.target.value)} />
        <button className="lf-btn" onClick={submit}><Plus size={14} /> Add</button>
      </div>
      {items.length === 0 && <div className="lf-empty">No recurring bills set up yet.</div>}
      {items.map(r => {
        const paidThisMonth = r.lastPaidMonth === currentMonthKey;
        return (
          <div className="lf-ledger-line" key={r.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</span>
              <span className="lf-cat-badge">{r.category}</span>
              <span style={{ fontSize: 11, color: INK_SOFT }}>day {r.dueDay}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span className="lf-mono" style={{ fontWeight: 600 }}>{formatNaira(r.amount)}</span>
              {paidThisMonth ? (
                <span style={{ fontSize: 11, color: FOREST, display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle2 size={12} /> Paid</span>
              ) : (
                <button className="lf-btn-ghost" onClick={() => onMarkPaid(r.id)}><Check size={12} /> Paid</button>
              )}
              <Trash2 size={13} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(r.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpectedIncomePanel({ items, onAdd, onMarkReceived, onDelete }) {
  const [description, setDescription] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [expectedDate, setExpectedDate] = useState(todayStr());

  const submit = () => {
    if (!description || !expectedAmount) return;
    onAdd({ description, expectedAmount: Number(expectedAmount), expectedDate });
    setDescription(''); setExpectedAmount('');
  };

  return (
    <div className="lf-panel">
      <h3 className="lf-panel-title"><CalendarClock size={14} style={{ verticalAlign: -2 }} /> Expected income</h3>
      <div className="lf-form-grid" style={{ marginBottom: 14 }}>
        <input className="lf-input" placeholder="Source / description" value={description} onChange={e => setDescription(e.target.value)} />
        <input className="lf-input lf-mono" type="number" min="0" placeholder="Expected amount" value={expectedAmount} onChange={e => setExpectedAmount(e.target.value)} />
        <input className="lf-input" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
        <button className="lf-btn" onClick={submit}><Plus size={14} /> Add</button>
      </div>
      {items.length === 0 && <div className="lf-empty">Nothing expected right now.</div>}
      {items.map(e => <ExpectedIncomeRow key={e.id} item={e} onMarkReceived={onMarkReceived} onDelete={onDelete} />)}
    </div>
  );
}

function ExpectedIncomeRow({ item, onMarkReceived, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(item.expectedAmount);
  const [date, setDate] = useState(todayStr());

  return (
    <div className="lf-ledger-line" style={{ flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 13 }}>{item.description}</span>
        <span style={{ fontSize: 11, color: INK_SOFT }}>expected {item.expectedDate}</span>
      </div>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span className="lf-mono" style={{ fontWeight: 600, color: BRASS }}>{formatNaira(item.expectedAmount)}</span>
          <button className="lf-btn-ghost" onClick={() => setEditing(true)}><Check size={12} /> Mark Received</button>
          <Trash2 size={13} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(item.id)} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, width: '100%' }}>
          <input className="lf-input lf-mono" style={{ width: 110 }} type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="lf-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <button className="lf-btn-ghost" onClick={() => { onMarkReceived(item.id, Number(amount), date); }}>Confirm</button>
          <button className="lf-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Financial Advisor Chat ---------- */
function AdvisorTab({ financialData, chats, plans, onAddChat, onAddMessage, onAddPlan, onUpdatePlan, onDeletePlan }) {
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [showPlanForm, setShowPlanForm] = useState(false);

  const selectedChat = chats.find(c => c.id === selectedChatId);

  return (
    <div className="lf-advisor-layout">
      {/* Sidebar: Chat list */}
      <div className="lf-panel" style={{ margin: 0, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
        <h3 className="lf-panel-title">Conversations</h3>
        <button className="lf-btn" onClick={() => { const cid = uid(); onAddChat(cid, ''); setSelectedChatId(cid); }} style={{ width: '100%', marginBottom: 12 }}>
          <Plus size={14} /> New chat
        </button>
        {chats.length === 0 ? (
          <div className="lf-empty">No conversations yet. Start one to discuss your finances with the AI advisor.</div>
        ) : (
          chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              style={{
                padding: '10px 8px',
                marginBottom: 6,
                borderRadius: 4,
                background: selectedChatId === chat.id ? BRASS_SOFT : PAPER_DARK,
                cursor: 'pointer',
                fontSize: 12,
                color: INK,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {chat.messages[0]?.content?.substring(0, 30) || 'New conversation'}
            </div>
          ))
        )}
      </div>

      {/* Main: Chat or Plans */}
      <div>
        {selectedChat ? (
          <AdvisorChatWindow
            chat={selectedChat}
            financialData={financialData}
            onSendMessage={onAddMessage}
            onCreatePlan={onAddPlan}
          />
        ) : (
          <AdvisorPlansPanel plans={plans} onAdd={onAddPlan} onUpdate={onUpdatePlan} onDelete={onDeletePlan} onShowForm={() => setShowPlanForm(!showPlanForm)} showForm={showPlanForm} />
        )}
      </div>
    </div>
  );
}

function AdvisorChatWindow({ chat, financialData, onSendMessage, onCreatePlan }) {
  const [userMessage, setUserMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat.messages]);

  const sendMessage = async () => {
    if (!userMessage.trim()) return;
    
    setLoading(true);
    onSendMessage(chat.id, { role: 'user', content: userMessage });
    setUserMessage('');

    try {
      // Build context: financial summary + conversation history
      const summary = {
        currentMonth: new Date().toISOString().slice(0, 7),
        monthIncomeNGN: financialData.monthIncome,
        monthExpenseNGN: financialData.monthExpense,
        netFlowNGN: financialData.netFlow,
        totalIOweNGN: financialData.totalIOwe,
        totalOwedToMeNGN: financialData.totalOwedToMe,
        recentTransactions: financialData.transactions.slice(0, 15),
        debts: financialData.debts,
        budgets: financialData.budgets,
      };

      const messages = [
        ...chat.messages,
        { role: 'user', content: userMessage }
      ].slice(-10); // Keep last 10 messages for context

      const res = await fetch('/.netlify/functions/anthropic-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          max_tokens: 750,
          system: `${ADVISOR_SYSTEM_PROMPT}\n\nFinancial Context:\n${JSON.stringify(summary, null, 2)}`,
          messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `AI request failed (${res.status})`);
      const text = aiText(json);
      if (!text) throw new Error('empty response');
      
      onSendMessage(chat.id, { role: 'assistant', content: text });
    } catch (e) {
      onSendMessage(chat.id, { role: 'assistant', content: `Sorry, I couldn't process that right now. Error: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lf-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 300px)' }}>
      <h3 className="lf-panel-title">Financial Advisor</h3>
      
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 14, paddingRight: 8 }}>
        {chat.messages.length === 0 ? (
          <div className="lf-empty" style={{ paddingTop: 40 }}>Start by asking about your finances, or ask me to help you create a plan.</div>
        ) : (
          chat.messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 14, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
              <div
                style={{
                  display: 'inline-block',
                  maxWidth: '85%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: msg.role === 'user' ? BRASS : PAPER_DARK,
                  color: msg.role === 'user' ? 'white' : INK,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="lf-input"
          style={{ flex: 1 }}
          placeholder="Ask about your finances or research topics..."
          value={userMessage}
          onChange={e => setUserMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          disabled={loading}
        />
        <button className="lf-btn" onClick={sendMessage} disabled={loading || !userMessage.trim()}>
          {loading ? <Loader2 size={14} className="lf-spin" /> : <MessageSquare size={14} />}
        </button>
      </div>
    </div>
  );
}

function AdvisorPlansPanel({ plans, onAdd, onUpdate, onDelete, onShowForm, showForm }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [timeline, setTimeline] = useState('');

  const submit = () => {
    if (!title) return;
    onAdd({
      title,
      description,
      steps: steps.split('\n').filter(s => s.trim()),
      timeline,
      completed: false,
    });
    setTitle('');
    setDescription('');
    setSteps('');
    setTimeline('');
    onShowForm();
  };

  return (
    <div className="lf-panel">
      <h3 className="lf-panel-title">Financial Plans & Goals</h3>
      
      {showForm ? (
        <div style={{ marginBottom: 16, padding: 12, background: PAPER_DARK, borderRadius: 4 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input className="lf-input" placeholder="Plan title" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="lf-input" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
            <textarea className="lf-input" placeholder="Action steps (one per line)" value={steps} onChange={e => setSteps(e.target.value)} style={{ minHeight: 80, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }} />
            <input className="lf-input" placeholder="Timeline (e.g., 3 months)" value={timeline} onChange={e => setTimeline(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="lf-btn" onClick={submit}><Check size={14} /> Save plan</button>
              <button className="lf-btn-ghost" onClick={onShowForm}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="lf-btn" onClick={onShowForm} style={{ marginBottom: 16, width: '100%' }}>
          <Plus size={14} /> Create new plan
        </button>
      )}

      {plans.length === 0 ? (
        <div className="lf-empty">No plans yet. Create one based on advice from your financial advisor.</div>
      ) : (
        plans.map(plan => (
          <div key={plan.id} style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 4, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{plan.title}</div>
                {plan.description && <div style={{ fontSize: 12, color: INK_SOFT, marginTop: 4 }}>{plan.description}</div>}
                {plan.timeline && <div style={{ fontSize: 11, color: BRASS, marginTop: 4 }}>⏱ {plan.timeline}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="lf-btn-ghost" onClick={() => onUpdate(plan.id, { completed: !plan.completed })}>
                  {plan.completed ? '✓' : '○'}
                </button>
                <Trash2 size={14} style={{ color: INK_SOFT, cursor: 'pointer' }} onClick={() => onDelete(plan.id)} />
              </div>
            </div>
            {plan.steps && plan.steps.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${HAIRLINE}` }}>
                {plan.steps.map((step, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '4px 0', color: INK_SOFT, display: 'flex', gap: 8 }}>
                    <span>{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
