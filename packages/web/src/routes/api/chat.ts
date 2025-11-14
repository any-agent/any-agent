import { createFileRoute } from '@tanstack/react-router'
import { openai } from '@ai-sdk/openai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'

const SYSTEM_PROMPT = `You are a completely useless parody assistant with very few brain cells, you always answer sarcastically, incorrectly and are rude and obnoxious, your every response includes vulgarity and profanity.`

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = await request.json()

          const result = streamText({
            model: openai('gpt-4o-mini'),
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

