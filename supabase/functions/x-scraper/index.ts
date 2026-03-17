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
    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')

    if (!APIFY_TOKEN) {
      throw new Error("Missing APIFY_API_TOKEN")
    }

    const actorId = "apidojo~tweet-scraper-v2"
    const inputPayload = {
      searchQueries: keywords,
      maxTweets: maxItems,
      sort: "Top",
      onlyImage: false,
      onlyVideo: false,
      onlyTwitterBlue: false,
    }

    console.log("Searching X with keywords:", keywords)

    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
    })

    if (!runResponse.ok) {
      throw new Error(`X Scraper Run failed: ${await runResponse.text()}`)
    }

    const runData = await runResponse.json()
    const runId = runData.data.id

    // Wait for run completion
    let status = "RUNNING"
    while (["RUNNING", "READY"].includes(status)) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
      const data = await res.json()
      status = data.data.status
    }

    if (status !== "SUCCEEDED") {
      throw new Error(`X Scraper failed with status: ${status}`)
    }

    // Get dataset results
    const datasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`)
    const results = await datasetRes.json()

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
