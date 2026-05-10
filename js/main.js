/**
 * Live Income Viewer — main.js
 *
 * Rates:
 *   weeklyIncome  = hourRate × workHoursPerDay × workDaysPerWeek
 *   incomePerSec  = weeklyIncome / (7 × 86400)   — spread evenly over all 7 days
 *   outcomePerSec = monthlyOutcome / 2419200      — 28 days × 24h × 3600s
 *   netPerSec     = incomePerSec - outcomePerSec
 *
 *   Example: 100 PLN/h × 8h × 5 days = 4000 PLN/week → 4000/604800 ≈ 0.00661 PLN/s
 */

$(function () {

  /* ── Constants ────────────────────────────────────────────── */
  const STORAGE_KEY  = 'liveIncome_settings';
  const TICK_MS      = 100;   // update every 100ms for smooth animation

  /* ── State ────────────────────────────────────────────────── */
  let state = {
    hourRate:          0,
    workHoursPerDay:   8,
    workDaysPerWeek:   5,
    monthlyOutcome:    0,
    currency:          'PLN',
    incomePerSec:      0,
    outcomePerSec:    0,
    netPerSec:        0,
    // accumulators (in PLN)
    incomeAcc:        0,
    outcomeAcc:       0,
    netAcc:           0,
    // tracking origin timestamp (ms) — persisted across visits
    trackingStartTime: null,
    // total elapsed seconds since tracking started
    sessionSec:       0,
  };

  let tickInterval   = null;
  let timerInterval  = null;

  /* ── Bootstrap Offcanvas reference ───────────────────────── */
  const offcanvasEl  = document.getElementById('settingsPanel');
  const bsOffcanvas  = new bootstrap.Offcanvas(offcanvasEl);

  /* ── Helpers ──────────────────────────────────────────────── */
  function fmt(val, decimals = 4) {
    return val.toLocaleString('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtShort(val) {
    return val.toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function fmtTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /* ── Persist & restore settings ──────────────────────────── */
  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      hourRate:          state.hourRate,
      workHoursPerDay:   state.workHoursPerDay,
      workDaysPerWeek:   state.workDaysPerWeek,
      monthlyOutcome:    state.monthlyOutcome,
      currency:          state.currency,
      trackingStartTime: state.trackingStartTime,
    }));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  /* ── Compute per-second rates ─────────────────────────────── */
  // weeklyIncome = hourRate × workHoursPerDay × workDaysPerWeek
  // incomePerSec = weeklyIncome / (7 × 86400)  — spread evenly over all 7 days
  // e.g. 100 PLN/h × 8h × 5 days = 4000 PLN/week → 4000 / 604800 ≈ 0.00661 PLN/s
  function computeRates(hourRate, workHoursPerDay, workDaysPerWeek, monthlyOutcome) {
    const weeklyIncome  = hourRate * workHoursPerDay * workDaysPerWeek;
    const incomePerSec  = weeklyIncome / (7 * 86400);
    const outcomePerSec = monthlyOutcome / 2419200;
    return {
      incomePerSec,
      outcomePerSec,
      netPerSec: incomePerSec - outcomePerSec,
    };
  }

  /* ── Apply settings & start dashboard ────────────────────── */
  function applySettings(hourRate, workHoursPerDay, workDaysPerWeek, monthlyOutcome, currency, startTime) {
    state.hourRate        = hourRate;
    state.workHoursPerDay = workHoursPerDay;
    state.workDaysPerWeek = workDaysPerWeek;
    state.monthlyOutcome  = monthlyOutcome;
    state.currency        = currency || 'PLN';

    const rates = computeRates(hourRate, workHoursPerDay, workDaysPerWeek, monthlyOutcome);
    state.incomePerSec  = rates.incomePerSec;
    state.outcomePerSec = rates.outcomePerSec;
    state.netPerSec     = rates.netPerSec;

    // Use existing start time (restore) or stamp now (fresh start)
    state.trackingStartTime = startTime || Date.now();
    saveSettings(); // persist start time immediately

    // Seed accumulators from total elapsed time since tracking began
    const elapsedSec = (Date.now() - state.trackingStartTime) / 1000;
    state.incomeAcc  = state.incomePerSec  * elapsedSec;
    state.outcomeAcc = state.outcomePerSec * elapsedSec;
    state.netAcc     = state.netPerSec     * elapsedSec;
    state.sessionSec = Math.floor(elapsedSec);

    // Update currency unit labels in form
    const cur = state.currency;
    $('#hourRateUnit').text(`${cur}/h`);
    $('#monthlyOutcomeUnit').text(`${cur}/mo`);

    // Render static info
    const weeklyIncome = hourRate * workHoursPerDay * workDaysPerWeek;
    const monthlyIncome = weeklyIncome * (2419200 / 604800); // × 4 weeks
    $('#incomeRate').text(`+${fmt(state.incomePerSec)} ${cur}/s`);
    $('#outcomeRate').text(`-${fmt(state.outcomePerSec)} ${cur}/s`);
    $('#netRate').text(`${state.netPerSec >= 0 ? '+' : ''}${fmt(state.netPerSec)} ${cur}/s`);

    $('#incomeCurrency, #outcomeCurrency, #netCurrency').text(cur);
    $('#incomeHourly').text(
      `${fmtShort(hourRate)} ${cur}/h × ${workHoursPerDay}h × ${workDaysPerWeek}d = ${fmtShort(weeklyIncome)} ${cur}/wk`
    );
    $('#outcomeMonthly').text(`Monthly expenses: ${fmtShort(monthlyOutcome)} ${cur}/mo`);

    // Monthly Income KPI
    const grossMonthlyIncome = state.incomePerSec * 2419200;
    $('#monthlyIncomeValue').text(fmtShort(grossMonthlyIncome));
    $('#monthlyIncomeRate').text(`${fmtShort(grossMonthlyIncome)} ${cur}/mo`);
    $('#monthlyIncomeCurrency').text(cur);
    $('#monthlyIncomeSub').text(`${fmtShort(weeklyIncome)} ${cur}/wk · ${fmtShort(hourRate * workHoursPerDay)} ${cur}/day`);

    // Stat cards
    const netPerDay   = state.netPerSec * 86400;
    const netPerMonth = state.netPerSec * 2419200;

    // Per Minute: gross income per minute
    $('#statPerMin').text(`${fmtShort(state.incomePerSec * 60)} ${cur}`);
    // Per Hour: the configured hourly rate (what you actually earn when working)
    $('#statPerHour').text(`${fmtShort(hourRate)} ${cur}`);

    const dayColor   = netPerDay   >= 0 ? 'text-accent' : 'text-danger';
    const monthColor = netPerMonth >= 0 ? 'text-accent' : 'text-danger';
    $('#statPerDay')
      .removeClass('text-accent text-danger')
      .addClass(dayColor)
      .text(`${netPerDay >= 0 ? '+' : ''}${fmtShort(netPerDay)} ${cur}`);
    $('#statPerMonth')
      .removeClass('text-accent text-danger')
      .addClass(monthColor)
      .text(`${netPerMonth >= 0 ? '+' : ''}${fmtShort(netPerMonth)} ${cur}`);

    // Ratio bar
    const total = state.incomePerSec + state.outcomePerSec;
    const pct   = total > 0 ? Math.round((state.incomePerSec / total) * 100) : 50;
    $('#ratioBar').css('width', pct + '%');
    $('#ratioIncomeLabel').text(`${fmtShort(weeklyIncome)} ${cur}/wk`);
    $('#ratioOutcomeLabel').text(`${fmtShort(state.outcomePerSec * 604800)} ${cur}/wk`);

    // Net sub label
    const netMonthText = `Net/month: ${netPerMonth >= 0 ? '+' : ''}${fmtShort(netPerMonth)} ${cur}`;
    $('#netSub').text(netMonthText);

    startDashboard();
  }

  /* ── Start live ticking ───────────────────────────────────── */
  function startDashboard() {
    stopDashboard();

    $('#emptyState').addClass('d-none');
    $('#dashboard').removeClass('d-none');

    const deltaPerTick = TICK_MS / 1000;

    // Tick — accumulate and update counters
    tickInterval = setInterval(function () {
      state.incomeAcc  += state.incomePerSec  * deltaPerTick;
      state.outcomeAcc += state.outcomePerSec * deltaPerTick;
      state.netAcc     += state.netPerSec     * deltaPerTick;

      $('#incomeTotal').text(fmt(state.incomeAcc));
      $('#outcomeTotal').text(fmt(state.outcomeAcc));
      $('#netTotal').text(fmt(state.netAcc));

      // Color net card value dynamically
      const $netVal = $('.kpi-net .kpi-value');
      $netVal.css('color', state.netAcc >= 0 ? '#8b83ff' : 'var(--danger)');

    }, TICK_MS);

    // Clock — total time since tracking start
    timerInterval = setInterval(function () {
      state.sessionSec = Math.floor((Date.now() - state.trackingStartTime) / 1000);
      $('#sessionTimer').text(fmtTime(state.sessionSec));

      // Trigger tick flash on KPI cards every second
      $('.kpi-income').addClass('tick');
      $('.kpi-net').addClass('tick');
      $('.kpi-outcome').addClass('tick');
      $('.kpi-monthly').addClass('tick');
      setTimeout(() => $('.kpi-card').removeClass('tick'), 420);
    }, 1000);
  }

  function stopDashboard() {
    clearInterval(tickInterval);
    clearInterval(timerInterval);
  }

  /* ── Form submit ──────────────────────────────────────────── */
  $('#settingsForm').on('submit', function (e) {
    e.preventDefault();
    $('#formError').addClass('d-none').text('');

    const hourRate        = parseFloat($('#hourRate').val());
    const workHoursPerDay = parseFloat($('#workHoursPerDay').val());
    const workDaysPerWeek = parseFloat($('#workDaysPerWeek').val());
    const monthlyOutcome  = parseFloat($('#monthlyOutcome').val());
    const currency        = $('#currency').val().trim() || 'PLN';

    if (isNaN(hourRate) || hourRate < 0) {
      $('#formError').removeClass('d-none').text('Please enter a valid hourly rate.');
      return;
    }
    if (isNaN(workHoursPerDay) || workHoursPerDay <= 0 || workHoursPerDay > 24) {
      $('#formError').removeClass('d-none').text('Working hours/day must be between 0.5 and 24.');
      return;
    }
    if (isNaN(workDaysPerWeek) || workDaysPerWeek < 1 || workDaysPerWeek > 7) {
      $('#formError').removeClass('d-none').text('Working days/week must be between 1 and 7.');
      return;
    }
    if (isNaN(monthlyOutcome) || monthlyOutcome < 0) {
      $('#formError').removeClass('d-none').text('Please enter a valid monthly outcome.');
      return;
    }

    saveSettings();
    bsOffcanvas.hide();
    // Pass null startTime so a fresh tracking period begins on manual re-submit
    applySettings(hourRate, workHoursPerDay, workDaysPerWeek, monthlyOutcome, currency, null);
  });

  /* ── Reset ────────────────────────────────────────────────── */
  $('#btnReset').on('click', function () {
    if (!confirm('Reset all data and stop tracking?')) return;
    stopDashboard();
    localStorage.removeItem(STORAGE_KEY);
    state.incomeAcc        = 0;
    state.outcomeAcc       = 0;
    state.netAcc           = 0;
    state.sessionSec       = 0;
    state.trackingStartTime = null;
    $('#incomeTotal, #outcomeTotal, #netTotal').text('0.0000');
    $('#sessionTimer').text('00:00:00');
    $('#dashboard').addClass('d-none');
    $('#emptyState').removeClass('d-none');
    $('#settingsForm')[0].reset();
    $('#currency').val('PLN');
    bsOffcanvas.hide();
  });

  /* ── Open settings buttons ────────────────────────────────── */
  $('#btnSettings, #btnOpenSettings').on('click', function () {
    bsOffcanvas.show();
  });

  /* ── Auto-restore on load ─────────────────────────────────── */
  const saved = loadSettings();
  if (saved && saved.hourRate > 0) {
    $('#hourRate').val(saved.hourRate);
    $('#workHoursPerDay').val(saved.workHoursPerDay ?? 8);
    $('#workDaysPerWeek').val(saved.workDaysPerWeek ?? 5);
    $('#monthlyOutcome').val(saved.monthlyOutcome);
    $('#currency').val(saved.currency || 'PLN');
    applySettings(
      saved.hourRate,
      saved.workHoursPerDay ?? 8,
      saved.workDaysPerWeek ?? 5,
      saved.monthlyOutcome,
      saved.currency || 'PLN',
      saved.trackingStartTime || null
    );
  }

  /* ── Service Worker registration ──────────────────────────── */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

});
