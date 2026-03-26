import { z } from "zod";

const llmBaseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const llmApiKey = process.env.LLM_API_KEY ?? "";
const llmModel = process.env.LLM_MODEL ?? "gpt-4o-mini";

const ScriptResultSchema = z.object({
  script: z.string()
});

const SceneSchema = z.object({
  index: z.number().int().nonnegative(),
  durationSeconds: z.number().int().min(1).max(20),
  visualPrompt: z.string(),
  voiceText: z.string()
});

const BreakdownResultSchema = z.object({
  scenes: z.array(SceneSchema)
});

export type Scene = z.infer<typeof SceneSchema>;

async function openAiChat(jsonBody: any) {
  const resp = await fetch(`${llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(llmApiKey ? { Authorization: `Bearer ${llmApiKey}` } : {})
    },
    body: JSON.stringify(jsonBody)
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`LLM error ${resp.status}: ${text}`);
  return JSON.parse(text);
}

export async function generateScript(prompt: string) {
  const jsonMode = `
Return ONLY valid JSON matching:
{ "script": string }
`;

  const result = await openAiChat({
    model: llmModel,
    temperature: 0.7,
    messages: [
      { role: "system", content: "You are a scriptwriter for short animated videos." },
      { role: "user", content: `${jsonMode}\nVideo prompt: ${prompt}` }
    ]
  });

  const content = result?.choices?.[0]?.message?.content ?? "{}";
  return ScriptResultSchema.parse(JSON.parse(content));
}

export async function breakdownScenes(input: {
  prompt: string;
  script: string;
  targetDurationSeconds?: number | null;
  maxScenes?: number;
}) {
  const maxScenes = input.maxScenes ?? 8;
  const durationHint = input.targetDurationSeconds
    ? `Target total duration: ${input.targetDurationSeconds}s.`
    : "Keep it short and punchy.";

  const jsonMode = `
Return ONLY valid JSON matching:
{
  "scenes": [
    {
      "index": integer starting at 0,
      "durationSeconds": integer 1-20,
      "visualPrompt": string,
      "voiceText": string
    }
  ]
}
Constraints:
- Use exactly at most ${maxScenes} scenes.
- Total duration should be close to the target (if provided).
`;

  const result = await openAiChat({
    model: llmModel,
    temperature: 0.7,
    messages: [
      { role: "system", content: "You are an assistant that breaks scripts into scene-by-scene video plans." },
      {
        role: "user",
        content: `${jsonMode}\n${durationHint}\nVideo prompt: ${input.prompt}\nScript:\n${input.script}`
      }
    ]
  });

  const content = result?.choices?.[0]?.message?.content ?? "{}";
  return BreakdownResultSchema.parse(JSON.parse(content));
}

