// USD per million tokens, standard processing. Checked against
// https://developers.openai.com/api/docs/pricing on 2026-09-29.
const MODEL_RATES: Record<
  string,
  { input: number; cachedInput: number; output: number; longContext: boolean }
> = {
  "gpt-5-mini": {
    input: 0.25,
    cachedInput: 0.025,
    output: 2,
    longContext: false,
  },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15, longContext: true },
  "gpt-5.4-mini": {
    input: 0.75,
    cachedInput: 0.075,
    output: 4.5,
    longContext: false,
  },
  "gpt-5.6-luna": {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
    longContext: true,
  },
  "gpt-5.6-terra": {
    input: 2,
    cachedInput: 0.2,
    output: 12,
    longContext: true,
  },
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20, longContext: true },
};

function rateForModel(model: string) {
  const normalized = model === "gpt-5.6" ? "gpt-5.6-sol" : model;
  const key = Object.keys(MODEL_RATES)
    .sort((left, right) => right.length - left.length)
    .find((name) => normalized === name || normalized.startsWith(`${name}-20`));
  return key ? MODEL_RATES[key] : null;
}

export function estimateOpenAiUsd(input: {
  model: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  webSearchCalls: number;
}) {
  const rates = rateForModel(input.model);
  if (!rates || input.inputTokens === null || input.outputTokens === null)
    return null;
  const cached = Math.min(input.cachedInputTokens ?? 0, input.inputTokens);
  const longContext = rates.longContext && input.inputTokens > 272_000;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  return (
    ((input.inputTokens - cached) * rates.input * inputMultiplier +
      cached * rates.cachedInput * inputMultiplier +
      input.outputTokens * rates.output * outputMultiplier) /
      1_000_000 +
    input.webSearchCalls * 0.01
  );
}

export function openAiResponseUsage(response: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  } | null;
  output?: unknown;
}) {
  return {
    inputTokens: response.usage?.input_tokens ?? null,
    cachedInputTokens:
      response.usage?.input_tokens_details?.cached_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens: response.usage?.total_tokens ?? null,
    webSearchCalls: Array.isArray(response.output)
      ? response.output.filter(
          (item) =>
            item && typeof item === "object" && item.type === "web_search_call",
        ).length
      : 0,
  };
}
