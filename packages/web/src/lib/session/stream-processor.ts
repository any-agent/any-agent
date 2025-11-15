// import type { StreamTextResult } from 'ai'
// import type { UIMessageChunk } from 'ai'
// import { Bus } from '../bus'

// const ChatEvent = Bus.event('chat.message', {
//   sessionId: '',
//   requestId: '',
//   chunk: {} as UIMessageChunk,
// })

// export async function processStreamText(
//   // biome-ignore lint/suspicious/noExplicitAny: StreamTextResult requires complex generic types
//   result: StreamTextResult<any, any>,
//   sessionId: string,
//   requestId: string,
// ): Promise<void> {
//   try {
//     const response = result.toUIMessageStreamResponse()
//     const reader = response.body?.getReader()
//     if (!reader) {
//       throw new Error('No response body reader available')
//     }

//     const decoder = new TextDecoder()
//     let buffer = ''

//     while (true) {
//       const { done, value } = await reader.read()
//       if (done) break

//       buffer += decoder.decode(value, { stream: true })
//       const lines = buffer.split('\n')
//       buffer = lines.pop() || ''

//       for (const line of lines) {
//         if (line.startsWith('data: ')) {
//           const jsonStr = line.slice(6).trim()
//           if (!jsonStr || jsonStr === '[DONE]') continue

//           try {
//             const chunk = JSON.parse(jsonStr) as UIMessageChunk
//             await Bus.publish(ChatEvent, {
//               sessionId,
//               requestId,
//               chunk,
//             })
//           } catch (e) {
//             console.error('Failed to parse chunk:', e)
//           }
//         }
//       }
//     }
//   } catch (error) {
//     console.error('Stream processing error:', error)
//     throw error
//   }
// }

