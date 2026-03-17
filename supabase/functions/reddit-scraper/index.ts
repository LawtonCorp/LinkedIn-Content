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
    
    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    
    if (!APIFY_TOKEN) {
      throw new Error("Missing Apify API token in Edge Function env variables.")
    }

    const actorId = "harshmaur~reddit-scraper-pro"

    // Build input for harshmaur/reddit-scraper-pro
    const inputPayload = {
      searches: (keywords || ["AI small business"]).map((kw) => ({
        term: kw,
        sort: "relevance",
        time: timeFilter || "month", // last 30 days by default
      })),
      subreddits: subreddits || ["Entrepreneur", "smallbusiness", "startups"],
      maxItems: 20,
      proxy: {
        useApifyProxy: true,
      },
    }

    // Call Apify API to run the actor
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputPayload),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      throw new Error(`Apify Run failed: ${runResponse.status} ${errorText}`);
    }

    const runData = await runResponse.json();
    const defaultDatasetId = runData.data.defaultDatasetId;

    // Poll for completion (max 60 seconds)
    let status = runData.data.status;
    let attempts = 0;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && attempts < 30) {
      await new Promise(res => setTimeout(res, 2000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runData.data.id}?token=${APIFY_TOKEN}`);
      const statusData = await statusRes.json();
      status = statusData.data.status;
      attempts++;
    }

    if (status !== "SUCCEEDED") {
      throw new Error(`Apify run did not succeed. Final status: ${status}`);
    }

    // Fetch the dataset results
    const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`);
    const results = await datasetResponse.json();

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
