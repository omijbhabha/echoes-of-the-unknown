import { createServerFn } from "@tanstack/react-start";

export type Turn = { role: "player" | "npc"; text: string };
export type NpcResult = {
  reply: string;
  trustDelta: number;
  mood: "suspicious" | "amused" | "angry" | "impressed" | "neutral";
  outcome: "continue" | "opened" | "banished";
};

const SYSTEM = `You are Vesper, an ancient, witty stone gargoyle guarding the Moonlit Gate of a forbidden library.
The player is a traveller who wants to get through. You only open the gate for someone who earns your trust
through cleverness, honesty, kindness, or solving your riddles. You may pose riddles, ask questions, react to bribes,
lies, threats or flattery. Stay in character, 1-4 sentences, vivid and playful. Never mention being an AI.
Current trust (0-100) and turns remaining are given. Return trustDelta between -30 and +30 judging the player's latest message.
Set outcome "opened" only if trust after delta would reach 100 or the player truly solves your final challenge; "banished" if trust drops to 0 or the player is very hostile; else "continue".`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "trustDelta", "mood", "outcome"],
  properties: {
    reply: { type: "string" },
    trustDelta: { type: "integer" },
    mood: { type: "string", enum: ["suspicious", "amused", "angry", "impressed", "neutral"] },
    outcome: { type: "string", enum: ["continue", "opened", "banished"] },
  },
};

export const talkToNpc = createServerFn({ method: "POST" })
  .inputValidator((d: { history: Turn[]; message: string; trust: number; turnsLeft: number }) => {
    const message = String(d?.message ?? "").trim();
    if (!message) throw new Error("Say something to Vesper first.");
    if (message.length > 400) throw new Error("Too long — keep it under 400 characters.");
    return { ...d, message, history: (d.history ?? []).slice(-16) };
  })
  .handler(async ({ data }): Promise<{ ok: true; result: NpcResult } | { ok: false; error: string }> => {
    const key = process.env["OPENROUTER_API_KEY"];
    if (!key) return { ok: false, error: "AI is not configured (missing OpenRouter key)." };
    const messages = [
      { role: "system", content: SYSTEM },
      ...data.history.map((t) => ({
        role: t.role === "player" ? "user" : "assistant",
        content: t.text,
      })),
      {
        role: "user",
        content: `[trust=${data.trust}, turnsLeft=${data.turnsLeft}] ${data.message}`,
      },
    ];
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Title": "The Moonlit Gate",
        },
        body: JSON.stringify({
          models: ["nvidia/nemotron-3.5-super-vl:free", "xingchen-agi/xing4.0-29b-a4b:free", "dots-studio/dots-3-note-preview:free"],
          messages,
          response_format: {
            type: "json_schema",
            json_schema: { name: "npc_turn", strict: true, schema },
          },
        }),
      });
      if (!res.ok) {
        const msg =
          res.status === 429
            ? "Vesper is overwhelmed (rate limited). Wait a moment and try again."
            : res.status === 401
              ? "The OpenRouter key is invalid."
              : res.status === 402
                ? "Your OpenRouter account is out of credits."
                : `The gargoyle's magic flickered (error ${res.status}). Try again.`;
        return { ok: false, error: msg };
      }
      const json = await res.json();
      const text: string = json?.choices?.[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { ok: false, error: "Vesper mumbled something unclear. Try again." };
      const parsed = JSON.parse(m[0]) as NpcResult;
      if (!parsed.reply) return { ok: false, error: "Vesper mumbled something unclear. Try again." };
      parsed.trustDelta = Math.max(-30, Math.min(30, Math.round(parsed.trustDelta || 0)));
      return { ok: true, result: parsed };
    } catch (e) {
      console.error(e);
      return { ok: false, error: "Vesper's words were lost in the wind (network/AI error). Try again." };
    }
  });
