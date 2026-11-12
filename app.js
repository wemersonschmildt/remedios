// ============================================================
// Remédios — registro de remédios e acontecimentos com lembretes
// ============================================================

const SUPABASE_URL = 'https://kjqrajrxlnufbwmhavlj.supabase.co';
const SUPABASE_CHAVE = 'sb_publishable_lSc8cqiSkB97YMrZ4bpUAg_OmqdCWIc';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE);

const TIPOS_EVENTO = [
  { tipo: 'Vomitou', icone: '🤮', rapido: true },
  { tipo: 'Febre', icone: '🌡️', campo: { rotulo: 'Temperatura (°C)', tipo: 'number', passo: '0.1', sufixo: '°C' } },
  { tipo: 'Diarreia', icone: '💩', rapido: true },
  { tipo: 'Dor', icone: '😣', campo: { rotulo: 'Onde / intensidade', tipo: 'text' } },
  { tipo: 'Bebeu líquido', icone: '🥤', campo: { rotulo: 'Quantidade (ml)', tipo: 'number', passo: '10', sufixo: ' ml' } },
  { tipo: 'Comeu', icone: '🍽️', campo: { rotulo: 'O que comeu', tipo: 'text' } },
  { tipo: 'Xixi', icone: '💧', rapido: true },
  { tipo: 'Observação', icone: '📝', campo: { rotulo: 'Observação', tipo: 'textarea' } },
];

// Palavras do texto importado que viram acontecimentos (e não remédios)
const APELIDOS_EVENTO = {
  vomitou: 'Vomitou', vomito: 'Vomitou', vomitos: 'Vomitou', vomitando: 'Vomitou',
  febre: 'Febre', diarreia: 'Diarreia', xixi: 'Xixi', urinou: 'Xixi',
  dor: 'Dor', comeu: 'Comeu', bebeu: 'Bebeu líquido', 'bebeu liquido': 'Bebeu líquido',
  observacao: 'Observação', obs: 'Observação',
};

const S = {
  usuario: null,
  familia: null,
  membros: [],
  pessoas: [],
  pessoaId: localStorage.getItem('pessoaId'),
  aba: 'hoje',
  remediosFamilia: [],
  diasHistorico: 7,
  modalAberto: false,
};

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaMes = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const HORA = 3600e3;

function chaveDia(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function rotuloDia(chave) {
  const [a, m, d] = chave.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  const hoje = chaveDia(new Date());
  const ontem = chaveDia(new Date(Date.now() - 24 * HORA));
  const sem = data.toLocaleDateString('pt-BR', { weekday: 'long' });
  const base = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  if (chave === hoje) return `Hoje · ${base}`;
  if (chave === ontem) return `Ontem · ${base}`;
  return `${base} · ${sem}`;
}
function duracao(min) {
  min = Math.abs(Math.round(min));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
  return `${Math.floor(h / 24)} dias`;
}
const haQuanto = (d) => { const min = (Date.now() - new Date(d)) / 60000; return min < 1 ? 'agora' : `há ${duracao(min)}`; };
const emQuanto = (d) => { const min = (new Date(d) - Date.now()) / 60000; return min <= 0 ? 'agora' : `em ${duracao(min)}`; };
function paraInput(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 16);
}
const deInput = (v) => new Date(v).toISOString(); // "AAAA-MM-DDTHH:mm" é interpretado no fuso local

function pessoaAtual() {
  return S.pessoas.find((p) => p.id === S.pessoaId) || S.pessoas[0] || null;
}
function nomePessoa(id) {
  return S.pessoas.find((p) => p.id === id)?.nome || '';
}
function erro(e) {
  console.error(e);
  toast('⚠️ ' + (e?.message || e || 'Erro inesperado'));
}
async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw error;
  return data;
}

// ---------- toast ----------
function toast(texto, acoes = [], ms = 5000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div>${esc(texto)}</div><div></div>`;
  for (const a of acoes) {
    const b = document.createElement('button');
    b.textContent = a.rotulo;
    b.onclick = () => { el.remove(); a.fn(); };
    el.lastChild.appendChild(b);
  }
  $('#toast-raiz').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- modal ----------
function abrirModal(html, aoMontar) {
  fecharModal();
  S.modalAberto = true;
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="fundo-modal"><div class="folha"><div class="alca"></div>${html}</div></div>`;
  const fundo = raiz.firstChild;
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fecharModal(); });
  aoMontar?.(fundo.firstChild);
  return fundo.firstChild;
}
function fecharModal() {
  $('#modal-raiz').innerHTML = '';
  S.modalAberto = false;
}
function confirmar(titulo, corpoHtml, rotuloOk = 'Confirmar', perigo = false) {
  return new Promise((resolve) => {
    abrirModal(`
      <h2>${esc(titulo)}</h2>
      <div style="margin-bottom:16px">${corpoHtml}</div>
      <div class="botoes">
        <button class="btn neutro" data-r="0">Cancelar</button>
        <button class="btn ${perigo ? 'perigo' : 'primario'}" data-r="1">${esc(rotuloOk)}</button>
      </div>`, (f) => {
      $$('[data-r]', f).forEach((b) => b.onclick = () => { fecharModal(); resolve(b.dataset.r === '1'); });
    });
  });
}

