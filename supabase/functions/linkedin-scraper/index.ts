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
    const { topicKeywords, scraperType } = await req.json()
    console.log("LinkedIn Scraper received body:", { topicKeywords, scraperType })

    // Securely get the tokens from Supabase environment variables
    const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN')
    console.log("APIFY_TOKEN present:", !!APIFY_TOKEN, APIFY_TOKEN ? `(Starts with: ${APIFY_TOKEN.substring(0, 4)}...)` : "(MISSING)")
    
    if (!APIFY_TOKEN) {
      throw new Error("Missing Apify API token in Edge Function env variables.")
    }

    // Determine which actor to call based on the scraperType requested by the client
    let actorId = "supreme_coder/linkedin-post"
    let inputPayload = {}

    if (scraperType === "posts") {
      inputPayload = {
        keywords: topicKeywords || ["AI", "Small Business"], // Use topic keywords passed from UI
        // Depending on specific actor requirements
        cookieId: Deno.env.get('LINKEDIN_LI_AT_COOKIE') || "",
        deepScrape: true,
      }
    } else {
      throw new Error(`Invalid scraperType: ${scraperType}. Only 'posts' is supported.`)
    }

    // Call Apify API to run the actor synchronously (wait for finish)
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${actorId.replace('/', '~')}/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(inputPayload),
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
    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && attempts < 30) {
        await new Promise(res => setTimeout(res, 2000)); // wait 2s
        const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runData.data.id}?token=${APIFY_TOKEN}`);
        const statusData = await statusRes.json();
        status = statusData.data.status;
        attempts++;
    }

    if (status !== "SUCCEEDED") {
         throw new Error(`Apify run did not succeed within timeout. Final status: ${status}`);
    }

    // Fetch the dataset results
    const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`);
    const results = await datasetResponse.json();

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error("Function error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
