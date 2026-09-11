(() => {
  'use strict';

  const STATUS = ['Pendente', 'Aguardando terceiro', 'Em andamento', 'Concluida'];
  const PRIORITIES = ['Alta', 'Media', 'Baixa'];
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const today = () => new Date().toISOString().slice(0, 10);
  const currentState = () => { try { return typeof state === 'undefined' ? null : state; } catch { return null; } };
  const itemId = () => `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const days = (date) => {
    if (!date) return null;
    const target = new Date(`${date}T12:00:00`); const now = new Date(); now.setHours(12, 0, 0, 0);
    return Math.round((target - now) / 86400000);
  };
  const isOpen = (item) => item.status !== 'Concluida';
  const deadlineLabel = (item) => {
    const value = days(item.due);
    if (value === null) return 'Sem prazo';
    if (value < 0) return `${Math.abs(value)} dia(s) em atraso`;
    if (value === 0) return 'Vence hoje';
    if (value === 1) return 'Vence amanhã';
    return `Prazo em ${value} dias`;
  };
  const urgency = (item) => { const value = days(item.due); return value !== null && value < 0 ? 'late' : value !== null && value <= 7 ? 'soon' : item.status === 'Aguardando terceiro' ? 'waiting' : ''; };

  function ensure() {
    const work = currentState(); if (!work) return null;
    work.operation = { pendingItems: [], filter: 'open', ...(work.operation || {}) };
    work.operation.pendingItems = Array.isArray(work.operation.pendingItems) ? work.operation.pendingItems : [];
    return work.operation;
  }

  async function persist(reason, item) {
    const work = currentState(); if (!work) return;
    try { if (typeof localStorage !== 'undefined' && typeof storeKey !== 'undefined') localStorage.setItem(storeKey, JSON.stringify(work)); } catch {}
    try {
      if (typeof recordProjectChange === 'function') recordProjectChange('pending', item?.title || 'Central de pendências', reason, 'pending', '', item?.status || '');
      if (typeof persistDashboardCard === 'function') await persistDashboardCard();
    } catch (error) { console.warn('Não foi possível salvar a pendência na base compartilhada:', error.message); }
  }

  function summary(items) {
    const open = items.filter(isOpen);
    return { open: open.length, late: open.filter(item => days(item.due) < 0).length, soon: open.filter(item => { const value = days(item.due); return value !== null && value >= 0 && value <= 7; }).length, waiting: open.filter(item => item.status === 'Aguardando terceiro').length };
  }

  function itemMarkup(item) {
    const tone = urgency(item); const owner = item.owner || 'Sem responsável'; const waiting = item.waitingOn ? `<span><b>Aguardando:</b> ${esc(item.waitingOn)}</span>` : '';
    return `<article class="work-pending-item ${tone}" data-pending-id="${esc(item.id)}"><div class="work-pending-top"><div><strong>${esc(item.title || 'Pendência sem título')}</strong><span>${esc(item.category || 'Geral')} · ${esc(item.priority || 'Media')} prioridade</span></div><span class="work-pending-deadline">${esc(deadlineLabel(item))}</span></div><div class="work-pending-meta"><span><b>Responsável:</b> ${esc(owner)}</span>${waiting}<span><b>Status:</b> ${esc(item.status || 'Pendente')}</span></div>${item.note ? `<p>${esc(item.note)}</p>` : ''}<div class="work-pending-actions"><select data-action="status"><option value="">Alterar status</option>${STATUS.map(status => `<option value="${esc(status)}">${esc(status)}</option>`).join('')}</select><button type="button" data-action="done">Concluir</button><button type="button" data-action="remove" class="work-pending-remove">Remover</button></div></article>`;
  }

  function filtered(operation) {
    const items = operation.pendingItems || [];
    if (operation.filter === 'late') return items.filter(item => isOpen(item) && days(item.due) < 0);
    if (operation.filter === 'soon') return items.filter(item => isOpen(item) && (() => { const value = days(item.due); return value !== null && value >= 0 && value <= 7; })());
    if (operation.filter === 'waiting') return items.filter(item => isOpen(item) && item.status === 'Aguardando terceiro');
    if (operation.filter === 'all') return items;
    return items.filter(isOpen);
  }

  function render(panel) {
    const operation = ensure(); if (!operation) return;
    const counts = summary(operation.pendingItems); const list = filtered(operation);
    const workId = typeof obraParam !== 'undefined' ? obraParam : '';
    panel.innerHTML = `<style id="work-pending-style">#work-pending-panel{margin:26px 0}.work-pending-shell{background:#0e1b2d;border:1px solid #2e4d70;border-radius:14px;padding:20px;box-shadow:var(--p3-shadow)}.work-pending-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}.work-pending-head h2{font-size:18px;color:var(--p3-primary);margin:0}.work-pending-head p{font-size:12px;color:var(--p3-muted);margin:4px 0 0}.work-pending-counts{display:flex;gap:8px;flex-wrap:wrap}.work-pending-counts button,.work-pending-actions button,.work-pending-recharge{border:1px solid #2e4d70;background:#0b1524;color:var(--p3-text);border-radius:7px;padding:7px 9px;font:inherit;font-size:11px;font-weight:800;cursor:pointer;text-decoration:none}.work-pending-counts button.active{border-color:var(--p3-accent);color:var(--p3-accent)}.work-pending-counts .danger{color:#ff8c99}.work-pending-recharge{color:var(--p3-accent)}.work-pending-form{display:grid;grid-template-columns:1.4fr 1fr 1fr .8fr .9fr auto;gap:8px;align-items:end;border:1px solid var(--p3-border);background:#13243b;border-radius:10px;padding:12px;margin-bottom:14px}.work-pending-form label{display:grid;gap:3px;font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--p3-muted)}.work-pending-form input,.work-pending-form select,.work-pending-form textarea{min-width:0;border:1px solid #2e4d70;background:#0b1524;color:var(--p3-text);border-radius:7px;padding:8px;font:inherit;font-size:12px}.work-pending-form button{border:0;border-radius:7px;background:var(--p3-accent);color:#fff;padding:9px 12px;font-weight:800;cursor:pointer}.work-pending-more{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}.work-pending-list{display:grid;gap:9px}.work-pending-item{border:1px solid var(--p3-border);border-left:4px solid var(--p3-accent);border-radius:9px;background:#13243b;padding:12px}.work-pending-item.late{border-left-color:var(--p3-danger)}.work-pending-item.soon{border-left-color:var(--p3-warn)}.work-pending-item.waiting{border-left-color:#7eb7ff}.work-pending-top{display:flex;justify-content:space-between;gap:10px}.work-pending-top strong{display:block;color:var(--p3-text);font-size:13px}.work-pending-top span,.work-pending-meta,.work-pending-item p{color:var(--p3-muted);font-size:11px}.work-pending-deadline{font-weight:800;white-space:nowrap}.work-pending-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:7px}.work-pending-item p{margin:7px 0 0}.work-pending-actions{display:flex;gap:7px;align-items:center;margin-top:9px}.work-pending-actions select{border:1px solid #2e4d70;background:#0b1524;color:var(--p3-text);border-radius:6px;padding:6px;font-size:11px}.work-pending-actions .work-pending-remove{color:#ff8c99}.work-pending-empty{border:1px dashed var(--p3-border);border-radius:9px;padding:18px;text-align:center;color:var(--p3-muted);font-size:12px}@media(max-width:880px){.work-pending-form{grid-template-columns:1fr 1fr 1fr}.work-pending-form button{height:38px}}@media(max-width:620px){.work-pending-head,.work-pending-top{display:block}.work-pending-counts{margin-top:10px}.work-pending-form,.work-pending-more{grid-template-columns:1fr}.work-pending-deadline{display:block;margin-top:4px}.work-pending-actions{flex-wrap:wrap}}</style><section class="work-pending-shell"><header class="work-pending-head"><div><h2>Central de pendências da obra</h2><p>Registre bloqueios, responsáveis, prazos e retornos de terceiros. Esta fila alimenta a visão geral de obras.</p></div><div class="work-pending-counts"><a class="work-pending-recharge" href="recargas.html?obra=${encodeURIComponent(workId)}">Operação de recargas</a><button data-filter="open" class="${operation.filter === 'open' ? 'active' : ''}">${counts.open} abertas</button><button data-filter="late" class="danger ${operation.filter === 'late' ? 'active' : ''}">${counts.late} atrasadas</button><button data-filter="soon" class="${operation.filter === 'soon' ? 'active' : ''}">${counts.soon} próximos 7 dias</button><button data-filter="waiting" class="${operation.filter === 'waiting' ? 'active' : ''}">${counts.waiting} aguardando</button><button data-filter="all" class="${operation.filter === 'all' ? 'active' : ''}">Todas</button></div></header><form class="work-pending-form"><label>Pendência<input name="title" required placeholder="Ex.: retorno da Copel"></label><label>Responsável<input name="owner" placeholder="Quem resolve"></label><label>Prazo<input name="due" type="date"></label><label>Prioridade<select name="priority">${PRIORITIES.map(value => `<option>${value}</option>`).join('')}</select></label><label>Status<select name="status">${STATUS.slice(0, 3).map(value => `<option>${value}</option>`).join('')}</select></label><button type="submit">Adicionar</button><div class="work-pending-more"><label>Aguardando quem / o quê?<input name="waitingOn" placeholder="Ex.: Copel · protocolo 123"></label><label>Anotação<textarea name="note" rows="2" placeholder="Contexto, próximo passo e informação necessária"></textarea></label></div></form><div class="work-pending-list">${list.length ? list.sort((a,b) => (days(a.due) ?? 99999) - (days(b.due) ?? 99999)).map(itemMarkup).join('') : '<div class="work-pending-empty">Nenhuma pendência neste filtro. Use a fila para registrar tudo que estiver aguardando ou travando a obra.</div>'}</div></section>`;
    bind(panel, operation);
  }

  function bind(panel, operation) {
    panel.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { operation.filter = button.dataset.filter; render(panel); }));
    panel.querySelector('form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const item = { id: itemId(), title: String(form.get('title') || '').trim(), owner: String(form.get('owner') || '').trim(), due: String(form.get('due') || ''), priority: String(form.get('priority') || 'Media'), status: String(form.get('status') || 'Pendente'), waitingOn: String(form.get('waitingOn') || '').trim(), note: String(form.get('note') || '').trim(), category: 'Pendência operacional', createdAt: new Date().toISOString() }; if (!item.title) return; operation.pendingItems.push(item); await persist('Pendência criada na central da obra.', item); render(panel); });
    panel.querySelectorAll('[data-pending-id]').forEach(row => { const item = operation.pendingItems.find(entry => entry.id === row.dataset.pendingId); if (!item) return; row.querySelector('[data-action="status"]').addEventListener('change', async (event) => { if (!event.target.value) return; item.status = event.target.value; await persist('Status da pendência atualizado.', item); render(panel); }); row.querySelector('[data-action="done"]').addEventListener('click', async () => { item.status = 'Concluida'; item.completedAt = new Date().toISOString(); await persist('Pendência concluída.', item); render(panel); }); row.querySelector('[data-action="remove"]').addEventListener('click', async () => { operation.pendingItems = operation.pendingItems.filter(entry => entry.id !== item.id); await persist('Pendência removida.', item); render(panel); }); });
  }

  function mount() { if (document.getElementById('work-pending-panel') || !currentState()) return; const panel = document.createElement('div'); panel.id = 'work-pending-panel'; const anchor = document.querySelector('#alertBox'); if (anchor) anchor.insertAdjacentElement('afterend', panel); else document.querySelector('main, .page')?.prepend(panel); render(panel); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  let observed = currentState(); let tries = 0; const refresh = window.setInterval(() => { const next = currentState(); if (next && next !== observed) { observed = next; const panel = document.getElementById('work-pending-panel'); if (panel) render(panel); } if (++tries > 90) window.clearInterval(refresh); }, 200);
})();
