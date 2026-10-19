import { ITEMS } from './items.js';

const STORE_KEY = 'gcalc:v1';
const PER_LABEL = { 1000: 'kg', 500: '500 g', 250: '250 g', 100: '100 g' };
const WEIGHT_PRESETS = [100, 250, 500, 1000, 2000]; // grams
const CURRENCIES = [
  ['Rs', 'Rupee (Rs)'], ['₹', 'Indian rupee'], ['$', 'Dollar'], ['€', 'Euro'], ['£', 'Pound'],
  ['¥', 'Yen / Yuan'], ['৳', 'Taka'], ['AED', 'Dirham'], ['SAR', 'Riyal'], ['RM', 'Ringgit'],
  ['₱', 'Peso'], ['₦', 'Naira'], ['R', 'Rand'], ['KSh', 'Shilling'], ['₩', 'Won'], ['₺', 'Lira'],
  ['₫', 'Dong'], ['Rp', 'Rupiah'],
];
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const state = loadState();
let tab = 'all';
let query = '';
let item = null; // item open in the calculator
let pending = null; // { grams, price } currently shown as the result
let newCat = 'veg'; // category picked in the add-item sheet
let editing = false; // edit mode: tapping a card deletes it
let installPrompt = null;

// ---------- Storage ----------

function loadState() {
  // `hidden` lists built-in items the user deleted; Settings can bring them back.
  const defaults = { rates: {}, custom: [], hidden: [], bill: [], currency: 'Rs', mode: 'weight', unit: 'g' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved ? { ...defaults, ...saved } : defaults;
  } catch {
    return defaults;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage full: the app still works for this visit.
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Numbers ----------

const formatters = new Map();
function fmt(n, maxDigits, minDigits = 0) {
  const key = `${maxDigits}/${minDigits}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits }));
  }
  return formatters.get(key).format(n);
}

function money(n, short = false) {
  const digits = short && Number.isInteger(n) ? 0 : 2;
  const gap = /^[A-Za-z]/.test(state.currency) ? ' ' : '';
  return `${state.currency}${gap}${fmt(n, digits, digits)}`;
}

const inKg = (grams) => Math.round(grams) >= 1000;
const weight = (grams) => (inKg(grams) ? `${fmt(grams / 1000, 3)} kg` : `${fmt(grams, grams < 10 ? 1 : 0)} g`);
const altWeight = (grams) => (inKg(grams) ? `${fmt(grams, 0)} g` : `${fmt(grams / 1000, 3)} kg`);
const trimNum = (n) => String(Math.round(n * 1000) / 1000);

function parseNum(s) {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// Keep digits and a single decimal point (a comma counts as one).
function sanitize(input) {
  const v = input.value.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const dot = v.indexOf('.');
  const clean = dot === -1 ? v : v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
  if (clean !== input.value) input.value = clean;
}

// Rounds to the closest 1, 2 or 5 × 10ⁿ, the amounts people actually hand over.
function niceAmount(x) {
  const p = 10 ** Math.floor(Math.log10(x));
  const distance = (s) => Math.abs(Math.log(x / (s * p)));
  return [1, 2, 5, 10].reduce((a, b) => (distance(b) < distance(a) ? b : a)) * p;
}

// ---------- Item grid ----------

function allItems() {
  const hidden = new Set(state.hidden);
  return [...state.custom, ...ITEMS.filter((it) => !hidden.has(it.id))];
}

function matches(it, q) {
  return it.name.toLowerCase().includes(q) || (it.aka || []).some((a) => a.includes(q));
}

function paintAvatar(node, it) {
  node.className = `avatar ${it.cat}${it.emoji ? ' emoji' : ''}`;
  node.textContent = it.emoji || it.name.trim().charAt(0).toUpperCase();
}

function avatar(it, size) {
  const node = el('span');
  node.setAttribute('aria-hidden', 'true');
  paintAvatar(node, it);
  if (size) node.classList.add(size);
  return node;
}

function card(it) {
  const r = state.rates[it.id];
  const btn = el('button', 'card');
  btn.type = 'button';
  btn.append(
    avatar(it),
    el('span', 'name', it.name),
    el('span', r ? 'rate set' : 'rate', r ? `${money(r.rate, true)}/${PER_LABEL[r.per]}` : 'Set rate'),
  );
  if (editing) {
    const badge = el('span', 'del');
    badge.innerHTML = X_ICON;
    btn.append(badge);
    btn.setAttribute('aria-label', `Delete ${it.name}`);
  }
  btn.addEventListener('click', () => (editing ? removeItem(it) : openCalc(it)));
  const li = el('li');
  li.append(btn);
  return li;
}

function addCard(name) {
  const btn = el('button', 'card add');
  btn.type = 'button';
  btn.append(el('span', 'avatar plus', '+'), el('span', 'name', name ? `Add “${name}”` : 'Add item'));
  btn.addEventListener('click', () => openAdd(name));
  const li = el('li');
  li.append(btn);
  return li;
}

function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = allItems().filter((it) => (tab === 'all' || it.cat === tab) && (!q || matches(it, q)));
  $('#grid').replaceChildren(...list.map(card), addCard(list.length ? '' : query.trim()));
  $('#grid').classList.toggle('editing', editing);
  $('#editHint').hidden = !editing;
  $('#noMatch').hidden = list.length > 0;
  $('#noMatch').textContent = q ? 'No items match your search.' : 'No items here yet. Add one, or bring back deleted ones in Settings.';
}

function setEditing(on) {
  editing = on;
  const btn = $('#editBtn');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'Done' : 'Edit';
  renderGrid();
}

// Deletes right away and offers Undo. Built-in items are only hidden, so Settings can restore them.
function removeItem(it) {
  const index = state.custom.findIndex((c) => c.id === it.id);
  const rate = state.rates[it.id];
  if (index !== -1) {
    state.custom.splice(index, 1);
    delete state.rates[it.id];
  } else {
    state.hidden.push(it.id);
  }
  saveState();
  renderGrid();
  renderRestore();
  toast(`${it.name} deleted`, 'Undo', () => {
    if (index !== -1) {
      state.custom.splice(index, 0, it);
      if (rate) state.rates[it.id] = rate;
    } else {
      state.hidden = state.hidden.filter((id) => id !== it.id);
    }
    saveState();
    renderGrid();
    renderRestore();
  });
}

// ---------- Calculator ----------

const calcDlg = $('#calc');
const rateIn = $('#rate');
const perSel = $('#per');
const amountIn = $('#amount');
const weightIn = $('#weight');
const activeInput = () => (state.mode === 'weight' ? amountIn : weightIn);

function openCalc(it) {
  item = it;
  const r = state.rates[it.id];
  paintAvatar($('#calcAvatar'), it);
  $('#calcAvatar').classList.add('lg');
  $('#calcName').textContent = it.name;
  $('#calcCat').textContent = it.cat === 'veg' ? 'Vegetable' : 'Fruit';
  rateIn.value = r ? String(r.rate) : '';
  perSel.value = String(r ? r.per : 1000);
  amountIn.value = '';
  weightIn.value = '';
  calcDlg.showModal();
  setMode(state.mode);
  (r ? activeInput() : rateIn).focus();
}

function setMode(mode) {
  state.mode = mode;
  saveState();
  for (const b of $$('#mode button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  $('#amountField').hidden = mode !== 'weight';
  $('#weightField').hidden = mode !== 'price';
  paintUnit();
  update();
}

function paintUnit() {
  for (const b of $$('#unit button')) b.setAttribute('aria-pressed', String(b.dataset.unit === state.unit));
}

function setUnit(unit) {
  if (unit === state.unit) return;
  const v = parseNum(weightIn.value);
  if (v > 0) weightIn.value = trimNum(unit === 'kg' ? v / 1000 : v * 1000);
  state.unit = unit;
  saveState();
  paintUnit();
  update();
}

function update() {
  const rate = parseNum(rateIn.value);
  const per = Number(perSel.value);
  const hasRate = rate > 0;
  if (hasRate) state.rates[item.id] = { rate, per };
  else delete state.rates[item.id];
  saveState();

  const byPrice = state.mode === 'weight';
  pending = null;
  if (hasRate) {
    const perGram = rate / per;
    if (byPrice) {
      const amount = parseNum(amountIn.value);
      if (amount > 0) pending = { grams: amount / perGram, price: amount };
    } else {
      const w = parseNum(weightIn.value);
      const grams = state.unit === 'kg' ? w * 1000 : w;
      if (grams > 0) pending = { grams, price: grams * perGram };
    }
  }

  let main = '—';
  let sub;
  if (!hasRate) sub = 'Enter the rate first';
  else if (!pending) sub = byPrice ? 'Enter how much you want to spend' : 'Enter how much you need';
  else if (byPrice) {
    main = weight(pending.grams);
    sub = `${altWeight(pending.grams)} for ${money(pending.price)}`;
  } else {
    main = money(pending.price);
    sub = `for ${weight(pending.grams)}`;
  }
  $('#resLabel').textContent = byPrice ? 'You get' : 'You pay';
  $('#resMain').textContent = main;
  $('#resSub').textContent = sub;
  $('#addToBill').disabled = !pending;
  renderChips(hasRate ? (rate * 1000) / per : 0);
}

function chip(label, pressed, onPick) {
  const b = el('button', 'chip', label);
  b.type = 'button';
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onPick);
  return b;
}

function renderChips(ratePerKg) {
  if (state.mode === 'weight') {
    // Amounts worth roughly ¼, ½, 1, 2 and 5 kg at this rate.
    const values = ratePerKg ? [...new Set([0.25, 0.5, 1, 2, 5].map((f) => niceAmount(ratePerKg * f)))] : [];
    const current = parseNum(amountIn.value);
    $('#amountChips').replaceChildren(
      ...values.map((v) => chip(money(v, true), v === current, () => { amountIn.value = String(v); update(); })),
    );
  } else {
    const grams = parseNum(weightIn.value) * (state.unit === 'kg' ? 1000 : 1);
    $('#weightChips').replaceChildren(
      ...WEIGHT_PRESETS.map((g) => chip(weight(g), Math.abs(g - grams) < 1e-6, () => {
        weightIn.value = trimNum(state.unit === 'kg' ? g / 1000 : g);
        update();
      })),
    );
  }
}

rateIn.addEventListener('input', () => { sanitize(rateIn); update(); });
perSel.addEventListener('change', update);
for (const input of [amountIn, weightIn]) {
  input.addEventListener('input', () => { sanitize(input); update(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
  });
}
rateIn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); activeInput().focus(); }
});

for (const b of $$('#mode button')) {
  b.addEventListener('click', () => {
    setMode(b.dataset.mode);
    if (parseNum(rateIn.value) > 0) activeInput().focus();
  });
}
for (const b of $$('#unit button')) b.addEventListener('click', () => setUnit(b.dataset.unit));

$('#addToBill').addEventListener('click', () => {
  if (!pending) return;
  state.bill.push({
    key: uid(),
    name: item.name,
    emoji: item.emoji || '',
    cat: item.cat,
    grams: pending.grams,
    price: Math.round(pending.price * 100) / 100,
  });
  saveState();
  renderBadge();
  calcDlg.close();
  toast(`${item.name} added · Total ${money(billTotal())}`);
});

$('#deleteItem').addEventListener('click', () => {
  calcDlg.close();
  removeItem(item);
});

// Rates may have changed while the sheet was open.
calcDlg.addEventListener('close', renderGrid);

// ---------- Bill ----------

const billDlg = $('#bill');
const billTotal = () => state.bill.reduce((sum, row) => sum + row.price, 0);

function renderBadge() {
  const n = state.bill.length;
  $('#billCount').textContent = String(n);
  $('#billCount').hidden = n === 0;
  $('#billBtn').setAttribute('aria-label', n ? `Open bill, ${n} item${n > 1 ? 's' : ''}` : 'Open bill');
}

function renderBill() {
  const rows = state.bill.map((row) => {
    const meta = el('div', 'meta');
    meta.append(el('div', 'name', row.name), el('div', 'qty', weight(row.grams)));
    const remove = el('button', 'icon-btn ghost');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${row.name}`);
    remove.innerHTML = X_ICON;
    remove.addEventListener('click', () => {
      state.bill = state.bill.filter((r) => r.key !== row.key);
      saveState();
      renderBill();
      renderBadge();
    });
    const li = el('li', 'bill-row');
    li.append(avatar(row, 'sm'), meta, el('div', 'price', money(row.price)), remove);
    return li;
  });
  $('#billList').replaceChildren(...rows);
  $('#billEmpty').hidden = rows.length > 0;
  $('#billFoot').hidden = rows.length === 0;
  $('#billTotal').textContent = money(billTotal());
}

