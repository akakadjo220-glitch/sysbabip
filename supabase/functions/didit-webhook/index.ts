import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Didit Webhook Handler
 * 
 * This function is refactored to use the modern Deno.serve syntax
 * and is compatible with Supabase Edge Functions.
 */
Deno.serve(async (req: Request) => {
  try {
    // Basic health check for GET requests
    if (req.method === 'GET') {
      return new Response("Webhook is active", { status: 200 })
    }

    const body = await req.json()
    console.log("Didit Webhook received:", body)

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
