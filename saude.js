// ============================================================
// ABA SAÚDE — ficha, consultas, atendimentos, vacinas, relatório
// ============================================================

const TIPOS_ATENDIMENTO = ['Consulta', 'Pronto-socorro', 'Exame', 'Retorno', 'Teleconsulta', 'Internação'];
const ICONE_ATENDIMENTO = { Consulta: '🩺', 'Pronto-socorro': '🚑', Exame: '🧪', Retorno: '🔁', Teleconsulta: '💻', Internação: '🏥' };
const ESPECIALIDADES = ['Pediatra', 'Clínico geral', 'Gastroenterologista', 'Otorrinolaringologista', 'Dermatologista', 'Alergista',
  'Pneumologista', 'Cardiologista', 'Neurologista', 'Ortopedista', 'Oftalmologista', 'Endocrinologista', 'Urologista',
  'Ginecologista', 'Infectologista', 'Psiquiatra', 'Psicólogo', 'Nutricionista', 'Fisioterapeuta', 'Fonoaudiólogo', 'Dentista'];
const TIPOS_SANGUE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const linkMaps = (txt) => `https://maps.apple.com/?q=${encodeURIComponent(txt)}`;
const quandoTexto = (d) => {
  const k = chaveDia(d);
  const hoje = chaveDia(new Date()), amanha = chaveDia(new Date(Date.now() + 24 * HORA));
  const dia = k === hoje ? 'Hoje' : k === amanha ? 'Amanhã' : new Date(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${dia} às ${hora(d)}`;
};
const dataBR = (d) => new Date(d).toLocaleDateString('pt-BR');
const opcoesEspecialidade = `<datalist id="lista-especialidades">${ESPECIALIDADES.map((e) => `<option value="${esc(e)}">`).join('')}</datalist>`;

let cacheSaude = {};
S.limiteAtendimentos = 10;

async function htmlSaude() {
  const p = pessoaAtual();
  const [consultas, atendimentos, vacinas, links, anexosQtd] = await Promise.all([
    q(sb.from('consultas').select('*').eq('pessoa_id', p.id).eq('status', 'agendada').order('data_hora')),
    q(sb.from('atendimentos').select('*').eq('pessoa_id', p.id).order('data_hora', { ascending: false }).limit(S.limiteAtendimentos + 1)),
    q(sb.from('vacinas').select('id').eq('pessoa_id', p.id)),
    q(sb.from('compartilhamentos').select('*').eq('pessoa_id', p.id).eq('revogado', false).gt('expira_em', new Date().toISOString()).order('criado_em', { ascending: false })),
    q(sb.from('anexos').select('atendimento_id').eq('pessoa_id', p.id)),
  ]);
  const qtdAnexos = {};
  for (const a of anexosQtd) qtdAnexos[a.atendimento_id] = (qtdAnexos[a.atendimento_id] || 0) + 1;
  cacheSaude = { consultas, atendimentos, links };
  const passadas = consultas.filter((c) => new Date(c.data_hora) < Date.now() - 30 * 60e3);
  const futuras = consultas.filter((c) => !passadas.includes(c));

  let html = '';
  for (const c of p.condicoes_especiais || []) {
    if (RESTRICOES[c]) html += `<div class="alerta-alergia item-clicavel" data-restricao="${c}" style="background:var(--laranja-suave);color:var(--laranja)"><b>🧬 ${esc(RESTRICOES[c].nome)}</b>O app avisa ao registrar remédios restritos. Toque para ver a lista.</div>`;
  }
  if (p.alergias) html += `<div class="alerta-alergia"><b>⚠️ Alergias</b>${esc(p.alergias)}</div>`;

  const resumo = [
    ...(p.condicoes_especiais || []).map((c) => RESTRICOES[c]?.curto).filter(Boolean),
    p.nascimento && rlIdade(p.nascimento),
    p.tipo_sanguineo && `Sangue ${p.tipo_sanguineo}`,
    p.peso_kg && `${fmtNum(p.peso_kg)} kg`,
    p.plano_saude,
  ].filter(Boolean).join(' · ');
  html += `<div class="cartao item-clicavel" id="s-ficha" style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <div><div class="dose-nome">📇 Ficha de ${esc(p.nome)}</div><div class="dose-info">${esc(resumo || 'Toque para preencher: idade, alergias, tipo sanguíneo, plano…')}</div></div>
      <span class="sub">›</span></div>
    <div class="botoes" style="margin-bottom:4px">
      <button class="btn primario" id="s-agendar">📅 Agendar consulta</button>
      <button class="btn" id="s-atend">🩺 Registrar atendimento</button>
    </div>`;

  if (passadas.length) {
    html += `<div class="secao-titulo">Como foi?</div>`;
    html += passadas.map((c) => `<div class="cartao dose">
      <div><div class="dose-nome">${esc([c.especialidade, c.medico].filter(Boolean).join(' · ') || 'Consulta')}</div>
      <div class="dose-info">${dataBR(c.data_hora)} às ${hora(c.data_hora)}${c.local ? ' · ' + esc(c.local) : ''}</div></div>
      <div class="botoes">
        <button class="btn verde" data-como-foi="${c.id}">Registrar como foi</button>
        <button class="btn neutro" data-nao-foi="${c.id}" style="flex:.6">Não aconteceu</button>
      </div></div>`).join('');
  }

  html += `<div class="secao-titulo">Próximas consultas</div>`;
  html += futuras.length
    ? `<div class="lista">${futuras.map((c) => `<div class="item item-clicavel" data-consulta="${c.id}">
        <div><div>${esc([c.especialidade, c.medico].filter(Boolean).join(' · ') || 'Consulta')}</div>
        <div class="sub">${quandoTexto(c.data_hora)}${c.local ? ' · ' + esc(c.local) : ''}</div></div>
        <span class="etiqueta futura">${emQuanto(c.data_hora).replace('em ', '')}</span></div>`).join('')}</div>`
    : `<div class="vazio" style="padding:8px">Nenhuma consulta agendada.</div>`;

  html += `<div class="secao-titulo">Atendimentos</div>`;
  const lista = atendimentos.slice(0, S.limiteAtendimentos);
  html += lista.length
    ? `<div class="lista">${lista.map((a) => `<div class="item item-clicavel" data-atendimento="${a.id}">
        <div style="min-width:0"><div>${ICONE_ATENDIMENTO[a.tipo] || '🩺'} ${esc(a.tipo)}${a.especialidade ? ' · ' + esc(a.especialidade) : ''}</div>
        <div class="sub">${dataBR(a.data_hora)}${a.medico ? ' · ' + esc(a.medico) : ''}${qtdAnexos[a.id] ? ` · 📎 ${qtdAnexos[a.id]}` : ''}</div>
        ${a.diagnostico ? `<div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.diagnostico)}</div>` : ''}</div>
        <span class="sub">›</span></div>`).join('')}</div>`
    : `<div class="vazio" style="padding:8px">Nenhum atendimento registrado.</div>`;
  if (atendimentos.length > S.limiteAtendimentos) html += `<button class="btn neutro bloco" id="s-mais-at">Ver mais</button>`;

  html += `<div class="secao-titulo">Vacinas</div>
    <div class="lista"><div class="item item-clicavel" id="s-vacinas"><div>💉 Carteira de vacinação</div><span class="sub">${vacinas.length} registro(s) ›</span></div></div>`;

  html += `<div class="secao-titulo">Para o médico</div>
    <div class="cartao">
      <div class="dose-info" style="margin-bottom:10px">Junta ficha, alergias, atendimentos, exames, remédios e o diário de sintomas do período que você escolher.</div>
      <div class="botoes">
        <button class="btn primario" id="s-pdf">📄 Gerar PDF</button>
        <button class="btn" id="s-link">🔗 Criar link</button>
      </div>
    </div>`;
  if (links.length) {
    html += `<div class="lista">${links.map((l) => `<div class="item">
      <div><div>🔗 Link ${l.de || l.ate ? `(${l.de ? rlDataSimples(l.de) : 'início'} a ${l.ate ? rlDataSimples(l.ate) : 'hoje'})` : '(todo o histórico)'}</div>
      <div class="sub">vale até ${dataBR(l.expira_em)} · aberto ${l.acessos}x</div></div>
      <div style="display:flex;gap:6px"><button class="btn pequeno" data-link-enviar="${l.id}">Enviar</button><button class="btn pequeno perigo" data-link-cancelar="${l.id}">✕</button></div>
    </div>`).join('')}</div>`;
  }
  return html;
}

function ligarSaude() {
  const p = pessoaAtual();
  $('#s-ficha').onclick = () => modalFicha(p);
  $$('[data-restricao]').forEach((el) => el.onclick = () => modalRestricoes(el.dataset.restricao));
  $('#s-agendar').onclick = () => modalConsulta(null);
  $('#s-atend').onclick = () => modalAtendimento(null);
  $('#s-vacinas').onclick = () => modalVacinas();
  $('#s-pdf').onclick = () => modalRelatorio('pdf');
  $('#s-link').onclick = () => modalRelatorio('link');
  $('#s-mais-at')?.addEventListener('click', () => { S.limiteAtendimentos += 20; render(); });
  $$('[data-consulta]').forEach((el) => el.onclick = () => abrirConsulta(el.dataset.consulta));
  $$('[data-atendimento]').forEach((el) => el.onclick = () => abrirAtendimento(el.dataset.atendimento));
  $$('[data-como-foi]').forEach((b) => b.onclick = () => modalAtendimento(null, cacheSaude.consultas.find((c) => c.id === b.dataset.comoFoi)));
  $$('[data-nao-foi]').forEach((b) => b.onclick = async () => {
    try { await q(sb.from('consultas').update({ status: 'cancelada' }).eq('id', b.dataset.naoFoi)); render(); } catch (e) { erro(e); }
  });
  $$('[data-link-enviar]').forEach((b) => b.onclick = () => enviarLink(cacheSaude.links.find((l) => l.id === b.dataset.linkEnviar)));
  $$('[data-link-cancelar]').forEach((b) => b.onclick = async () => {
    if (!(await confirmar('Cancelar link?', 'Quem tiver o link não vai conseguir mais abrir o histórico.', 'Cancelar link', true))) return;
    try { await q(sb.from('compartilhamentos').update({ revogado: true }).eq('id', b.dataset.linkCancelar)); render(); } catch (e) { erro(e); }
  });
}

// ---------- Ficha ----------
function modalFicha(p) {
  const campo = (id, rot, val, tipo = 'text', extra = '') =>
    `<label class="campo"><span>${rot}</span><input type="${tipo}" id="${id}" value="${esc(val ?? '')}" ${extra}></label>`;
  const area = (id, rot, val, ph = '') =>
    `<label class="campo"><span>${rot}</span><textarea id="${id}" placeholder="${esc(ph)}" style="min-height:64px">${esc(val ?? '')}</textarea></label>`;
  abrirModal(`
    <h2>📇 Ficha de ${esc(p.nome)}</h2>
    <div class="linha-campos">
      ${campo('f-nasc', 'Nascimento', p.nascimento, 'date')}
      <label class="campo"><span>Tipo sanguíneo</span><select id="f-sangue"><option value="">—</option>${TIPOS_SANGUE.map((t) => `<option ${t === p.tipo_sanguineo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="linha-campos">
      ${campo('f-peso', 'Peso (kg)', p.peso_kg, 'number', 'step="0.1" inputmode="decimal"')}
      ${campo('f-alt', 'Altura (cm)', p.altura_cm, 'number', 'step="0.5" inputmode="decimal"')}
    </div>
    <div class="secao-titulo" style="margin-top:0">Condições que restringem remédios</div>
    ${Object.entries(RESTRICOES).map(([k, d]) => `<label class="check"><input type="checkbox" class="f-cond-esp" value="${k}" ${(p.condicoes_especiais || []).includes(k) ? 'checked' : ''}> <span>${esc(d.nome)} <a href="#" data-ver-rest="${k}">ver lista</a></span></label>`).join('')}
    ${area('f-alergias', '⚠️ Alergias', p.alergias, 'ex.: dipirona, amendoim, picada de abelha')}
    ${area('f-cond', 'Condições de saúde / doenças', p.condicoes, 'ex.: asma, refluxo, cirurgias anteriores')}
    ${area('f-cont', 'Remédios de uso contínuo', p.uso_continuo)}
    <div class="linha-campos">
      ${campo('f-plano', 'Plano de saúde', p.plano_saude)}
      ${campo('f-cart', 'Nº da carteirinha', p.plano_carteirinha, 'text', 'inputmode="numeric"')}
    </div>
    ${area('f-med', 'Médicos de confiança (nome, especialidade, telefone)', p.medicos_confianca)}
    ${area('f-obs', 'Outras observações', p.observacoes_saude)}
    <button class="btn primario bloco" id="f-ok">Salvar</button>`, (f) => {
    $$('[data-ver-rest]', f).forEach((a) => a.onclick = (e) => { e.preventDefault(); modalRestricoes(a.dataset.verRest); });
    $('#f-ok', f).onclick = async () => {
      const v = (id) => $(id, f).value.trim() || null;
      const n = (id) => { const x = parseFloat(String($(id, f).value).replace(',', '.')); return isNaN(x) ? null : x; };
      try {
        await q(sb.from('pessoas').update({
          nascimento: v('#f-nasc'), tipo_sanguineo: v('#f-sangue'), peso_kg: n('#f-peso'), altura_cm: n('#f-alt'),
          alergias: v('#f-alergias'), condicoes: v('#f-cond'), uso_continuo: v('#f-cont'),
          condicoes_especiais: $$('.f-cond-esp', f).filter((x) => x.checked).map((x) => x.value),
          plano_saude: v('#f-plano'), plano_carteirinha: v('#f-cart'), medicos_confianca: v('#f-med'), observacoes_saude: v('#f-obs'),
        }).eq('id', p.id));
        await recarregarCadastros();
        fecharModal(); toast('✓ Ficha salva'); render();
      } catch (e) { erro(e); }
    };
  });
}

