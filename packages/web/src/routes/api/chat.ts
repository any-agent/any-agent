import { createFileRoute } from '@tanstack/react-router'
import { openai } from '@ai-sdk/openai'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { createProcessor } from '../../lib/session/stream-processor-improved'
import { resolveModel } from '@/lib/session/model'
import { Provider } from '@/lib/provider/provider'
import { SessionLock } from '@/lib/session/lock'
import { Log } from '@/lib/util/log'
import { Session } from '@/lib/session'
import { Bus } from '@/lib/bus'
import { Event } from '@/lib/session/consts'
import { SystemPrompt } from '@/lib/session/system'
import type { UIMessage } from 'ai'
import z from 'zod'
import { Plugin } from '@/lib/plugin'
import { ProviderTransform } from '@/lib/provider/transform'
import { SessionRevert } from '@/lib/session/revert'
import { createUserMessage } from '@/lib/session/user-message'
import { Instance } from '@/lib/project/instance'
import { MessageV2 } from '@/lib/session/message-v2'

const SYSTEM_PROMPT = `You are a completely useless parody assistant with very few brain cells, you always answer sarcastically, incorrectly and are rude and obnoxious, your every response includes vulgarity and profanity.`

const messageSchema = z.object({
  role: z.string()
}).loose()

const postChatRequestSchema = z.object({
  messages: z.array(messageSchema).transform((messages) => messages as unknown as UIMessage[]),
  id: z.string().optional(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }).optional(),
})

function isBusy(sessionID: string) {
  return SessionLock.isLocked(sessionID)
}

function lock(sessionID: string, log: Log.Logger) {
  const handle = SessionLock.acquire({
    sessionID,
  })
  log.info("locking", { sessionID })
  return {
    signal: handle.signal,
    abort: handle.abort,
    async [Symbol.dispose]() {
      handle[Symbol.dispose]()
      log.info("unlocking", { sessionID })

      const session = await Session.get(sessionID)
      if (session.parentID) return

      Bus.publish(Event.Idle, {
        sessionID,
      })
    },
  }
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const log = Log.create({ service: "session.prompt" })
          const input = await postChatRequestSchema.parseAsync(await request.json())

          const sessionId = input.id || crypto.randomUUID()
          const requestId = crypto.randomUUID()

          const state = Instance.state(
            () => {
              const queued = new Map<
                string,
                {
                  messageID: string
                  callback: (input: MessageV2.WithParts) => void
                }[]
              >()
              const pending = new Set<Promise<void>>()
        
              const track = (promise: Promise<void>) => {
                pending.add(promise)
                promise.finally(() => pending.delete(promise))
              }
        
              return {
                queued,
                pending,
                track,
              }
            },
            async (current) => {
              current.queued.clear()
              await Promise.allSettled([...current.pending])
            },
          )

          const session = await Session.get(sessionId)
          await SessionRevert.cleanup(session)

          const userMsg = await createUserMessage({ ...input, sessionID: sessionId, log })
          await Session.touch(sessionId)

          if (isBusy(sessionId)) {
            return new Promise((resolve) => {
              const queue = state().queued.get(sessionId) ?? []
              queue.push({
                messageID: userMsg.info.id,
                callback: resolve,
              })
              state().queued.set(sessionId, queue)
            })
          }

          const model = await resolveModel({
            model: input.model,
          }).then((x) => Provider.getModel(x.providerID, x.modelID))

          using abort = lock(sessionId, log)

          const system = await SystemPrompt.resolveSystemPrompt({
            providerID: model.providerID,
            modelID: model.info.id,
          })

          const processor = await createProcessor({
            sessionID: sessionId,
            model: model.info,
            providerID: model.providerID,
            system,
            abort: abort.signal,
            log,
          })

          const params = await Plugin.trigger(
            "chat.params",
            {
              sessionID: sessionId,
              model: model.info,
              provider: await Provider.getProvider(model.providerID),
              message: userMsg,
            },
            {
              temperature: model.info.temperature
                ? ProviderTransform.temperature(model.providerID, model.modelID)
                : undefined,
              topP: ProviderTransform.topP(model.providerID, model.modelID),
              options: {
                ...ProviderTransform.options(model.providerID, model.modelID, sessionId),
                ...model.info.options,
              },
            },
          )

          const result = streamText({
            model: openai('gpt-4o-mini'),
            messages: convertToModelMessages(messages),
            temperature: 0.7,
            stopWhen: stepCountIs(5),
            system: SYSTEM_PROMPT,
          })

          processStreamText(result, sessionId, requestId).catch((error) => {
            console.error('Background stream processing error:', error)
          })

          return new Response(JSON.stringify({ sessionId, requestId }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
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
} as any)

