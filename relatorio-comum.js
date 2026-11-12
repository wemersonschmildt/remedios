// Montagem do relatório de saúde (usado no app e na página do link para o médico).
// Entrada: { pessoa, periodo, atendimentos, anexos, vacinas, tratamentos, doses, eventos, consultas, gerado_em }
// Saída: seções que viram HTML (renderRelatorioHTML) ou PDF (gerarRelatorioPDF).

const RL_FUSO = 'America/Sao_Paulo';
const rlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rlHora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: RL_FUSO });
const rlData = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: RL_FUSO });
const rlDataHora = (d) => `${rlData(d)} ${rlHora(d)}`;
const rlDiaSemana = (d) => new Date(d).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: RL_FUSO }).replace('.', '');
const rlDataSimples = (s) => { if (!s) return ''; const [a, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const rlNum = (n) => String(+n).replace('.', ',');

function rlIdade(nasc) {
  if (!nasc) return '';
  const [a, m, d] = String(nasc).slice(0, 10).split('-').map(Number);
  const hoje = new Date();
  let anos = hoje.getFullYear() - a;
  let meses = hoje.getMonth() + 1 - m;
  if (hoje.getDate() < d) meses--;
  if (meses < 0) { anos--; meses += 12; }
  if (anos < 2) return `${anos * 12 + meses} meses`;
  return `${anos} anos${anos < 12 && meses ? ` e ${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''}`;
}

const RL_SUFIXO = { Febre: ' °C', 'Bebeu líquido': ' ml' };

function montarSecoesRelatorio(d) {
  const p = d.pessoa || {};
  const secoes = [];

  // Identificação
  const ident = [
    ['Nome', p.nome],
    ['Idade', p.nascimento ? `${rlIdade(p.nascimento)} (nasc. ${rlDataSimples(p.nascimento)})` : ''],
    ['Peso', p.peso_kg ? `${rlNum(p.peso_kg)} kg` : ''],
    ['Altura', p.altura_cm ? `${rlNum(p.altura_cm)} cm` : ''],
    ['Tipo sanguíneo', p.tipo_sanguineo],
    ['Plano de saúde', [p.plano_saude, p.plano_carteirinha ? `carteirinha ${p.plano_carteirinha}` : ''].filter(Boolean).join(' — ')],
  ].filter(([, v]) => v);
  secoes.push({ titulo: 'Identificação', blocos: [{ pares: ident }] });

  secoes.push({
    titulo: 'Alergias',
    destaque: !!p.alergias,
    blocos: [{ texto: p.alergias || 'Nenhuma alergia informada.' }],
  });

  const saude = [
    ['Condições de saúde', p.condicoes],
    ['Remédios de uso contínuo', p.uso_continuo],
    ['Médicos de confiança', p.medicos_confianca],
    ['Observações', p.observacoes_saude],
  ].filter(([, v]) => v);
  if (saude.length) secoes.push({ titulo: 'Histórico de saúde', blocos: [{ pares: saude }] });

  // Resumo do período
  const resumo = [];
  const porEvento = {};
  for (const e of d.eventos || []) (porEvento[e.tipo] ??= []).push(e);
  for (const [tipo, lista] of Object.entries(porEvento)) {
    let txt = `${lista.length} registro(s), de ${rlDataHora(lista[0].ocorrido_em)} a ${rlDataHora(lista.at(-1).ocorrido_em)}`;
    if (tipo === 'Febre') {
      const vals = lista.map((e) => parseFloat(String(e.valor || '').replace(',', '.'))).filter((x) => !isNaN(x));
      if (vals.length) txt += ` — máxima ${rlNum(Math.max(...vals))} °C`;
    }
    resumo.push([tipo, txt]);
  }
  const porRemedio = {};
  for (const x of d.doses || []) (porRemedio[x.remedio] ??= []).push(x);
  for (const [rem, lista] of Object.entries(porRemedio)) {
    resumo.push([rem, `${lista.length} dose(s), última em ${rlDataHora(lista.at(-1).tomado_em)}`]);
  }
  if (resumo.length) secoes.push({ titulo: 'Resumo do período', blocos: [{ pares: resumo }] });

  // Próximas consultas
  if ((d.consultas || []).length) {
    secoes.push({
      titulo: 'Próximas consultas',
      blocos: [{ linhas: d.consultas.map((c) => `${rlDataHora(c.data_hora)} — ${[c.especialidade, c.medico, c.local].filter(Boolean).join(' · ')}${c.observacao ? ` (${c.observacao})` : ''}`) }],
    });
  }

  // Atendimentos
  const anexosPorAt = {};
  for (const a of d.anexos || []) (anexosPorAt[a.atendimento_id || '-'] ??= []).push(a);
  if ((d.atendimentos || []).length) {
    secoes.push({
      titulo: 'Atendimentos médicos',
      blocos: d.atendimentos.map((a) => ({
        subtitulo: `${rlDataHora(a.data_hora)} — ${a.tipo}${a.especialidade ? ' · ' + a.especialidade : ''}${a.medico ? ' · ' + a.medico : ''}`,
        pares: [
          ['Local', a.local],
          ['Motivo / sintomas', a.motivo],
          ['Sinais', [a.temperatura && `temp. ${a.temperatura} °C`, a.peso && `peso ${a.peso} kg`, a.pressao && `PA ${a.pressao}`, a.saturacao && `sat. ${a.saturacao}%`].filter(Boolean).join(' · ')],
          ['Diagnóstico', a.diagnostico],
          ['Orientações', a.orientacoes],
          ['Exames pedidos', a.exames_pedidos],
          ['Resultados de exames', a.exames_resultados],
          ['Receita', a.receita],
          ['Observações', a.observacoes],
          ['Anexos', (anexosPorAt[a.id] || []).map((x) => x.nome).join(', ')],
        ].filter(([, v]) => v),
        anexos: anexosPorAt[a.id] || [],
      })),
    });
  }

  // Remédios
  if ((d.tratamentos || []).length) {
    secoes.push({
      titulo: 'Remédios prescritos / em uso',
      blocos: [{
        linhas: d.tratamentos.map((t) => t.tipo === 'sos'
          ? `${t.remedio}${t.dose ? ' ' + t.dose : ''} — se necessário, intervalo mínimo ${rlNum(t.intervalo_horas)}h${t.max_doses_dia ? `, máx. ${t.max_doses_dia} em 24h` : ''}${t.ativo ? '' : ' (encerrado)'}${t.observacao ? ` — ${t.observacao}` : ''}`
          : `${t.remedio}${t.dose ? ' ' + t.dose : ''} — de ${rlNum(t.intervalo_horas)} em ${rlNum(t.intervalo_horas)}h por ${rlNum(t.dias)} dia(s), início ${rlDataHora(t.inicio)}${t.ativo ? '' : ' (encerrado)'}${t.observacao ? ` — ${t.observacao}` : ''}`),
      }],
    });
  }

  // Diário por dia
  const dias = new Map();
  const add = (quando, nome, txt) => {
    const k = new Date(quando).toLocaleDateString('en-CA', { timeZone: RL_FUSO });
    if (!dias.has(k)) dias.set(k, { quando, grupos: new Map() });
    const g = dias.get(k).grupos;
    if (!g.has(nome)) g.set(nome, []);
    g.get(nome).push(txt);
  };
  for (const x of d.doses || []) add(x.tomado_em, x.remedio, rlHora(x.tomado_em));
  for (const e of d.eventos || []) add(e.ocorrido_em, e.tipo, rlHora(e.ocorrido_em) + (e.valor ? ` (${e.valor}${RL_SUFIXO[e.tipo] || ''})` : ''));
  for (const a of d.atendimentos || []) add(a.data_hora, `[${a.tipo}]`, rlHora(a.data_hora));
  if (dias.size) {
    secoes.push({
      titulo: 'Diário: remédios e sintomas por dia',
      blocos: [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => ({
        subtitulo: `${rlData(v.quando)} (${rlDiaSemana(v.quando)})`,
        linhas: [...v.grupos.entries()].map(([nome, hs]) => `${nome}: ${hs.join('  ')}`),
      })),
    });
  }

  // Vacinas
  if ((d.vacinas || []).length) {
    secoes.push({
      titulo: 'Vacinas',
      blocos: [{ linhas: d.vacinas.map((v) => `${v.data ? rlDataSimples(v.data) + ' — ' : ''}${v.vacina}${v.dose ? ' (' + v.dose + ')' : ''}${v.local ? ' · ' + v.local : ''}${v.lote ? ' · lote ' + v.lote : ''}`) }],
    });
  }

  // Anexos sem atendimento
  if ((anexosPorAt['-'] || []).length) {
    secoes.push({ titulo: 'Outros anexos', blocos: [{ linhas: anexosPorAt['-'].map((a) => a.nome), anexos: anexosPorAt['-'] }] });
  }
  return secoes;
}

function textoPeriodo(periodo) {
  if (!periodo || (!periodo.de && !periodo.ate)) return 'Todo o histórico';
  return `De ${periodo.de ? rlDataSimples(periodo.de) : 'início'} até ${periodo.ate ? rlDataSimples(periodo.ate) : 'hoje'}`;
}

function renderRelatorioHTML(d) {
  const secoes = montarSecoesRelatorio(d);
  let h = `<div class="rel-cab"><h1>Histórico de saúde — ${rlEsc(d.pessoa?.nome)}</h1>
    <div class="rel-sub">${rlEsc(textoPeriodo(d.periodo))} · gerado em ${rlDataHora(d.gerado_em || new Date())}</div></div>`;
  for (const s of secoes) {
    h += `<section class="rel-secao ${s.destaque ? 'rel-destaque' : ''}"><h2>${s.destaque ? '⚠️ ' : ''}${rlEsc(s.titulo)}</h2>`;
    for (const b of s.blocos) {
      h += `<div class="rel-bloco">`;
      if (b.subtitulo) h += `<h3>${rlEsc(b.subtitulo)}</h3>`;
      if (b.texto) h += `<p>${rlEsc(b.texto).replace(/\n/g, '<br>')}</p>`;
      if (b.pares) h += `<dl>${b.pares.map(([k, v]) => `<dt>${rlEsc(k)}</dt><dd>${rlEsc(v).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>`;
      if (b.linhas) h += `<ul>${b.linhas.map((l) => `<li>${rlEsc(l)}</li>`).join('')}</ul>`;
      if (b.anexos?.length) {
        h += `<div class="rel-anexos">${b.anexos.map((a) => a.url
          ? (String(a.tipo_mime).startsWith('image/')
            ? `<a href="${rlEsc(a.url)}" target="_blank" rel="noopener"><img src="${rlEsc(a.url)}" alt="${rlEsc(a.nome)}"><span>${rlEsc(a.nome)}</span></a>`
            : `<a href="${rlEsc(a.url)}" target="_blank" rel="noopener" class="rel-arq">📄 <span>${rlEsc(a.nome)}</span></a>`)
          : '').join('')}</div>`;
      }
      h += `</div>`;
    }
    h += `</section>`;
  }
  h += `<p class="rel-rodape">Registros feitos pela família no app Remédios. Não substituem o prontuário médico.</p>`;
  return h;
}

// Carrega o jsPDF sob demanda
function carregarJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    s.onload = () => ok(window.jspdf.jsPDF);
    s.onerror = () => erro(new Error('Não foi possível carregar o gerador de PDF. Verifique a internet.'));
    document.head.appendChild(s);
  });
}

