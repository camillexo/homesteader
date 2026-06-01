import React, { useState, useEffect, useMemo } from "react";
import { Home, Plus, Trash2, ExternalLink, Info, TrendingUp, DollarSign, FileText, AlertCircle, X, MapPin } from "lucide-react";

// ============================================================
// First-Time Homebuyer Scenario Planner
// Designed for an H1B holder (U.S. tax resident, non-citizen)
// Focus states: South Carolina & Illinois
// ============================================================

// ---- 2025/2026 reference assumptions (editable in UI) ----
const STATE_DATA = {
  SC: {
    name: "South Carolina",
    propertyTaxRate: 0.0057,      // ~0.57% effective avg (owner-occupied 4% assessment ratio)
    insuranceAnnualPer1k: 6.5,    // homeowners ins est per $1k of value/yr (coastal higher)
    transferTaxRate: 0.0037,      // deed recording / transfer (~$3.70 per $1000) — paid by seller typically
    note: "SC gives a 4% assessment ratio + Homestead-style relief on owner-occupied primary residences, which keeps effective property tax low. Coastal counties (Charleston, Beaufort) carry much higher windstorm/flood insurance.",
  },
  IL: {
    name: "Illinois",
    propertyTaxRate: 0.0223,      // ~2.23% effective avg — among highest in U.S.
    insuranceAnnualPer1k: 5.5,
    transferTaxRate: 0.0015,      // state $0.50/$500 + county; Chicago adds municipal
    note: "Illinois has some of the highest property taxes in the country (Cook County especially). Always verify the exact county rate — it dramatically changes affordability.",
  },
};

const LOAN_TYPES = {
  conventional: { name: "Conventional (Fannie/Freddie)", minDown: 0.03, rate: 0.0688, pmiThreshold: 0.20 },
  fha: { name: "FHA", minDown: 0.035, rate: 0.0675, pmiThreshold: 1.0 }, // FHA MIP for full term in most cases
  jumbo: { name: "Jumbo (>$806,500)", minDown: 0.10, rate: 0.0715, pmiThreshold: 0.20 },
};

const fmt = (n) =>
  isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
const fmt2 = (n) =>
  isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
const pct = (n) => (isFinite(n) ? (n * 100).toFixed(2) + "%" : "—");