// ---------- Consultas agendadas ----------
function modalConsulta(c, base = {}) {
  const p = pessoaAtual();
  const d = c || base;
  const padrao = new Date(Date.now() + 24 * HORA); padrao.setMinutes(0, 0, 0);
  abrirModal(`
    <h2>${c ? 'Editar consulta' : '📅 Agendar consulta'} — ${esc(nomePessoa(c?.pessoa_id || p.id))}</h2>
    <label class="campo"><span>Data e hora</span><input type="datetime-local" id="c-quando" value="${paraInput(d.data_hora || padrao)}"></label>
    <label class="campo"><span>Especialidade</span><input type="text" id="c-esp" list="lista-especialidades" value="${esc(d.especialidade || '')}" placeholder="ex.: Pediatra"></label>
    <label class="campo"><span>Médico</span><input type="text" id="c-med" value="${esc(d.medico || '')}" placeholder="ex.: Dra. Ana Souza"></label>
    <label class="campo"><span>Local</span><input type="text" id="c-local" value="${esc(d.local || '')}" placeholder="ex.: Clínica Bem Estar"></label>
    <label class="campo"><span>Endereço (para abrir no mapa)</span><input type="text" id="c-end" value="${esc(d.endereco || '')}"></label>
    <label class="campo"><span>Observação</span><input type="text" id="c-obs" value="${esc(d.observacao || '')}" placeholder="ex.: levar exames de sangue"></label>
    <p class="dica">Lembrete no dia anterior e 2 horas antes.</p>
    <button class="btn primario bloco" id="c-ok">Salvar</button>${opcoesEspecialidade}`, (f) => {
    $('#c-ok', f).onclick = async () => {
      const v = (id) => $(id, f).value.trim() || null;
      const dados = {
        data_hora: deInput($('#c-quando', f).value), especialidade: v('#c-esp'), medico: v('#c-med'),
        local: v('#c-local'), endereco: v('#c-end'), observacao: v('#c-obs'),
      };
      try {
        if (c) {
          if (new Date(dados.data_hora).getTime() !== new Date(c.data_hora).getTime()) Object.assign(dados, { lembrete_1d_em: null, lembrete_2h_em: null, status: 'agendada' });
          await q(sb.from('consultas').update(dados).eq('id', c.id));
        } else {
          await q(sb.from('consultas').insert({ ...dados, familia_id: S.familia.id, pessoa_id: p.id, origem_atendimento_id: base.origem_atendimento_id || null }));
        }
        fecharModal(); toast('✓ Consulta salva'); render();
      } catch (e) { erro(e); }
    };
  });
}

