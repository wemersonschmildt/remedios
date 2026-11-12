// Devolve o histórico de saúde de uma pessoa para o link temporário enviado ao médico.
// Acesso só com o token do link, válido até a data de expiração e se não foi revogado.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'
import { createClient } from 'npm:@supabase/supabase-js@2'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 })

function chaveSecreta() {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
    if (k.default) return k.default
  } catch { /* ignora */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), { auth: { persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { token } = await req.json().catch(() => ({}))
    if (!token || typeof token !== 'string' || token.length < 32) return resposta({ erro: 'Link inválido.' }, 400)

    const [c] = await sql`
      update public.compartilhamentos set acessos = acessos + 1
       where token = ${token} and not revogado and expira_em > now()
      returning *`
    if (!c) return resposta({ erro: 'Este link expirou ou foi cancelado.' }, 404)

    const tz = 'America/Sao_Paulo'
    const de = c.de ? sql`(${c.de}::date)::timestamp at time zone ${tz}` : sql`'-infinity'::timestamptz`
    const ate = c.ate ? sql`((${c.ate}::date + 1))::timestamp at time zone ${tz}` : sql`'infinity'::timestamptz`

    const [pessoa] = await sql`
      select nome, condicoes_especiais, nascimento, peso_kg, altura_cm, tipo_sanguineo, alergias, condicoes, uso_continuo,
             plano_saude, plano_carteirinha, medicos_confianca, observacoes_saude
        from public.pessoas where id = ${c.pessoa_id}`
    const atendimentos = await sql`
      select * from public.atendimentos
       where pessoa_id = ${c.pessoa_id} and data_hora >= ${de} and data_hora < ${ate}
       order by data_hora desc`
    const idsAt = atendimentos.map((a) => a.id)
    const anexos = await sql`
      select id, atendimento_id, caminho, nome, tipo_mime, descricao, criado_em from public.anexos
       where pessoa_id = ${c.pessoa_id}
         and (atendimento_id = any(${idsAt}::uuid[])
              or (atendimento_id is null and criado_em >= ${de} and criado_em < ${ate}))
       order by criado_em`
    const vacinas = await sql`select vacina, dose, data, local, lote, observacao from public.vacinas where pessoa_id = ${c.pessoa_id} order by data desc nulls last`
    const tratamentos = await sql`
      select remedio, dose, intervalo_horas, dias, inicio, tipo, max_doses_dia, ativo, observacao from public.tratamentos
       where pessoa_id = ${c.pessoa_id} and inicio < ${ate}
         and (tipo = 'sos' or inicio + make_interval(secs => (dias * 86400)::double precision) >= ${de})
       order by inicio desc`
    const doses = await sql`
      select remedio, dose, tomado_em from public.doses
       where pessoa_id = ${c.pessoa_id} and status = 'tomada' and tomado_em >= ${de} and tomado_em < ${ate}
       order by tomado_em`
    const eventos = await sql`
      select tipo, valor, ocorrido_em, observacao from public.eventos
       where pessoa_id = ${c.pessoa_id} and ocorrido_em >= ${de} and ocorrido_em < ${ate}
       order by ocorrido_em`
    const consultas = await sql`
      select data_hora, medico, especialidade, local, observacao from public.consultas
       where pessoa_id = ${c.pessoa_id} and status = 'agendada' and data_hora >= now()
       order by data_hora`

    // Endereços temporários (1 hora) para abrir os anexos
    let urls: Record<string, string> = {}
    if (anexos.length) {
      const { data } = await admin.storage.from('anexos').createSignedUrls(anexos.map((a) => a.caminho), 3600)
      urls = Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]))
    }

    return resposta({
      periodo: { de: c.de, ate: c.ate },
      expira_em: c.expira_em,
      gerado_em: new Date().toISOString(),
      pessoa, atendimentos, vacinas, tratamentos, doses, eventos, consultas,
      anexos: anexos.map((a) => ({ ...a, caminho: undefined, url: urls[a.caminho] ?? null })),
    })
  } catch (e) {
    console.error(e)
    return resposta({ erro: 'Não foi possível carregar o histórico.' }, 500)
  }
})
