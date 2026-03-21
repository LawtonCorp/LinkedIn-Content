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
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { systemPrompt, rawContent, tone } = await req.json()
    console.log("Post Writer received content. Tone:", tone)

    if (!rawContent) {
      throw new Error("No content provided.")
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    if (!OPENAI_API_KEY && !CLAUDE_API_KEY && !GEMINI_API_KEY) {
      throw new Error("No AI API keys configured. Please set at least one of OPENAI_API_KEY, CLAUDE_API_KEY, or GEMINI_API_KEY in your Supabase project secrets.")
    }

    const toneDescriptions: Record<string, string> = {
      authoritative: "Confident, data-driven, and commanding. Use short punchy sentences. Establish expertise early.",
      conversational: "Warm, relatable, story-driven. Write like you're talking to a smart friend over coffee. Use 'you' and 'I' freely.",
      contrarian: "Challenge conventional wisdom. Open with a bold, surprising statement. Be provocative but back it up with logic.",
    }

    const toneGuide = toneDescriptions[tone] || toneDescriptions['authoritative']

    const userMessage = `Raw thoughts / hook idea:
"""
${rawContent}
"""

Tone: ${tone} — ${toneGuide}

Write a polished, ready-to-publish LinkedIn post based on the raw thoughts above.

Requirements:
- Use the specified tone throughout
- Open with a strong hook (first line must stop the scroll)
- Use line breaks liberally for readability (LinkedIn posts need whitespace)
- Keep it between 150-300 words
- End with a clear call-to-action (repost, comment, or link)
- Use HTML <br> tags for line breaks and <strong> for emphasis where appropriate
- Do NOT wrap in quotes or add meta-commentary — just output the post text directly`

    // Try LLMs in priority order
    const attempts: { name: string; fn: () => Promise<string> }[] = []
    if (CLAUDE_API_KEY) attempts.push({ name: 'claude', fn: () => callClaude(systemPrompt, userMessage, CLAUDE_API_KEY) })
    if (OPENAI_API_KEY) attempts.push({ name: 'openai', fn: () => callOpenAI(systemPrompt, userMessage, OPENAI_API_KEY) })
    if (GEMINI_API_KEY) attempts.push({ name: 'gemini', fn: () => callGemini(systemPrompt, userMessage, GEMINI_API_KEY) })

    let lastError = ''
    for (const attempt of attempts) {
      try {
        console.log(`Trying ${attempt.name}...`)
        const post = await attempt.fn()
        console.log(`${attempt.name} succeeded.`)
        return new Response(
          JSON.stringify({ data: { post }, error: null, llm_used: attempt.name }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } catch (e) {
        console.warn(`${attempt.name} failed:`, e.message)
        lastError = `${attempt.name}: ${e.message}`
      }
    }

    throw new Error(`All LLMs failed. Last error: ${lastError}`)

  } catch (error) {
    console.error("Post Writer Error:", error.message)
    return new Response(JSON.stringify({ data: null, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