$('#billBtn').addEventListener('click', () => { renderBill(); billDlg.showModal(); });
$('#clearBill').addEventListener('click', () => {
  if (!confirm('Clear every item from the bill?')) return;
  state.bill = [];
  saveState();
  renderBill();
  renderBadge();
});

// ---------- Add item ----------

const addDlg = $('#add');

function setNewCat(cat) {
  newCat = cat;
  for (const b of $$('#addCat button')) b.setAttribute('aria-pressed', String(b.dataset.cat === cat));
}

function openAdd(name = '') {
  $('#addName').value = name.charAt(0).toUpperCase() + name.slice(1);
  $('#addEmoji').value = '';
  setNewCat(tab === 'fruit' ? 'fruit' : 'veg');
  addDlg.showModal();
  $('#addName').focus();
}

function firstGrapheme(s) {
  s = s.trim();
  if (!s) return '';
  if (Intl.Segmenter) return new Intl.Segmenter().segment(s)[Symbol.iterator]().next().value.segment;
  return Array.from(s)[0];
}

for (const b of $$('#addCat button')) b.addEventListener('click', () => setNewCat(b.dataset.cat));

$('#addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#addName').value.trim().replace(/\s+/g, ' ');
  if (!name) { $('#addName').focus(); return; }
  // A name that already exists opens that item; a deleted built-in one comes back.
  let it = [...state.custom, ...ITEMS].find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!it) {
    it = { id: `c-${uid()}`, name, emoji: firstGrapheme($('#addEmoji').value), cat: newCat, custom: true };
    state.custom.unshift(it);
  }
  state.hidden = state.hidden.filter((id) => id !== it.id);
  saveState();
  renderRestore();
  addDlg.close();
  query = '';
  $('#search').value = '';
  setEditing(false);
  openCalc(it);
});

