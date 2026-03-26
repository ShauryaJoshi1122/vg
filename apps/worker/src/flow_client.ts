import { z } from "zod";

const flowBaseUrl = process.env.FLOW_BASE_URL ?? "";
const flowApiKey = process.env.FLOW_API_KEY ?? "";
const visualEndpoint = process.env.FLOW_VISUAL_ENDPOINT ?? "/v1/visuals:generate";
const ttsEndpoint = process.env.FLOW_TTS_ENDPOINT ?? "/v1/tts:synthesize";

if (!flowBaseUrl) {
  // In production, this should be configured via environment.
  // Keep worker import-safe for scaffolding.
}

export const FlowVisualResponseSchema = z.object({
  uri: z.string()
});

export const FlowTtsResponseSchema = z.object({
  uri: z.string()
});

export type FlowVisualResult = z.infer<typeof FlowVisualResponseSchema>;
export type FlowTtsResult = z.infer<typeof FlowTtsResponseSchema>;

async function flowPost(path: string, body: any) {
  const url = `${flowBaseUrl}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(flowApiKey ? { Authorization: `Bearer ${flowApiKey}` } : {})
    },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Flow API error ${resp.status}: ${text}`);
  }
  return JSON.parse(text);
}

export async function generateVisual(input: {
  scenePrompt: string;
  styleProfile?: string | null;
}) {
  const payload = {
    prompt: input.scenePrompt,
    style_profile: input.styleProfile ?? null
  };
  const json = await flowPost(visualEndpoint, payload);
  return FlowVisualResponseSchema.parse(json);
}

export async function synthesizeVoice(input: {
  text: string;
  voiceProfile?: string | null;
}) {
  const payload = {
    text: input.text,
    voice_profile: input.voiceProfile ?? null
  };
  const json = await flowPost(ttsEndpoint, payload);
  return FlowTtsResponseSchema.parse(json);
}