async function abrirConsulta(id) {
  try {
    const c = await q(sb.from('consultas').select('*').eq('id', id).maybeSingle());
    if (!c) return toast('Consulta não encontrada.');
    const ondeMapa = c.endereco || c.local;
    abrirModal(`
      <h2>📅 ${esc([c.especialidade, c.medico].filter(Boolean).join(' · ') || 'Consulta')}</h2>
      <div class="cartao">
        <div class="dose-nome">${quandoTexto(c.data_hora)}</div>
        <div class="dose-info">${esc(nomePessoa(c.pessoa_id))}${c.status !== 'agendada' ? ' · ' + esc(c.status) : ''}</div>
        ${c.local ? `<div style="margin-top:8px">📍 ${esc(c.local)}${c.endereco ? `<div class="dose-info">${esc(c.endereco)}</div>` : ''}</div>` : ''}
        ${c.observacao ? `<div style="margin-top:8px">📝 ${esc(c.observacao)}</div>` : ''}
      </div>
      ${ondeMapa ? `<a class="btn neutro bloco" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px" href="${linkMaps(ondeMapa)}" target="_blank" rel="noopener">🗺️ Abrir no mapa</a>` : ''}
      <button class="btn verde bloco" id="cd-foi" style="margin-bottom:8px">Registrar como foi</button>
      <div class="botoes">
        <button class="btn" id="cd-editar">Editar</button>
        <button class="btn perigo" id="cd-cancelar">Desmarcar</button>
      </div>`, (f) => {
      $('#cd-foi', f).onclick = () => modalAtendimento(null, c);
      $('#cd-editar', f).onclick = () => modalConsulta(c);
      $('#cd-cancelar', f).onclick = async () => {
        if (!(await confirmar('Desmarcar consulta?', 'Os lembretes dessa consulta param.', 'Desmarcar', true))) return;
        try { await q(sb.from('consultas').update({ status: 'cancelada' }).eq('id', c.id)); render(); } catch (e) { erro(e); }
      };
    });
  } catch (e) { erro(e); }
}

// ---------- Atendimentos ----------
async function resumoRecente(pessoaId, dias = 3) {
  const desde = new Date(Date.now() - dias * 24 * HORA).toISOString();
  const [evs, ds] = await Promise.all([
    q(sb.from('eventos').select('tipo, valor, ocorrido_em').eq('pessoa_id', pessoaId).gte('ocorrido_em', desde).order('ocorrido_em')),
    q(sb.from('doses').select('remedio, tomado_em').eq('pessoa_id', pessoaId).eq('status', 'tomada').gte('tomado_em', desde).order('tomado_em')),
  ]);
  const linhas = [];
  const porTipo = {};
  for (const e of evs) (porTipo[e.tipo] ??= []).push(e);
  for (const [t, l] of Object.entries(porTipo)) {
    let s = `${t}: ${l.length}x (de ${diaMes(l[0].ocorrido_em)} ${hora(l[0].ocorrido_em)} a ${diaMes(l.at(-1).ocorrido_em)} ${hora(l.at(-1).ocorrido_em)})`;
    const vals = l.map((e) => parseFloat(String(e.valor || '').replace(',', '.'))).filter((x) => !isNaN(x));
    if (t === 'Febre' && vals.length) s += `, máx. ${fmtNum(Math.max(...vals))} °C`;
    linhas.push(s);
  }
  const porRem = {};
  for (const d of ds) (porRem[d.remedio] ??= []).push(d);
  if (Object.keys(porRem).length) linhas.push('Remédios dados: ' + Object.entries(porRem).map(([r, l]) => `${r} ${l.length}x`).join(', '));
  return linhas.length ? `Últimos ${dias} dias — ` + linhas.join('; ') + '.' : '';
}

function modalAtendimento(a, consulta = null) {
  const p = pessoaAtual();
  const pessoaId = a?.pessoa_id || consulta?.pessoa_id || p.id;
  const d = a || {
    tipo: 'Consulta', data_hora: consulta?.data_hora || new Date().toISOString(),
    medico: consulta?.medico, especialidade: consulta?.especialidade, local: consulta?.local,
  };
  const area = (id, rot, val, ph = '') => `<label class="campo"><span>${rot}</span><textarea id="${id}" placeholder="${esc(ph)}" style="min-height:64px">${esc(val ?? '')}</textarea></label>`;
  let arquivos = [];
  abrirModal(`
    <h2>${a ? 'Editar atendimento' : '🩺 Registrar atendimento'} — ${esc(nomePessoa(pessoaId))}</h2>
    <label class="campo"><span>Tipo</span><select id="at-tipo">${TIPOS_ATENDIMENTO.map((t) => `<option ${t === d.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo"><span>Data e hora</span><input type="datetime-local" id="at-quando" value="${paraInput(d.data_hora)}"></label>
    <label class="campo"><span>Local</span><input type="text" id="at-local" value="${esc(d.local || '')}" placeholder="ex.: Hospital São Lucas"></label>
    <div class="linha-campos">
      <label class="campo"><span>Médico</span><input type="text" id="at-med" value="${esc(d.medico || '')}"></label>
      <label class="campo"><span>Especialidade</span><input type="text" id="at-esp" list="lista-especialidades" value="${esc(d.especialidade || '')}"></label>
    </div>
    ${area('at-motivo', 'Motivo / sintomas', d.motivo, 'O que levou ao atendimento')}
    <button class="btn pequeno" id="at-puxar" style="margin:-4px 0 12px">↧ Puxar sintomas e remédios dos últimos 3 dias</button>
    <div class="secao-titulo" style="margin-top:4px">Sinais medidos</div>
    <div class="linha-campos">
      <label class="campo"><span>Temp. (°C)</span><input type="text" id="at-temp" value="${esc(d.temperatura || '')}" inputmode="decimal"></label>
      <label class="campo"><span>Peso (kg)</span><input type="text" id="at-peso" value="${esc(d.peso || '')}" inputmode="decimal"></label>
    </div>
    <div class="linha-campos">
      <label class="campo"><span>Pressão</span><input type="text" id="at-pa" value="${esc(d.pressao || '')}" placeholder="12x8"></label>
      <label class="campo"><span>Saturação (%)</span><input type="text" id="at-sat" value="${esc(d.saturacao || '')}" inputmode="numeric"></label>
    </div>
    ${area('at-diag', 'Diagnóstico do médico', d.diagnostico)}
    ${area('at-orient', 'Orientações / conduta', d.orientacoes, 'ex.: hidratação, dieta leve, voltar se febre por mais de 48h')}
    ${area('at-receita', 'Receita (remédios prescritos)', d.receita, 'ex.: Ondansetrona 4 mg de 8/8h se vômito')}
    ${area('at-exped', 'Exames pedidos', d.exames_pedidos)}
    ${area('at-exres', 'Resultados de exames', d.exames_resultados)}
    ${area('at-obs', 'Outras observações', d.observacoes)}
    <div class="secao-titulo" style="margin-top:4px">Anexos (receita, exames, laudos)</div>
    <label class="btn bloco" style="display:block;text-align:center;margin-bottom:8px">📎 Adicionar fotos ou PDF
      <input type="file" id="at-arq" accept="image/*,application/pdf" multiple hidden></label>
    <div id="at-lista-arq" class="dica" style="margin:0 2px 12px"></div>
    ${a ? '' : `<label class="check"><input type="checkbox" id="at-ret-ok"> <span>Médico pediu retorno</span></label>
    <label class="campo" id="at-ret-campo" hidden><span>Data e hora do retorno</span><input type="datetime-local" id="at-ret"></label>`}
    <button class="btn primario bloco" id="at-ok">Salvar</button>${opcoesEspecialidade}`, (f) => {
    const mostrarArquivos = () => {
      $('#at-lista-arq', f).innerHTML = arquivos.map((x, i) => `<div>📄 ${esc(x.name)} <a href="#" data-rm="${i}">remover</a></div>`).join('');
      $$('[data-rm]', f).forEach((el) => el.onclick = (e) => { e.preventDefault(); arquivos.splice(+el.dataset.rm, 1); mostrarArquivos(); });
    };
    $('#at-arq', f).onchange = (e) => { arquivos.push(...e.target.files); e.target.value = ''; mostrarArquivos(); };
    $('#at-ret-ok', f)?.addEventListener('change', (e) => {
      $('#at-ret-campo', f).hidden = !e.target.checked;
      if (e.target.checked && !$('#at-ret', f).value) {
        const r = new Date(new Date($('#at-quando', f).value).getTime() + 7 * 24 * HORA);
        $('#at-ret', f).value = paraInput(r);
      }
    });
    $('#at-puxar', f).onclick = async () => {
      const txt = await resumoRecente(pessoaId);
      if (!txt) return toast('Nada registrado nos últimos 3 dias.');
      const m = $('#at-motivo', f);
      m.value = (m.value ? m.value + '\n' : '') + txt;
    };
    $('#at-ok', f).onclick = async () => {
      const v = (id) => $(id, f).value.trim() || null;
      const dados = {
        tipo: $('#at-tipo', f).value, data_hora: deInput($('#at-quando', f).value), local: v('#at-local'),
        medico: v('#at-med'), especialidade: v('#at-esp'), motivo: v('#at-motivo'),
        temperatura: v('#at-temp'), peso: v('#at-peso'), pressao: v('#at-pa'), saturacao: v('#at-sat'),
        diagnostico: v('#at-diag'), orientacoes: v('#at-orient'), receita: v('#at-receita'),
        exames_pedidos: v('#at-exped'), exames_resultados: v('#at-exres'), observacoes: v('#at-obs'),
      };
      const retorno = $('#at-ret-ok', f)?.checked && $('#at-ret', f).value ? deInput($('#at-ret', f).value) : null;
      const btn = $('#at-ok', f);
      btn.disabled = true; btn.textContent = arquivos.length ? 'Enviando anexos…' : 'Salvando…';
      try {
        let reg;
        if (a) reg = await q(sb.from('atendimentos').update(dados).eq('id', a.id).select().single());
        else reg = await q(sb.from('atendimentos').insert({ ...dados, familia_id: S.familia.id, pessoa_id: pessoaId }).select().single());
        for (const arq of arquivos) await enviarAnexo(arq, reg);
        if (consulta) await q(sb.from('consultas').update({ status: 'realizada', atendimento_id: reg.id }).eq('id', consulta.id));
        if (retorno) {
          await q(sb.from('consultas').insert({
            familia_id: S.familia.id, pessoa_id: pessoaId, data_hora: retorno, medico: dados.medico,
            especialidade: dados.especialidade, local: dados.local, observacao: 'Retorno', origem_atendimento_id: reg.id,
          }));
        }
        fecharModal();
        toast('✓ Atendimento salvo');
        if (S.aba !== 'saude') S.aba = 'saude';
        render();
        abrirAtendimento(reg.id);
      } catch (e) { btn.disabled = false; btn.textContent = 'Salvar'; erro(e); }
    };
  });
}

// Reduz fotos grandes antes de enviar
async function prepararArquivo(arq) {
  if (!arq.type.startsWith('image/') || arq.size < 1.2e6) return arq;
  try {
    const bmp = await createImageBitmap(arq);
    const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) return arq;
    return new File([blob], arq.name.replace(/\.(heic|heif|png|jpe?g|webp)$/i, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return arq; }
}

async function enviarAnexo(arqOriginal, atendimento) {
  const arq = await prepararArquivo(arqOriginal);
  const ext = (arq.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const caminho = `${atendimento.familia_id}/${atendimento.pessoa_id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('anexos').upload(caminho, arq, { contentType: arq.type || undefined });
  if (error) throw error;
  await q(sb.from('anexos').insert({
    familia_id: atendimento.familia_id, pessoa_id: atendimento.pessoa_id, atendimento_id: atendimento.id,
    caminho, nome: arqOriginal.name, tipo_mime: arq.type || null, tamanho: arq.size,
  }));
}

async function abrirAtendimento(id) {
  try {
    const [a, anexos] = await Promise.all([
      q(sb.from('atendimentos').select('*').eq('id', id).maybeSingle()),
      q(sb.from('anexos').select('*').eq('atendimento_id', id).order('criado_em')),
    ]);
    if (!a) return toast('Atendimento não encontrado.');
    let urls = {};
    if (anexos.length) {
      const { data } = await sb.storage.from('anexos').createSignedUrls(anexos.map((x) => x.caminho), 3600);
      urls = Object.fromEntries((data || []).map((x) => [x.path, x.signedUrl]));
    }
    const campo = (rot, val) => val ? `<div class="campo-ver"><span>${rot}</span><div>${esc(val).replace(/\n/g, '<br>')}</div></div>` : '';
    const sinais = [a.temperatura && `🌡️ ${a.temperatura} °C`, a.peso && `⚖️ ${a.peso} kg`, a.pressao && `🩸 ${a.pressao}`, a.saturacao && `🫁 ${a.saturacao}%`].filter(Boolean).join('  ·  ');
    abrirModal(`
      <h2>${ICONE_ATENDIMENTO[a.tipo] || '🩺'} ${esc(a.tipo)} — ${esc(nomePessoa(a.pessoa_id))}</h2>
      <div class="cartao">
        <div class="dose-nome">${dataBR(a.data_hora)} às ${hora(a.data_hora)}</div>
        <div class="dose-info">${esc([a.especialidade, a.medico, a.local].filter(Boolean).join(' · '))}</div>
        ${sinais ? `<div style="margin-top:8px">${esc(sinais)}</div>` : ''}
      </div>
      <div class="cartao">
        ${campo('Motivo / sintomas', a.motivo)}${campo('Diagnóstico', a.diagnostico)}${campo('Orientações', a.orientacoes)}
        ${campo('Receita', a.receita)}${campo('Exames pedidos', a.exames_pedidos)}${campo('Resultados de exames', a.exames_resultados)}
        ${campo('Observações', a.observacoes)}
        ${[a.motivo, a.diagnostico, a.orientacoes, a.receita, a.exames_pedidos, a.exames_resultados, a.observacoes].some(Boolean) ? '' : '<div class="dica" style="margin:0">Sem anotações.</div>'}
      </div>
      ${anexos.length ? `<div class="secao-titulo">Anexos</div><div class="galeria">${anexos.map((x) => `
        <div class="anexo">
          <a href="${esc(urls[x.caminho] || '#')}" target="_blank" rel="noopener">${String(x.tipo_mime).startsWith('image/') && urls[x.caminho] ? `<img src="${esc(urls[x.caminho])}" alt="">` : '<div class="anexo-pdf">📄</div>'}</a>
          <div class="anexo-nome">${esc(x.nome)}</div>
          <button class="link" style="padding:2px;font-size:13px;color:var(--vermelho)" data-del-anexo="${x.id}">excluir</button>
        </div>`).join('')}</div>` : ''}
      <label class="btn bloco" style="display:block;text-align:center;margin:8px 0">📎 Adicionar anexo<input type="file" id="ad-arq" accept="image/*,application/pdf" multiple hidden></label>
      <button class="btn bloco" id="ad-receita" style="margin-bottom:8px">💊 Cadastrar remédio da receita</button>
      <button class="btn bloco" id="ad-retorno" style="margin-bottom:8px">📅 Agendar retorno</button>
      <div class="botoes">
        <button class="btn neutro" id="ad-editar">Editar</button>
        <button class="btn perigo" id="ad-excluir">Excluir</button>
      </div>`, (f) => {
      $('#ad-arq', f).onchange = async (e) => {
        const lista = [...e.target.files];
        toast(`Enviando ${lista.length} arquivo(s)…`);
        try { for (const arq of lista) await enviarAnexo(arq, a); abrirAtendimento(a.id); render(); } catch (err) { erro(err); }
      };
      $$('[data-del-anexo]', f).forEach((b) => b.onclick = async () => {
        const x = anexos.find((y) => y.id === b.dataset.delAnexo);
        if (!(await confirmar('Excluir anexo?', esc(x.nome), 'Excluir', true))) return abrirAtendimento(a.id);
        try {
          await sb.storage.from('anexos').remove([x.caminho]);
          await q(sb.from('anexos').delete().eq('id', x.id));
          abrirAtendimento(a.id);
        } catch (e) { erro(e); }
      });
      $('#ad-receita', f).onclick = () => {
        if (a.pessoa_id !== S.pessoaId) { S.pessoaId = a.pessoa_id; localStorage.setItem('pessoaId', a.pessoa_id); }
        modalTratamento();
      };
      $('#ad-retorno', f).onclick = () => modalConsulta(null, { medico: a.medico, especialidade: a.especialidade, local: a.local, observacao: 'Retorno', origem_atendimento_id: a.id });
      $('#ad-editar', f).onclick = () => modalAtendimento(a);
      $('#ad-excluir', f).onclick = async () => {
        if (!(await confirmar('Excluir atendimento?', 'O registro e os anexos serão apagados.', 'Excluir', true))) return;
        try {
          if (anexos.length) await sb.storage.from('anexos').remove(anexos.map((x) => x.caminho));
          await q(sb.from('atendimentos').delete().eq('id', a.id));
          render();
        } catch (e) { erro(e); }
      };
    });
  } catch (e) { erro(e); }
}

// ---------- Vacinas ----------
async function modalVacinas() {
  const p = pessoaAtual();
  const vacinas = await q(sb.from('vacinas').select('*').eq('pessoa_id', p.id).order('data', { ascending: false, nullsFirst: false }));
  abrirModal(`
    <h2>💉 Vacinas — ${esc(p.nome)}</h2>
    <div class="lista">${vacinas.length ? vacinas.map((v) => `<div class="item">
      <div><div>${esc(v.vacina)}${v.dose ? ' · ' + esc(v.dose) : ''}</div><div class="sub">${v.data ? rlDataSimples(v.data) : 'sem data'}${v.local ? ' · ' + esc(v.local) : ''}${v.lote ? ' · lote ' + esc(v.lote) : ''}</div></div>
      <button class="btn pequeno perigo" data-del-vac="${v.id}">✕</button></div>`).join('') : '<div class="item"><div class="sub">Nenhuma vacina registrada.</div></div>'}</div>
    <div class="secao-titulo">Adicionar</div>
    <label class="campo"><span>Vacina</span><input type="text" id="v-nome" placeholder="ex.: Influenza, Pentavalente, Tríplice viral"></label>
    <div class="linha-campos">
      <label class="campo"><span>Dose</span><input type="text" id="v-dose" placeholder="ex.: 1ª, reforço"></label>
      <label class="campo"><span>Data</span><input type="date" id="v-data"></label>
    </div>
    <div class="linha-campos">
      <label class="campo"><span>Local</span><input type="text" id="v-local"></label>
      <label class="campo"><span>Lote</span><input type="text" id="v-lote"></label>
    </div>
    <button class="btn primario bloco" id="v-ok">Adicionar vacina</button>`, (f) => {
    $('#v-ok', f).onclick = async () => {
      const v = (id) => $(id, f).value.trim() || null;
      if (!v('#v-nome')) return toast('Informe a vacina.');
      try {
        await q(sb.from('vacinas').insert({ familia_id: S.familia.id, pessoa_id: p.id, vacina: v('#v-nome'), dose: v('#v-dose'), data: v('#v-data'), local: v('#v-local'), lote: v('#v-lote') }));
        modalVacinas(); render();
      } catch (e) { erro(e); }
    };
    $$('[data-del-vac]', f).forEach((b) => b.onclick = async () => {
      try { await q(sb.from('vacinas').delete().eq('id', b.dataset.delVac)); modalVacinas(); render(); } catch (e) { erro(e); }
    });
  });
}

// ---------- Relatório (PDF e link) ----------
function periodoEscolhido(f) {
  const opc = $('#r-periodo', f).value;
  if (opc === 'tudo') return { de: null, ate: null };
  if (opc === 'pers') return { de: $('#r-de', f).value || null, ate: $('#r-ate', f).value || null };
  const de = new Date(); de.setDate(de.getDate() - (+opc - 1));
  return { de: chaveDia(de), ate: chaveDia(new Date()) };
}

function modalRelatorio(modo) {
  const p = pessoaAtual();
  abrirModal(`
    <h2>${modo === 'pdf' ? '📄 PDF para o médico' : '🔗 Link para o médico'} — ${esc(p.nome)}</h2>
    <label class="campo"><span>Período</span><select id="r-periodo">
      <option value="7">Últimos 7 dias</option><option value="30" selected>Últimos 30 dias</option>
      <option value="90">Últimos 3 meses</option><option value="365">Último ano</option>
      <option value="tudo">Todo o histórico</option><option value="pers">Escolher datas</option></select></label>
    <div class="linha-campos" id="r-pers" hidden>
      <label class="campo"><span>De</span><input type="date" id="r-de"></label>
      <label class="campo"><span>Até</span><input type="date" id="r-ate" value="${chaveDia(new Date())}"></label>
    </div>
    ${modo === 'link' ? `<label class="campo"><span>Link vale por</span><select id="r-validade"><option value="1">1 dia</option><option value="7" selected>7 dias</option><option value="30">30 dias</option></select></label>
      <p class="dica">Quem tiver o link vê o histórico sem precisar de login, até a data de validade. Você pode cancelar quando quiser.</p>` : '<p class="dica">Fotos anexadas entram no fim do PDF.</p>'}
    <button class="btn primario bloco" id="r-ok">${modo === 'pdf' ? 'Gerar PDF' : 'Criar e enviar link'}</button>`, (f) => {
    $('#r-periodo', f).onchange = (e) => ($('#r-pers', f).hidden = e.target.value !== 'pers');
    $('#r-ok', f).onclick = async () => {
      const periodo = periodoEscolhido(f);
      const btn = $('#r-ok', f);
      btn.disabled = true; btn.textContent = 'Preparando…';
      try {
        if (modo === 'pdf') {
          const dados = await dadosRelatorio(p.id, periodo);
          const blob = await gerarRelatorioPDF(dados);
          fecharModal();
          await compartilharPDF(blob, `Historico-${p.nome.replace(/\s+/g, '-')}-${chaveDia(new Date())}.pdf`);
        } else {
          const dias = +$('#r-validade', f).value;
          const link = await q(sb.from('compartilhamentos').insert({
            familia_id: S.familia.id, pessoa_id: p.id, de: periodo.de, ate: periodo.ate,
            expira_em: new Date(Date.now() + dias * 24 * HORA).toISOString(),
          }).select().single());
          fecharModal();
          render();
          await enviarLink(link);
        }
      } catch (e) { btn.disabled = false; btn.textContent = 'Tentar de novo'; erro(e); }
    };
  });
}

function urlDoLink(l) {
  return new URL(`relatorio.html?t=${l.token}`, location.href.split('?')[0].replace(/[^/]*$/, '')).href;
}

async function enviarLink(l) {
  const url = urlDoLink(l);
  const texto = `Histórico de saúde de ${nomePessoa(l.pessoa_id)} (válido até ${dataBR(l.expira_em)}):`;
  try {
    if (navigator.share) await navigator.share({ title: 'Histórico de saúde', text: texto, url });
    else { await navigator.clipboard.writeText(`${texto} ${url}`); toast('Link copiado.'); }
  } catch (e) {
    if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast('Link copiado.'); } catch { erro(e); } }
  }
}

// Busca os dados do relatório direto do banco (mesmo formato da função do link)
async function dadosRelatorio(pessoaId, periodo) {
  const de = periodo.de ? new Date(periodo.de + 'T00:00:00').toISOString() : '1900-01-01T00:00:00Z';
  const ate = periodo.ate ? new Date(new Date(periodo.ate + 'T00:00:00').getTime() + 24 * HORA).toISOString() : '2999-01-01T00:00:00Z';
  const [pessoa, atendimentos, vacinas, tratamentos, doses, eventos, consultas] = await Promise.all([
    q(sb.from('pessoas').select('*').eq('id', pessoaId).single()),
    q(sb.from('atendimentos').select('*').eq('pessoa_id', pessoaId).gte('data_hora', de).lt('data_hora', ate).order('data_hora', { ascending: false })),
    q(sb.from('vacinas').select('*').eq('pessoa_id', pessoaId).order('data', { ascending: false, nullsFirst: false })),
    q(sb.from('tratamentos').select('*').eq('pessoa_id', pessoaId).lt('inicio', ate).order('inicio', { ascending: false })),
    q(sb.from('doses').select('remedio, dose, tomado_em').eq('pessoa_id', pessoaId).eq('status', 'tomada').gte('tomado_em', de).lt('tomado_em', ate).order('tomado_em')),
    q(sb.from('eventos').select('tipo, valor, ocorrido_em, observacao').eq('pessoa_id', pessoaId).gte('ocorrido_em', de).lt('ocorrido_em', ate).order('ocorrido_em')),
    q(sb.from('consultas').select('*').eq('pessoa_id', pessoaId).eq('status', 'agendada').gte('data_hora', new Date().toISOString()).order('data_hora')),
  ]);
  const ids = atendimentos.map((a) => a.id);
  let anexos = [];
  if (ids.length) anexos = await q(sb.from('anexos').select('*').in('atendimento_id', ids).order('criado_em'));
  if (anexos.length) {
    const { data } = await sb.storage.from('anexos').createSignedUrls(anexos.map((a) => a.caminho), 3600);
    const urls = Object.fromEntries((data || []).map((x) => [x.path, x.signedUrl]));
    anexos = anexos.map((a) => ({ ...a, url: urls[a.caminho] || null }));
  }
  const tratsPeriodo = tratamentos.filter((t) => t.tipo === 'sos' || new Date(t.inicio).getTime() + (+t.dias) * 24 * HORA >= new Date(de).getTime());
  return { pessoa, periodo, atendimentos, vacinas, tratamentos: tratsPeriodo, doses, eventos, consultas, anexos, gerado_em: new Date().toISOString() };
}

// Cartões de consulta na tela Hoje
async function htmlConsultasHoje(p) {
  const consultas = await q(sb.from('consultas').select('*').eq('pessoa_id', p.id).eq('status', 'agendada')
    .lte('data_hora', new Date(Date.now() + 7 * 24 * HORA).toISOString()).order('data_hora'));
  return consultas.map((c) => {
    const passou = new Date(c.data_hora) < Date.now() - 30 * 60e3;
    return `<div class="cartao item-clicavel" data-consulta-hoje="${c.id}" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div><div class="dose-nome">📅 ${esc([c.especialidade, c.medico].filter(Boolean).join(' · ') || 'Consulta')}</div>
      <div class="dose-info">${quandoTexto(c.data_hora)}${c.local ? ' · ' + esc(c.local) : ''}</div></div>
      <span class="etiqueta ${passou ? 'agora' : 'futura'}">${passou ? 'Como foi?' : emQuanto(c.data_hora).replace('em ', '')}</span></div>`;
  }).join('');
}
