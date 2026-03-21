import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Individual LLM callers ---

async function callOpenAI(systemPrompt: string, userMessage: string, apiKey: string): Promise<{ source: string; trends: unknown[] }> {
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
  return { source: 'openai', trends: parseTrends(data.choices[0].message.content) }
}

async function callClaude(systemPrompt: string, userMessage: string, apiKey: string): Promise<{ source: string; trends: unknown[] }> {
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
  const text = data.content[0].text
  return { source: 'claude', trends: parseTrends(text) }
}

async function callGemini(systemPrompt: string, userMessage: string, apiKey: string): Promise<{ source: string; trends: unknown[] }> {
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
  const text = data.candidates[0].content.parts[0].text
  return { source: 'gemini', trends: parseTrends(text) }
}

// --- Helpers ---

function parseTrends(raw: string): unknown[] {
  let parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    // Look for a top-level array field (trends, results, data, etc.)
    const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]))
    if (arrayKey) parsed = parsed[arrayKey]
    else throw new Error('Response is not an array and contains no array field')
  }
  return parsed
}

interface Trend {
  title: string
  desc: string
  tags: string[]
  rank?: number
  sources: string[]
  confidence: number
}

function mergeTrends(results: { source: string; trends: unknown[] }[]): Trend[] {
  // Collect all trends with their source
  const allTrends: { source: string; title: string; desc: string; tags: string[] }[] = []
  for (const r of results) {
    for (const t of r.trends as any[]) {
      allTrends.push({
        source: r.source,
        title: (t.title || '').toLowerCase().trim(),
        desc: t.desc || t.description || '',
        tags: t.tags || [],
      })
    }
  }

  // Group similar trends by fuzzy title matching (shared significant words)
  const groups: { titles: string[]; descs: string[]; tags: string[][]; sources: Set<string> }[] = []

  for (const trend of allTrends) {
    const words = new Set(trend.title.split(/\s+/).filter(w => w.length > 3))
    let matched = false
    for (const group of groups) {
      // Check if this trend overlaps with any title in the group
      for (const existingTitle of group.titles) {
        const existingWords = new Set(existingTitle.split(/\s+/).filter(w => w.length > 3))
        const overlap = [...words].filter(w => existingWords.has(w)).length
        if (overlap >= 1 && (overlap / Math.min(words.size, existingWords.size)) >= 0.4) {
          group.titles.push(trend.title)
          group.descs.push(trend.desc)
          group.tags.push(trend.tags)
          group.sources.add(trend.source)
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (!matched) {
      groups.push({
        titles: [trend.title],
        descs: [trend.desc],
        tags: [trend.tags],
        sources: new Set([trend.source]),
      })
    }
  }

  // Sort by number of sources (consensus first), then by group size
  groups.sort((a, b) => b.sources.size - a.sources.size || b.titles.length - a.titles.length)

  // Build final trends list
  return groups.slice(0, 5).map((g, i) => ({
    rank: i + 1,
    title: g.titles[0].replace(/\b\w/g, c => c.toUpperCase()), // title-case the first occurrence
    desc: g.descs[0], // use the first (longest) description
    tags: [...new Set(g.tags.flat())].slice(0, 4),
    sources: [...g.sources],
    confidence: Math.round((g.sources.size / results.length) * 100),
  }))
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { systemPrompt, scrapedData } = await req.json()
    console.log("Trends Summarizer received data. Posts count:", scrapedData?.length)

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

    // Check that at least one key is available
    if (!OPENAI_API_KEY && !CLAUDE_API_KEY && !GEMINI_API_KEY) {
      console.warn("No AI API keys found. Returning simulation.")
      const simulation = [
        { rank: 1, title: "The B2B Attribution Crisis", desc: "AI-driven privacy changes are making traditional tracking impossible. Founders are shifting to 'Zero-Party Data' strategies.", tags: ["High Friction", "Strategy"], sources: ["simulated"], confidence: 0 },
        { rank: 2, title: "Ghostwriting vs. AI-Writing", desc: "The 'uncanny valley' of AI content is leading to a massive premium for human-vetted, high-personality posts.", tags: ["LinkedIn", "Pain Point"], sources: ["simulated"], confidence: 0 },
        { rank: 3, title: "Local CRM AI Adoption", desc: "Small service businesses are starting to use AI voice agents for scheduling—a huge untapped market.", tags: ["SMB", "Opportunity"], sources: ["simulated"], confidence: 0 },
      ]
      return new Response(
        JSON.stringify({ data: simulation, error: null, simulated: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const userMessage = `Here are the top 20 posts from today's scrape across LinkedIn, Reddit, and X:\n\n${JSON.stringify(scrapedData)}\n\nPlease summarize these into the top 3-5 high-impact recurring trends based on my instructions. Output as a JSON array of objects with 'title', 'desc', and 'tags' fields.`

    // Fire all available LLMs in parallel
    const calls: Promise<{ source: string; trends: unknown[] }>[] = []
    if (OPENAI_API_KEY) calls.push(callOpenAI(systemPrompt, userMessage, OPENAI_API_KEY))
    if (CLAUDE_API_KEY) calls.push(callClaude(systemPrompt, userMessage, CLAUDE_API_KEY))
    if (GEMINI_API_KEY) calls.push(callGemini(systemPrompt, userMessage, GEMINI_API_KEY))

    console.log(`Calling ${calls.length} LLMs in parallel...`)

    const settled = await Promise.allSettled(calls)
    const succeeded = settled
      .filter((r): r is PromiseFulfilledResult<{ source: string; trends: unknown[] }> => r.status === 'fulfilled')
      .map(r => r.value)
    const failed = settled
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message || String(r.reason))

    if (failed.length > 0) {
      console.warn(`${failed.length} LLM(s) failed:`, failed)
    }

    if (succeeded.length === 0) {
      throw new Error(`All LLMs failed: ${failed.join('; ')}`)
    }

    console.log(`${succeeded.length} LLM(s) succeeded: ${succeeded.map(s => s.source).join(', ')}`)

    // Merge results from all successful LLMs
    const merged = mergeTrends(succeeded)

    return new Response(
      JSON.stringify({
        data: merged,
        error: null,
        llms_used: succeeded.map(s => s.source),
        llms_failed: failed.length > 0 ? failed : undefined,
      }),
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
