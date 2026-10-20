(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const statuses = { new: '待处理', reviewing: '处理中', resolved: '已解决' };
  const categories = { bug: '程序错误', stuck: '卡关 / 引导', suggestion: '体验建议', other: '其他' };
  let authorization = '', page = 0, busy = false;
  const node = (tag, text, cls) => { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el; };
  function logout() {
    authorization = ''; $('items').replaceChildren(); $('counts').replaceChildren();
    $('inbox').hidden = true; $('logout').hidden = true; $('login-panel').hidden = false; $('password').value = '';
  }
  async function api(path = 'api', options = {}) {
    const response = await fetch(new URL(path, location.href), { ...options, cache: 'no-store',
      headers: { Authorization: authorization, ...options.headers }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      if (response.status === 401) logout();
      throw new Error(response.status === 429 ? '尝试过于频繁，请稍后再试。' : response.status === 401 ? '账号或密码不正确。' : '请求未完成，请重试。');
    }
    return response;
  }
  async function load() {
    if (busy) return;
    busy = true; $('notice').textContent = '正在读取…';
    try {
      const data = await (await api(`api?page=${page}&status=${encodeURIComponent($('filter').value)}`)).json();
      $('login-panel').hidden = true; $('inbox').hidden = false; $('logout').hidden = false; $('password').value = '';
      $('counts').replaceChildren(...Object.entries(statuses).map(([key, label]) => {
        const el = node('span', ''); el.append(node('strong', String(data.counts[key])), document.createTextNode(label)); return el;
      }));
      $('items').replaceChildren(...data.items.map(item => {
        const card = node('article', '', 'note');
        const head = node('div', '', 'note-head');
        head.append(node('span', `${categories[item.category]} · ${statuses[item.status]}`, 'badge'), node('time', new Date(item.created).toLocaleString()));
        card.append(head, node('div', item.message, 'body'));
        if (item.steps) card.append(node('p', '复现步骤', 'dim'), node('div', item.steps, 'steps'));
        if (item.contact) card.append(node('p', `联系方式：${item.contact}`, 'contact'));
        const detail = node('details', ''); detail.append(node('summary', '版本与环境'), node('pre', JSON.stringify(item.context, null, 2)));
        card.append(detail, node('p', item.id, 'id'));
        const actions = node('div', '', 'note-actions');
        if (item.hasSave) {
          const download = node('button', '下载存档');
          download.addEventListener('click', async () => {
            try {
              const blob = await (await api(`save/${item.id}`)).blob();
              const url = URL.createObjectURL(blob), link = document.createElement('a');
              link.href = url; link.download = `feedback-${item.id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) { $('notice').textContent = e.message; }
          }); actions.append(download);
        }
        const label = node('label', '处理状态 '), select = document.createElement('select'); select.setAttribute('aria-label', '处理状态');
        Object.entries(statuses).forEach(([value, text]) => { const option = node('option', text); option.value = value; select.append(option); });
        select.value = item.status;
        select.addEventListener('change', async () => {
          select.disabled = true;
          try { await api('api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status: select.value }) }); await load(); }
          catch (e) { select.value = item.status; $('notice').textContent = e.message; }
          finally { select.disabled = false; }
        });
        label.append(select); actions.append(label); card.append(actions); return card;
      }));
      $('previous').disabled = page === 0; $('next').disabled = (page + 1) * 30 >= data.total;
      $('page').textContent = `第 ${page + 1} 页 · 共 ${data.total} 条`;
      $('notice').textContent = data.total ? '' : '这里还没有反馈。';
    } catch (e) { $('notice').textContent = e.message; }
    finally { busy = false; }
  }
  $('login').addEventListener('submit', e => {
    e.preventDefault();
    authorization = 'Basic ' + btoa(unescape(encodeURIComponent(`${$('username').value}:${$('password').value}`)));
    page = 0; void load();
  });
  $('logout').addEventListener('click', () => { logout(); $('notice').textContent = '已退出。'; });
  $('refresh').addEventListener('click', () => void load());
  $('filter').addEventListener('change', () => { page = 0; void load(); });
  $('previous').addEventListener('click', () => { if (page > 0) { page--; void load(); } });
  $('next').addEventListener('click', () => { page++; void load(); });
})();
