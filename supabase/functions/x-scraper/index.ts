import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { keywords, maxItems = 10 } = await req.json()
    console.log("X Scraper received body:", { keywords, maxItems })

    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    console.log("APIFY_TOKEN present:", !!APIFY_TOKEN, APIFY_TOKEN ? `(Starts with: ${APIFY_TOKEN.substring(0, 4)}...)` : "(MISSING)")

    if (!APIFY_TOKEN) {
      throw new Error("Missing APIFY_API_TOKEN")
    }

    // New actor: scraping_solutions/twitter-x-scraper-post-timeline-search-replies-pay-by-result
    const actorId = "scraping_solutions~twitter-x-scraper-post-timeline-search-replies-pay-by-result"
    
    // The input schema for this actor uses Input_Search and max_items
    const inputPayload = {
      Input_Search: keywords || ["AI", "Automation", "SaaS"], // Array of strings
      max_items: 5, // Keep it fast
      includeReplies: false,
    }

    console.log("Searching X with new actor using keywords:", keywords)

    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
    })

    if (!runResponse.ok) {
      const errorText = await runResponse.text()
      console.error("X Scraper Apify Run failed:", errorText)
      throw new Error(`X Scraper Run failed: ${runResponse.status} - ${errorText}`)
    }

    const runData = await runResponse.json()
    const runId = runData.data.id

    // Wait for run completion (max 100 seconds to stay within Supabase 121s limit)
    let status = "RUNNING"
    let attempts = 0
    while (["RUNNING", "READY"].includes(status) && attempts < 50) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
      const data = await res.json()
      status = data.data.status
      attempts++
    }

    if (status !== "SUCCEEDED") {
      const logRes = await fetch(`https://api.apify.com/v2/logs/${runId}?token=${APIFY_TOKEN}`);
      const logText = await logRes.text();
      const logExcerpt = logText.slice(-1000);
      throw new Error(`X Scraper failed with status: ${status}. Log: ${logExcerpt}`);
    }

    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`)
    const results = await datasetRes.json()

    return new Response(JSON.stringify({ data: results, error: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Function error:", error.message)
    return new Response(JSON.stringify({ data: null, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
