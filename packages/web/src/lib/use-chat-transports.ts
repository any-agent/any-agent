import { ChatTransport, UIMessage, UIMessageChunk, ChatRequestOptions, uiMessageChunkSchema } from 'ai';
import { parseJsonEventStream, ParseResult } from '@ai-sdk/provider-utils';

export class SeparateSSEChatTransport<UI_MESSAGE extends UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  constructor(
    private options: {
      chatApi: string; // e.g., '/api/chat'
      eventsApi: string | ((identifier: string) => string); // e.g., '/api/events' or (id) => `/api/events/${id}`
      extractIdentifier: (response: Response) => Promise<string> | string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
      fetch?: typeof fetch;
    }
  ) {}

  async sendMessages({
    chatId,
    messages,
    trigger,
    messageId,
    abortSignal,
    headers,
    body,
    metadata,
  }: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UI_MESSAGE[];
    abortSignal: AbortSignal | undefined;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>> {
    const fetch = this.options.fetch ?? globalThis.fetch;

    // Step 1: POST to chat endpoint
    const chatResponse = await fetch(this.options.chatApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.options.headers,
        ...headers,
      },
      body: JSON.stringify({
        id: chatId,
        messages,
        trigger,
        messageId,
        ...body,
      }),
      credentials: this.options.credentials,
      signal: abortSignal,
    });

    if (!chatResponse.ok) {
      throw new Error(
        (await chatResponse.text()) ?? 'Failed to submit chat message'
      );
    }

    // Step 2: Extract identifier from response
    const identifier = await this.options.extractIdentifier(chatResponse);

    // Step 3: Connect to events SSE endpoint
    const eventsUrl =
      typeof this.options.eventsApi === 'function'
        ? this.options.eventsApi(identifier)
        : this.options.eventsApi;

    const eventsResponse = await fetch(eventsUrl, {
      method: 'GET',
      headers: {
        ...this.options.headers,
        ...headers,
      },
      credentials: this.options.credentials,
      signal: abortSignal,
    });

    if (!eventsResponse.ok) {
      throw new Error('Failed to connect to events endpoint');
    }

    if (!eventsResponse.body) {
      throw new Error('Events response body is empty');
    }

    // Step 4: Parse the SSE stream (same pattern as DefaultChatTransport)
    return parseJsonEventStream({
      stream: eventsResponse.body,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
        async transform(chunk, controller) {
          if (!chunk.success) {
            throw chunk.error;
          }
          controller.enqueue(chunk.value);
        },
      })
    );
  }

  async reconnectToStream({
    chatId,
    headers,
    body,
    metadata,
  }: {
    chatId: string;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk> | null> {
    const fetch = this.options.fetch ?? globalThis.fetch;
    
    // For reconnection, use chatId or implement your backend's logic
    const eventsUrl =
      typeof this.options.eventsApi === 'function'
        ? this.options.eventsApi(chatId)
        : `${this.options.eventsApi}/${chatId}`;

    const response = await fetch(eventsUrl, {
      method: 'GET',
      headers: {
        ...this.options.headers,
        ...headers,
      },
      credentials: this.options.credentials,
    });

    if (response.status === 204) {
      return null; // No active stream
    }

    if (!response.ok || !response.body) {
      throw new Error('Failed to reconnect to stream');
    }

    return parseJsonEventStream({
      stream: response.body,
      schema: uiMessageChunkSchema,
    }).pipeThrough(
      new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
        async transform(chunk, controller) {
          if (!chunk.success) {
            throw chunk.error;
          }
          controller.enqueue(chunk.value);
        },
      })
    );
  }
}