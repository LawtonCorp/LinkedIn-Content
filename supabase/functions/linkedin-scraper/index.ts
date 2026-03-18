import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

console.log("Hello from linkedin-scraper!")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { topicKeywords, profileUrl, scraperType } = await req.json()
    console.log("LinkedIn Scraper received body:", { topicKeywords, profileUrl, scraperType })

    // Securely get the tokens from Supabase environment variables
    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    console.log("APIFY_TOKEN present:", !!APIFY_TOKEN, APIFY_TOKEN ? `(Starts with: ${APIFY_TOKEN.substring(0, 4)}...)` : "(MISSING)")
    
    if (!APIFY_TOKEN) {
      throw new Error("Missing Apify API token in Edge Function env variables.")
    }

    // Determine which actor to call based on the scraperType requested by the client
    let actorId = "supreme_coder~linkedin-post"
    let inputPayload = {}

    if (scraperType === "activity" && profileUrl) {
        // Fetch recent activities from the specific profile
        const activityUrl = profileUrl.endsWith('/') ? `${profileUrl}recent-activity/all/` : `${profileUrl}/recent-activity/all/`;
        inputPayload = {
            urls: [activityUrl],
            cookieId: Deno.env.get('LINKEDIN_LI_AT_COOKIE') || "",
            deepScrape: true,
            minPostCount: 5
        };
    } else if (scraperType === "posts" || scraperType === "activity") {
      // Fallback to keyword search if no profileUrl or specifically requested
      const searchUrls = (topicKeywords || ["AI", "Small Business"]).map((kw: string) => 
        `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(kw)}`
      )
      inputPayload = {
        urls: searchUrls,
        cookieId: Deno.env.get('LINKEDIN_LI_AT_COOKIE') || "",
        deepScrape: true,
      }
    } else {
      throw new Error(`Invalid scraperType: ${scraperType}.`)
    }

    // Start the Apify actor run using the direct 'acts' endpoint
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(inputPayload)
    });

    if (!runResponse.ok) {
        const errorText = await runResponse.text();
        throw new Error(`Apify Run failed: ${runResponse.status} ${errorText}`);
    }

    const runData = await runResponse.json();
    const defaultDatasetId = runData.data.defaultDatasetId;

    // Wait for the run to finish (Simplest approach: Poll Apify for run status. 
    // Apify also offers webhooks, but for a 4-hour background job, polling in an edge function is okay 
    // IF the scrape is fast. If it's slow, we should use webhooks).
    // Let's implement a quick polling loop (max 60 seconds for safety in edge functions).
    
    let status = runData.data.status;
    let attempts = 0;
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && attempts < 45) {
        await new Promise(res => setTimeout(res, 2000)); // wait 2s
        const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runData.data.id}?token=${APIFY_TOKEN}`);
        const statusData = await statusRes.json();
        status = statusData.data.status;
        attempts++;
    }

    // If still running after 90s, we'll try to fetch results anyway or report it
    if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      console.log("LinkedIn Scraper still running, fetching partial results...");
    }

    if (status !== "SUCCEEDED") {
      const logRes = await fetch(`https://api.apify.com/v2/logs/${runData.data.id}?token=${APIFY_TOKEN}`);
      const logText = await logRes.text();
      const logExcerpt = logText.slice(-1000);
      throw new Error(`LinkedIn Scraper ${status}. Log: ${logExcerpt}`);
    }

    // Fetch the dataset results
    const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`);
    const results = await datasetResponse.json();

    return new Response(
      JSON.stringify({ data: results, error: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (error) {
    console.error("Function error:", error.message)
    return new Response(JSON.stringify({ data: null, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
