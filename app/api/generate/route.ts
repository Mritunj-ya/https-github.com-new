import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid build issues
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const pdfFile = formData.get('pdf') as File
    const deckName = formData.get('deckName') as string

    if (!pdfFile) {
      return NextResponse.json({ error: 'No PDF provided' }, { status: 400 })
    }

    // Convert File to Buffer
    const arrayBuffer = await pdfFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text from PDF
    let pdfText: string
    try {
      pdfText = await extractTextFromPDF(buffer)
    } catch {
      return NextResponse.json({ error: 'Failed to read PDF. Please ensure it contains readable text (not scanned images).' }, { status: 400 })
    }

    if (!pdfText || pdfText.trim().length < 100) {
      return NextResponse.json({ error: 'PDF appears to be empty or contains no readable text.' }, { status: 400 })
    }

    // Truncate to ~8000 words to stay within context limits
    const words = pdfText.split(/\s+/)
    const truncated = words.slice(0, 8000).join(' ')

    // Generate flashcards with Claude
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are an expert educator creating high-quality flashcards from study material. 

Analyze this content and create 15-25 flashcards that cover:
- Key concepts and definitions
- Important relationships between ideas
- Edge cases and exceptions
- Facts and formulas students need to remember
- Worked examples as Q&A pairs

Rules for great flashcards:
1. Each question should test ONE specific thing
2. Answers should be concise but complete (1-3 sentences max)
3. Questions should be specific, not vague ("What is the formula for X?" not "Describe X")
4. Include a mix of: definition cards, concept cards, application cards, and example cards
5. Write as if a great teacher made them — not scraped by a bot

Content from "${deckName}":
---
${truncated}
---

Return ONLY a JSON array (no markdown, no explanation) in this exact format:
[
  {"front": "question here", "back": "answer here"},
  ...
]`
        }
      ]
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    
    // Parse JSON response
    let cards
    try {
      // Strip any markdown fences if present
      const cleaned = responseText.replace(/```json\n?|\n?```/g, '').trim()
      cards = JSON.parse(cleaned)
    } catch {
      // Try to extract JSON array from response
      const match = responseText.match(/\[[\s\S]*\]/)
      if (!match) {
        return NextResponse.json({ error: 'Failed to parse generated cards. Please try again.' }, { status: 500 })
      }
      cards = JSON.parse(match[0])
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: 'No cards were generated. Please try with a different PDF.' }, { status: 500 })
    }

    // Validate card structure
    const validCards = cards.filter(c => c.front && c.back && typeof c.front === 'string' && typeof c.back === 'string')

    return NextResponse.json({ cards: validCards })

  } catch (error: unknown) {
    console.error('Generation error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Generation failed: ${message}` }, { status: 500 })
  }
}
