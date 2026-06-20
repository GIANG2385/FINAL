// Thin wrapper around the Cohere Chat API for the AI Operations Consultant.
// This is the one feature in the app that calls a real external LLM —
// see docs/superpowers/specs/2026-06-19-ai-consultant-chatbot-design.md
// for why this is an explicit, user-requested exception to the
// rule-based-only "AI" approach used everywhere else in the build.
// Switched from OpenAI to Cohere (user-requested, free-tier API key) — same
// getChatCompletion(messages) interface so consultantController.js is unaffected.
const apiKey = process.env.COHERE_API_KEY
const model = process.env.COHERE_MODEL || 'command-a-03-2025'

if (!apiKey) {
  console.warn(
    'COHERE_API_KEY is not set — the AI Consultant endpoint will fail until it is set in backend/.env.'
  )
}

export async function getChatCompletion(messages) {
  if (!apiKey) {
    throw new Error('Cohere client not initialized — COHERE_API_KEY is missing')
  }

  const response = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Cohere API error ${response.status}: ${errorBody}`)
  }

  const data = await response.json()
  return data.message.content.map((part) => part.text).join('')
}
