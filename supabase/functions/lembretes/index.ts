// Envia as notificações de remédio e de consultas (chamado a cada minuto pelo pg_cron)
// e também a notificação de teste pedida pelo app.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import webpush from 'npm:web-push@3.6.7'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 })
const FUSO = 'America/Sao_Paulo'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function obterConfig(chave: string): Promise<string | null> {
  const r = await sql`select valor from privado.config where chave = ${chave}`
  return r.length ? r[0].valor : null
}

// Gera as chaves VAPID na primeira execução e guarda no banco
async function prepararVapid() {
  let publica = await obterConfig('vapid_publica')
  let privada = await obterConfig('vapid_privada')
  if (!publica || !privada) {
    const k = webpush.generateVAPIDKeys()
    await sql`insert into privado.config (chave, valor) values ('vapid_publica', ${k.publicKey}) on conflict do nothing`
    await sql`insert into privado.config (chave, valor) values ('vapid_privada', ${k.privateKey}) on conflict do nothing`
    publica = await obterConfig('vapid_publica')
    privada = await obterConfig('vapid_privada')
  }
  webpush.setVapidDetails('mailto:lembretes@remedios.app', publica!, privada!)
}

type Dispositivo = { id: string; endpoint: string; p256dh: string; auth: string; familia_id?: string }

async function enviar(disp: Dispositivo, carga: Record<string, unknown>) {
  try {
    await webpush.sendNotification(
      { endpoint: disp.endpoint, keys: { p256dh: disp.p256dh, auth: disp.auth } },
      JSON.stringify(carga),
      { TTL: 3600, urgency: 'high' },
    )
    return true
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    // Inscrição expirada ou removida: apaga o dispositivo
    if (status === 404 || status === 410) {
      await sql`delete from public.dispositivos where id = ${disp.id}`
    } else {
      console.error('Falha ao enviar push', status, (e as Error).message)
    }
    return false
  }
}

function horaBR(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
}
function diaBR(d: Date) {
  return d.toLocaleDateString('pt-BR', { timeZone: FUSO })
}
function quandoBR(d: Date) {
  const hoje = diaBR(new Date())
  const amanha = diaBR(new Date(Date.now() + 86400e3))
  const dia = diaBR(d)
  const rot = dia === hoje ? 'hoje' : dia === amanha ? 'amanhã' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO })
  return `${rot} às ${horaBR(d)}`
}

async function dispositivosDas(familias: string[]): Promise<Dispositivo[]> {
  if (!familias.length) return []
  return await sql`
    select dv.id, dv.endpoint, dv.p256dh, dv.auth, m.familia_id
      from public.dispositivos dv
      join public.membros m on m.user_id = dv.user_id
     where m.familia_id in ${sql(familias)}` as unknown as Dispositivo[]
}

async function processarDoses() {
  // Marca as doses vencidas como notificadas (repete a cada 15 min, até 4 vezes)
  const doses = await sql`
    update public.doses d
       set notificado_em = now(), notificacoes = d.notificacoes + 1
     where d.id in (
       select id from public.doses
        where status = 'pendente'
          and previsto_em <= now()
          and notificacoes < 4
          and (notificado_em is null or notificado_em <= now() - interval '15 minutes')
        for update skip locked
     )
    returning d.id, d.familia_id, d.remedio, d.dose, d.previsto_em, d.notificacoes,
              (select p.nome from public.pessoas p where p.id = d.pessoa_id) as pessoa`

  if (!doses.length) return 0
  const dispositivos = await dispositivosDas([...new Set(doses.map((d) => d.familia_id))])
  let envios = 0
  for (const d of doses) {
    const reforco = d.notificacoes > 1 ? ' (lembrete de novo)' : ''
    const carga = {
      title: `💊 ${d.pessoa}: ${d.remedio}`,
      body: `${d.dose ? d.dose + ' — ' : ''}previsto para ${horaBR(new Date(d.previsto_em))}${reforco}. Toque para confirmar.`,
      tag: `dose-${d.id}`,
      url: `./?dose=${d.id}`,
    }
    for (const disp of dispositivos.filter((x) => x.familia_id === d.familia_id)) {
      if (await enviar(disp, carga)) envios++
    }
  }
  return envios
}

async function processarConsultas() {
  // Lembrete do dia anterior (entre 24h e 2h antes)
  const vespera = await sql`
    update public.consultas c set lembrete_1d_em = now()
     where c.id in (
       select id from public.consultas
        where status = 'agendada' and lembrete_1d_em is null
          and data_hora > now() + interval '2 hours'
          and data_hora <= now() + interval '24 hours'
        for update skip locked)
    returning c.*, (select p.nome from public.pessoas p where p.id = c.pessoa_id) as pessoa`
  // Lembrete de 2 horas antes
  const proximas = await sql`
    update public.consultas c set lembrete_2h_em = now(), lembrete_1d_em = coalesce(c.lembrete_1d_em, now())
     where c.id in (
       select id from public.consultas
        where status = 'agendada' and lembrete_2h_em is null
          and data_hora > now()
          and data_hora <= now() + interval '2 hours'
        for update skip locked)
    returning c.*, (select p.nome from public.pessoas p where p.id = c.pessoa_id) as pessoa`

  const todas = [...vespera, ...proximas]
  if (!todas.length) return 0
  const dispositivos = await dispositivosDas([...new Set(todas.map((c) => c.familia_id))])
  let envios = 0
  for (const c of todas) {
    const quem = [c.especialidade, c.medico].filter(Boolean).join(' · ') || 'Consulta'
    const carga = {
      title: `📅 ${c.pessoa}: consulta ${quandoBR(new Date(c.data_hora))}`,
      body: [quem, c.local, c.observacao].filter(Boolean).join(' — '),
      tag: `consulta-${c.id}`,
      url: `./?consulta=${c.id}`,
    }
    for (const disp of dispositivos.filter((x) => x.familia_id === c.familia_id)) {
      if (await enviar(disp, carga)) envios++
    }
  }
  return envios
}

async function usuarioDoToken(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  let apikey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  try {
    const pub = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
    if (pub.default) apikey = pub.default
  } catch { /* ignora */ }
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey },
  })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    await prepararVapid()
    const corpo = await req.json().catch(() => ({}))

    // Chamada do agendador
    if (corpo.acao === 'cron') {
      const segredo = await obterConfig('cron_segredo')
      if (!segredo || req.headers.get('x-cron-secret') !== segredo) {
        return resposta({ erro: 'não autorizado' }, 401)
      }
      const doses = await processarDoses()
      const consultas = await processarConsultas()
      return resposta({ envios_doses: doses, envios_consultas: consultas })
    }

    // Notificação de teste para os iPhones do próprio usuário
    if (corpo.acao === 'teste') {
      const userId = await usuarioDoToken(req)
      if (!userId) return resposta({ erro: 'não autenticado' }, 401)
      const disps = await sql`select id, endpoint, p256dh, auth from public.dispositivos where user_id = ${userId}`
      let envios = 0
      for (const disp of disps) {
        if (await enviar(disp as unknown as Dispositivo, {
          title: '✅ Notificações funcionando',
          body: 'Você vai receber os lembretes de remédio e de consultas aqui.',
          tag: 'teste',
          url: './',
        })) envios++
      }
      return resposta({ dispositivos: disps.length, envios })
    }

    if (corpo.acao === 'iniciar') return resposta({ ok: true })

    return resposta({ erro: 'ação desconhecida' }, 400)
  } catch (e) {
    console.error(e)
    return resposta({ erro: (e as Error).message }, 500)
  }
})
