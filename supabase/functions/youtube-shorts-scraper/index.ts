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
    const { keywords, maxResults = 5 } = await req.json()
    console.log("YT Shorts Scraper received body:", { keywords, maxResults })

    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    if (!APIFY_TOKEN) {
      throw new Error("Missing APIFY_API_TOKEN")
    }

    // Step 1: Search for YouTube Shorts URLs using a keyword-based actor
    // This actor supports searching by keyword without requiring a channel list
    const searchActorId = "scrapestorm~youtube-search-scraper-by-keyword-all-results-available"
    const searchInput = {
      searchTerms: keywords || ["AI", "Automation", "SaaS"], // Array of keywords
      maxResults: maxResults,
    }

    console.log("Searching for Shorts URLs with keywords:", keywords)

    // Start search actor run using the direct 'acts' endpoint for better reliability
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${searchActorId}/runs?token=${APIFY_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchInput),
    })

    if (!runResponse.ok) {
      const errorText = await runResponse.text()
      console.error("YT Search Actor failed:", errorText)
      throw new Error(`Search Actor failed: ${runResponse.status} - ${errorText}`)
    }

    const searchRunData = await runResponse.json()
    const searchRunId = searchRunData.data.id

    // Wait for search to complete (max 90s to stay within Supabase 121s limit)
    let searchStatus = "RUNNING"
    let searchAttempts = 0
    while (searchStatus === "RUNNING" && searchAttempts < 45) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${searchRunId}?token=${APIFY_TOKEN}`)
      const data = await res.json()
      searchStatus = data.data.status
      searchAttempts++
    }

    if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(searchStatus) && searchStatus !== "RUNNING") {
      throw new Error(`YT Search Actor ended with unexpected status: ${searchStatus}`)
    }

    if (searchStatus === "RUNNING") {
      throw new Error("YT Search Actor timed out after 90s polling")
    }

    if (searchStatus !== "SUCCEEDED") {
      const logRes = await fetch(`https://api.apify.com/v2/logs/${searchRunId}?token=${APIFY_TOKEN}`)
      const logText = await logRes.text()
      const logExcerpt = logText.slice(-1000)
      throw new Error(`YT Search Actor ${searchStatus}. Log: ${logExcerpt}`)
    }

    // Get search results (URLs)
    const searchDatasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${searchRunId}/dataset/items?token=${APIFY_TOKEN}`)
    const searchItems = await searchDatasetRes.json()
    const shortsUrls = searchItems
      .map(item => item.url)
      .filter(url => url && url.includes('shorts/'))

    if (shortsUrls.length === 0) {
      return new Response(JSON.stringify({ data: [], error: null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Step 2: Extract transcripts using the user-requested actor
    const transcriptActorId = "scrapestorm/youtube-transcript-short-scraper-fast-cheap"
    const transcriptInput = {
      urls: shortsUrls,
    }

    console.log("Extracting transcripts for URLs:", shortsUrls)

    const transcriptRunResponse = await fetch(`https://api.apify.com/v2/acts/${transcriptActorId}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transcriptInput),
    })

    if (!transcriptRunResponse.ok) {
      throw new Error(`Transcript Actor failed: ${await transcriptRunResponse.text()}`)
    }

    const transcriptRunData = await transcriptRunResponse.json()
    const transcriptRunId = transcriptRunData.data.id

    // Wait for transcript extraction to complete (max 90s)
    let transcriptStatus = "RUNNING"
    let transcriptAttempts = 0
    while (transcriptStatus === "RUNNING" && transcriptAttempts < 45) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${transcriptRunId}?token=${APIFY_TOKEN}`)
      const data = await res.json()
      transcriptStatus = data.data.status
      transcriptAttempts++
    }

    if (transcriptStatus === "RUNNING") {
      throw new Error("YT Transcript Actor timed out after 90s polling")
    }

    if (transcriptStatus !== "SUCCEEDED") {
      const logRes = await fetch(`https://api.apify.com/v2/logs/${transcriptRunId}?token=${APIFY_TOKEN}`);
      const logText = await logRes.text();
      const logExcerpt = logText.slice(-1000);
      throw new Error(`Transcript Actor ${transcriptStatus}. Log: ${logExcerpt}`);
    }

    // Get final results
    const finalDatasetRes = await fetch(`https://api.apify.com/v2/actor-runs/${transcriptRunId}/dataset/items?token=${APIFY_TOKEN}`)
    const finalResults = await finalDatasetRes.json()

    return new Response(JSON.stringify({ data: finalResults, error: null }), {
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
