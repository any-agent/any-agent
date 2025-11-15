import { UIMessage } from "ai";
import { MessageV2 } from "./message-v2";
import { Identifier } from "../id/id";
import { Log } from "../util/log";
import { Plugin } from "../plugin";
import { Session } from ".";

export async function createUserMessage(input: {
  sessionID: string;
  messages: UIMessage[];
  model?: {
    providerID: string;
    modelID: string;
  } | undefined
  log: Log.Logger
}) {
  const info: MessageV2.Info = {
    id: Identifier.ascending("message"),
    role: "user",
    sessionID: input.sessionID,
    time: {
      created: Date.now(),
    },
  }

  const lastMessage = input.messages[input.messages.length - 1]

  const parts = await Promise.all(
    lastMessage.parts.map(async (part): Promise<MessageV2.Part[]> => {
      if (part.type === "file") {
        const url = new URL(part.url)
        switch (url.protocol) {
          case "data:":
            if (part.mediaType === "text/plain") {
              return [
                {
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                },
                {
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: Buffer.from(part.url, "base64url").toString(),
                },
                {
                  ...part,
                  mime: part.mediaType,
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                },
              ]
            }
            break
        }
      }

      if (part.type === "text") {
        return [
          {
            id: Identifier.ascending("part"),
            ...part,
            messageID: info.id,
            sessionID: input.sessionID,
          },
        ]
      }

      return []
    }),
  ).then((x) => x.flat())

  await Plugin.trigger(
    "chat.message",
    {
      sessionID: input.sessionID,
      model: input.model,
      messageID: info.id,
    },
    {
      message: info,
      parts,
    },
  )

  await Session.updateMessage(info)
  for (const part of parts) {
    await Session.updatePart(part)
  }

  return {
    info,
    parts,
  }
}