// Monthly P&I
function monthlyPI(principal, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function computeScenario(inputs) {
  const {
    price, downPct, state, loanType, hoaMonthly, rate, term,
    insuranceOverride, propTaxOverride,
  } = inputs;

  const sd = STATE_DATA[state];
  const lt = LOAN_TYPES[loanType];
  const down = price * (downPct / 100);
  const loan = price - down;

  const propTaxAnnual = propTaxOverride != null && propTaxOverride !== "" ? Number(propTaxOverride) : price * sd.propertyTaxRate;
  const insAnnual = insuranceOverride != null && insuranceOverride !== "" ? Number(insuranceOverride) : (price / 1000) * sd.insuranceAnnualPer1k;

  const pi = monthlyPI(loan, rate / 100, term);

  // PMI / MIP
  let pmiMonthly = 0;
  const ltv = loan / price;
  if (loanType === "fha") {
    pmiMonthly = (loan * 0.0055) / 12; // ~0.55% annual MIP
  } else if (ltv > 0.80) {
    pmiMonthly = (loan * 0.007) / 12; // ~0.7% annual PMI estimate
  }

  const taxMonthly = propTaxAnnual / 12;
  const insMonthly = insAnnual / 12;
  const totalMonthly = pi + taxMonthly + insMonthly + pmiMonthly + Number(hoaMonthly || 0);

  // Closing costs ~3% of price (lender fees, title, escrow, recording)
  const closingCosts = price * 0.03;
  const cashToClose = down + closingCosts;

  // Income needed at 28% front-end DTI
  const incomeFront28 = (totalMonthly * 12) / 0.28;
  // 36% back-end (assume modest other debt headroom)
  const incomeBack36 = (totalMonthly * 12) / 0.36;

  return {
    down, loan, pi, taxMonthly, insMonthly, pmiMonthly, ltv,
    propTaxAnnual, insAnnual, totalMonthly, closingCosts, cashToClose,
    incomeFront28, incomeBack36, minDownPct: lt.minDown * 100,
  };
}

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,900&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

export default function App() {
  const [homes, setHomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  // ---- persistence ----
  useEffect(() => {
    (async () => {
      try {
        const list = await window.storage.list("home:");
        const keys = list?.keys || [];
        const loaded = [];
        for (const k of keys) {
          try {
            const r = await window.storage.get(k.key ?? k);
            if (r?.value) loaded.push(JSON.parse(r.value));
          } catch (e) { /* skip */ }
        }
        loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setHomes(loaded);
        if (loaded.length) setActiveId(loaded[0].id);
      } catch (e) {
        console.log("No saved homes yet");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveHome(home) {
    try { await window.storage.set(`home:${home.id}`, JSON.stringify(home)); }
    catch (e) { console.error("save failed", e); }
  }
  async function removeHome(id) {
    try { await window.storage.delete(`home:${id}`); } catch (e) {}
    setHomes((h) => {
      const next = h.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || null);
      return next;
    });
  }

  const active = homes.find((h) => h.id === activeId) || null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <style>{FONTS}{`
        :root{
          --paper:#f4f0e6; --ink:#1c1a17; --accent:#0b3d2e; --accent2:#c5512c;
          --gold:#b8893b; --line:#d8d1be; --card:#fbf9f2; --muted:#6b6557;
        }
        *{box-sizing:border-box;}
        ::selection{background:var(--accent2);color:#fff;}
        .hb-num{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;}
        .hb-disp{font-family:'Fraunces',serif;}
        .hb-body{font-family:'Newsreader',Georgia,serif;}
        .hb-btn{cursor:pointer;border:none;font-family:'IBM Plex Mono',monospace;letter-spacing:.04em;transition:all .18s ease;}
        .hb-btn:hover{transform:translateY(-1px);}
        .hb-card{background:var(--card);border:1px solid var(--line);}
        input,select{font-family:'IBM Plex Mono',monospace;background:var(--paper);border:1px solid var(--line);color:var(--ink);padding:9px 11px;width:100%;outline:none;transition:border .15s;border-radius:2px;}
        input:focus,select:focus{border-color:var(--accent);}
        label{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:5px;}
        .row-anim{animation:fade .5s ease both;}
        @keyframes fade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
        .tile{animation:fade .5s ease both;}
        a{color:var(--accent2);}
        .scrollbar::-webkit-scrollbar{width:8px;height:8px;}
        .scrollbar::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px;}
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "2px solid var(--ink)", background: "var(--accent)", color: "var(--paper)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, border: "2px solid var(--paper)", display: "grid", placeItems: "center", borderRadius: 2 }}>
              <Home size={22} />
            </div>
            <div>
              <h1 className="hb-disp" style={{ margin: 0, fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.01em" }}>
                The Homestead Ledger
              </h1>
              <p className="hb-num" style={{ margin: "4px 0 0", fontSize: 10, letterSpacing: ".18em", opacity: 0.8 }}>
                FIRST-TIME BUYER PLANNER · SC + IL · H1B EDITION
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="hb-btn" onClick={() => setShowGuide(true)}
              style={{ background: "transparent", color: "var(--paper)", border: "1px solid var(--paper)", padding: "9px 14px", fontSize: 11, display: "flex", alignItems: "center", gap: 7, borderRadius: 2 }}>
              <FileText size={14} /> LOAN GUIDE
            </button>
            <button className="hb-btn" onClick={() => setShowForm(true)}
              style={{ background: "var(--accent2)", color: "#fff", padding: "9px 16px", fontSize: 11, display: "flex", alignItems: "center", gap: 7, borderRadius: 2 }}>
              <Plus size={14} /> ADD A LISTING
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px", display: "grid", gridTemplateColumns: "minmax(0,300px) minmax(0,1fr)", gap: 26, alignItems: "start" }}>
        {/* Sidebar list */}
        <aside style={{ position: "sticky", top: 20 }}>
          <div className="hb-num" style={{ fontSize: 10, letterSpacing: ".12em", color: "var(--muted)", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span>SAVED LISTINGS</span><span>{homes.length}</span>
          </div>
          {loading && <p className="hb-body" style={{ color: "var(--muted)" }}>Loading your ledger…</p>}
          {!loading && homes.length === 0 && (
            <div className="hb-card" style={{ padding: 20, borderRadius: 3, borderStyle: "dashed" }}>
              <p className="hb-body" style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.5 }}>
                No homes yet. Hit <strong>Add a Listing</strong>, paste your Zillow link and a few numbers from the page, and your assessment appears here.
              </p>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="scrollbar">
            {homes.map((h) => {
              const s = computeScenario(h);
              const on = h.id === activeId;
              return (
                <div key={h.id} className="tile hb-card" onClick={() => setActiveId(h.id)}
                  style={{ padding: 14, borderRadius: 3, cursor: "pointer", borderColor: on ? "var(--accent)" : "var(--line)", borderWidth: on ? 2 : 1, background: on ? "#fff" : "var(--card)", position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span className="hb-num" style={{ fontSize: 10, color: "var(--accent2)", letterSpacing: ".05em", display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={11} /> {STATE_DATA[h.state].name}
                    </span>
                    <button className="hb-btn" onClick={(e) => { e.stopPropagation(); removeHome(h.id); }}
                      style={{ background: "transparent", color: "var(--muted)", padding: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="hb-disp" style={{ fontSize: 20, fontWeight: 600, margin: "6px 0 2px" }}>{fmt(h.price)}</div>
                  <div className="hb-num" style={{ fontSize: 11, color: "var(--muted)" }}>
                    {fmt(s.totalMonthly)}/mo · {h.downPct}% down
                  </div>
                  {h.label && <div className="hb-body" style={{ fontSize: 13, marginTop: 6, color: "var(--ink)" }}>{h.label}</div>}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Detail */}
        <section>
          {!active && !loading && (
            <div className="hb-card" style={{ padding: 40, borderRadius: 3, textAlign: "center" }}>
              <TrendingUp size={36} color="var(--accent)" />
              <h2 className="hb-disp" style={{ fontWeight: 600, fontSize: 24, marginTop: 14 }}>Your assessments will appear here</h2>
              <p className="hb-body" style={{ color: "var(--muted)", fontSize: 16, maxWidth: 460, margin: "8px auto 0", lineHeight: 1.5 }}>
                Add a listing to see monthly payment breakdowns, cash-to-close, income needed, and H1B-specific loan notes.
              </p>
            </div>
          )}
          {active && <Assessment home={active} />}
        </section>
      </main>

      {showForm && <ListingForm onClose={() => setShowForm(false)} onSave={(h) => { setHomes((p) => [h, ...p]); setActiveId(h.id); saveHome(h); setShowForm(false); }} />}
      {showGuide && <LoanGuide onClose={() => setShowGuide(false)} />}

      <footer style={{ borderTop: "1px solid var(--line)", marginTop: 30 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 26px" }}>
          <p className="hb-num" style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
            ESTIMATES ONLY — NOT FINANCIAL ADVICE. Rates, tax rates & insurance are editable assumptions; verify the exact county property-tax rate and obtain real quotes from a licensed loan officer & insurer. Data persists in this artifact; export to GitHub via the JSON button on any assessment.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
function Assessment({ home }) {
  const s = useMemo(() => computeScenario(home), [home]);
  const sd = STATE_DATA[home.state];

  const breakdown = [
    { label: "Principal & Interest", val: s.pi, color: "var(--accent)" },
    { label: "Property Tax", val: s.taxMonthly, color: "var(--accent2)" },
    { label: "Homeowners Insurance", val: s.insMonthly, color: "var(--gold)" },
    { label: s.pmiMonthly > 0 ? (home.loanType === "fha" ? "FHA Mortgage Insurance" : "PMI") : "PMI (none — 20%+ down)", val: s.pmiMonthly, color: "#7a6f5d" },
    { label: "HOA", val: Number(home.hoaMonthly || 0), color: "#9c8b6a" },
  ];
  const maxVal = Math.max(...breakdown.map((b) => b.val), 1);

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ ...home, computed: s }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${home.label ? home.label.replace(/\s+/g, "-") : "listing"}-${home.id}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="row-anim">
      {/* Top banner */}
      <div className="hb-card" style={{ padding: 22, borderRadius: 3, borderLeft: "5px solid var(--accent2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="hb-num" style={{ fontSize: 10, color: "var(--accent2)", letterSpacing: ".1em" }}>{sd.name.toUpperCase()} · {LOAN_TYPES[home.loanType].name.toUpperCase()}</div>
            <h2 className="hb-disp" style={{ fontWeight: 900, fontSize: 30, margin: "4px 0 0" }}>{home.label || "Listing assessment"}</h2>
            <div className="hb-num" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{fmt(home.price)} list · {home.downPct}% down · {home.term}-yr · {home.rate}% APR</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {home.url && (
              <a href={home.url} target="_blank" rel="noopener noreferrer" className="hb-btn"
                style={{ textDecoration: "none", background: "var(--accent)", color: "var(--paper)", padding: "9px 13px", fontSize: 11, display: "flex", alignItems: "center", gap: 6, borderRadius: 2 }}>
                <ExternalLink size={13} /> ZILLOW
              </a>
            )}
            <button className="hb-btn" onClick={exportJSON}
              style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", padding: "9px 13px", fontSize: 11, borderRadius: 2 }}>
              ⬇ JSON
            </button>
          </div>
        </div>
      </div>

      {/* Headline numbers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginTop: 18 }}>
        <Stat label="Total Monthly (PITI+HOA)" value={fmt(s.totalMonthly)} accent big />
        <Stat label="Cash to Close" value={fmt(s.cashToClose)} sub={`${fmt(s.down)} down + ${fmt(s.closingCosts)} costs`} />
        <Stat label="Down Payment" value={fmt(s.down)} sub={`${home.downPct}% of price`} />
        <Stat label="Loan Amount" value={fmt(s.loan)} sub={`LTV ${pct(s.ltv)}`} />
      </div>

      {/* Breakdown bars */}
      <div className="hb-card" style={{ padding: 22, borderRadius: 3, marginTop: 18 }}>
        <h3 className="hb-disp" style={{ fontWeight: 600, fontSize: 19, margin: "0 0 16px" }}>Monthly payment, line by line</h3>
        {breakdown.map((b, i) => (
          <div key={i} style={{ marginBottom: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span className="hb-body" style={{ fontSize: 15 }}>{b.label}</span>
              <span className="hb-num" style={{ fontSize: 14, fontWeight: 500 }}>{fmt2(b.val)}</span>
            </div>
            <div style={{ height: 7, background: "var(--paper)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(b.val / maxVal) * 100}%`, background: b.color, borderRadius: 4, transition: "width .6s ease" }} />
            </div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
          <span className="hb-disp" style={{ fontSize: 18, fontWeight: 600 }}>Total</span>
          <span className="hb-num" style={{ fontSize: 18, fontWeight: 600, color: "var(--accent2)" }}>{fmt(s.totalMonthly)}/mo</span>
        </div>
      </div>

      {/* Income + tax cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginTop: 18 }}>
        <div className="hb-card" style={{ padding: 20, borderRadius: 3 }}>
          <h3 className="hb-disp" style={{ fontWeight: 600, fontSize: 18, margin: "0 0 12px" }}>Income you'd need</h3>
          <Line k="At 28% housing ratio (no other debt)" v={`${fmt(s.incomeFront28)}/yr`} />
          <Line k="At 36% total debt ratio" v={`${fmt(s.incomeBack36)}/yr`} />
          <p className="hb-body" style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
            Lenders generally want housing ≤ 28% of gross income and all debts ≤ 36–43%. The 28% figure is the cleaner target.
          </p>
        </div>
        <div className="hb-card" style={{ padding: 20, borderRadius: 3 }}>
          <h3 className="hb-disp" style={{ fontWeight: 600, fontSize: 18, margin: "0 0 12px" }}>Annual carrying costs</h3>
          <Line k="Property tax (est.)" v={fmt(s.propTaxAnnual)} />
          <Line k="Homeowners insurance (est.)" v={fmt(s.insAnnual)} />
          <Line k="HOA" v={fmt(Number(home.hoaMonthly || 0) * 12)} />
          <p className="hb-body" style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
            {sd.note}
          </p>
        </div>
      </div>

      {/* H1B note */}
      <div className="hb-card" style={{ padding: 20, borderRadius: 3, marginTop: 18, background: "#fff", borderLeft: "5px solid var(--gold)" }}>
        <h3 className="hb-disp" style={{ fontWeight: 600, fontSize: 18, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={18} color="var(--gold)" /> H1B loan reality check
        </h3>
        <p className="hb-body" style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
          As an H1B holder you are a U.S. tax resident, and you <strong>can</strong> get a standard conventional or FHA mortgage at the same rates as a citizen — no premium. Lenders will want: a valid H1B (or EAD), an unexpired visa with ideally 1+ years remaining or evidence of renewal/extension, a U.S. SSN, and typically a 2-year U.S. credit & employment history. Fannie Mae explicitly allows non-permanent residents. Keep your I-797 approval notice and recent pay stubs ready. If your visa is near expiry, some lenders ask for an employer letter confirming intent to extend.
        </p>
      </div>

      {/* What's needed checklist */}
      <div className="hb-card" style={{ padding: 20, borderRadius: 3, marginTop: 18 }}>
        <h3 className="hb-disp" style={{ fontWeight: 600, fontSize: 18, margin: "0 0 12px" }}>What this home asks of you</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <Need n="1" t={`Save ${fmt(s.cashToClose)}`} d="Down payment plus ~3% closing costs (title, escrow, lender, recording fees)." />
          <Need n="2" t={`Earn ~${fmt(s.incomeFront28)}/yr`} d="To keep housing under the 28% comfort line." />
          <Need n="3" t="Credit score 620+ (740+ best)" d="Higher score = lower rate & cheaper PMI. FHA goes as low as 580." />
          <Need n="4" t="2 yrs docs ready" d="W-2s, tax returns, pay stubs, bank statements, H1B I-797." />
        </div>
      </div>

      {home.notes && (
        <div className="hb-card" style={{ padding: 18, borderRadius: 3, marginTop: 18 }}>
          <div className="hb-num" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".1em", marginBottom: 6 }}>YOUR NOTES</div>
          <p className="hb-body" style={{ fontSize: 15, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{home.notes}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent, big }) {
  return (
    <div className="hb-card" style={{ padding: 16, borderRadius: 3, background: accent ? "var(--accent)" : "var(--card)", color: accent ? "var(--paper)" : "var(--ink)" }}>
      <div className="hb-num" style={{ fontSize: 9.5, letterSpacing: ".1em", opacity: accent ? 0.85 : 0.6 }}>{label.toUpperCase()}</div>
      <div className="hb-disp" style={{ fontWeight: 900, fontSize: big ? 30 : 24, marginTop: 5, lineHeight: 1 }}>{value}</div>
      {sub && <div className="hb-num" style={{ fontSize: 11, marginTop: 5, opacity: accent ? 0.8 : 0.6 }}>{sub}</div>}
    </div>
  );
}
function Line({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dotted var(--line)" }}>
      <span className="hb-body" style={{ fontSize: 14.5 }}>{k}</span>
      <span className="hb-num" style={{ fontSize: 14, fontWeight: 500 }}>{v}</span>
    </div>
  );
}
function Need({ n, t, d }) {
  return (
    <div style={{ display: "flex", gap: 11 }}>
      <div className="hb-num" style={{ minWidth: 26, height: 26, border: "1.5px solid var(--accent)", color: "var(--accent)", display: "grid", placeItems: "center", borderRadius: "50%", fontSize: 12, fontWeight: 600 }}>{n}</div>
      <div>
        <div className="hb-disp" style={{ fontSize: 15.5, fontWeight: 600 }}>{t}</div>
        <div className="hb-body" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>{d}</div>
      </div>
    </div>
  );
}

// ============================================================
function ListingForm({ onClose, onSave }) {
  const [f, setF] = useState({
    url: "", label: "", price: 350000, state: "SC", downPct: 10,
    loanType: "conventional", hoaMonthly: 0, rate: 6.88, term: 30,
    insuranceOverride: "", propTaxOverride: "", notes: "",
  });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // auto-fill rate when loan type changes
  useEffect(() => {
    up("rate", (LOAN_TYPES[f.loanType].rate * 100).toFixed(2));
    up("downPct", Math.max(f.downPct, LOAN_TYPES[f.loanType].minDown * 100));
  }, [f.loanType]);

  const preview = useMemo(() => computeScenario({ ...f, price: Number(f.price), hoaMonthly: Number(f.hoaMonthly), rate: Number(f.rate), term: Number(f.term) }), [f]);

  function submit() {
    if (!f.price || Number(f.price) <= 0) return;
    onSave({
      ...f,
      id: Date.now().toString(36),
      price: Number(f.price),
      hoaMonthly: Number(f.hoaMonthly),
      rate: Number(f.rate),
      term: Number(f.term),
      downPct: Number(f.downPct),
      createdAt: Date.now(),
    });
  }

  return (
    <Modal onClose={onClose} title="Add a Zillow listing">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label>Zillow URL (paste here)</label>
          <input value={f.url} onChange={(e) => up("url", e.target.value)} placeholder="https://www.zillow.com/homedetails/..." />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label>Nickname / address</label>
          <input value={f.label} onChange={(e) => up("label", e.target.value)} placeholder="e.g. 3BR Greenville bungalow" />
        </div>
        <div>
          <label>List price ($)</label>
          <input type="number" value={f.price} onChange={(e) => up("price", e.target.value)} />
        </div>
        <div>
          <label>State</label>
          <select value={f.state} onChange={(e) => up("state", e.target.value)}>
            <option value="SC">South Carolina</option>
            <option value="IL">Illinois</option>
          </select>
        </div>
        <div>
          <label>Loan type</label>
          <select value={f.loanType} onChange={(e) => up("loanType", e.target.value)}>
            {Object.entries(LOAN_TYPES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label>Down payment (%) · min {LOAN_TYPES[f.loanType].minDown * 100}%</label>
          <input type="number" value={f.downPct} onChange={(e) => up("downPct", e.target.value)} />
        </div>
        <div>
          <label>Interest rate (% APR)</label>
          <input type="number" step="0.01" value={f.rate} onChange={(e) => up("rate", e.target.value)} />
        </div>
        <div>
          <label>Term (years)</label>
          <select value={f.term} onChange={(e) => up("term", e.target.value)}>
            <option value={30}>30</option><option value={20}>20</option><option value={15}>15</option>
          </select>
        </div>
        <div>
          <label>HOA ($/mo, from listing)</label>
          <input type="number" value={f.hoaMonthly} onChange={(e) => up("hoaMonthly", e.target.value)} />
        </div>
        <div>
          <label>Property tax/yr — override (optional)</label>
          <input type="number" value={f.propTaxOverride} onChange={(e) => up("propTaxOverride", e.target.value)} placeholder={`auto: ${fmt(preview.propTaxAnnual)}`} />
        </div>
        <div>
          <label>Insurance/yr — override (optional)</label>
          <input type="number" value={f.insuranceOverride} onChange={(e) => up("insuranceOverride", e.target.value)} placeholder={`auto: ${fmt(preview.insAnnual)}`} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label>Notes</label>
          <input value={f.notes} onChange={(e) => up("notes", e.target.value)} placeholder="Roof age, commute, school district…" />
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 14, background: "var(--accent)", color: "var(--paper)", borderRadius: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="hb-num" style={{ fontSize: 10, opacity: 0.8 }}>LIVE PREVIEW · TOTAL MONTHLY</div>
          <div className="hb-disp" style={{ fontSize: 28, fontWeight: 900 }}>{fmt(preview.totalMonthly)}/mo</div>
        </div>
        <div className="hb-num" style={{ fontSize: 12, textAlign: "right", opacity: 0.9 }}>
          Cash to close {fmt(preview.cashToClose)}<br />Income needed ≈ {fmt(preview.incomeFront28)}/yr
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button className="hb-btn" onClick={onClose} style={{ background: "transparent", border: "1px solid var(--line)", padding: "10px 18px", fontSize: 12, borderRadius: 2 }}>CANCEL</button>
        <button className="hb-btn" onClick={submit} style={{ background: "var(--accent2)", color: "#fff", padding: "10px 22px", fontSize: 12, borderRadius: 2 }}>SAVE ASSESSMENT</button>
      </div>
    </Modal>
  );
}

// ============================================================
function LoanGuide({ onClose }) {
  return (
    <Modal onClose={onClose} title="Loan guidance for an H1B first-time buyer" wide>
      <div className="hb-body" style={{ fontSize: 15, lineHeight: 1.65 }}>
        <G h="You qualify like anyone else">
          On an H1B you're a U.S. tax resident and lenders treat you as a "non-permanent resident alien." Fannie Mae and FHA both lend to you at <strong>standard rates</strong>. You need an SSN, valid H1B/I-797, and typically 2 years of U.S. employment & credit history. No citizenship required.
        </G>
        <G h="Conventional vs FHA — the core choice">
          <strong>Conventional</strong>: as little as 3% down for first-timers, PMI drops off automatically at 20% equity, better long-run cost if your credit is 700+. <strong>FHA</strong>: 3.5% down with a 580 score, more forgiving on credit, but mortgage insurance (MIP) usually lasts the life of the loan unless you put 10%+ down — so most people refinance out of it later.
        </G>
        <G h="The 20% threshold">
          Put 20% down and you skip PMI entirely, which often saves $100–300/mo. If you can't, that's fine — 20% is a cost optimization, not a requirement. Many first-timers buy at 5–10% and refinance once they hit 20% equity.
        </G>
        <G h="State-specific watch-outs">
          <strong>South Carolina</strong>: very low effective property tax on a primary residence (4% assessment ratio). Watch coastal insurance — windstorm/flood near Charleston or the coast can dwarf the mortgage. <strong>Illinois</strong>: property taxes are among the highest in the nation, Cook County especially. Two identical houses can have wildly different taxes by county; always pull the actual tax bill from the listing.
        </G>
        <G h="Documents to gather now">
          SSN, H1B I-797 approval notice, last 2 years' W-2s & federal tax returns, 30 days of pay stubs, 2 months of bank statements, and an employment verification letter. Get a <strong>pre-approval</strong> (not just pre-qualification) before you make offers — sellers take it seriously.
        </G>
        <G h="First-time buyer programs">
          SC State Housing (SC Housing) offers down-payment assistance and below-market rates for first-timers meeting income limits. IHDA (Illinois Housing Development Authority) offers similar DPA grants/forgivable loans. Eligibility usually doesn't require citizenship — lawful residency + SSN is the bar — but confirm with each program.
        </G>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 18, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          This is general education, not financial or legal advice. Mortgage rules and program eligibility change — confirm specifics with a licensed loan officer and, for visa-status questions, an immigration attorney.
        </p>
      </div>
    </Modal>
  );
}
function G({ h, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 className="hb-disp" style={{ fontWeight: 600, fontSize: 18, margin: "0 0 5px", color: "var(--accent)" }}>{h}</h3>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
function Modal({ children, onClose, title, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,26,23,.55)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 18, zIndex: 50, animation: "fade .25s ease" }}>
      <div onClick={(e) => e.stopPropagation()} className="scrollbar"
        style={{ background: "var(--paper)", borderRadius: 4, maxWidth: wide ? 680 : 760, width: "100%", maxHeight: "90vh", overflowY: "auto", border: "2px solid var(--ink)" }}>
        <div style={{ position: "sticky", top: 0, background: "var(--accent)", color: "var(--paper)", padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <h2 className="hb-disp" style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>{title}</h2>
          <button className="hb-btn" onClick={onClose} style={{ background: "transparent", color: "var(--paper)", padding: 4 }}><X size={20} /></button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}
