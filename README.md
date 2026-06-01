# 🏡 The Homestead Ledger — First-Time Homebuyer Scenario Planner

A self-contained tool for assessing what it takes to buy a home you find on Zillow,
built for an **H1B holder (U.S. tax resident, non-citizen)** shopping in
**South Carolina** and **Illinois**.

Paste a Zillow link + a few numbers from the listing → get an instant assessment:
monthly PITI, HOA, PMI/MIP, cash-to-close, income needed, and H1B-specific loan
guidance. Listings are saved so this repo doubles as your personal record of
every home you've evaluated.

## What it computes

- **Monthly payment, line by line** — principal & interest, property tax,
  homeowners insurance, PMI/FHA MIP, HOA
- **Cash to close** — down payment + ~3% closing costs
- **Income needed** — at 28% front-end and 36% back-end DTI
- **Loan guidance** — conventional vs FHA vs jumbo, the 20% PMI threshold,
  and an H1B qualification reality check
- **State-aware assumptions** — SC's low owner-occupied property tax + coastal
  insurance risk; IL's high (county-dependent) property taxes

## ⚠️ On the "paste a Zillow link" workflow

Zillow actively blocks automated scraping, and browser apps can't fetch
zillow.com directly (CORS). So this tool uses a **paste-link-plus-key-numbers**
flow: you paste the URL (kept as a clickable reference) and type in the price,
HOA, and — if shown — the listing's tax/insurance estimates. Everything else is
auto-estimated and fully editable. This keeps the tool reliable and free.

If you later want true auto-fill, you'd need a paid listing API (e.g. RapidAPI's
Zillow endpoints, ATTOM, or Bridge Interactive) wired into a small backend; the
`computeScenario()` function here is already structured to accept that data.

## Assumptions (edit in `STATE_DATA` / `LOAN_TYPES` in the source)

| Item | SC | IL |
|------|----|----|
| Effective property tax | ~0.57% | ~2.23% |
| Insurance (per $1k/yr) | $6.50 | $5.50 |

Rates default to ~6.7–7.2% by loan type. **These are reference defaults — always
verify the actual county tax rate and get real quotes.**

## Run it

This is a single React component. The fastest way to use it locally:

1. Create a Vite + React app: `npm create vite@latest ledger -- --template react`
2. `cd ledger && npm install lucide-react`
3. Replace `src/App.jsx` with `homebuyer-planner.jsx` (rename to `App.jsx`)
4. `npm run dev`

> Note: the artifact version uses `window.storage` (Claude's persistence layer).
> For standalone web use, see `LOCAL_STORAGE_NOTE.md` to swap in `localStorage`.

## Disclaimer

Estimates only — **not financial, legal, or immigration advice.** Confirm
mortgage specifics with a licensed loan officer and visa/eligibility questions
with an immigration attorney.