// Remove caracteres que a fonte padrão do PDF não tem (emojis etc.)
const rlPdfTexto = (s) => String(s ?? '').replace(/[^\u0000-ÿ–—•]/g, '').replace(/–|—/g, '-');

async function imagemParaDataURL(url, maxLado = 1400) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  const esc = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * esc);
  c.height = Math.round(bmp.height * esc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
}

async function gerarRelatorioPDF(d) {
  const jsPDF = await carregarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 15, R = 195, W = R - L, ALT = 297, BASE = 282;
  let y = 18;
  const nome = rlPdfTexto(d.pessoa?.nome);

  const rodape = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`Histórico de saúde - ${nome} - página ${i} de ${n}`, L, 290);
      doc.text('Registros feitos pela família. Não substituem o prontuário médico.', R, 290, { align: 'right' });
    }
  };
  const quebra = (h) => { if (y + h > BASE) { doc.addPage(); y = 18; } };
  const escrever = (texto, { tam = 10, negrito = false, cor = 30, recuo = 0, espaco = 1.2 } = {}) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tam);
    if (Array.isArray(cor)) doc.setTextColor(...cor); else doc.setTextColor(cor);
    const linhas = doc.splitTextToSize(rlPdfTexto(texto), W - recuo);
    const lh = tam * 0.3528 * 1.35;
    for (const l of linhas) { quebra(lh); doc.text(l, L + recuo, y); y += lh; }
    y += espaco;
  };

  // "Rótulo: valor" na mesma linha, com recuo nas linhas seguintes
  const parRotulo = (k, v) => {
    const tam = 9.5, lh = tam * 0.3528 * 1.35;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(tam);
    const rot = rlPdfTexto(k) + ': ';
    const lw = Math.min(doc.getTextWidth(rot), 55);
    doc.setFont('helvetica', 'normal');
    const linhas = doc.splitTextToSize(rlPdfTexto(v), W - 2 - lw);
    linhas.forEach((l, i) => {
      quebra(lh);
      if (i === 0) { doc.setFont('helvetica', 'bold'); doc.setTextColor(90); doc.text(rot, L + 2, y); }
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30);
      doc.text(l, L + 2 + lw, y);
      y += lh;
    });
    y += 0.8;
  };

  escrever(`Histórico de saúde - ${nome}`, { tam: 17, negrito: true, espaco: 0.5 });
  escrever(`${textoPeriodo(d.periodo)} - gerado em ${rlDataHora(d.gerado_em || new Date())}`, { tam: 9, cor: 110, espaco: 4 });

  for (const s of montarSecoesRelatorio(d)) {
    quebra(14);
    if (s.destaque) { doc.setFillColor(253, 236, 236); doc.rect(L - 2, y - 5, W + 4, 8, 'F'); }
    escrever(s.destaque ? `ATENÇÃO - ${s.titulo.toUpperCase()}` : s.titulo.toUpperCase(), { tam: 11, negrito: true, cor: s.destaque ? [200, 30, 30] : [40, 80, 200], espaco: 1.5 });
    for (const b of s.blocos) {
      if (b.subtitulo) escrever(b.subtitulo, { tam: 10, negrito: true, espaco: 0.8 });
      if (b.texto) escrever(b.texto, { tam: s.destaque ? 11 : 10, negrito: !!s.destaque });
      for (const [k, v] of b.pares || []) parRotulo(k, v);
      for (const l of b.linhas || []) escrever(`• ${l}`, { tam: 9.5, recuo: 2, espaco: 0.3 });
      y += 2;
    }
    y += 2;
  }

  // Imagens anexadas no fim
  const imagens = (d.anexos || []).filter((a) => a.url && String(a.tipo_mime).startsWith('image/')).slice(0, 30);
  for (const a of imagens) {
    try {
      const img = await imagemParaDataURL(a.url);
      doc.addPage(); y = 18;
      escrever(`Anexo: ${a.nome}`, { tam: 10, negrito: true, espaco: 2 });
      const maxW = W, maxH = BASE - y;
      const esc = Math.min(maxW / img.w, maxH / img.h);
      doc.addImage(img.dataUrl, 'JPEG', L, y, img.w * esc, img.h * esc);
    } catch (e) { console.warn('Anexo não incluído', a.nome, e); }
  }
  rodape();
  return doc.output('blob');
}

async function compartilharPDF(blob, nomeArquivo) {
  const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: nomeArquivo }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo; a.target = '_blank';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
