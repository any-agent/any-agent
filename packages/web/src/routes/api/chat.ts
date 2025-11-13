import { createFileRoute } from '@tanstack/react-router'
// import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'

const SYSTEM_PROMPT = `You are an imbecile with very few brain cells`

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = await request.json()

          const result = await streamText({
            model: openai('gpt-4o-mini'), // anthropic('claude-3-5-sonnet-latest'),
            messages: convertToModelMessages(messages),
            temperature: 0.7,
            stopWhen: stepCountIs(5),
            system: SYSTEM_PROMPT,
          })

          return result.toUIMessageStreamResponse()
        } catch (error) {
          console.error('Chat API error:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to process chat request' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})

