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
    const { systemPrompt, scrapedData } = await req.json()
    console.log("Trends Summarizer received data. Posts count:", scrapedData?.length)

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

    if (!OPENAI_API_KEY) {
        console.warn("OPENAI_API_KEY not found. Returning premium simulation.")
        // Return a high-quality simulated response if no key is present
        // This ensures the UX doesn't break during the prototype phase
        const simulation = [
            { 
                rank: 1, 
                title: "The B2B Attribution Crisis", 
                desc: "AI-driven privacy changes are making traditional tracking impossible. Founders are shifting to 'Zero-Party Data' strategies.",
                tags: ["High Friction", "Strategy"]
            },
            { 
                rank: 2, 
                title: "Ghostwriting vs. AI-Writing", 
                desc: "The 'uncanny valley' of AI content is leading to a massive premium for human-vetted, high-personality posts.",
                tags: ["LinkedIn", "Pain Point"]
            },
            { 
                rank: 3, 
                title: "Local CRM AI Adoption", 
                desc: "Small service businesses (plumbers, HVAC) are starting to use AI voice agents for scheduling-a huge untapped market.",
                tags: ["SMB", "Opportunity"]
            }
        ];
        return new Response(
            JSON.stringify({ data: simulation, error: null, simulated: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    // If we HAVE a key, we'll try to use it
    // Preparing the prompt
    const userMessage = `Here are the top 20 posts from today's scrape across LinkedIn, Reddit, and X:\n\n${JSON.stringify(scrapedData)}\n\nPlease summarize these into the top 3-5 high-impact recurring trends based on my instructions. Output as a JSON array of objects with 'title', 'desc', and 'tags' fields.`

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ],
            response_format: { type: "json_object" }
        })
    })

    if (!aiResponse.ok) {
        const errText = await aiResponse.text()
        throw new Error(`OpenAI API failed: ${aiResponse.status} ${errText}`)
    }

    const aiData = await aiResponse.json()
    const content = aiData.choices[0].message.content
    
    // Parse the JSON. We expect an array or an object containing an array.
    let parsed = JSON.parse(content)
    if (!Array.isArray(parsed) && parsed.trends) parsed = parsed.trends

    return new Response(
        JSON.stringify({ data: parsed, error: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error("Summarizer Error:", error.message)
    return new Response(JSON.stringify({ data: null, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
