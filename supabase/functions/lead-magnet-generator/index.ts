import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Individual LLM callers ---

async function callOpenAI(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

async function callClaude(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.content[0].text
}

async function callGemini(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

// --- Helpers ---

function parseResponse(raw: string): { outline: string; variations: { type: string; content: string }[] } {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const parsed = JSON.parse(cleaned)
  // Normalize: accept either top-level or nested structure
  const outline = parsed.outline || parsed.lead_magnet_outline || parsed.magnet_outline || ''
  const variations = parsed.variations || parsed.social_variations || parsed.posts || []
  return { outline, variations }
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { systemPrompt, topic } = await req.json()
    console.log("Lead Magnet Generator received topic:", topic)

    if (!topic) {
      throw new Error("No topic provided.")
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!OPENAI_API_KEY && !CLAUDE_API_KEY && !GEMINI_API_KEY) {
      throw new Error("No AI API keys configured. Please set at least one of OPENAI_API_KEY, CLAUDE_API_KEY, or GEMINI_API_KEY in your Supabase project secrets.")
    }

    const userMessage = `Topic: "${topic}"

Generate a high-value lead magnet outline and 3 social media post variations for this topic.

Return your response as a JSON object with this exact structure:
{
  "outline": "HTML-formatted lead magnet outline with <strong>, <br> tags for formatting. Include: Title, The Problem, The Solution/Framework (with 2-3 actionable steps), and a Call to Action.",
  "variations": [
    { "type": "Contrarian", "content": "A punchy, contrarian hook post (2-3 sentences) that challenges conventional wisdom on this topic." },
    { "type": "Pain-First", "content": "A pain-point-driven hook post (2-3 sentences) that leads with the struggle and offers relief." },
    { "type": "Results-Led", "content": "A results-driven hook post (2-3 sentences) that leads with a specific outcome or metric." }
  ]
}

Make the outline actionable and specific. Make the variations compelling LinkedIn hooks that would drive engagement. Each variation should be distinct in voice and angle.`

    // Try LLMs in priority order: Claude > OpenAI > Gemini (single call, not parallel — we only need one good result)
    const attempts: { name: string; fn: () => Promise<string> }[] = []
    if (CLAUDE_API_KEY) attempts.push({ name: 'claude', fn: () => callClaude(systemPrompt, userMessage, CLAUDE_API_KEY) })
    if (OPENAI_API_KEY) attempts.push({ name: 'openai', fn: () => callOpenAI(systemPrompt, userMessage, OPENAI_API_KEY) })
    if (GEMINI_API_KEY) attempts.push({ name: 'gemini', fn: () => callGemini(systemPrompt, userMessage, GEMINI_API_KEY) })

    let lastError = ''
    for (const attempt of attempts) {
      try {
        console.log(`Trying ${attempt.name}...`)
        const raw = await attempt.fn()
        const parsed = parseResponse(raw)
        console.log(`${attempt.name} succeeded.`)
        return new Response(
          JSON.stringify({ data: parsed, error: null, llm_used: attempt.name }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (e) {
        console.warn(`${attempt.name} failed:`, e.message)
        lastError = `${attempt.name}: ${e.message}`
      }
    }

    throw new Error(`All LLMs failed. Last error: ${lastError}`)

  } catch (error) {
    console.error("Lead Magnet Generator Error:", error.message)
    return new Response(JSON.stringify({ data: null, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
