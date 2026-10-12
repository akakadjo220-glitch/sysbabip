import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Didit Webhook Handler
 * 
 * This function is refactored to use the modern Deno.serve syntax
 * and is compatible with Supabase Edge Functions.
 */
const encoder = new TextEncoder()

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Signature HMAC-SHA256 Didit : X-Signature-V2 (JSON canonique) ou X-Signature (corps brut). */
async function isValidSignature(req: Request, rawBody: string, body: unknown): Promise<boolean> {
  const secret = Deno.env.get('DIDIT_WEBHOOK_SECRET')
  if (!secret) return false

  const timestamp = Number(req.headers.get('x-timestamp'))
  if (timestamp && Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const sigV2 = req.headers.get('x-signature-v2')
  if (sigV2 && safeEqual(sigV2, await hmacHex(secret, canonicalJson(body)))) return true
  const sigRaw = req.headers.get('x-signature')
  if (sigRaw && safeEqual(sigRaw, await hmacHex(secret, rawBody))) return true
  return false
}

Deno.serve(async (req: Request) => {
  try {
    // Basic health check for GET requests
    if (req.method === 'GET') {
      return new Response("Webhook is active", { status: 200 })
    }

    const rawBody = await req.text()
    const body = JSON.parse(rawBody)
    if (!(await isValidSignature(req, rawBody, body))) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    }
    console.log("Didit Webhook received:", { session_id: body.session_id, status: body.status })

    // Note: session_id and status are typical fields from Didit webhooks
    // You should map these based on their actual API documentation
    const { decision, vendor_data } = body // vendor_data usually contains your user_id
    const user_id = vendor_data?.user_id

    if (!user_id) {
       return new Response(JSON.stringify({ error: "No user_id in vendor_data" }), { 
         status: 400,
         headers: { "Content-Type": "application/json" }
       })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Update profile using the helper function we created in SQL
    const status = decision === 'APPROVED' ? 'verified' : 'rejected'
    
    const { error } = await supabaseAdmin.rpc('verify_organizer', {
      p_user_id: user_id,
      p_status: status
    })

    if (error) throw error

    return new Response(JSON.stringify({ success: true, status }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("Webhook Error:", (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
