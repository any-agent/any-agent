type EventPayload = {
  type: string
  properties: unknown
}

type Subscription = (event: EventPayload) => void | Promise<void>

const subscriptions = new Map<string, Subscription[]>()

export namespace Bus {
  export type EventDefinition = {
    type: string
    properties: unknown
  }

  const registry = new Map<string, EventDefinition>()

  export function event<Type extends string, Properties extends unknown>(
    type: Type,
    properties: Properties,
  ) {
    const result = {
      type,
      properties,
    }
    registry.set(type, result)
    return result
  }

  export async function publish<Definition extends EventDefinition>(
    def: Definition,
    properties: unknown,
  ) {
    const payload = {
      type: def.type,
      properties,
    }
    const pending: Promise<void>[] = []
    for (const key of [def.type, '*']) {
      const match = subscriptions.get(key)
      for (const sub of match ?? []) {
        const result = sub(payload)
        if (result instanceof Promise) {
          pending.push(result)
        }
      }
    }
    await Promise.all(pending)
  }

  export function subscribe<Definition extends EventDefinition>(
    def: Definition,
    callback: (event: { type: Definition['type']; properties: unknown }) => void | Promise<void>,
  ) {
    return raw(def.type, callback)
  }

  export function subscribeAll(callback: (event: EventPayload) => void | Promise<void>) {
    return raw('*', callback)
  }

  function raw(type: string, callback: (event: EventPayload) => void | Promise<void>) {
    const match = subscriptions.get(type) ?? []
    match.push(callback)
    subscriptions.set(type, match)

    return () => {
      const match = subscriptions.get(type)
      if (!match) return
      const index = match.indexOf(callback)
      if (index === -1) return
      match.splice(index, 1)
    }
  }
}

