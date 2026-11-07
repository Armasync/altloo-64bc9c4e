/* Altloo admin dashboard — talks to the Node API in server/. */
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { token: localStorage.getItem('altloo_token') || '', base: localStorage.getItem('altloo_api') || '' };

  const STATUS = {
    active: ['نشط', 'ok'],
    warned: ['إنذار', ''],
    suspended: ['موقوف', 'no'],
    banned: ['محظور', 'no']
  };

  const fmtNum = (value) => new Intl.NumberFormat('ar-EG').format(Number(value || 0));
  const money = (cents) => (Number(cents || 0) / 100).toFixed(2) + ' $';
  const dateOf = (ms) => (ms ? new Date(Number(ms)).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const timeOf = (ms) => (ms ? new Date(Number(ms)).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function msg(text, kind = 'ok', node = 'globalMsg') {
    const box = $(node);
    if (!box) return;
    box.textContent = text;
    box.className = `msg show ${kind}`;
    window.setTimeout(() => { box.className = 'msg'; }, 4200);
  }

  async function api(path, options = {}) {
    const response = await fetch(state.base + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      logout();
      throw new Error('انتهت الجلسة، سجّل الدخول من جديد');
    }
    if (!response.ok) throw new Error(data.error || data.message || 'فشل الطلب');
    return data;
  }

  // ---------------------------------------------------------------- auth
  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.base = $('apiBase').value.replace(/\/$/, '');
    localStorage.setItem('altloo_api', state.base);
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value })
      });
      state.token = data.token;
      localStorage.setItem('altloo_token', data.token);
      enterDashboard();
    } catch (error) {
      msg(error.message, 'err', 'loginMsg');
    }
  });

  function logout() {
    state.token = '';
    localStorage.removeItem('altloo_token');
    $('dashView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
  }

  $('logoutBtn').addEventListener('click', logout);

  function enterDashboard() {
    $('loginView').classList.add('hidden');
    $('dashView').classList.remove('hidden');
    showTab('overview');
  }

  if (state.token) {
    state.base = state.base || '';
    if (!state.base) {
      // Nothing stored: ask for the server address once on the login screen.
      $('loginView').classList.remove('hidden');
    } else {
      $('apiBase').value = state.base;
      enterDashboard();
    }
  }

  // ---------------------------------------------------------------- tabs
  const TITLES = {
    overview: 'نظرة عامة',
    banners: 'البانرات',
    users: 'الأعضاء',
    withdrawals: 'السحوبات',
    luck: 'شريط الحظ',
    rooms: 'الغرف',
    audit: 'سجل العمليات'
  };

  document.querySelectorAll('.nav-btn[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });

  function showTab(name) {
    document.querySelectorAll('.nav-btn[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((section) => section.classList.add('hidden'));
    $('tab-' + name).classList.remove('hidden');
    $('pageTitle').textContent = TITLES[name] || '';
    loaders[name]?.().catch((error) => msg(error.message, 'err'));
  }

  $('refreshBtn').addEventListener('click', () => {
    const active = document.querySelector('.nav-btn.active[data-tab]')?.dataset.tab || 'overview';
    showTab(active);
  });

  // ---------------------------------------------------------------- overview
  async function loadOverview() {
    const data = await api('/api/admin/overview');
    const cards = [
      ['الأعضاء', fmtNum(data.users)],
      ['جدد هذا الأسبوع', fmtNum(data.newUsers7d)],
      ['غرف مباشرة', fmtNum(data.liveRooms)],
      ['مستمعون الآن', fmtNum(data.listeners)],
      ['عملات ذهبية', fmtNum(data.coins)],
      ['ألماس', fmtNum(data.diamonds)],
      ['سحوبات معلّقة', fmtNum(data.pendingPayouts)],
      ['بلاغات مفتوحة', fmtNum(data.openReports)]
    ];
    $('statsGrid').innerHTML = cards.map(([label, value]) =>
      `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join('');

    const [users, audit] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/audit')
    ]);
    $('recentUsers').innerHTML = users.items.slice(0, 6).map((user) =>
      `<tr><td>${esc(user.display_name || user.name || '—')}<div class="muted">${esc(user.altloo_id || '')}</div></td>
        <td class="muted">${esc(dateOf(user.created_at))}</td></tr>`).join('') || '<tr><td class="muted">لا أعضاء بعد</td></tr>';
    $('recentAudit').innerHTML = audit.items.slice(0, 6).map((row) =>
      `<tr><td>${esc(row.action)}<div class="muted">${esc(row.detail || '')}</div></td>
        <td class="muted">${esc(timeOf(row.created_at))}</td></tr>`).join('') || '<tr><td class="muted">لا عمليات بعد</td></tr>';
  }

  // ---------------------------------------------------------------- banners
  async function loadBanners() {
    const data = await api('/api/admin/banners');
    $('bannerRows').innerHTML = data.items.map((banner) => {
      const live = banner.active && banner.starts_at <= Date.now() && banner.ends_at >= Date.now();
      return `<tr>
        <td>${esc(banner.emoji || '')} ${esc(banner.title)}<div class="muted">${esc(banner.subtitle || '')}</div></td>
        <td class="muted">${esc(dateOf(banner.starts_at))} — ${esc(dateOf(banner.ends_at))}</td>
        <td><span class="pill ${live ? 'ok' : 'no'}">${live ? 'مفعّل' : 'غير ظاهر'}</span></td>
        <td><div class="row-actions">
          <button class="btn small" data-edit="${esc(banner.id)}">تعديل</button>
          <button class="btn small danger" data-del="${esc(banner.id)}">حذف</button>
        </div></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="muted">لا بانرات بعد</td></tr>';

    $('bannerRows').querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const banner = data.items.find((item) => item.id === button.dataset.edit);
        $('bannerId').value = banner.id;
        $('bannerTitle').value = banner.title;
        $('bannerSub').value = banner.subtitle || '';
        $('bannerEmoji').value = banner.emoji || '';
        $('bannerKind').value = banner.kind || 'link';
        $('bannerTarget').value = banner.target || '';
        $('bannerStart').value = new Date(banner.starts_at).toISOString().slice(0, 10);
        $('bannerEnd').value = new Date(banner.ends_at).toISOString().slice(0, 10);
        $('bannerOrder').value = banner.sort_order || 0;
        $('bannerActive').checked = !!banner.active;
        $('bannerFormTitle').textContent = 'تعديل البانر';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    $('bannerRows').querySelectorAll('[data-del]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('حذف هذا البانر نهائيًا؟')) return;
        try {
          await api('/api/admin/banners/' + button.dataset.del, { method: 'DELETE' });
          msg('حُذف البانر');
          loadBanners();
        } catch (error) { msg(error.message, 'err'); }
      });
    });
  }

  function resetBannerForm() {
    $('bannerForm').reset();
    $('bannerId').value = '';
    $('bannerEmoji').value = '✨';
    $('bannerOrder').value = 0;
    $('bannerActive').checked = true;
    $('bannerFormTitle').textContent = 'بانر جديد';
  }

  $('bannerReset').addEventListener('click', resetBannerForm);

  $('bannerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const start = new Date($('bannerStart').value + 'T00:00:00').getTime();
    const end = new Date($('bannerEnd').value + 'T23:59:59').getTime();
    if (!(end > start)) return msg('تاريخ النهاية يجب أن يكون بعد البداية', 'err');
    const payload = {
      title: $('bannerTitle').value.trim(),
      subtitle: $('bannerSub').value.trim(),
      emoji: $('bannerEmoji').value.trim() || '✨',
      imageUrl: '',
      kind: $('bannerKind').value,
      target: $('bannerTarget').value.trim(),
      startsAt: start,
      endsAt: end,
      active: $('bannerActive').checked,
      sortOrder: Number($('bannerOrder').value || 0)
    };
    const id = $('bannerId').value;
    try {
      await api(id ? '/api/admin/banners/' + id : '/api/admin/banners', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      msg(id ? 'تم تحديث البانر' : 'أُضيف البانر');
      resetBannerForm();
      loadBanners();
    } catch (error) { msg(error.message, 'err'); }
  });

  // ---------------------------------------------------------------- users
  async function loadUsers() {
    const data = await api('/api/admin/users');
    const term = ($('userSearch').value || '').trim().toLowerCase();
    const rows = data.items.filter((user) => !term ||
      `${user.display_name || ''} ${user.altloo_id || ''} ${user.email || ''} ${user.phone || ''}`.toLowerCase().includes(term));
    $('userRows').innerHTML = rows.map((user) => {
      const [label, cls] = STATUS[user.status] || STATUS.active;
      return `<tr>
        <td>${esc(user.display_name || 'بدون اسم')}<div class="muted">${esc(user.email || user.phone || '')}</div></td>
        <td class="muted">${esc(user.altloo_id)}</td>
        <td class="muted">${esc(user.provider || 'email')}</td>
        <td><span class="pill ${cls}">${esc(label)}</span></td>
        <td class="muted">🪙 ${fmtNum(user.coins)} · 💎 ${fmtNum(user.diamonds)}</td>
        <td><div class="row-actions">
          <button class="btn small" data-status="${esc(user.id)}" data-next="${user.status === 'banned' ? 'active' : 'banned'}">
            ${user.status === 'banned' ? 'رفع الحظر' : 'حظر'}
          </button>
          <button class="btn small" data-credit="${esc(user.id)}">رصيد</button>
        </div></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">لا نتائج</td></tr>';

    $('userRows').querySelectorAll('[data-status]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await api('/api/admin/users/' + button.dataset.status, {
            method: 'PATCH',
            body: JSON.stringify({ status: button.dataset.next })
          });
          msg('تم تحديث حالة العضو');
          loadUsers();
        } catch (error) { msg(error.message, 'err'); }
      });
    });

    $('userRows').querySelectorAll('[data-credit]').forEach((button) => {
      button.addEventListener('click', async () => {
        const amount = Number(window.prompt('قيمة التعديل (سالب للخصم):', '500'));
        if (!amount) return;
        const currency = window.prompt('العملة: coins أو diamonds', 'coins');
        if (currency !== 'coins' && currency !== 'diamonds') return msg('عملة غير معروفة', 'err');
        try {
          await api(`/api/admin/users/${button.dataset.credit}/balance`, {
            method: 'POST',
            body: JSON.stringify({ currency, amount, note: 'تعديل يدوي من لوحة التحكم' })
          });
          msg('تم تعديل الرصيد');
          loadUsers();
        } catch (error) { msg(error.message, 'err'); }
      });
    });
  }

  $('userSearch').addEventListener('input', () => loadUsers().catch(() => {}));

  // ---------------------------------------------------------------- withdrawals
  async function loadWithdrawals() {
    const data = await api('/api/admin/withdrawals');
    $('withdrawRows').innerHTML = data.items.map((row) => `<tr>
      <td>${esc(row.display_name || '')}<div class="muted">${esc(row.altloo_id || '')}</div></td>
      <td>${fmtNum(row.diamonds)} 💎</td>
      <td>${esc(money(row.cents))}</td>
      <td class="muted">${esc(row.method)}</td>
      <td class="muted">${esc(row.account)}</td>
      <td><span class="pill ${row.status === 'paid' ? 'ok' : row.status === 'rejected' ? 'no' : ''}">${esc(row.status)}</span></td>
      <td><div class="row-actions">
        ${row.status === 'pending' ? `
          <button class="btn small" data-pay="${esc(row.id)}">تم الدفع</button>
          <button class="btn small danger" data-reject="${esc(row.id)}">رفض</button>` : '<span class="muted">—</span>'}
      </div></td></tr>`).join('') || '<tr><td colspan="7" class="muted">لا طلبات سحب</td></tr>';

    const handle = (selector, status) => {
      $('withdrawRows').querySelectorAll(selector).forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await api('/api/admin/withdrawals/' + button.dataset[status === 'paid' ? 'pay' : 'reject'], {
              method: 'PATCH',
              body: JSON.stringify({ status, note: '' })
            });
            msg('تم تحديث الطلب');
            loadWithdrawals();
          } catch (error) { msg(error.message, 'err'); }
        });
      });
    };
    handle('[data-pay]', 'paid');
    handle('[data-reject]', 'rejected');
  }

  // ---------------------------------------------------------------- luck
  async function loadLuck() {
    const config = await api('/api/admin/luck');
    const hours = Math.round(Number(config.cooldown_ms || 72000000) / 3600000);
    const prizes = JSON.parse(config.prizes_json || '[]');
    $('luckCooldown').value = hours;
    $('luckStep').value = prizes.length ? (Number(config.max_streak) || 1) : 1;
    $('luckMax').value = Number(config.max_streak || 3);
    $('spinRows').innerHTML = prizes.map((prize) =>
      `<tr><td>${esc(prize.label)}</td><td>${fmtNum(prize.amount)} ${prize.currency === 'diamonds' ? '💎' : '🪙'}</td>
        <td class="muted">وزن ${fmtNum(prize.weight)}</td><td class="muted">—</td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">لا جوائز محفوظة</td></tr>';
  }

  $('luckForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const cooldownMs = Number($('luckCooldown').value) * 3600000;
    const maxStreak = Number($('luckMax').value);
    const step = Number($('luckStep').value);
    const prizes = [
      { label: 'جائزة صغيرة', amount: 1000, currency: 'coins', weight: 34 },
      { label: 'جائزة متوسطة', amount: 2500, currency: 'coins', weight: 24 },
      { label: 'جائزة كبيرة', amount: 6000, currency: 'coins', weight: 12 },
      { label: 'ألماس', amount: 20, currency: 'diamonds', weight: 18 },
      { label: 'ألماس نادر', amount: 60, currency: 'diamonds', weight: 10 },
      { label: 'الجائزة الكبرى', amount: 250, currency: 'diamonds', weight: 2 }
    ];
    try {
      await api('/api/admin/luck', {
        method: 'PUT',
        body: JSON.stringify({ cooldownMs, maxStreak, prizes, multiplierStep: step })
      });
      msg('حُفظت إعدادات شريط الحظ');
      loadLuck();
    } catch (error) { msg(error.message, 'err'); }
  });

  // ---------------------------------------------------------------- rooms
  async function loadRooms() {
    const data = await api('/api/admin/rooms');
    $('roomRows').innerHTML = data.items.map((room) => `<tr>
      <td>${esc(room.title)}<div class="muted">#${esc(room.code)}</div></td>
      <td class="muted">${esc(room.host_name || '')}</td>
      <td class="muted">${esc(room.category)}</td>
      <td>${fmtNum(room.listeners)}</td>
      <td><span class="pill ${room.live ? 'ok' : 'no'}">${room.live ? 'مباشرة' : 'مغلقة'}</span></td>
      <td><button class="btn small ${room.live ? 'danger' : ''}" data-room="${esc(room.id)}" data-live="${room.live ? 0 : 1}">
        ${room.live ? 'إغلاق' : 'فتح'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا غرف</td></tr>';

    $('roomRows').querySelectorAll('[data-room]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await api('/api/admin/rooms/' + button.dataset.room, {
            method: 'PATCH',
            body: JSON.stringify({ live: button.dataset.live === '1' })
          });
          msg('تم تحديث الغرفة');
          loadRooms();
        } catch (error) { msg(error.message, 'err'); }
      });
    });
  }

  // ---------------------------------------------------------------- audit
  async function loadAudit() {
    const data = await api('/api/admin/audit');
    $('auditRows').innerHTML = data.items.map((row) =>
      `<tr><td>${esc(row.action)}<div class="muted">${esc(row.detail || '')}</div></td>
        <td class="muted">${esc(row.actor)}</td><td class="muted">${esc(timeOf(row.created_at))}</td></tr>`).join('')
      || '<tr><td colspan="3" class="muted">لا عمليات</td></tr>';
  }

  const loaders = {
    overview: loadOverview,
    banners: loadBanners,
    users: loadUsers,
    withdrawals: loadWithdrawals,
    luck: loadLuck,
    rooms: loadRooms,
    audit: loadAudit
  };
})();