$('#addBtn').addEventListener('click', () => openAdd());

// ---------- Settings ----------

const settingsDlg = $('#settings');
const currencySel = $('#currency');

function renderCurrency() {
  for (const node of $$('.cur')) node.textContent = state.currency;
}

currencySel.replaceChildren(...CURRENCIES.map(([sym, label]) => new Option(`${sym}  ${label}`, sym)));
if (!CURRENCIES.some(([sym]) => sym === state.currency)) currencySel.prepend(new Option(state.currency, state.currency));
currencySel.value = state.currency;
currencySel.addEventListener('change', () => {
  state.currency = currencySel.value;
  saveState();
  renderCurrency();
  renderGrid();
});

$('#settingsBtn').addEventListener('click', () => settingsDlg.showModal());
$('#resetRates').addEventListener('click', () => {
  if (!confirm('Clear the saved rate of every item?')) return;
  state.rates = {};
  saveState();
  settingsDlg.close();
  renderGrid();
  toast('All rates cleared');
});

function renderRestore() {
  const n = state.hidden.length;
  $('#restoreItems').hidden = n === 0;
  $('#restoreItems').textContent = `Bring back ${n} deleted item${n === 1 ? '' : 's'}`;
}

$('#restoreItems').addEventListener('click', () => {
  const n = state.hidden.length;
  state.hidden = [];
  saveState();
  renderRestore();
  settingsDlg.close();
  renderGrid();
  toast(`${n} item${n === 1 ? '' : 's'} restored`);
});

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
$('#installHint').hidden = Boolean(standalone);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#installBtn').hidden = false;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#installBtn').hidden = true;
  $('#installHint').hidden = true;
});
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#installBtn').hidden = true;
});

// ---------- Shared UI ----------

for (const dlg of $$('dialog')) {
  // A tap on the dimmed backdrop lands on the dialog element itself.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-close]');
  if (btn) btn.closest('dialog').close();
});

let toastTimer;
let toastAction = null;

function toast(message, actionLabel, onAction) {
  $('#toastMsg').textContent = message;
  $('#toastAction').textContent = actionLabel || '';
  $('#toastAction').hidden = !actionLabel;
  toastAction = onAction || null;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 2400);
}

function hideToast() {
  $('#toast').classList.remove('show');
  toastAction = null;
}

$('#toastAction').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  if (action) action();
});

$('#search').addEventListener('input', (e) => { query = e.target.value; renderGrid(); });
for (const b of $$('#tabs button[data-cat]')) {
  b.addEventListener('click', () => {
    tab = b.dataset.cat;
    for (const other of $$('#tabs button[data-cat]')) other.setAttribute('aria-pressed', String(other === b));
    renderGrid();
  });
}
$('#editBtn').addEventListener('click', () => setEditing(!editing));

renderCurrency();
renderGrid();
renderBadge();
renderRestore();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