// ---------- base de remédios ----------
function catalogo() {
  const lista = BASE_REMEDIOS.map(([nome, principios, classes]) => ({
    nome, principios, classes: classes.map((c) => CLASSES[c]), origem: 'base',
  }));
  for (const r of S.remediosFamilia) {
    lista.push({
      nome: r.nome,
      principios: r.principio_ativo ? r.principio_ativo.split(/[,+]/).map((s) => norm(s)).filter(Boolean) : [],
      classes: r.classe ? [r.classe] : [],
      origem: 'familia',
    });
  }
  return lista;
}
function acharRemedio(nome) {
  const n = norm(nome);
  return catalogo().find((r) => norm(r.nome) === n) || null;
}
function buscarRemedios(termo) {
  const t = norm(termo);
  if (!t) return [];
  const res = [];
  for (const r of catalogo()) {
    const n = norm(r.nome);
    let p = -1;
    if (n.startsWith(t)) p = 0;
    else if (n.split(' ').some((w) => w.startsWith(t))) p = 1;
    else if (r.principios.some((x) => norm(x).startsWith(t))) p = 2;
    else if (n.includes(t)) p = 3;
    if (p >= 0) res.push({ ...r, p });
  }
  return res.sort((a, b) => a.p - b.p || (a.origem === 'familia' ? -1 : 1) || a.nome.localeCompare(b.nome)).slice(0, 8);
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function corrigirNome(nome) {
  if (acharRemedio(nome)) return acharRemedio(nome).nome;
  const n = norm(nome);
  if (n.length < 6) return nome;
  let melhor = null, dist = 3;
  for (const r of catalogo()) {
    const x = levenshtein(n, norm(r.nome));
    if (x < dist) { dist = x; melhor = r.nome; }
  }
  return melhor || nome;
}

// Campo de remédio com sugestões
function montarAutoRemedio(container, aoEscolher) {
  const input = $('input', container);
  const caixa = document.createElement('div');
  caixa.className = 'sugestoes';
  caixa.hidden = true;
  container.appendChild(caixa);
  const atualizar = () => {
    const lista = buscarRemedios(input.value);
    if (!lista.length || lista.some((r) => norm(r.nome) === norm(input.value))) { caixa.hidden = true; return; }
    caixa.innerHTML = lista.map((r, i) => `
      <div class="sugestao" data-i="${i}">${esc(r.nome)}
        <small>${esc([r.principios.join(' + '), r.classes.join(' · ')].filter(Boolean).join(' — ') || 'cadastrado pela família')}</small>
      </div>`).join('');
    caixa.hidden = false;
    $$('.sugestao', caixa).forEach((el) => el.onpointerdown = (e) => {
      e.preventDefault();
      input.value = lista[+el.dataset.i].nome;
      caixa.hidden = true;
      aoEscolher?.(lista[+el.dataset.i]);
    });
  };
  input.addEventListener('input', atualizar);
  input.addEventListener('focus', atualizar);
  input.addEventListener('blur', () => setTimeout(() => (caixa.hidden = true), 150));
}

// Se o remédio não está na base, oferece cadastrar para a família
async function garantirRemedio(nome) {
  nome = nome.trim();
  if (!nome || acharRemedio(nome)) return true;
  return new Promise((resolve) => {
    const opcoes = Object.values(CLASSES).sort().map((c) => `<option>${esc(c)}</option>`).join('');
    abrirModal(`
      <h2>Remédio novo</h2>
      <p class="dica" style="margin-top:0">"${esc(nome)}" não está na base. Cadastre para ele aparecer nas sugestões e nos alertas.</p>
      <label class="campo"><span>Nome</span><input type="text" id="rn-nome" value="${esc(nome)}"></label>
      <label class="campo"><span>Princípio ativo (opcional)</span><input type="text" id="rn-princ" placeholder="ex.: paracetamol"></label>
      <label class="campo"><span>Para que serve (opcional)</span><select id="rn-classe"><option value="">—</option>${opcoes}</select></label>
      <div class="botoes">
        <button class="btn neutro" id="rn-pular">Usar sem cadastrar</button>
        <button class="btn primario" id="rn-ok">Cadastrar</button>
      </div>`, (f) => {
      $('#rn-pular', f).onclick = () => { fecharModal(); resolve(true); };
      $('#rn-ok', f).onclick = async () => {
        try {
          const reg = await q(sb.from('remedios_familia').insert({
            familia_id: S.familia.id,
            nome: $('#rn-nome', f).value.trim() || nome,
            principio_ativo: $('#rn-princ', f).value.trim() || null,
            classe: $('#rn-classe', f).value || null,
          }).select().single());
          S.remediosFamilia.push(reg);
          fecharModal();
          resolve(true);
        } catch (e) { erro(e); }
      };
    });
  });
}

// Alertas de mesmo princípio ativo ou de dois anti-inflamatórios próximos
async function verificarAlertas(pessoaId, nome, quandoIso) {
  const quando = new Date(quandoIso).getTime();
  const r = acharRemedio(nome);
  // Se for um remédio "se necessário", vale o intervalo cadastrado
  const sosT = (S.sosAtivos || []).find((t) => t.pessoa_id === pessoaId && mesmoRemedio(t.remedio, nome));
  const limiteMesmo = sosT ? +sosT.intervalo_horas : 6;
  const doses = await q(sb.from('doses').select('remedio, tomado_em')
    .eq('pessoa_id', pessoaId).eq('status', 'tomada')
    .gte('tomado_em', new Date(quando - Math.max(8, limiteMesmo) * HORA).toISOString())
    .lte('tomado_em', new Date(quando).toISOString())
    .order('tomado_em', { ascending: false }));
  const avisos = [];
  const vistos = new Set();
  for (const d of doses) {
    const o = acharRemedio(d.remedio);
    const horas = (quando - new Date(d.tomado_em)) / HORA;
    const mesmo = norm(d.remedio) === norm(nome);
    const comuns = r && o ? r.principios.filter((p) => o.principios.includes(p)) : [];
    let msg = null;
    if ((mesmo || comuns.length) && horas < limiteMesmo) {
      msg = mesmo
        ? `<b>${esc(d.remedio)}</b> já foi dado às ${hora(d.tomado_em)} (${duracao(horas * 60)} antes).`
        : `Mesmo princípio ativo (${esc(comuns.join(', '))}): <b>${esc(d.remedio)}</b> foi dado às ${hora(d.tomado_em)} (${duracao(horas * 60)} antes).`;
    } else if (r && o && !mesmo && !comuns.length && horas < 8 && r.classes.includes(CLASSES.AINE) && o.classes.includes(CLASSES.AINE)) {
      msg = `<b>${esc(d.remedio)}</b> também é anti-inflamatório e foi dado às ${hora(d.tomado_em)} (${duracao(horas * 60)} antes).`;
    }
    if (msg && !vistos.has(norm(d.remedio))) { vistos.add(norm(d.remedio)); avisos.push(msg); }
  }
  if (!avisos.length) return true;
  return confirmar('Atenção', `<div class="aviso" style="margin-top:0">${avisos.join('<br>')}</div>
    <p class="dica" style="margin:0">Confira o intervalo indicado pelo médico ou na bula. Se foi orientado assim, pode registrar.</p>`,
    'Registrar mesmo assim');
}

// ---------- autenticação ----------
function telaLogin(msg = '', ok = false) {
  $('#app').innerHTML = `
    <div class="login">
      <div class="logo">💊</div>
      <h1>Remédios</h1>
      <p class="sub">Registro de remédios, sintomas e lembretes da família</p>
      ${msg ? `<p class="${ok ? 'msg-ok' : 'msg-erro'}">${esc(msg)}</p>` : ''}
      <label class="campo"><span>E-mail</span><input type="email" id="l-email" autocomplete="email" inputmode="email"></label>
      <label class="campo"><span>Senha</span><input type="password" id="l-senha" autocomplete="current-password"></label>
      <button class="btn primario bloco" id="l-entrar">Entrar</button>
      <button class="link" id="l-criar">Criar conta</button>
      <button class="link" id="l-esqueci" style="font-weight:400;font-size:14px">Esqueci a senha</button>
    </div>`;
  const dados = () => ({ email: $('#l-email').value.trim(), password: $('#l-senha').value });
  $('#l-entrar').onclick = async () => {
    const { error } = await sb.auth.signInWithPassword(dados());
    if (error) telaLogin(error.message.includes('Invalid') ? 'E-mail ou senha incorretos.' : error.message.includes('confirmed') ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.' : error.message);
  };
  $('#l-criar').onclick = async () => {
    const d = dados();
    if (!d.email || d.password.length < 6) return telaLogin('Informe o e-mail e uma senha com pelo menos 6 caracteres.');
    const { data, error } = await sb.auth.signUp({ ...d, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) return telaLogin(error.message);
    if (!data.session) telaLogin('Conta criada! Abra o e-mail de confirmação e toque no link. Depois volte aqui e entre.', true);
  };
  $('#l-esqueci').onclick = async () => {
    const email = $('#l-email').value.trim();
    if (!email) return telaLogin('Digite seu e-mail e toque em "Esqueci a senha" de novo.');
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    telaLogin('Se o e-mail existir, enviamos um link para redefinir a senha.', true);
  };
}

function telaNovaSenha() {
  abrirModal(`
    <h2>Nova senha</h2>
    <label class="campo"><span>Nova senha</span><input type="password" id="ns-senha" autocomplete="new-password"></label>
    <button class="btn primario bloco" id="ns-ok">Salvar</button>`, (f) => {
    $('#ns-ok', f).onclick = async () => {
      const { error } = await sb.auth.updateUser({ password: $('#ns-senha', f).value });
      if (error) return erro(error);
      fecharModal();
      toast('Senha alterada.');
    };
  });
}

// ---------- carga inicial ----------
async function iniciarSessao(usuario) {
  S.usuario = usuario;
  try {
    await sb.rpc('aceitar_convites');
    const membros = await q(sb.from('membros').select('familia_id, familias(id, nome)').eq('user_id', usuario.id));
    if (!membros.length) return telaBoasVindas();
    const preferida = localStorage.getItem('familiaId');
    const m = membros.find((x) => x.familia_id === preferida) || membros[0];
    S.familia = m.familias;
    await recarregarCadastros();
    if (!S.pessoas.length) return telaBoasVindas(true);
    desenharEstrutura();
    sincronizarInscricaoPush();
    abrirDoseDaUrl();
  } catch (e) {
    erro(e);
  }
}

async function recarregarCadastros() {
  const [pessoas, rems, membros] = await Promise.all([
    q(sb.from('pessoas').select('*').eq('familia_id', S.familia.id).eq('ativo', true).order('criado_em')),
    q(sb.from('remedios_familia').select('*').eq('familia_id', S.familia.id).order('nome')),
    q(sb.from('membros').select('user_id, email').eq('familia_id', S.familia.id)),
  ]);
  S.pessoas = pessoas;
  S.remediosFamilia = rems;
  S.membros = membros;
  if (!S.pessoas.find((p) => p.id === S.pessoaId)) S.pessoaId = S.pessoas[0]?.id || null;
}

function telaBoasVindas(soPessoas = false) {
  $('#app').innerHTML = `
    <div class="login">
      <div class="logo">👋</div>
      <h1>Bem-vindo</h1>
      <p class="sub">${soPessoas ? 'Cadastre quem você vai acompanhar.' : 'Vamos configurar. Se alguém já te convidou, peça para te convidar com este e-mail: ' + esc(S.usuario.email)}</p>
      ${soPessoas ? '' : `<label class="campo"><span>Nome da família</span><input type="text" id="b-familia" value="Família"></label>`}
      <label class="campo"><span>Quem você vai acompanhar? (separe por vírgula)</span><input type="text" id="b-pessoas" placeholder="ex.: Gustavo, Graziella"></label>
      <button class="btn primario bloco" id="b-ok">Começar</button>
      <button class="link" id="b-sair">Sair</button>
    </div>`;
  $('#b-sair').onclick = () => sb.auth.signOut();
  $('#b-ok').onclick = async () => {
    const nomes = $('#b-pessoas').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!nomes.length) return toast('Informe pelo menos uma pessoa.');
    try {
      if (!soPessoas) {
        const id = await q(sb.rpc('criar_familia', { p_nome: $('#b-familia').value.trim() || 'Família' }));
        S.familia = { id };
        localStorage.setItem('familiaId', id);
      }
      await q(sb.from('pessoas').insert(nomes.map((nome) => ({ familia_id: S.familia.id, nome }))));
      await iniciarSessao(S.usuario);
    } catch (e) { erro(e); }
  };
}

// ---------- estrutura e abas ----------
const ABAS = [
  { id: 'hoje', rotulo: 'Hoje', icone: '🏠' },
  { id: 'historico', rotulo: 'Histórico', icone: '📋' },
  { id: 'tratamentos', rotulo: 'Tratamentos', icone: '💊' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: '⚙️' },
];

function desenharEstrutura() {
  $('#app').innerHTML = `
    <header class="topo">
      <h1 id="titulo"></h1>
      <div class="pessoas" id="pessoas"></div>
    </header>
    <main id="conteudo"></main>
    <nav class="abas">${ABAS.map((a) => `<button class="aba" data-aba="${a.id}"><span>${a.icone}</span>${a.rotulo}</button>`).join('')}</nav>`;
  $$('.aba').forEach((b) => b.onclick = () => { S.aba = b.dataset.aba; render(); window.scrollTo(0, 0); });
  render();
}

function desenharPessoas() {
  const el = $('#pessoas');
  if (!el) return;
  el.innerHTML = S.pessoas.map((p) => `<button class="chip-pessoa ${p.id === pessoaAtual()?.id ? 'ativa' : ''}" data-id="${p.id}">${esc(p.nome)}</button>`).join('');
  $$('.chip-pessoa', el).forEach((b) => b.onclick = () => {
    S.pessoaId = b.dataset.id;
    localStorage.setItem('pessoaId', S.pessoaId);
    render();
  });
  el.hidden = S.aba === 'ajustes';
}

let renderizando = null;
async function render() {
  const aba = ABAS.find((a) => a.id === S.aba);
  $('#titulo').textContent = aba.rotulo;
  $$('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === S.aba));
  desenharPessoas();
  const token = Symbol();
  renderizando = token;
  try {
    const html = await ({ hoje: htmlHoje, historico: htmlHistorico, tratamentos: htmlTratamentos, ajustes: htmlAjustes })[S.aba]();
    if (renderizando !== token) return;
    $('#conteudo').innerHTML = html;
    ({ hoje: ligarHoje, historico: ligarHistorico, tratamentos: ligarTratamentos, ajustes: ligarAjustes })[S.aba]();
  } catch (e) { erro(e); }
}

// ============================================================
// ABA HOJE
// ============================================================
let cacheHoje = {};
async function htmlHoje() {
  const p = pessoaAtual();
  const agora = Date.now();
  const [pendentes, tomadas, eventos, sos] = await Promise.all([
    q(sb.from('doses').select('*').eq('pessoa_id', p.id).eq('status', 'pendente')
      .lte('previsto_em', new Date(agora + 24 * HORA).toISOString()).order('previsto_em')),
    q(sb.from('doses').select('remedio, dose, tomado_em').eq('pessoa_id', p.id).eq('status', 'tomada')
      .gte('tomado_em', new Date(agora - 72 * HORA).toISOString()).order('tomado_em', { ascending: false })),
    q(sb.from('eventos').select('*').eq('pessoa_id', p.id)
      .gte('ocorrido_em', new Date(agora - 24 * HORA).toISOString()).order('ocorrido_em', { ascending: false })),
    q(sb.from('tratamentos').select('*').eq('pessoa_id', p.id).eq('tipo', 'sos').eq('ativo', true).order('remedio')),
  ]);
  cacheHoje = { pendentes, sos };
  S.sosAtivos = sos;

  const limite = agora + 10 * 60e3;
  const paraAgora = pendentes.filter((d) => new Date(d.previsto_em) <= limite);
  const proximas = pendentes.filter((d) => new Date(d.previsto_em) > limite).slice(0, 8);

  let html = avisoInstalacao();

  if (paraAgora.length) {
    html += `<div class="secao-titulo">Para dar agora</div>`;
    html += paraAgora.map((d) => {
      const atrasada = Date.now() - new Date(d.previsto_em) > 15 * 60e3;
      return `<div class="cartao dose">
        <div class="dose-topo">
          <div><div class="dose-nome">${esc(d.remedio)}</div>
          <div class="dose-info">${d.dose ? esc(d.dose) + ' · ' : ''}previsto ${hora(d.previsto_em)}${new Date(d.previsto_em).toDateString() !== new Date().toDateString() ? ' de ' + diaMes(d.previsto_em) : ''}</div></div>
          <span class="etiqueta ${atrasada ? 'atrasada' : 'agora'}">${atrasada ? 'Atrasada ' + duracao((Date.now() - new Date(d.previsto_em)) / 60000) : 'Agora'}</span>
        </div>
        <div class="botoes">
          <button class="btn verde" data-tomei="${d.id}">✓ Tomei</button>
          <button class="btn neutro" data-outro="${d.id}">Outro horário</button>
          <button class="btn perigo" data-pular="${d.id}" style="flex:.6">Pular</button>
        </div>
      </div>`;
    }).join('');
  }

  if (sos.length) {
    html += `<div class="secao-titulo">Se necessário</div>`;
    html += sos.map((t) => {
      const st = situacaoSos(t, tomadas);
      return `<div class="cartao dose">
        <div class="dose-topo">
          <div><div class="dose-nome">${esc(t.remedio)}</div>
          <div class="dose-info">${t.dose ? esc(t.dose) + ' · ' : ''}intervalo mínimo ${fmtNum(t.intervalo_horas)}h${t.max_doses_dia ? ` · máx. ${t.max_doses_dia} em 24h` : ''}</div>
          <div class="dose-info">${st.ultima ? `Última: ${diaMes(st.ultima)} às ${hora(st.ultima)} (${haQuanto(st.ultima)})` : 'Nenhuma dose recente'}${t.max_doses_dia ? ` · ${st.em24h} de ${t.max_doses_dia} em 24h` : ''}</div>
          ${t.observacao ? `<div class="dose-info">📝 ${esc(t.observacao)}</div>` : ''}</div>
          <span class="etiqueta ${st.liberado ? 'ok' : 'futura'}">${st.liberado ? 'Liberado' : st.limite ? 'Limite atingido' : 'Libera ' + hora(st.liberaEm)}</span>
        </div>
        ${!st.liberado && st.liberaEm ? `<div class="dose-info">Pode dar de novo ${emQuanto(st.liberaEm)}, às ${hora(st.liberaEm)}${chaveDia(st.liberaEm) !== chaveDia(new Date()) ? ' de ' + diaMes(st.liberaEm) : ''}.</div>` : ''}
        <div class="botoes">
          <button class="btn ${st.liberado ? 'verde' : 'neutro'}" data-sos="${t.id}">💊 Dar agora</button>
          <button class="btn neutro" data-sos-outro="${t.id}">Outro horário</button>
        </div>
      </div>`;
    }).join('');
  }

  html += `<div class="secao-titulo">Registrar</div>
    <div class="grade-eventos">
      <button class="btn-evento destaque" id="btn-avulso"><span>💊</span> Deu um remédio</button>
      ${TIPOS_EVENTO.map((t, i) => `<button class="btn-evento" data-evento="${i}"><span>${t.icone}</span>${esc(t.tipo)}</button>`).join('')}
    </div>`;

  // Resumo de 24h
  const vomitos = eventos.filter((e) => e.tipo === 'Vomitou');
  const febres = eventos.filter((e) => e.tipo === 'Febre' && e.valor);
  if (vomitos.length || febres.length) {
    html += `<div class="secao-titulo">Últimas 24 horas</div><div class="resumo">`;
    if (vomitos.length) html += `<div class="cartao"><div class="num">${vomitos.length}</div><div class="rot">vômito${vomitos.length > 1 ? 's' : ''} · último ${haQuanto(vomitos[0].ocorrido_em)}</div></div>`;
    if (febres.length) html += `<div class="cartao"><div class="num">${esc(febres[0].valor)}°</div><div class="rot">última febre · ${haQuanto(febres[0].ocorrido_em)}</div></div>`;
    html += `</div>`;
  }

  if (proximas.length) {
    html += `<div class="secao-titulo">Próximas doses</div><div class="lista">`;
    html += proximas.map((d) => `<div class="item item-clicavel" data-outro="${d.id}">
        <div><div>${esc(d.remedio)}</div><div class="sub">${d.dose ? esc(d.dose) + ' · ' : ''}${hora(d.previsto_em)}</div></div>
        <span class="etiqueta futura">${emQuanto(d.previsto_em)}</span></div>`).join('');
    html += `</div>`;
  }

  // Última dose de cada remédio
  const ultimas = new Map();
  for (const d of tomadas) if (!ultimas.has(norm(d.remedio))) ultimas.set(norm(d.remedio), d);
  if (ultimas.size) {
    html += `<div class="secao-titulo">Última dose de cada remédio</div><div class="lista">`;
    html += [...ultimas.values()].map((d) => `<div class="item">
        <div><div>${esc(d.remedio)}</div><div class="sub">${diaMes(d.tomado_em)} às ${hora(d.tomado_em)}</div></div>
        <span class="etiqueta ok">${haQuanto(d.tomado_em)}</span></div>`).join('');
    html += `</div>`;
  }

  if (!pendentes.length && !tomadas.length && !eventos.length) {
    html += `<div class="vazio">Nada registrado para ${esc(p.nome)} ainda.<br>Use os botões acima ou crie um tratamento com lembretes na aba 💊.</div>`;
  }
  return html;
}

// Dose do mesmo remédio ou com o mesmo princípio ativo
function mesmoRemedio(a, b) {
  if (norm(a) === norm(b)) return true;
  const ra = acharRemedio(a), rb = acharRemedio(b);
  return !!(ra && rb && ra.principios.some((p) => rb.principios.includes(p)));
}

// Situação de um remédio "se necessário": liberado ou quando libera
function situacaoSos(t, tomadas, agora = Date.now()) {
  const doses = tomadas.filter((d) => mesmoRemedio(d.remedio, t.remedio)).map((d) => new Date(d.tomado_em).getTime()).filter((x) => x <= agora).sort((a, b) => b - a);
  const ultima = doses[0] || null;
  let liberaEm = ultima ? ultima + t.intervalo_horas * HORA : null;
  const em24 = doses.filter((x) => x > agora - 24 * HORA);
  let limite = false;
  if (t.max_doses_dia && em24.length >= t.max_doses_dia) {
    limite = true;
    // libera quando a dose mais antiga dentro das 24h sair da janela
    const saida = em24[t.max_doses_dia - 1] + 24 * HORA;
    liberaEm = Math.max(liberaEm || 0, saida);
  }
  const liberado = !liberaEm || liberaEm <= agora;
  return { ultima: ultima && new Date(ultima), liberaEm: liberaEm && new Date(liberaEm), liberado, limite: limite && !liberado, em24h: em24.length };
}

async function darSos(id, quando = new Date().toISOString(), confirmarAntes = true) {
  const t = (cacheHoje.sos || []).find((x) => x.id === id);
  if (!t) return;
  try {
    const tomadas = await q(sb.from('doses').select('remedio, tomado_em').eq('pessoa_id', t.pessoa_id).eq('status', 'tomada')
      .gte('tomado_em', new Date(new Date(quando) - Math.max(24, t.intervalo_horas) * HORA).toISOString()));
    const st = situacaoSos(t, tomadas, new Date(quando).getTime() + 1);
    if (confirmarAntes && !st.liberado) {
      const motivo = st.limite
        ? `Já foram ${st.em24h} dose(s) nas últimas 24h (máximo ${t.max_doses_dia}).`
        : `A última dose foi às ${hora(st.ultima)}. O intervalo mínimo de ${fmtNum(t.intervalo_horas)}h só completa às ${hora(st.liberaEm)}.`;
      if (!(await confirmar('Ainda não liberado', `<div class="aviso" style="margin-top:0">${motivo}</div><p class="dica" style="margin:0">Registre só se o médico orientou.</p>`, 'Registrar mesmo assim'))) return;
    }
    await q(sb.from('doses').insert({
      familia_id: t.familia_id, pessoa_id: t.pessoa_id, remedio: t.remedio, dose: t.dose,
      status: 'tomada', tomado_em: quando, registrado_por: S.usuario.id,
    }));
    toast(`💊 ${t.remedio} registrado às ${hora(quando)}`);
    render();
  } catch (e) { erro(e); }
}

function avisoInstalacao() {
  const instalado = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!instalado && /iPhone|iPad/.test(navigator.userAgent)) {
    return `<div class="aviso"><b>Instale o app para receber lembretes</b>Toque em Compartilhar <span style="font-size:18px">⎋</span> e depois em <b style="display:inline">Adicionar à Tela de Início</b>. Abra pelo ícone criado.</div>`;
  }
  if (instalado && 'Notification' in window && Notification.permission !== 'granted') {
    return `<div class="aviso"><b>Ative as notificações</b>Sem isso os lembretes não chegam.<div style="margin-top:8px"><button class="btn primario pequeno" id="ativar-notif">Ativar notificações</button></div></div>`;
  }
  return '';
}

function ligarHoje() {
  $$('[data-tomei]').forEach((b) => b.onclick = () => confirmarDose(b.dataset.tomei, 'tomada', new Date().toISOString()));
  $$('[data-pular]').forEach((b) => b.onclick = async () => {
    if (await confirmar('Pular dose?', 'A dose ficará registrada como não dada.', 'Pular', true)) confirmarDose(b.dataset.pular, 'pulada');
  });
  $$('[data-outro]').forEach((b) => b.onclick = () => abrirDose(b.dataset.outro));
  $('#btn-avulso').onclick = () => modalAvulso();
  $$('[data-sos]').forEach((b) => b.onclick = () => darSos(b.dataset.sos));
  $$('[data-sos-outro]').forEach((b) => b.onclick = () => {
    const t = cacheHoje.sos.find((x) => x.id === b.dataset.sosOutro);
    abrirModal(`
      <h2>${esc(t.remedio)}</h2>
      <label class="campo"><span>Horário em que deu</span><input type="datetime-local" id="so-quando" value="${paraInput(new Date())}"></label>
      <button class="btn verde bloco" id="so-ok">Registrar</button>`, (f) => {
      $('#so-ok', f).onclick = () => { const v = deInput($('#so-quando', f).value); fecharModal(); darSos(t.id, v); };
    });
  });
  $$('[data-evento]').forEach((b) => b.onclick = () => registrarEvento(TIPOS_EVENTO[+b.dataset.evento]));
  $('#ativar-notif')?.addEventListener('click', ativarNotificacoes);
}

async function confirmarDose(id, status, quando = new Date().toISOString()) {
  try {
    await q(sb.rpc('registrar_dose', { p_dose: id, p_status: status, p_quando: quando }));
    toast(status === 'tomada' ? `✓ Registrado às ${hora(quando)}` : 'Dose pulada');
    if (!S.modalAberto) render();
  } catch (e) { erro(e); }
}

// Modal de uma dose prevista (também aberto pela notificação)
async function abrirDose(id) {
  try {
    const d = await q(sb.from('doses').select('*').eq('id', id).maybeSingle());
    if (!d) return toast('Dose não encontrada.');
    if (d.pessoa_id !== S.pessoaId) { S.pessoaId = d.pessoa_id; localStorage.setItem('pessoaId', d.pessoa_id); }
    const jaFeita = d.status !== 'pendente';
    abrirModal(`
      <h2>${esc(d.remedio)} — ${esc(nomePessoa(d.pessoa_id))}</h2>
      <p class="dica" style="margin-top:-6px">${d.dose ? esc(d.dose) + ' · ' : ''}previsto para ${diaMes(d.previsto_em)} às ${hora(d.previsto_em)}</p>
      ${jaFeita ? `<div class="aviso">Esta dose já está como <b style="display:inline">${esc(d.status)}</b>${d.tomado_em ? ' às ' + hora(d.tomado_em) : ''}.</div>` : ''}
      <button class="btn verde bloco" id="d-agora" style="margin-bottom:12px;padding:16px">✓ Tomei agora (${hora(new Date())})</button>
      <label class="campo"><span>Ou informe o horário em que tomou</span><input type="datetime-local" id="d-quando" value="${paraInput(new Date())}"></label>
      <div class="botoes">
        <button class="btn primario" id="d-outro">Registrar neste horário</button>
        <button class="btn perigo" id="d-pular" style="flex:.5">Pular</button>
      </div>
      <button class="link" id="d-fechar">Fechar</button>`, (f) => {
      $('#d-agora', f).onclick = () => { fecharModal(); confirmarDose(id, 'tomada', new Date().toISOString()); };
      $('#d-outro', f).onclick = () => { const v = $('#d-quando', f).value; fecharModal(); confirmarDose(id, 'tomada', deInput(v)); };
      $('#d-pular', f).onclick = () => { fecharModal(); confirmarDose(id, 'pulada'); };
      $('#d-fechar', f).onclick = fecharModal;
    });
  } catch (e) { erro(e); }
}

function modalAvulso(nomeInicial = '') {
  const p = pessoaAtual();
  abrirModal(`
    <h2>Deu um remédio — ${esc(p.nome)}</h2>
    <label class="campo"><span>Remédio</span><div class="auto" id="a-auto"><input type="text" id="a-nome" value="${esc(nomeInicial)}" placeholder="Digite para buscar" autocomplete="off"></div></label>
    <label class="campo"><span>Dose (opcional)</span><input type="text" id="a-dose" placeholder="ex.: 5 ml, 1 comprimido, 20 gotas"></label>
    <label class="campo"><span>Horário</span><input type="datetime-local" id="a-quando" value="${paraInput(new Date())}"></label>
    <button class="btn verde bloco" id="a-ok">Registrar</button>
    <button class="link" id="a-trat">Cadastrar como tratamento (horário fixo ou se necessário)</button>`, (f) => {
    montarAutoRemedio($('#a-auto', f));
    if (!nomeInicial) setTimeout(() => $('#a-nome', f).focus(), 250);
    $('#a-trat', f).onclick = () => modalTratamento($('#a-nome', f).value);
    $('#a-ok', f).onclick = async () => {
      const nome = $('#a-nome', f).value.trim();
      const dose = $('#a-dose', f).value.trim() || null;
      const quando = deInput($('#a-quando', f).value);
      if (!nome) return toast('Informe o remédio.');
      fecharModal();
      try {
        if (!(await garantirRemedio(nome))) return;
        const nomeFinal = acharRemedio(nome)?.nome || nome;
        if (!(await verificarAlertas(p.id, nomeFinal, quando))) return;
        await q(sb.from('doses').insert({
          familia_id: S.familia.id, pessoa_id: p.id, remedio: nomeFinal, dose,
          status: 'tomada', tomado_em: quando, registrado_por: S.usuario.id,
        }));
        toast(`💊 ${nomeFinal} registrado às ${hora(quando)}`);
        render();
      } catch (e) { erro(e); }
    };
  });
}

async function registrarEvento(t) {
  const p = pessoaAtual();
  const salvar = async (valor, quando, obs) => {
    try {
      const ev = await q(sb.from('eventos').insert({
        familia_id: S.familia.id, pessoa_id: p.id, tipo: t.tipo, valor: valor || null,
        ocorrido_em: quando, observacao: obs || null,
      }).select().single());
      toast(`${t.icone} ${t.tipo} às ${hora(quando)}`, [
        { rotulo: 'Desfazer', fn: async () => { await sb.from('eventos').delete().eq('id', ev.id); render(); } },
        { rotulo: 'Horário', fn: () => editarEvento(ev) },
      ], 7000);
      render();
    } catch (e) { erro(e); }
  };
  if (t.rapido) return salvar(null, new Date().toISOString());
  const c = t.campo;
  abrirModal(`
    <h2>${t.icone} ${esc(t.tipo)} — ${esc(p.nome)}</h2>
    <label class="campo"><span>${esc(c.rotulo)}</span>${c.tipo === 'textarea'
      ? '<textarea id="e-valor"></textarea>'
      : `<input type="${c.tipo}" id="e-valor" ${c.passo ? `step="${c.passo}" inputmode="decimal"` : ''}>`}</label>
    <label class="campo"><span>Horário</span><input type="datetime-local" id="e-quando" value="${paraInput(new Date())}"></label>
    <button class="btn primario bloco" id="e-ok">Registrar</button>`, (f) => {
    setTimeout(() => $('#e-valor', f).focus(), 250);
    $('#e-ok', f).onclick = () => {
      const v = $('#e-valor', f).value.trim().replace('.', ',');
      fecharModal();
      salvar(c.tipo === 'textarea' ? null : v, deInput($('#e-quando', f).value), c.tipo === 'textarea' ? v : null);
    };
  });
}

function editarEvento(ev) {
  const t = TIPOS_EVENTO.find((x) => x.tipo === ev.tipo);
  abrirModal(`
    <h2>${t?.icone || '•'} ${esc(ev.tipo)}</h2>
    ${t?.campo && t.campo.tipo !== 'textarea' ? `<label class="campo"><span>${esc(t.campo.rotulo)}</span><input type="text" id="ee-valor" value="${esc(ev.valor || '')}"></label>` : ''}
    <label class="campo"><span>Horário</span><input type="datetime-local" id="ee-quando" value="${paraInput(ev.ocorrido_em)}"></label>
    <label class="campo"><span>Observação</span><textarea id="ee-obs">${esc(ev.observacao || '')}</textarea></label>
    <div class="botoes">
      <button class="btn perigo" id="ee-del">Excluir</button>
      <button class="btn primario" id="ee-ok">Salvar</button>
    </div>`, (f) => {
    $('#ee-ok', f).onclick = async () => {
      try {
        await q(sb.from('eventos').update({
          ocorrido_em: deInput($('#ee-quando', f).value),
          valor: $('#ee-valor', f)?.value.trim() || ev.valor || null,
          observacao: $('#ee-obs', f).value.trim() || null,
        }).eq('id', ev.id));
        fecharModal(); render();
      } catch (e) { erro(e); }
    };
    $('#ee-del', f).onclick = async () => {
      try { await q(sb.from('eventos').delete().eq('id', ev.id)); fecharModal(); render(); } catch (e) { erro(e); }
    };
  });
}

function editarDoseTomada(d) {
  abrirModal(`
    <h2>💊 ${esc(d.remedio)}</h2>
    <label class="campo"><span>Dose</span><input type="text" id="ed-dose" value="${esc(d.dose || '')}"></label>
    <label class="campo"><span>Horário em que tomou</span><input type="datetime-local" id="ed-quando" value="${paraInput(d.tomado_em)}"></label>
    ${d.tratamento_id ? '<p class="dica">Dose de tratamento. Ao excluir, ela volta a ficar pendente.</p>' : ''}
    <div class="botoes">
      <button class="btn perigo" id="ed-del">Excluir</button>
      <button class="btn primario" id="ed-ok">Salvar</button>
    </div>`, (f) => {
    $('#ed-ok', f).onclick = async () => {
      try {
        await q(sb.from('doses').update({ tomado_em: deInput($('#ed-quando', f).value), dose: $('#ed-dose', f).value.trim() || null }).eq('id', d.id));
        fecharModal(); render();
      } catch (e) { erro(e); }
    };
    $('#ed-del', f).onclick = async () => {
      try {
        if (d.tratamento_id) await q(sb.from('doses').update({ status: 'pendente', tomado_em: null }).eq('id', d.id));
        else await q(sb.from('doses').delete().eq('id', d.id));
        fecharModal(); render();
      } catch (e) { erro(e); }
    };
  });
}

// ============================================================
// ABA HISTÓRICO
// ============================================================
let cacheHist = { dias: [] };
async function htmlHistorico() {
  const p = pessoaAtual();
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (S.diasHistorico - 1));
  const [doses, eventos] = await Promise.all([
    q(sb.from('doses').select('*').eq('pessoa_id', p.id).eq('status', 'tomada').gte('tomado_em', inicio.toISOString()).order('tomado_em')),
    q(sb.from('eventos').select('*').eq('pessoa_id', p.id).gte('ocorrido_em', inicio.toISOString()).order('ocorrido_em')),
  ]);

  // Agrupa por dia e, dentro do dia, por remédio / acontecimento
  const dias = new Map();
  const add = (quando, nome, item) => {
    const k = chaveDia(quando);
    if (!dias.has(k)) dias.set(k, new Map());
    const g = dias.get(k);
    if (!g.has(nome)) g.set(nome, []);
    g.get(nome).push(item);
  };
  for (const d of doses) add(d.tomado_em, d.remedio, { tipo: 'dose', quando: d.tomado_em, reg: d });
  for (const e of eventos) add(e.ocorrido_em, e.tipo, { tipo: 'evento', quando: e.ocorrido_em, reg: e });
  const chaves = [...dias.keys()].sort().reverse();
  cacheHist = { pessoa: p, dias: chaves.map((k) => ({ chave: k, grupos: [...dias.get(k).entries()].map(([nome, itens]) => ({ nome, itens: itens.sort((a, b) => new Date(a.quando) - new Date(b.quando)) })).sort((a, b) => new Date(a.itens[0].quando) - new Date(b.itens[0].quando)) })) };

  let html = `<div class="botoes" style="margin:6px 0 4px">
      <button class="btn pequeno" id="h-copiar">📋 Copiar texto</button>
      <button class="btn pequeno" id="h-importar">⬇️ Importar anotações</button>
    </div>`;
  if (!chaves.length) html += `<div class="vazio">Nada registrado nos últimos ${S.diasHistorico} dias.</div>`;
  let idx = 0;
  const regs = [];
  for (const dia of cacheHist.dias) {
    html += `<div class="secao-titulo">${esc(rotuloDia(dia.chave))}</div><div class="cartao dia">`;
    for (const g of dia.grupos) {
      const ehEvento = g.itens[0].tipo === 'evento';
      const t = TIPOS_EVENTO.find((x) => x.tipo === g.nome);
      html += `<div class="linha-hist"><div class="nome">${ehEvento ? (t?.icone || '•') + ' ' : ''}${esc(g.nome)}</div><div class="horarios">`;
      for (const it of g.itens) {
        regs.push(it);
        const extra = it.tipo === 'evento' && it.reg.valor ? ` · ${esc(it.reg.valor)}${t?.campo?.sufixo || ''}` : '';
        html += `<button class="hora-chip ${ehEvento ? 'evento' : ''}" data-reg="${idx++}">${hora(it.quando)}${extra}</button>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
  }
  cacheHist.regs = regs;
  html += `<button class="btn neutro bloco" id="h-mais" style="margin-top:8px">Ver mais 7 dias</button>`;
  return html;
}

function textoHistorico() {
  const { pessoa, dias } = cacheHist;
  let t = `${pessoa.nome}\n`;
  for (const dia of [...dias].reverse()) {
    const [, m, d] = dia.chave.split('-');
    t += `\n${d}/${m}\n`;
    for (const g of dia.grupos) {
      const tipo = TIPOS_EVENTO.find((x) => x.tipo === g.nome);
      t += `${g.nome} ${g.itens.map((it) => hora(it.quando) + (it.tipo === 'evento' && it.reg.valor ? ` (${it.reg.valor}${tipo?.campo?.sufixo || ''})` : '')).join(' ')}\n`;
    }
  }
  return t.trim();
}

function ligarHistorico() {
  $$('[data-reg]').forEach((b) => b.onclick = () => {
    const it = cacheHist.regs[+b.dataset.reg];
    it.tipo === 'dose' ? editarDoseTomada(it.reg) : editarEvento(it.reg);
  });
  $('#h-mais').onclick = () => { S.diasHistorico += 7; render(); };
  $('#h-importar').onclick = modalImportar;
  $('#h-copiar').onclick = async () => {
    const texto = textoHistorico();
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else { await navigator.clipboard.writeText(texto); toast('Texto copiado.'); }
    } catch (e) {
      if (e.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(texto); toast('Texto copiado.'); } catch { erro(e); }
      }
    }
  };
}

// ---------- importação do texto anotado ----------
function interpretarTexto(texto) {
  const hoje = new Date();
  let pessoa = pessoaAtual().nome;
  let data = null;
  const itens = [];
  const ignoradas = [];
  const correcoes = new Map();
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l) continue;
    const md = l.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (md) {
      const mes = +md[2] - 1;
      let ano = md[3] ? (md[3].length === 2 ? 2000 + +md[3] : +md[3]) : hoje.getFullYear();
      if (!md[3] && mes > hoje.getMonth() + 1) ano--;
      data = { ano, mes, dia: +md[1] };
      continue;
    }
    const mi = l.match(/^(.+?)\s+((?:\d{1,2}[:hH]\d{2}[\s,;]*)+)$/);
    if (mi && data) {
      const original = mi[1].trim().replace(/[:\-–]+$/, '').trim();
      const evento = APELIDOS_EVENTO[norm(original)];
      let nome = evento || original;
      if (!evento) {
        nome = corrigirNome(original);
        if (norm(nome) !== norm(original)) correcoes.set(original, nome);
      }
      for (const h of mi[2].match(/\d{1,2}[:hH]\d{2}/g)) {
        const [hh, mm] = h.split(/[:hH]/).map(Number);
        itens.push({ pessoa, nome, evento: !!evento, quando: new Date(data.ano, data.mes, data.dia, hh, mm) });
      }
      continue;
    }
    if (!/\d/.test(l)) { pessoa = l.replace(/:$/, ''); continue; }
    ignoradas.push(l);
  }
  // Remove repetições dentro do próprio texto
  const vistos = new Set();
  const unicos = itens.filter((it) => {
    const k = `${norm(it.pessoa)}|${norm(it.nome)}|${it.quando.getTime()}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return { itens: unicos, ignoradas, correcoes };
}

function modalImportar() {
  abrirModal(`
    <h2>Importar anotações</h2>
    <p class="dica" style="margin-top:-6px">Cole o texto no formato que você já usa:<br>nome da pessoa, a data (dd/mm) e uma linha por remédio ou acontecimento com os horários.</p>
    <label class="campo"><textarea id="i-texto" style="min-height:180px" placeholder="Gustavo&#10;10/11&#10;Ibuprofeno 18:55&#10;Paracetamol 20:45&#10;Vomitou 04:06 05:20"></textarea></label>
    <div id="i-previa"></div>
    <button class="btn primario bloco" id="i-ver">Conferir</button>`, (f) => {
    let plano = null;
    $('#i-ver', f).onclick = async () => {
      if (plano) return executarImportacao(plano);
      const r = interpretarTexto($('#i-texto', f).value);
      if (!r.itens.length) return toast('Nenhum registro encontrado no texto.');
      try {
        plano = await planejarImportacao(r);
        const porPessoa = {};
        for (const it of plano.novos) {
          porPessoa[it.pessoa] ??= { doses: 0, eventos: 0 };
          porPessoa[it.pessoa][it.evento ? 'eventos' : 'doses']++;
        }
        let html = `<div class="cartao">`;
        for (const [n, c] of Object.entries(porPessoa)) html += `<div><b>${esc(n)}</b>${plano.pessoasNovas.includes(n) ? ' (nova pessoa)' : ''}: ${c.doses} dose(s), ${c.eventos} acontecimento(s)</div>`;
        if (plano.repetidos) html += `<div class="dica" style="margin:6px 0 0">${plano.repetidos} registro(s) já existiam e serão ignorados.</div>`;
        if (r.correcoes.size) html += `<div class="dica" style="margin:6px 0 0">Nomes corrigidos: ${[...r.correcoes].map(([a, b]) => `${esc(a)} → ${esc(b)}`).join(', ')}</div>`;
        if (r.ignoradas.length) html += `<div class="dica" style="margin:6px 0 0">Linhas não entendidas: ${r.ignoradas.map(esc).join(' | ')}</div>`;
        html += `</div>`;
        $('#i-previa', f).innerHTML = html;
        $('#i-texto', f).disabled = true;
        $('#i-ver', f).textContent = plano.novos.length ? `Importar ${plano.novos.length} registro(s)` : 'Nada novo para importar';
        if (!plano.novos.length) $('#i-ver', f).disabled = true;
      } catch (e) { erro(e); }
    };
  });
}

async function planejarImportacao({ itens }) {
  const nomesPessoas = [...new Set(itens.map((i) => i.pessoa))];
  const pessoasNovas = nomesPessoas.filter((n) => !S.pessoas.find((p) => norm(p.nome) === norm(n)));
  const ids = S.pessoas.filter((p) => nomesPessoas.some((n) => norm(n) === norm(p.nome))).map((p) => p.id);
  const min = new Date(Math.min(...itens.map((i) => i.quando))).toISOString();
  const max = new Date(Math.max(...itens.map((i) => i.quando)) + 60e3).toISOString();
  const existentes = new Set();
  if (ids.length) {
    const [ds, es] = await Promise.all([
      q(sb.from('doses').select('pessoa_id, remedio, tomado_em').in('pessoa_id', ids).eq('status', 'tomada').gte('tomado_em', min).lte('tomado_em', max)),
      q(sb.from('eventos').select('pessoa_id, tipo, ocorrido_em').in('pessoa_id', ids).gte('ocorrido_em', min).lte('ocorrido_em', max)),
    ]);
    const minuto = (d) => Math.floor(new Date(d).getTime() / 60e3);
    for (const d of ds) existentes.add(`${norm(nomePessoa(d.pessoa_id))}|${norm(d.remedio)}|${minuto(d.tomado_em)}`);
    for (const e of es) existentes.add(`${norm(nomePessoa(e.pessoa_id))}|${norm(e.tipo)}|${minuto(e.ocorrido_em)}`);
  }
  const novos = itens.filter((i) => !existentes.has(`${norm(i.pessoa)}|${norm(i.nome)}|${Math.floor(i.quando.getTime() / 60e3)}`));
  return { novos, repetidos: itens.length - novos.length, pessoasNovas };
}

async function executarImportacao(plano) {
  try {
    if (plano.pessoasNovas.length) {
      await q(sb.from('pessoas').insert(plano.pessoasNovas.map((nome) => ({ familia_id: S.familia.id, nome }))));
      await recarregarCadastros();
    }
    const idPessoa = (n) => S.pessoas.find((p) => norm(p.nome) === norm(n)).id;
    // Remédios desconhecidos entram na lista da família (sem classe)
    const desconhecidos = [...new Set(plano.novos.filter((i) => !i.evento && !acharRemedio(i.nome)).map((i) => i.nome))];
    if (desconhecidos.length) {
      await q(sb.from('remedios_familia').upsert(desconhecidos.map((nome) => ({ familia_id: S.familia.id, nome })), { onConflict: 'familia_id,nome', ignoreDuplicates: true }));
    }
    const doses = plano.novos.filter((i) => !i.evento).map((i) => ({
      familia_id: S.familia.id, pessoa_id: idPessoa(i.pessoa), remedio: i.nome,
      status: 'tomada', tomado_em: i.quando.toISOString(), registrado_por: S.usuario.id,
    }));
    const eventos = plano.novos.filter((i) => i.evento).map((i) => ({
      familia_id: S.familia.id, pessoa_id: idPessoa(i.pessoa), tipo: i.nome, ocorrido_em: i.quando.toISOString(),
    }));
    if (doses.length) await q(sb.from('doses').insert(doses));
    if (eventos.length) await q(sb.from('eventos').insert(eventos));
    await recarregarCadastros();
    fecharModal();
    toast(`✓ ${doses.length + eventos.length} registro(s) importados`);
    S.diasHistorico = Math.max(S.diasHistorico, Math.ceil((Date.now() - Math.min(...plano.novos.map((i) => i.quando))) / (24 * HORA)) + 1);
    render();
  } catch (e) { erro(e); }
}

// ============================================================
// ABA TRATAMENTOS
// ============================================================
let cacheTrat = [];
async function htmlTratamentos() {
  const p = pessoaAtual();
  const trats = await q(sb.from('tratamentos').select('*').eq('pessoa_id', p.id).order('criado_em', { ascending: false }).limit(30));
  let doses = [];
  if (trats.length) doses = await q(sb.from('doses').select('tratamento_id, status, previsto_em, tomado_em').in('tratamento_id', trats.map((t) => t.id)).order('previsto_em'));
  cacheTrat = trats;
  const info = (t) => {
    const ds = doses.filter((d) => d.tratamento_id === t.id);
    const tomadas = ds.filter((d) => d.status === 'tomada').length;
    const total = ds.filter((d) => d.status !== 'cancelada').length;
    const proxima = ds.find((d) => d.status === 'pendente');
    const ultima = ds.filter((d) => d.status !== 'cancelada').at(-1);
    return { tomadas, total, proxima, ultima, emAndamento: t.ativo && !!proxima };
  };
  const sos = trats.filter((t) => t.tipo === 'sos' && t.ativo);
  const ativos = trats.filter((t) => t.tipo !== 'sos' && info(t).emAndamento);
  const outros = trats.filter((t) => t.tipo === 'sos' ? !t.ativo : !info(t).emAndamento);

  let html = `<div class="botoes" style="margin:6px 0 4px">
    <button class="btn primario" id="t-novo">⏰ Horário fixo</button>
    <button class="btn" id="t-sos">🆘 Se necessário</button>
  </div>`;
  html += `<div class="secao-titulo">Em andamento</div>`;
  if (!ativos.length) html += `<div class="vazio">Nenhum tratamento em andamento para ${esc(p.nome)}.</div>`;
  for (const t of ativos) {
    const i = info(t);
    html += `<div class="cartao">
      <div class="dose-topo"><div>
        <div class="dose-nome">${esc(t.remedio)}</div>
        <div class="dose-info">${t.dose ? esc(t.dose) + ' · ' : ''}a cada ${fmtNum(t.intervalo_horas)}h por ${fmtNum(t.dias)} dia(s)</div>
        <div class="dose-info">Próxima: ${diaMes(i.proxima.previsto_em)} às ${hora(i.proxima.previsto_em)} (${emQuanto(i.proxima.previsto_em)})</div>
        <div class="dose-info">Termina: ${diaMes(i.ultima.previsto_em)} às ${hora(i.ultima.previsto_em)}</div>
        ${t.observacao ? `<div class="dose-info">📝 ${esc(t.observacao)}</div>` : ''}
      </div><span class="etiqueta ok">${i.tomadas}/${i.total}</span></div>
      <div class="progresso"><div style="width:${i.total ? (100 * i.tomadas / i.total) : 0}%"></div></div>
      <div class="botoes" style="margin-top:10px">
        <button class="btn pequeno neutro" data-doses="${t.id}">Ver doses</button>
        <button class="btn pequeno" data-editar="${t.id}">Editar</button>
        <button class="btn pequeno perigo" data-encerrar="${t.id}">Encerrar</button>
      </div>
    </div>`;
  }
  html += `<div class="secao-titulo">Se necessário (dor, febre, enjoo…)</div>`;
  if (!sos.length) html += `<div class="vazio" style="padding:8px">Nenhum. Use para remédios dados só quando precisa, respeitando um intervalo mínimo.</div>`;
  for (const t of sos) {
    html += `<div class="cartao">
      <div class="dose-nome">${esc(t.remedio)}</div>
      <div class="dose-info">${t.dose ? esc(t.dose) + ' · ' : ''}intervalo mínimo ${fmtNum(t.intervalo_horas)}h${t.max_doses_dia ? ` · máx. ${t.max_doses_dia} em 24h` : ''}</div>
      ${t.observacao ? `<div class="dose-info">📝 ${esc(t.observacao)}</div>` : ''}
      <div class="botoes" style="margin-top:10px">
        <button class="btn pequeno" data-editar="${t.id}">Editar</button>
        <button class="btn pequeno perigo" data-encerrar="${t.id}">Encerrar</button>
      </div>
    </div>`;
  }
  if (outros.length) {
    html += `<div class="secao-titulo">Encerrados</div><div class="lista">`;
    html += outros.map((t) => { const i = info(t); return t.tipo === 'sos'
      ? `<div class="item"><div><div>${esc(t.remedio)}</div><div class="sub">se necessário · intervalo ${fmtNum(t.intervalo_horas)}h</div></div></div>`
      : `<div class="item item-clicavel" data-doses="${t.id}">
      <div><div>${esc(t.remedio)}</div><div class="sub">${diaMes(t.inicio)} · a cada ${fmtNum(t.intervalo_horas)}h · ${i.tomadas}/${i.total} doses</div></div>
      <span class="sub">›</span></div>`; }).join('');
    html += `</div>`;
  }
  return html;
}
const fmtNum = (n) => String(+n).replace('.', ',');

function ligarTratamentos() {
  $('#t-novo').onclick = () => modalTratamento();
  $('#t-sos').onclick = () => modalTratamento('', 'sos');
  $$('[data-encerrar]').forEach((b) => b.onclick = async () => {
    const t = cacheTrat.find((x) => x.id === b.dataset.encerrar);
    const msg = t?.tipo === 'sos' ? `${esc(t.remedio)} sai da lista "Se necessário". O histórico fica guardado.` : 'As doses que ainda faltam serão canceladas e os lembretes param.';
    if (!(await confirmar('Encerrar?', msg, 'Encerrar', true))) return;
    try { await q(sb.rpc('encerrar_tratamento', { p_tratamento: b.dataset.encerrar })); render(); } catch (e) { erro(e); }
  });
  $$('[data-doses]').forEach((b) => b.onclick = () => modalDosesTratamento(b.dataset.doses));
  $$('[data-editar]').forEach((b) => b.onclick = () => modalEditarTratamento(cacheTrat.find((x) => x.id === b.dataset.editar)));
}

async function modalEditarTratamento(t) {
  const sos = t.tipo === 'sos';
  let ultimaTomada = null, primeiraPendente = null;
  if (!sos) {
    const ds = await q(sb.from('doses').select('status, previsto_em, tomado_em').eq('tratamento_id', t.id));
    ultimaTomada = ds.filter((d) => d.status === 'tomada' && d.tomado_em).map((d) => new Date(d.tomado_em)).sort((a, b) => b - a)[0] || null;
    primeiraPendente = ds.filter((d) => d.status === 'pendente').map((d) => new Date(d.previsto_em)).sort((a, b) => a - b)[0] || null;
  }
  abrirModal(`
    <h2>Editar ${esc(t.remedio)}</h2>
    <label class="campo"><span>Remédio</span><div class="auto" id="et-auto"><input type="text" id="et-nome" value="${esc(t.remedio)}" autocomplete="off"></div></label>
    <label class="campo"><span>Dose</span><input type="text" id="et-dose" value="${esc(t.dose || '')}"></label>
    <div class="linha-campos">
      <label class="campo"><span>${sos ? 'Intervalo mínimo (horas)' : 'A cada (horas)'}</span><input type="number" id="et-int" value="${+t.intervalo_horas}" min="0.5" step="0.5" inputmode="decimal"></label>
      ${sos
        ? `<label class="campo"><span>Máx. em 24h (opcional)</span><input type="number" id="et-max" value="${t.max_doses_dia || ''}" min="1" step="1" inputmode="numeric"></label>`
        : `<label class="campo"><span>Duração total (dias)</span><input type="number" id="et-dias" value="${+t.dias}" min="0.5" step="0.5" inputmode="decimal"></label>`}
    </div>
    ${sos ? '' : `
      <label class="campo"><span>Próxima dose</span><input type="datetime-local" id="et-prox"></label>
      <p class="dica">${ultimaTomada ? `Última dose dada: ${diaMes(ultimaTomada)} às ${hora(ultimaTomada)}. A próxima é calculada a partir dela.` : 'Nenhuma dose dada ainda.'} Início do tratamento: ${diaMes(t.inicio)} às ${hora(t.inicio)}.</p>
      <label class="check"><input type="checkbox" id="et-recalc" ${t.recalcular ? 'checked' : ''}> <span>Se uma dose atrasar, recalcular as próximas</span></label>`}
    <label class="campo"><span>Observação</span><input type="text" id="et-obs" value="${esc(t.observacao || '')}"></label>
    <p class="dica" id="et-previa"></p>
    <button class="btn primario bloco" id="et-ok">Salvar</button>`, (f) => {
    montarAutoRemedio($('#et-auto', f));
    let proxEditada = false;
    const proxSugerida = () => {
      const int = parseFloat($('#et-int', f).value.replace(',', '.')) || +t.intervalo_horas;
      if (ultimaTomada) return new Date(ultimaTomada.getTime() + int * HORA);
      return primeiraPendente || new Date(t.inicio);
    };
    const previa = () => {
      if (sos) return;
      if (!proxEditada) $('#et-prox', f).value = paraInput(proxSugerida());
      const int = parseFloat($('#et-int', f).value.replace(',', '.'));
      const dias = parseFloat($('#et-dias', f).value.replace(',', '.'));
      const prox = new Date($('#et-prox', f).value);
      const fim = new Date(new Date(t.inicio).getTime() + dias * 24 * HORA);
      if (!(int > 0 && dias > 0) || isNaN(prox)) return ($('#et-previa', f).textContent = '');
      const n = Math.max(0, Math.ceil((fim - prox) / (int * HORA)));
      if (!n) return ($('#et-previa', f).textContent = 'Com esses valores não sobra nenhuma dose: o tratamento termina antes da próxima.');
      const ult = new Date(prox.getTime() + (n - 1) * int * HORA);
      $('#et-previa', f).textContent = `Ficam ${n} dose(s) pela frente: de ${diaMes(prox)} ${hora(prox)} até ${diaMes(ult)} ${hora(ult)}.`;
    };
    if (!sos) $('#et-prox', f).addEventListener('input', () => { proxEditada = true; previa(); });
    $$('#et-int, #et-dias', f).forEach((i) => i.addEventListener('input', previa));
    previa();
    $('#et-ok', f).onclick = async () => {
      const nome = $('#et-nome', f).value.trim();
      const int = parseFloat($('#et-int', f).value.replace(',', '.'));
      if (!nome || !(int > 0)) return toast('Informe o remédio e o intervalo.');
      const dose = $('#et-dose', f).value.trim() || null;
      const obs = $('#et-obs', f).value.trim() || null;
      try {
        if (sos) {
          await q(sb.from('tratamentos').update({
            remedio: nome, dose, intervalo_horas: int, observacao: obs,
            max_doses_dia: parseInt($('#et-max', f).value, 10) || null,
          }).eq('id', t.id));
        } else {
          const dias = parseFloat($('#et-dias', f).value.replace(',', '.'));
          if (!(dias > 0)) return toast('Informe a duração em dias.');
          await q(sb.rpc('editar_tratamento', {
            p_tratamento: t.id, p_remedio: nome, p_dose: dose, p_intervalo: int, p_dias: dias,
            p_proxima: deInput($('#et-prox', f).value), p_recalcular: $('#et-recalc', f).checked, p_observacao: obs,
          }));
        }
        fecharModal();
        toast('✓ Tratamento atualizado');
        render();
      } catch (e) { erro(e); }
    };
  });
}

async function modalDosesTratamento(id) {
  const t = cacheTrat.find((x) => x.id === id);
  const doses = await q(sb.from('doses').select('*').eq('tratamento_id', id).order('previsto_em'));
  const rot = { tomada: ['ok', 'Tomada'], pulada: ['atrasada', 'Pulada'], cancelada: ['futura', 'Cancelada'], pendente: ['agora', 'Pendente'] };
  abrirModal(`
    <h2>${esc(t.remedio)}</h2>
    <div class="lista">${doses.map((d) => `<div class="item item-clicavel" data-d="${d.id}">
      <div><div>${diaMes(d.previsto_em)} · previsto ${hora(d.previsto_em)}</div>
      <div class="sub">${d.tomado_em ? 'tomou às ' + hora(d.tomado_em) + (chaveDia(d.tomado_em) !== chaveDia(d.previsto_em) ? ' de ' + diaMes(d.tomado_em) : '') : '&nbsp;'}</div></div>
      <span class="etiqueta ${rot[d.status][0]}">${rot[d.status][1]}</span></div>`).join('')}</div>`, (f) => {
    $$('[data-d]', f).forEach((el) => el.onclick = () => {
      const d = doses.find((x) => x.id === el.dataset.d);
      if (d.status === 'tomada') editarDoseTomada(d);
      else if (d.status !== 'cancelada') abrirDose(d.id);
    });
  });
}

function modalTratamento(nomeInicial = '', tipoInicial = 'agendado') {
  const p = pessoaAtual();
  const inicio = new Date();
  inicio.setSeconds(0, 0);
  abrirModal(`
    <h2>Novo remédio — ${esc(p.nome)}</h2>
    <div class="segmento" id="n-tipo">
      <button data-tipo="agendado">⏰ Horário fixo</button>
      <button data-tipo="sos">🆘 Se necessário</button>
    </div>
    <p class="dica" id="n-explica"></p>
    <label class="campo"><span>Remédio</span><div class="auto" id="n-auto"><input type="text" id="n-nome" value="${esc(nomeInicial)}" placeholder="Digite para buscar" autocomplete="off"></div></label>
    <label class="campo"><span>Dose</span><input type="text" id="n-dose" placeholder="ex.: 5 ml, 1 comprimido"></label>
    <div class="linha-campos">
      <label class="campo"><span id="n-int-rot">A cada (horas)</span><input type="number" id="n-int" value="8" min="0.5" step="0.5" inputmode="decimal"></label>
      <label class="campo so-agendado"><span>Por (dias)</span><input type="number" id="n-dias" value="7" min="0.5" step="0.5" inputmode="decimal"></label>
      <label class="campo so-sos"><span>Máx. em 24h (opcional)</span><input type="number" id="n-max" min="1" step="1" inputmode="numeric" placeholder="—"></label>
    </div>
    <div class="so-agendado">
      <label class="campo"><span>Primeira dose</span><input type="datetime-local" id="n-inicio" value="${paraInput(inicio)}"></label>
      <label class="check"><input type="checkbox" id="n-ja"> <span>A primeira dose já foi dada nesse horário</span></label>
      <label class="check"><input type="checkbox" id="n-recalc" checked> <span>Se uma dose atrasar, recalcular as próximas a partir do horário em que foi dada</span></label>
    </div>
    <label class="campo"><span>Observação (opcional)</span><input type="text" id="n-obs" placeholder="ex.: só se febre acima de 37,8°C"></label>
    <p class="dica" id="n-previa"></p>
    <button class="btn primario bloco" id="n-ok"></button>`, (f) => {
    let tipo = tipoInicial;
    montarAutoRemedio($('#n-auto', f));
    const previa = () => {
      const int = parseFloat($('#n-int', f).value.replace(',', '.'));
      if (tipo === 'sos') {
        const max = parseInt($('#n-max', f).value, 10);
        $('#n-previa', f).textContent = int > 0 ? `Sem lembretes. O app mostra quando está liberado: ${fmtNum(int)}h depois da última dose${max > 0 ? `, no máximo ${max} vez(es) em 24h` : ''}.` : '';
        return;
      }
      const dias = parseFloat($('#n-dias', f).value.replace(',', '.'));
      const ini = new Date($('#n-inicio', f).value);
      if (!(int > 0 && dias > 0) || isNaN(ini)) return ($('#n-previa', f).textContent = '');
      const n = Math.max(1, Math.ceil(dias * 24 / int));
      const fim = new Date(ini.getTime() + (n - 1) * int * HORA);
      $('#n-previa', f).textContent = `${n} doses: de ${diaMes(ini)} ${hora(ini)} até ${diaMes(fim)} ${hora(fim)}.`;
    };
    const mudarTipo = (t) => {
      tipo = t;
      $$('#n-tipo button', f).forEach((b) => b.classList.toggle('ativo', b.dataset.tipo === t));
      $$('.so-agendado', f).forEach((el) => (el.hidden = t !== 'agendado'));
      $$('.so-sos', f).forEach((el) => (el.hidden = t !== 'sos'));
      $('#n-int-rot', f).textContent = t === 'sos' ? 'Intervalo mínimo (horas)' : 'A cada (horas)';
      $('#n-explica', f).textContent = t === 'sos'
        ? 'Para dar só quando precisar (dor, febre, enjoo). Não tem duração nem lembretes; o app avisa se ainda não passou o intervalo.'
        : 'Para remédios com horário certo por alguns dias. O app lembra em cada horário.';
      $('#n-ok', f).textContent = t === 'sos' ? 'Salvar' : 'Criar e ativar lembretes';
      previa();
    };
    $$('#n-tipo button', f).forEach((b) => b.onclick = () => mudarTipo(b.dataset.tipo));
    $$('input', f).forEach((i) => i.addEventListener('input', previa));
    mudarTipo(tipo);
    $('#n-ok', f).onclick = async () => {
      const nome = $('#n-nome', f).value.trim();
      const int = parseFloat($('#n-int', f).value.replace(',', '.'));
      const dias = parseFloat($('#n-dias', f).value.replace(',', '.'));
      const max = parseInt($('#n-max', f).value, 10) || null;
      const ini = deInput($('#n-inicio', f).value);
      const ja = $('#n-ja', f).checked;
      const dados = { dose: $('#n-dose', f).value.trim() || null, recalc: $('#n-recalc', f).checked, obs: $('#n-obs', f).value.trim() || null };
      if (!nome) return toast('Informe o remédio.');
      if (!(int > 0)) return toast('Informe o intervalo em horas.');
      if (tipo === 'agendado' && !(dias > 0)) return toast('Informe a quantidade de dias.');
      fecharModal();
      try {
        if (!(await garantirRemedio(nome))) return;
        const nomeFinal = acharRemedio(nome)?.nome || nome;
        if (tipo === 'sos') {
          await q(sb.from('tratamentos').insert({
            familia_id: S.familia.id, pessoa_id: p.id, remedio: nomeFinal, dose: dados.dose,
            intervalo_horas: int, dias: null, inicio: new Date().toISOString(), tipo: 'sos',
            max_doses_dia: max, recalcular: false, observacao: dados.obs,
          }));
          toast(`✓ ${nomeFinal} adicionado em "Se necessário"`);
          S.aba = 'hoje';
          return render();
        }
        if (!(await verificarAlertas(p.id, nomeFinal, ja ? ini : new Date(Math.max(Date.now(), new Date(ini))).toISOString()))) return;
        const id = await q(sb.rpc('criar_tratamento', {
          p_pessoa: p.id, p_remedio: nomeFinal, p_dose: dados.dose, p_intervalo: int, p_dias: dias,
          p_inicio: ini, p_recalcular: dados.recalc, p_observacao: dados.obs,
        }));
        if (ja) {
          const primeira = await q(sb.from('doses').select('id').eq('tratamento_id', id).order('previsto_em').limit(1).single());
          await q(sb.rpc('registrar_dose', { p_dose: primeira.id, p_status: 'tomada', p_quando: ini }));
        }
        toast(`✓ Tratamento de ${nomeFinal} criado`);
        if ('Notification' in window && Notification.permission !== 'granted') toast('Ative as notificações em Ajustes para receber os lembretes.');
        S.aba = 'tratamentos';
        render();
      } catch (e) { erro(e); }
    };
  });
}

// ============================================================
// ABA AJUSTES
// ============================================================
async function htmlAjustes() {
  const convites = await q(sb.from('convites').select('*').eq('familia_id', S.familia.id).is('aceito_em', null));
  const instalado = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const permissao = 'Notification' in window ? Notification.permission : 'indisponível';
  const notifTexto = { granted: '✅ Ativadas neste aparelho', denied: '🚫 Bloqueadas — libere em Ajustes do iPhone › Notificações › Remédios', default: 'Ainda não ativadas', 'indisponível': instalado ? 'Este aparelho não suporta (precisa de iOS 16.4 ou mais novo)' : 'Abra o app pelo ícone da Tela de Início para ativar' }[permissao];

  return `
    <div class="secao-titulo">Notificações</div>
    <div class="cartao">
      <div style="margin-bottom:10px">${notifTexto}</div>
      <div class="botoes">
        <button class="btn primario pequeno" id="aj-ativar">${permissao === 'granted' ? 'Reativar' : 'Ativar'}</button>
        <button class="btn pequeno" id="aj-testar">Enviar teste</button>
      </div>
    </div>

    <div class="secao-titulo">Pessoas acompanhadas</div>
    <div class="lista">
      ${S.pessoas.map((p) => `<div class="item item-clicavel" data-pessoa="${p.id}"><div>${esc(p.nome)}</div><span class="sub">Editar ›</span></div>`).join('')}
      <div class="item item-clicavel" id="aj-add-pessoa"><div style="color:var(--primaria);font-weight:600">+ Adicionar pessoa</div></div>
    </div>

    <div class="secao-titulo">Quem cuida junto (${esc(S.familia.nome || 'Família')})</div>
    <div class="lista">
      ${S.membros.map((m) => `<div class="item"><div>${esc(m.email || 'membro')}${m.user_id === S.usuario.id ? ' <span class="sub">(você)</span>' : ''}</div></div>`).join('')}
      ${convites.map((c) => `<div class="item"><div>${esc(c.email)} <span class="sub">· convite pendente</span></div><button class="btn pequeno perigo" data-conv="${c.id}">Cancelar</button></div>`).join('')}
    </div>
    <div class="cartao">
      <label class="campo" style="margin-bottom:8px"><span>Convidar por e-mail</span><input type="email" id="aj-email" placeholder="email@exemplo.com"></label>
      <button class="btn primario pequeno bloco" id="aj-convidar">Convidar</button>
      <p class="dica" style="margin:8px 0 0">A pessoa convidada abre o mesmo link do app e cria a conta com esse e-mail. Ela entra direto na família e recebe os mesmos lembretes.</p>
    </div>

    <div class="secao-titulo">Remédios cadastrados pela família</div>
    <div class="lista">
      ${S.remediosFamilia.length ? S.remediosFamilia.map((r) => `<div class="item item-clicavel" data-rem="${r.id}"><div><div>${esc(r.nome)}</div><div class="sub">${esc([r.principio_ativo, r.classe].filter(Boolean).join(' · ') || 'sem detalhes')}</div></div><span class="sub">›</span></div>`).join('') : '<div class="item"><div class="sub">Nenhum. Remédios fora da base aparecem aqui.</div></div>'}
    </div>

    <div class="secao-titulo">Dados</div>
    <div class="lista">
      <div class="item item-clicavel" id="aj-importar"><div>⬇️ Importar anotações em texto</div><span class="sub">›</span></div>
    </div>

    <div class="secao-titulo">Conta</div>
    <div class="lista">
      <div class="item"><div>${esc(S.usuario.email)}</div></div>
      <div class="item item-clicavel" id="aj-senha"><div>Alterar senha</div><span class="sub">›</span></div>
      <div class="item item-clicavel" id="aj-sair"><div style="color:var(--vermelho)">Sair</div></div>
    </div>
    <p class="dica" style="text-align:center;margin-top:16px">Este app registra e lembra. Ele não substitui a orientação do médico.</p>`;
}

function ligarAjustes() {
  $('#aj-ativar').onclick = ativarNotificacoes;
  $('#aj-testar').onclick = async () => {
    try {
      const { data, error } = await sb.functions.invoke('lembretes', { body: { acao: 'teste' } });
      if (error) throw error;
      toast(data.envios ? `Teste enviado para ${data.envios} aparelho(s).` : 'Nenhum aparelho com notificação ativa. Toque em Ativar.');
    } catch (e) { erro(e); }
  };
  $$('[data-pessoa]').forEach((el) => el.onclick = () => modalPessoa(S.pessoas.find((p) => p.id === el.dataset.pessoa)));
  $('#aj-add-pessoa').onclick = () => modalPessoa(null);
  $('#aj-convidar').onclick = async () => {
    const email = $('#aj-email').value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('E-mail inválido.');
    try {
      await q(sb.from('convites').insert({ familia_id: S.familia.id, email }));
      toast('Convite criado. Envie o link do app para essa pessoa.', [{ rotulo: 'Copiar link', fn: () => navigator.clipboard.writeText(location.origin + location.pathname) }], 8000);
      render();
    } catch (e) { erro(e.code === '23505' ? 'Esse e-mail já foi convidado.' : e); }
  };
  $$('[data-conv]').forEach((b) => b.onclick = async () => { await sb.from('convites').delete().eq('id', b.dataset.conv); render(); });
  $$('[data-rem]').forEach((el) => el.onclick = () => modalRemedioFamilia(S.remediosFamilia.find((r) => r.id === el.dataset.rem)));
  $('#aj-importar').onclick = modalImportar;
  $('#aj-senha').onclick = telaNovaSenha;
  $('#aj-sair').onclick = async () => { await sb.auth.signOut(); };
}

function modalPessoa(p) {
  abrirModal(`
    <h2>${p ? 'Editar pessoa' : 'Nova pessoa'}</h2>
    <label class="campo"><span>Nome</span><input type="text" id="p-nome" value="${esc(p?.nome || '')}"></label>
    <div class="botoes">
      ${p ? '<button class="btn perigo" id="p-del">Remover</button>' : ''}
      <button class="btn primario" id="p-ok">Salvar</button>
    </div>`, (f) => {
    $('#p-ok', f).onclick = async () => {
      const nome = $('#p-nome', f).value.trim();
      if (!nome) return;
      try {
        if (p) await q(sb.from('pessoas').update({ nome }).eq('id', p.id));
        else await q(sb.from('pessoas').insert({ familia_id: S.familia.id, nome }));
        await recarregarCadastros(); fecharModal(); render();
      } catch (e) { erro(e); }
    };
    $('#p-del', f)?.addEventListener('click', async () => {
      if (S.pessoas.length === 1) return toast('Mantenha pelo menos uma pessoa.');
      if (!(await confirmar('Remover pessoa?', `${esc(p.nome)} some da lista. O histórico fica guardado.`, 'Remover', true))) return;
      try { await q(sb.from('pessoas').update({ ativo: false }).eq('id', p.id)); await recarregarCadastros(); render(); } catch (e) { erro(e); }
    });
  });
}

function modalRemedioFamilia(r) {
  const opcoes = Object.values(CLASSES).sort().map((c) => `<option ${c === r.classe ? 'selected' : ''}>${esc(c)}</option>`).join('');
  abrirModal(`
    <h2>${esc(r.nome)}</h2>
    <label class="campo"><span>Princípio ativo</span><input type="text" id="r-princ" value="${esc(r.principio_ativo || '')}"></label>
    <label class="campo"><span>Para que serve</span><select id="r-classe"><option value="">—</option>${opcoes}</select></label>
    <div class="botoes">
      <button class="btn perigo" id="r-del">Excluir</button>
      <button class="btn primario" id="r-ok">Salvar</button>
    </div>`, (f) => {
    $('#r-ok', f).onclick = async () => {
      try {
        await q(sb.from('remedios_familia').update({ principio_ativo: $('#r-princ', f).value.trim() || null, classe: $('#r-classe', f).value || null }).eq('id', r.id));
        await recarregarCadastros(); fecharModal(); render();
      } catch (e) { erro(e); }
    };
    $('#r-del', f).onclick = async () => {
      try { await q(sb.from('remedios_familia').delete().eq('id', r.id)); await recarregarCadastros(); fecharModal(); render(); } catch (e) { erro(e); }
    };
  });
}

// ============================================================
// NOTIFICAÇÕES (Web Push)
// ============================================================
function base64ParaUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function salvarInscricao(sub) {
  const j = sub.toJSON();
  await q(sb.from('dispositivos').upsert({
    user_id: S.usuario.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' }));
}

async function ativarNotificacoes() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return toast('No iPhone, abra o app pelo ícone da Tela de Início (iOS 16.4 ou mais novo).', [], 8000);
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Permissão negada. Libere em Ajustes do iPhone › Notificações › Remédios.', [], 8000);
    const reg = await navigator.serviceWorker.ready;
    const chave = await q(sb.rpc('chave_publica_vapid'));
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(chave) });
    await salvarInscricao(sub);
    toast('✅ Notificações ativadas neste aparelho');
    render();
  } catch (e) { erro(e); }
}

async function sincronizarInscricaoPush() {
  try {
    if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await salvarInscricao(sub);
  } catch (e) { console.warn(e); }
}

function abrirDoseDaUrl() {
  const id = new URLSearchParams(location.search).get('dose');
  if (id) {
    history.replaceState(null, '', location.pathname);
    abrirDose(id);
  }
}

// ============================================================
// INÍCIO
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(console.warn);
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.dose && S.usuario) abrirDose(e.data.dose);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.familia && !S.modalAberto && $('#conteudo')) render();
});
setInterval(() => {
  if (document.visibilityState === 'visible' && S.familia && !S.modalAberto && S.aba === 'hoje' && $('#conteudo')) render();
}, 60e3);

let usuarioAtual = null;
sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'PASSWORD_RECOVERY') setTimeout(telaNovaSenha, 300);
  const u = sessao?.user || null;
  if (u?.id === usuarioAtual) return;
  usuarioAtual = u?.id || null;
  if (u) setTimeout(() => iniciarSessao(u), 0);
  else { Object.assign(S, { usuario: null, familia: null, pessoas: [] }); telaLogin(); }
});
