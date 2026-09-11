(() => {
  'use strict';

  const DEFAULTS = {
    stage: 'Triagem inicial',
    responsible: '',
    contactName: '',
    contactRole: '',
    phone: '',
    email: '',
    nextAction: '',
    nextActionDate: '',
    notes: '',
    protocols: [],
    documents: [],
    contract: {
      fileName: '',
      link: '',
      storagePath: '',
      closedAt: '',
      collapsed: false,
      uploadPending: false
    }
  };

  const stages = [
    'Triagem inicial',
    'Contato realizado',
    'Dados em coleta',
    'Estudo técnico',
    'Proposta enviada',
    'Negociação',
    'Aguardando decisão',
    'Contrato fechado'
  ];

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const getState = () => {
    try {
      return typeof state !== 'undefined' ? state : null;
    } catch (_) {
      return null;
    }
  };

  const ensureProspecting = () => {
    const current = getState();
    if (!current) return null;
    current.prospecting = { ...DEFAULTS, ...(current.prospecting || {}) };
    current.prospecting.protocols = Array.isArray(current.prospecting.protocols) ? current.prospecting.protocols : [];
    current.prospecting.documents = Array.isArray(current.prospecting.documents) ? current.prospecting.documents : [];
    current.prospecting.contract = { ...DEFAULTS.contract, ...(current.prospecting.contract || {}) };
    return current.prospecting;
  };

  const field = (label, name, value, type = 'text', placeholder = '') => `
    <label class="prospecting-field">
      <span>${label}</span>
      <input type="${type}" data-prospect-field="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
    </label>`;

  const tableRows = (items, kind) => {
    if (!items.length) return '<tr><td colspan="5" class="prospecting-empty">Nenhum registro adicionado.</td></tr>';
    return items.map((item, index) => {
      const inputs = kind === 'protocol'
        ? [
          `<input data-prospect-${kind}="${index}" data-key="body" value="${escapeHtml(item.body)}" placeholder="Órgão / concessionária">`,
          `<input data-prospect-${kind}="${index}" data-key="number" value="${escapeHtml(item.number)}" placeholder="Número">`,
          `<input data-prospect-${kind}="${index}" data-key="status" value="${escapeHtml(item.status)}" placeholder="Status">`,
          `<input type="date" data-prospect-${kind}="${index}" data-key="deadline" value="${escapeHtml(item.deadline)}">`
        ]
        : [
          `<input data-prospect-${kind}="${index}" data-key="name" value="${escapeHtml(item.name)}" placeholder="Nome do documento">`,
          `<input data-prospect-${kind}="${index}" data-key="category" value="${escapeHtml(item.category)}" placeholder="Categoria">`,
          `<input data-prospect-${kind}="${index}" data-key="reference" value="${escapeHtml(item.reference)}" placeholder="Link ou referência">`,
          `<input data-prospect-${kind}="${index}" data-key="status" value="${escapeHtml(item.status)}" placeholder="Status">`
        ];
      return `<tr><td>${inputs[0]}</td><td>${inputs[1]}</td><td>${inputs[2]}</td><td>${inputs[3]}</td><td><button type="button" class="prospecting-remove" data-remove="${kind}" data-index="${index}" aria-label="Remover registro">Excluir</button></td></tr>`;
    }).join('');
  };

  const style = `
    <style id="prospecting-style">
      #prospecting-panel{margin:18px auto;max-width:1360px;padding:0 18px;box-sizing:border-box;font-family:inherit}
      .prospecting-card{background:#0c1b2e;border:1px solid #1d4d75;border-bottom:3px solid #37a8f5;border-radius:10px;padding:22px;color:#eaf3ff}
      .prospecting-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #203d5e;padding-bottom:14px;margin-bottom:18px}
      .prospecting-header h2{margin:0;color:#14efa0;font-size:20px}.prospecting-header p{margin:6px 0 0;color:#9db5ce;font-size:13px;line-height:1.5}.prospecting-badge{white-space:nowrap;background:#123657;color:#58bbff;border:1px solid #2b76ae;padding:7px 10px;border-radius:999px;font-weight:700;font-size:12px}
      .prospecting-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.prospecting-field{display:grid;gap:6px;color:#9db5ce;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.prospecting-field input,.prospecting-stage,.prospecting-notes{width:100%;box-sizing:border-box;background:#0a1728;border:1px solid #294766;color:#fff;border-radius:7px;padding:10px;font:inherit;min-height:40px}.prospecting-stage{margin-top:7px}.prospecting-notes{min-height:92px;resize:vertical}
      .prospecting-section{margin-top:22px}.prospecting-section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.prospecting-section h3{margin:0;color:#fff;font-size:15px}.prospecting-table-wrap{overflow-x:auto;border:1px solid #24435f;border-radius:8px}.prospecting-table{width:100%;border-collapse:collapse;min-width:720px}.prospecting-table th{background:#172f4c;color:#43efad;text-align:left;padding:10px;font-size:11px;letter-spacing:.05em}.prospecting-table td{padding:8px;border-top:1px solid #1e3854}.prospecting-table input{width:100%;box-sizing:border-box;background:#0a1728;border:1px solid #294766;color:#fff;border-radius:6px;padding:8px;min-height:36px}.prospecting-empty{color:#91a7bb;text-align:center;padding:16px}.prospecting-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}.prospecting-save,.prospecting-add{border:0;border-radius:7px;background:#08e98f;color:#062018;padding:10px 14px;font-weight:800;cursor:pointer}.prospecting-add{background:#183d61;color:#66c3ff}.prospecting-remove{border:1px solid #d95064;border-radius:6px;background:transparent;color:#ff8c99;padding:7px 10px;cursor:pointer}.prospecting-status{font-size:12px;color:#99b5cd}.prospecting-status[data-state="error"]{color:#ff8c99}.prospecting-status[data-state="success"]{color:#16f29a}.prospecting-contract{margin-top:22px;border:1px solid #2b76ae;border-left:4px solid #f2a93d;border-radius:8px;background:#0a1728}.prospecting-contract.closed{border-left-color:#14efa0}.prospecting-contract summary{cursor:pointer;list-style:none;padding:14px 16px;display:flex;justify-content:space-between;gap:12px;align-items:center;color:#fff;font-weight:800}.prospecting-contract summary::-webkit-details-marker{display:none}.prospecting-contract summary::after{content:'⌄';color:#66c3ff;font-size:18px}.prospecting-contract[open] summary::after{transform:rotate(180deg)}.prospecting-contract-body{padding:0 16px 16px;color:#9db5ce;font-size:13px;line-height:1.5}.prospecting-contract-body p{margin:0 0 12px}.prospecting-contract-upload{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.prospecting-contract-upload input{max-width:100%;color:#d9e9f7}.prospecting-contract-link{color:#66c3ff;font-weight:800;text-decoration:none}.prospecting-contract-alert{color:#ffd17b;font-weight:700}
      @media (max-width:760px){#prospecting-panel{padding:0 10px}.prospecting-card{padding:16px}.prospecting-header{display:block}.prospecting-badge{display:inline-block;margin-top:10px}.prospecting-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.prospecting-actions{align-items:flex-start;flex-direction:column}}
    </style>`;

  const render = (panel) => {
    const prospecting = ensureProspecting();
    if (!prospecting) return;
    const stageOptions = stages.map((stage) => `<option ${stage === prospecting.stage ? 'selected' : ''}>${stage}</option>`).join('');
    const contractClosed = prospecting.stage === 'Contrato fechado' && Boolean(prospecting.contract.link);
    const showContract = contractClosed || prospecting.contract.uploadPending;
    const contractOpen = !contractClosed || !prospecting.contract.collapsed;
    const contractSection = showContract ? `
        <details class="prospecting-contract ${contractClosed ? 'closed' : ''}" ${contractOpen ? 'open' : ''}>
          <summary><span>${contractClosed ? 'Contrato fechado e anexado' : 'Anexe o contrato para concluir o fechamento'}</span><span>${contractClosed ? 'Fechado' : 'Anexo obrigatório'}</span></summary>
          <div class="prospecting-contract-body">
            ${contractClosed
              ? `<p>Fechado em ${escapeHtml(prospecting.contract.closedAt || 'data não informada')}. ${prospecting.contract.fileName ? `Arquivo: ${escapeHtml(prospecting.contract.fileName)}.` : ''}</p>${prospecting.contract.link ? `<a class="prospecting-contract-link" href="${escapeHtml(prospecting.contract.link)}" target="_blank" rel="noopener">Abrir contrato anexado</a>` : ''}`
              : '<p class="prospecting-contract-alert">Para registrar o contrato como fechado, anexe o PDF ou imagem do contrato assinado.</p>'}
            <div class="prospecting-contract-upload"><input type="file" class="prospecting-contract-file" accept="application/pdf,image/jpeg,image/png,image/webp"><span class="prospecting-contract-upload-status">${contractClosed ? 'Você pode substituir o arquivo, se necessário.' : 'O fechamento será confirmado somente após o envio.'}</span></div>
          </div>
        </details>` : '';
    panel.innerHTML = `${style}
      <section class="prospecting-card">
        <header class="prospecting-header"><div><h2>Prospecção e estudo</h2><p>Gestão comercial e técnica anterior ao projeto. Contatos, protocolos e referências ficam vinculados à mesma obra.</p></div><span class="prospecting-badge">Etapa: ${escapeHtml(prospecting.stage)}</span></header>
        <div class="prospecting-grid">
          <label class="prospecting-field"><span>Etapa comercial</span><select class="prospecting-stage" data-prospect-field="stage">${stageOptions}</select></label>
          ${field('Responsável P3', 'responsible', prospecting.responsible, 'text', 'Nome do responsável')}
          ${field('Contato principal', 'contactName', prospecting.contactName, 'text', 'Nome do cliente')}
          ${field('Cargo / função', 'contactRole', prospecting.contactRole, 'text', 'Ex.: proprietário')}
          ${field('WhatsApp', 'phone', prospecting.phone, 'tel', 'DDD + número')}
          ${field('E-mail', 'email', prospecting.email, 'email', 'contato@empresa.com')}
          ${field('Próxima ação', 'nextAction', prospecting.nextAction, 'text', 'Ex.: solicitar fatura de energia')}
          ${field('Data da próxima ação', 'nextActionDate', prospecting.nextActionDate, 'date')}
        </div>
        <div class="prospecting-section"><label class="prospecting-field"><span>Notas do estudo</span><textarea class="prospecting-notes" data-prospect-field="notes" placeholder="Premissas comerciais, demanda, restrições e próximos passos.">${escapeHtml(prospecting.notes)}</textarea></label></div>
        ${contractSection}
        <div class="prospecting-section"><div class="prospecting-section-head"><h3>Protocolos e tratativas</h3><button type="button" class="prospecting-add" data-add="protocol">Adicionar protocolo</button></div><div class="prospecting-table-wrap"><table class="prospecting-table"><thead><tr><th>Órgão / concessionária</th><th>Protocolo</th><th>Status</th><th>Prazo</th><th></th></tr></thead><tbody>${tableRows(prospecting.protocols, 'protocol')}</tbody></table></div></div>
        <div class="prospecting-section"><div class="prospecting-section-head"><h3>Documentos e referências</h3><button type="button" class="prospecting-add" data-add="document">Adicionar documento</button></div><div class="prospecting-table-wrap"><table class="prospecting-table"><thead><tr><th>Documento</th><th>Categoria</th><th>Link / referência</th><th>Status</th><th></th></tr></thead><tbody>${tableRows(prospecting.documents, 'document')}</tbody></table></div></div>
        <footer class="prospecting-actions"><button type="button" class="prospecting-save">Salvar dados de prospecção</button><span class="prospecting-status">Os dados serão salvos na mesma base compartilhada desta obra.</span></footer>
      </section>`;
    bind(panel);
  };

  const bind = (panel) => {
    const prospecting = ensureProspecting();
    panel.querySelectorAll('[data-prospect-field]').forEach((input) => {
      const updateField = () => {
      const fieldName = input.dataset.prospectField;
      if (fieldName === 'stage' && input.value === 'Contrato fechado' && !prospecting.contract.link) {
        prospecting.contract.uploadPending = true;
        input.value = prospecting.stage;
        render(panel);
        return;
      }
      prospecting[fieldName] = input.value;
      if (fieldName === 'stage' && input.value !== 'Contrato fechado') prospecting.contract.uploadPending = false;
      };
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', updateField);
    });
    panel.querySelector('.prospecting-contract')?.addEventListener('toggle', (event) => {
      if (prospecting.stage === 'Contrato fechado' && prospecting.contract.link) prospecting.contract.collapsed = !event.currentTarget.open;
    });
    panel.querySelector('.prospecting-contract-file')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      const uploadStatus = panel.querySelector('.prospecting-contract-upload-status');
      if (!file) return;
      try {
        uploadStatus.textContent = 'Enviando contrato para a base compartilhada...';
        if (!window.UBY_SUPABASE?.uploadDocumentFile) throw new Error('Envio de arquivos indisponível. Entre na plataforma e tente novamente.');
        const current = getState();
        const workId = typeof obraParam !== 'undefined' ? obraParam : current?.project?.id;
        if (!workId) throw new Error('Não foi possível identificar a obra para armazenar o contrato.');
        const result = await window.UBY_SUPABASE.uploadDocumentFile(workId, current?.project?.obraNome || 'Obra', 'contrato-comercial', file);
        prospecting.contract = {
          ...prospecting.contract,
          fileName: result.fileName || file.name,
          link: result.link || '',
          storagePath: result.storagePath || '',
          closedAt: new Date().toLocaleDateString('pt-BR'),
          collapsed: true,
          uploadPending: false
        };
        prospecting.stage = 'Contrato fechado';
        if (typeof localStorage !== 'undefined' && typeof storeKey !== 'undefined') localStorage.setItem(storeKey, JSON.stringify(current));
        if (typeof recordProjectChange === 'function') recordProjectChange('contract', 'Contrato fechado', 'Contrato assinado anexado à obra.', 'contract', '', result.fileName || file.name);
        if (typeof persistDashboardCard === 'function') await persistDashboardCard();
        render(panel);
      } catch (error) {
        uploadStatus.textContent = `Não foi possível enviar o contrato: ${error.message}`;
      }
    });
    panel.querySelectorAll('[data-prospect-protocol],[data-prospect-document]').forEach((input) => input.addEventListener('input', () => {
      const kind = input.dataset.prospectProtocol !== undefined ? 'protocols' : 'documents';
      const index = Number(input.dataset.prospectProtocol ?? input.dataset.prospectDocument);
      prospecting[kind][index][input.dataset.key] = input.value;
    }));
    panel.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.add === 'protocol') prospecting.protocols.push({ body: '', number: '', status: '', deadline: '' });
      else prospecting.documents.push({ name: '', category: '', reference: '', status: '' });
      render(panel);
    }));
    panel.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      const list = button.dataset.remove === 'protocol' ? prospecting.protocols : prospecting.documents;
      list.splice(Number(button.dataset.index), 1);
      render(panel);
    }));
    panel.querySelector('.prospecting-save').addEventListener('click', async () => {
      const status = panel.querySelector('.prospecting-status');
      try {
        status.textContent = 'Salvando na base compartilhada...';
        status.dataset.state = '';
        if (typeof save !== 'function') throw new Error('Rotina de salvamento indisponível.');
        await save();
        status.textContent = 'Dados de prospecção salvos na base compartilhada.';
        status.dataset.state = 'success';
      } catch (error) {
        status.textContent = `Não foi possível salvar: ${error.message}`;
        status.dataset.state = 'error';
      }
    });
  };

  const mount = () => {
    if (document.getElementById('prospecting-panel') || !getState()) return;
    const panel = document.createElement('div');
    panel.id = 'prospecting-panel';
    const controls = document.querySelector('#statusExec')?.closest('.controls, .control-grid, section, .card');
    if (controls?.parentNode) controls.insertAdjacentElement('afterend', panel);
    else document.querySelector('main')?.prepend(panel);
    render(panel);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // O detalhe da obra inicia com uma copia local e troca o objeto `state`
  // quando a resposta oficial chega do Supabase. Este painel e inserido logo
  // depois do bootstrap; sem esta checagem ele continuava mostrando a copia
  // vazia, apesar de a obra ja ter sido carregada da nuvem.
  const initialState = getState();
  let refreshAttempts = 0;
  const refreshFromCloudState = window.setInterval(() => {
    const current = getState();
    if (current && current !== initialState) {
      window.clearInterval(refreshFromCloudState);
      const panel = document.getElementById('prospecting-panel');
      if (panel) render(panel);
      return;
    }
    refreshAttempts += 1;
    if (refreshAttempts >= 60) window.clearInterval(refreshFromCloudState);
  }, 200);
})();
