// Condições que restringem remédios. Os nomes são princípios ativos (sem acento, minúsculos),
// comparados (sem acento) com os princípios da base de remédios e com o nome digitado.
// Listas montadas a partir de: MSD Manuals, BNF (Reino Unido), revisão de Youngster et al. (Drug Saf 2010),
// American Family Physician (2005) e materiais da Sociedade Brasileira de Pediatria.
// As fontes divergem em vários itens: a lista é um apoio e não substitui o pediatra/hematologista.

const RESTRICOES = {
  G6PD: {
    nome: 'Deficiência de G6PD',
    curto: 'G6PD',
    evitar: [
      'dapsona', 'primaquina', 'tafenoquina', 'pamaquina', 'rasburicase', 'pegloticase',
      'azul de metileno', 'cloreto de metiltionínio', 'azul de toluidina',
      'nitrofurantoína', 'nitrofurazona', 'furazolidona', 'fenazopiridina',
      'sulfametoxazol', 'sulfadiazina', 'sulfassalazina', 'sulfacetamida', 'sulfanilamida', 'sulfapiridina',
      'ácido nalidíxico', 'ciprofloxacino', 'levofloxacino', 'norfloxacino', 'ofloxacino', 'moxifloxacino',
      'niridazol', 'fenilhidrazina', 'naftaleno', 'naftalina', 'flutamida',
    ],
    cautela: [
      'ácido acetilsalicílico (AAS)', 'cloroquina', 'hidroxicloroquina', 'quinina', 'quinidina', 'cloranfenicol',
      'ácido ascórbico (vitamina C)', 'menadiona', 'vitamina k', 'probenecida', 'isoniazida', 'levodopa',
      'glibenclamida', 'fenitoína', 'difenidramina', 'trimetoprima', 'mesalazina', 'hena',
    ],
    outros: 'Evitar também: feijão-fava, bolinhas de naftalina (e roupas guardadas com elas), hena (tatuagem/tintura), água tônica (tem quinina) e alguns corantes azuis. Infecções e febre também podem desencadear crise — procure o médico se houver urina escura (cor de coca-cola), palidez, cansaço ou pele/olhos amarelados.',
    observacao: 'Paracetamol e dipirona aparecem em algumas listas antigas, mas em doses habituais costumam ser usados — confirme com o pediatra. Vacinas do calendário são liberadas (SBP).',
  },
};

// Remédios extras na base para que os nomes comerciais sejam reconhecidos
BASE_REMEDIOS.push(
  ['Dapsona', ['dapsona'], ['ATB']],
  ['Primaquina', ['primaquina'], ['ATB']],
  ['Cloroquina', ['cloroquina'], ['ATB']],
  ['Hidroxicloroquina', ['hidroxicloroquina'], ['ATB']],
  ['Plaquinol', ['hidroxicloroquina'], ['ATB']],
  ['Azul de metileno', ['azul de metileno'], ['ATB']],
  ['Sulfassalazina', ['sulfassalazina'], ['ATB']],
  ['Azulfidine', ['sulfassalazina'], ['ATB']],
  ['Sulfadiazina', ['sulfadiazina'], ['ATB']],
  ['Sulfadiazina de prata (pomada)', ['sulfadiazina'], ['PELE', 'ATB']],
  ['Fenazopiridina', ['fenazopiridina'], ['ANALG']],
  ['Pyridium', ['fenazopiridina'], ['ANALG']],
  ['Cloranfenicol', ['cloranfenicol'], ['ATB']],
  ['Ácido nalidíxico', ['ácido nalidíxico'], ['ATB']],
  ['Norfloxacino', ['norfloxacino'], ['ATB']],
  ['Ofloxacino', ['ofloxacino'], ['ATB']],
  ['Moxifloxacino', ['moxifloxacino'], ['ATB']],
  ['Furazolidona', ['furazolidona'], ['ATB']],
  ['Nitrofurazona (pomada)', ['nitrofurazona'], ['PELE', 'ATB']],
  ['Furacin', ['nitrofurazona'], ['PELE', 'ATB']],
  ['Quinina', ['quinina'], ['ATB']],
  ['Vitamina K', ['vitamina K'], ['VITA']],
  ['Isoniazida', ['isoniazida'], ['ATB']],
  ['Glibenclamida', ['glibenclamida'], ['DIAB']],
  ['Daonil', ['glibenclamida'], ['DIAB']],
  ['Fenitoína', ['fenitoína'], ['ANSIED']],
  ['Hidantal', ['fenitoína'], ['ANSIED']],
  ['Difenidramina', ['difenidramina'], ['ALERG']],
  ['Mesalazina', ['mesalazina'], ['GASTRO']],
  ['Probenecida', ['probenecida'], ['ANALG']],
);

// Verifica restrições da pessoa para um remédio. Retorna { nivel: 'evitar'|'cautela', condicao, termo } ou null.
function restricaoRemedio(pessoa, nome) {
  const conds = pessoa?.condicoes_especiais || [];
  if (!conds.length) return null;
  const r = acharRemedio(nome);
  const termos = [...new Set([nome, ...(r ? r.principios : [])].map(norm).filter(Boolean))];
  let achado = null;
  for (const c of conds) {
    const def = RESTRICOES[c];
    if (!def) continue;
    for (const nivel of ['evitar', 'cautela']) {
      const casa = (x, p) => { const n = norm(p).replace(/\s*\(.*\)$/, ''); return x === n || x.includes(n); };
      const t = termos.find((x) => def[nivel].some((p) => casa(x, p)));
      if (t && (!achado || (nivel === 'evitar' && achado.nivel === 'cautela'))) {
        achado = { nivel, condicao: def, termo: def[nivel].find((p) => norm(p).replace(/\s*\(.*\)$/, '') === t) || def[nivel].find((p) => casa(t, p)) };
      }
    }
  }
  return achado;
}

function mensagemRestricao(pessoa, nome) {
  const r = restricaoRemedio(pessoa, nome);
  if (!r) return null;
  return r.nivel === 'evitar'
    ? `⛔ <strong>${esc(r.condicao.nome)}:</strong> ${esc(nome)} contém <strong>${esc(r.termo)}</strong>, que está na lista de substâncias a <strong>EVITAR</strong>. Só dê com orientação expressa do médico que sabe da ${esc(r.condicao.curto)}.`
    : `⚠️ <strong>${esc(r.condicao.nome)}:</strong> ${esc(nome)} contém <strong>${esc(r.termo)}</strong>, que algumas listas pedem para usar <strong>com cautela</strong>. Confirme com o médico.`;
}

function modalRestricoes(chave = 'G6PD') {
  const d = RESTRICOES[chave];
  const lista = (arr) => arr.map((x) => `<span class="tag-rest">${esc(x)}</span>`).join(' ');
  abrirModal(`
    <h2>🧬 ${esc(d.nome)}</h2>
    <div class="secao-titulo" style="color:var(--vermelho)">⛔ Evitar</div>
    <div class="cartao">${lista(d.evitar)}</div>
    <div class="secao-titulo" style="color:var(--laranja)">⚠️ Usar com cautela</div>
    <div class="cartao">${lista(d.cautela)}</div>
    <div class="secao-titulo">Outros cuidados</div>
    <div class="cartao">${esc(d.outros)}</div>
    <p class="dica">${esc(d.observacao)}</p>
    <p class="dica">As listas oficiais divergem em alguns itens. O app avisa, mas a palavra final é do pediatra ou hematologista. Leve a lista às consultas.</p>`);
}
