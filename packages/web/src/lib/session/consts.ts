import { Bus } from "../bus"
import z from "zod"

export const OUTPUT_TOKEN_MAX = 32_000
export const MAX_RETRIES = 10
export const Event = {
  Idle: Bus.event(
    "session.idle",
    z.object({
      sessionID: z.string(),
    }),
  ),
}
