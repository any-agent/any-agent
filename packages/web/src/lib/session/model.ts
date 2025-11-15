import { Provider } from "../provider/provider"

export async function resolveModel(input: { model?: { providerID: string; modelID: string } }) {
  if (input.model) {
    return input.model
  }
  return Provider.defaultModel()
}