import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

console.log("Hello from reddit-scraper!")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { keywords, subreddits, timeFilter } = await req.json()
    console.log("Reddit Scraper received body:", { keywords, subreddits, timeFilter })

    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    console.log("APIFY_TOKEN present:", !!APIFY_TOKEN, APIFY_TOKEN ? `(Starts with: ${APIFY_TOKEN.substring(0, 4)}...)` : "(MISSING)")
    
    if (!APIFY_TOKEN) {
      throw new Error("Missing Apify API token in Edge Function env variables.")
    }

    const actorId = "harshmaur~reddit-scraper-pro"

    // Build input for harshmaur/reddit-scraper-pro
    // Actor expects searchTerms as an array of strings
    const inputPayload = {
      searchTerms: keywords || ["AI small business"],
      searchPosts: true,
      searchComments: false,
      searchCommunities: false,
      sort: "relevance",
      time: timeFilter || "month",
      maxPostsCount: 20,
      proxy: {
        useApifyProxy: true,
      },
    }

    console.log("Calling Apify with payload:", JSON.stringify(inputPayload))

    // Call Apify API to run the actor
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error("Apify Run failed:", errorText)
      throw new Error(`Apify Run failed: ${runResponse.status} - ${errorText}`);
    }

    const runData = await runResponse.json();
    const defaultDatasetId = runData.data.defaultDatasetId;

    // Poll for completion (max 200 seconds)
    let status = runData.data.status;
    let attempts = 0;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && attempts < 100) {
      await new Promise(res => setTimeout(res, 2000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runData.data.id}?token=${APIFY_TOKEN}`);
      const statusData = await statusRes.json();
      status = statusData.data.status;
      attempts++;
    }

    if (status !== "SUCCEEDED") {
      // Fetch Apify Log for better debugging
      const logRes = await fetch(`https://api.apify.com/v2/logs/${runData.data.id}?token=${APIFY_TOKEN}`);
      const logText = await logRes.text();
      const logExcerpt = logText.slice(-1000); // last 1000 chars
      throw new Error(`Apify run ${status}. Log: ${logExcerpt}`);
    }

    // Fetch the dataset results
    const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`);
    const results = await datasetResponse.json();

    return new Response(
      JSON.stringify({ data: results, error: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error("Function error:", error.message)
    // Always return 200 but include error info
    return new Response(JSON.stringify({ data: null, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
