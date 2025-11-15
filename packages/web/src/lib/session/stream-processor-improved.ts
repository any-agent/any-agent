import { MessageV2 } from "./message-v2"
import { Identifier } from "../id/id"
import {
  type Tool as AITool,
  type StreamTextResult,
} from "ai"
import { Log } from "../util/log"
import { Session } from "."
import { Instance } from "../project/instance"
import { ModelsDev } from "../provider/models"
import { Permission } from "../permission"
import { Snapshot } from "../snapshot"
import { SessionSummary } from "./summary"
import { Bus } from "../bus"

export type Processor = Awaited<ReturnType<typeof createProcessor>>
export async function createProcessor(input: {
  sessionID: string
  providerID: string
  model: ModelsDev.Model
  system: string[]
  abort: AbortSignal
  log: Log.Logger
}) {
  const toolcalls: Record<string, MessageV2.ToolPart> = {}
  let snapshot: string | undefined
  let blocked = false

  async function createMessage(parentID: string) {
    const msg: MessageV2.Info = {
      id: Identifier.ascending("message"),
      parentID,
      role: "assistant",
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: input.model.id,
      providerID: input.providerID,
      time: {
        created: Date.now(),
      },
      sessionID: input.sessionID,
    }
    await Session.updateMessage(msg)
    return msg
  }

  let assistantMsg: MessageV2.Assistant | undefined

  const result = {
    async end() {
      if (assistantMsg) {
        assistantMsg.time.completed = Date.now()
        await Session.updateMessage(assistantMsg)
        assistantMsg = undefined
      }
    },
    async next(parentID: string) {
      if (assistantMsg) {
        throw new Error("end previous assistant message first")
      }
      assistantMsg = await createMessage(parentID)
      return assistantMsg
    },
    get message() {
      if (!assistantMsg) throw new Error("call next() first before accessing message")
      return assistantMsg
    },
    partFromToolCall(toolCallID: string) {
      return toolcalls[toolCallID]
    },
    async process(stream: StreamTextResult<Record<string, AITool>, never>, retries: { count: number; max: number }) {
      input.log.info("process")
      if (!assistantMsg) throw new Error("call next() first before processing")
      let shouldRetry = false
      try {
        let currentText: MessageV2.TextPart | undefined
        let reasoningMap: Record<string, MessageV2.ReasoningPart> = {}

        for await (const value of stream.fullStream) {
          input.abort.throwIfAborted()
          switch (value.type) {
            case "start":
              break

            case "reasoning-start":
              if (value.id in reasoningMap) {
                continue
              }
              reasoningMap[value.id] = {
                id: Identifier.ascending("part"),
                messageID: assistantMsg.id,
                sessionID: assistantMsg.sessionID,
                type: "reasoning",
                text: "",
                time: {
                  start: Date.now(),
                },
                metadata: value.providerMetadata,
              }
              break

            case "reasoning-delta":
              if (value.id in reasoningMap) {
                const part = reasoningMap[value.id]
                part.text += value.text
                if (value.providerMetadata) part.metadata = value.providerMetadata
                if (part.text) await Session.updatePart({ part, delta: value.text })
              }
              break

            case "reasoning-end":
              if (value.id in reasoningMap) {
                const part = reasoningMap[value.id]
                part.text = part.text.trimEnd()

                part.time = {
                  ...part.time,
                  end: Date.now(),
                }
                if (value.providerMetadata) part.metadata = value.providerMetadata
                await Session.updatePart(part)
                delete reasoningMap[value.id]
              }
              break

            case "tool-input-start":
              const part = await Session.updatePart({
                id: toolcalls[value.id]?.id ?? Identifier.ascending("part"),
                messageID: assistantMsg.id,
                sessionID: assistantMsg.sessionID,
                type: "tool",
                tool: value.toolName,
                callID: value.id,
                state: {
                  status: "pending",
                  input: {},
                  raw: "",
                },
              })
              toolcalls[value.id] = part as MessageV2.ToolPart
              break

            case "tool-input-delta":
              break

            case "tool-input-end":
              break

            case "tool-call": {
              const match = toolcalls[value.toolCallId]
              if (match) {
                const part = await Session.updatePart({
                  ...match,
                  tool: value.toolName,
                  state: {
                    status: "running",
                    input: value.input,
                    time: {
                      start: Date.now(),
                    },
                  },
                  metadata: value.providerMetadata,
                })
                toolcalls[value.toolCallId] = part as MessageV2.ToolPart
              }
              break
            }
            case "tool-result": {
              const match = toolcalls[value.toolCallId]
              if (match && match.state.status === "running") {
                await Session.updatePart({
                  ...match,
                  state: {
                    status: "completed",
                    input: value.input,
                    output: value.output.output,
                    metadata: value.output.metadata,
                    title: value.output.title,
                    time: {
                      start: match.state.time.start,
                      end: Date.now(),
                    },
                    attachments: value.output.attachments,
                  },
                })

                delete toolcalls[value.toolCallId]
              }
              break
            }

            case "tool-error": {
              const match = toolcalls[value.toolCallId]
              if (match && match.state.status === "running") {
                await Session.updatePart({
                  ...match,
                  state: {
                    status: "error",
                    input: value.input,
                    error: (value.error as any).toString(),
                    metadata: value.error instanceof Permission.RejectedError ? value.error.metadata : undefined,
                    time: {
                      start: match.state.time.start,
                      end: Date.now(),
                    },
                  },
                })

                if (value.error instanceof Permission.RejectedError) {
                  blocked = true
                }
                delete toolcalls[value.toolCallId]
              }
              break
            }
            case "error":
              throw value.error

            case "start-step":
              snapshot = await Snapshot.track()
              await Session.updatePart({
                id: Identifier.ascending("part"),
                messageID: assistantMsg.id,
                sessionID: assistantMsg.sessionID,
                snapshot,
                type: "step-start",
              })
              break

            case "finish-step":
              const usage = Session.getUsage({
                model: input.model,
                usage: value.usage,
                metadata: value.providerMetadata,
              })
              assistantMsg.tokens = usage.tokens
              await Session.updatePart({
                id: Identifier.ascending("part"),
                reason: value.finishReason,
                snapshot: await Snapshot.track(),
                messageID: assistantMsg.id,
                sessionID: assistantMsg.sessionID,
                type: "step-finish",
                tokens: usage.tokens,
              })
              await Session.updateMessage(assistantMsg)
              if (snapshot) {
                const patch = await Snapshot.patch(snapshot)
                if (patch.files.length) {
                  await Session.updatePart({
                    id: Identifier.ascending("part"),
                    messageID: assistantMsg.id,
                    sessionID: assistantMsg.sessionID,
                    type: "patch",
                    hash: patch.hash,
                    files: patch.files,
                  })
                }
                snapshot = undefined
              }
              SessionSummary.summarize({
                sessionID: input.sessionID,
                messageID: assistantMsg.parentID,
              })
              break

            case "text-start":
              currentText = {
                id: Identifier.ascending("part"),
                messageID: assistantMsg.id,
                sessionID: assistantMsg.sessionID,
                type: "text",
                text: "",
                time: {
                  start: Date.now(),
                },
                metadata: value.providerMetadata,
              }
              break

            case "text-delta":
              if (currentText) {
                currentText.text += value.text
                if (value.providerMetadata) currentText.metadata = value.providerMetadata
                if (currentText.text)
                  await Session.updatePart({
                    part: currentText,
                    delta: value.text,
                  })
              }
              break

            case "text-end":
              if (currentText) {
                currentText.text = currentText.text.trimEnd()
                currentText.time = {
                  start: Date.now(),
                  end: Date.now(),
                }
                if (value.providerMetadata) currentText.metadata = value.providerMetadata
                await Session.updatePart(currentText)
              }
              currentText = undefined
              break

            case "finish":
              assistantMsg.time.completed = Date.now()
              await Session.updateMessage(assistantMsg)
              break

            default:
              input.log.info("unhandled", {
                ...value,
              })
              continue
          }
        }
      } catch (e) {
        input.log.error("process", {
          error: e,
        })
        const error = MessageV2.fromError(e, { providerID: input.providerID })
        if (retries.count < retries.max && MessageV2.APIError.isInstance(error) && error.data.isRetryable) {
          shouldRetry = true
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: assistantMsg.id,
            sessionID: assistantMsg.sessionID,
            type: "retry",
            attempt: retries.count + 1,
            time: {
              created: Date.now(),
            },
            error,
          })
        } else {
          assistantMsg.error = error
          Bus.publish(Session.Event.Error, {
            sessionID: assistantMsg.sessionID,
            error: assistantMsg.error,
          })
        }
      }
      const p = await MessageV2.parts(assistantMsg.id)
      for (const part of p) {
        if (part.type === "tool" && part.state.status !== "completed" && part.state.status !== "error") {
          await Session.updatePart({
            ...part,
            state: {
              ...part.state,
              status: "error",
              error: "Tool execution aborted",
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            },
          })
        }
      }
      if (!shouldRetry) {
        assistantMsg.time.completed = Date.now()
      }
      await Session.updateMessage(assistantMsg)
      return { info: assistantMsg, parts: p, blocked, shouldRetry }
    },
  }
  return result
}
