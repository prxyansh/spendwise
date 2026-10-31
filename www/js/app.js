/* SpendWise – hybrid expense tracker (HTML/CSS/JS wrapped by Capacitor).
 * Data is stored locally with localStorage, so the app works fully offline. */
(function () {
  'use strict';

  var STORAGE_KEY = 'spendwise.expenses.v1';

  var CATEGORIES = [
    { id: 'food',      label: 'Food',          icon: '🍔', color: '#f97316' },
    { id: 'transport', label: 'Transport',     icon: '🚌', color: '#3b82f6' },
    { id: 'shopping',  label: 'Shopping',      icon: '🛍️', color: '#ec4899' },
    { id: 'bills',     label: 'Bills',         icon: '💡', color: '#eab308' },
    { id: 'health',    label: 'Health',        icon: '💊', color: '#22c55e' },
    { id: 'fun',       label: 'Entertainment', icon: '🎬', color: '#8b5cf6' },
    { id: 'other',     label: 'Other',         icon: '📦', color: '#6b7280' }
  ];

  var catById = {};
  CATEGORIES.forEach(function (c) { catById[c.id] = c; });

  // ---------- State ----------
  var expenses = load();
  var editingId = null;

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('expense-list');
  var emptyEl = $('empty');
  var dialog = $('dialog');
  var form = $('expense-form');
  var fAmount = $('f-amount');
  var fCategory = $('f-category');
  var fDate = $('f-date');
  var fNote = $('f-note');
  var filterCat = $('filter-category');
  var searchEl = $('search');
  var toastEl = $('toast');

  // ---------- Storage ----------
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    } catch (e) {
      toast('Could not save data');
    }
  }

  // ---------- Helpers ----------
  function todayISO() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function money(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function formatDate(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  // ---------- Rendering ----------
  function render() {
    renderSummary();
    renderBreakdown();
    renderList();
  }

  function currentMonthKey() { return todayISO().slice(0, 7); }

  function renderSummary() {
    var mk = currentMonthKey();
    var month = 0, all = 0;
    expenses.forEach(function (e) {
      all += e.amount;
      if (e.date.slice(0, 7) === mk) month += e.amount;
    });
    $('total-month').textContent = money(month);
    $('total-all').textContent = money(all);
    $('month-label').textContent = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function renderBreakdown() {
    var mk = currentMonthKey();
    var sums = {}, total = 0;
    expenses.forEach(function (e) {
      if (e.date.slice(0, 7) !== mk) return;
      sums[e.category] = (sums[e.category] || 0) + e.amount;
      total += e.amount;
    });
    var el = $('breakdown');
    if (!total) {
      el.innerHTML = '<p class="none">Nothing spent this month yet.</p>';
      return;
    }
    el.innerHTML = CATEGORIES
      .filter(function (c) { return sums[c.id]; })
      .sort(function (a, b) { return sums[b.id] - sums[a.id]; })
      .map(function (c) {
        var pct = Math.round((sums[c.id] / total) * 100);
        return '<div class="bar-row">' +
          '<div class="bar-head"><span>' + c.icon + ' ' + c.label + '</span><span>' + money(sums[c.id]) + ' · ' + pct + '%</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + c.color + '"></div></div>' +
          '</div>';
      }).join('');
  }

  function visibleExpenses() {
    var cat = filterCat.value;
    var q = searchEl.value.trim().toLowerCase();
    return expenses
      .filter(function (e) { return cat === 'all' || e.category === cat; })
      .filter(function (e) { return !q || (e.note || '').toLowerCase().indexOf(q) !== -1; })
      .sort(function (a, b) {
        return a.date === b.date ? b.created - a.created : (a.date < b.date ? 1 : -1);
      });
  }

  function renderList() {
    var items = visibleExpenses();
    emptyEl.hidden = items.length > 0;
    if (!items.length) {
      emptyEl.textContent = expenses.length ? 'No matching expenses.' : 'No expenses yet. Tap + to add one.';
    }
    listEl.innerHTML = items.map(function (e) {
      var c = catById[e.category] || catById.other;
      return '<li class="expense" data-id="' + e.id + '">' +
        '<div class="dot" style="background:' + c.color + '22">' + c.icon + '</div>' +
        '<div class="meta"><div class="note">' + esc(e.note || c.label) + '</div>' +
        '<div class="sub">' + c.label + ' · ' + formatDate(e.date) + '</div></div>' +
        '<div class="price">' + money(e.amount) + '</div>' +
        '<div class="row-actions">' +
          '<button class="icon-btn edit" aria-label="Edit">✏️</button>' +
          '<button class="icon-btn del" aria-label="Delete">🗑️</button>' +
        '</div></li>';
    }).join('');
  }

  // ---------- Dialog ----------
  function openDialog(expense) {
    editingId = expense ? expense.id : null;
    $('dialog-title').textContent = expense ? 'Edit expense' : 'Add expense';
    fAmount.value = expense ? expense.amount : '';
    fCategory.value = expense ? expense.category : CATEGORIES[0].id;
    fDate.value = expense ? expense.date : todayISO();
    fNote.value = expense ? (expense.note || '') : '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(function () { fAmount.focus(); }, 50);
  }

  function closeDialog() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  // ---------- Events ----------
  $('fab').addEventListener('click', function () { openDialog(null); });
  $('btn-cancel').addEventListener('click', closeDialog);

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var amount = parseFloat(fAmount.value);
    if (!(amount > 0)) { toast('Enter a valid amount'); return; }

    var data = {
      amount: Math.round(amount * 100) / 100,
      category: fCategory.value,
      date: fDate.value || todayISO(),
      note: fNote.value.trim()
    };

    if (editingId) {
      expenses = expenses.map(function (e) {
        return e.id === editingId ? Object.assign({}, e, data) : e;
      });
      toast('Expense updated');
    } else {
      data.id = uid();
      data.created = Date.now();
      expenses.push(data);
      toast('Expense added');
    }
    save();
    render();
    closeDialog();
  });

  listEl.addEventListener('click', function (ev) {
    var li = ev.target.closest('li.expense');
    if (!li) return;
    var id = li.getAttribute('data-id');
    var item = expenses.filter(function (e) { return e.id === id; })[0];
    if (!item) return;

    if (ev.target.closest('.edit')) {
      openDialog(item);
    } else if (ev.target.closest('.del')) {
      if (window.confirm('Delete this expense?')) {
        expenses = expenses.filter(function (e) { return e.id !== id; });
        save();
        render();
        toast('Expense deleted');
      }
    }
  });

  filterCat.addEventListener('change', renderList);
  searchEl.addEventListener('input', renderList);

  // ---------- Init ----------
  function init() {
    CATEGORIES.forEach(function (c) {
      var o1 = document.createElement('option');
      o1.value = c.id; o1.textContent = c.icon + ' ' + c.label;
      fCategory.appendChild(o1);

      var o2 = document.createElement('option');
      o2.value = c.id; o2.textContent = c.icon + ' ' + c.label;
      filterCat.appendChild(o2);
    });
    render();
  }

  init();
})();
