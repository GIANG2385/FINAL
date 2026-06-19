// Thin wrapper around the OpenAI SDK for the AI Operations Consultant.
// This is the one feature in the app that calls a real external LLM —
// see docs/superpowers/specs/2026-06-19-ai-consultant-chatbot-design.md
// for why this is an explicit, user-requested exception to the
// rule-based-only "AI" approach used everywhere else in the build.
import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

if (!apiKey) {
  console.warn(
    'OPENAI_API_KEY is not set — the AI Consultant endpoint will fail until it is set in backend/.env.'
  )
}

const client = apiKey ? new OpenAI({ apiKey }) : null

export async function getChatCompletion(messages) {
  if (!client) {
    throw new Error('OpenAI client not initialized — OPENAI_API_KEY is missing')
  }
  const completion = await client.chat.completions.create({ model, messages })
  return completion.choices[0].message.content
}
