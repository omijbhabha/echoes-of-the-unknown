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
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI is not configured." };
    const input = [
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
      const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          instructions: SYSTEM,
          input,
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: "npc_turn", strict: true, schema } },
        }),
      });
      if (!res.ok || !res.body) {
        const msg =
          res.status === 429
            ? "Vesper is overwhelmed (rate limited). Wait a moment and try again."
            : res.status === 402
              ? "AI credits have run out for this workspace."
              : `The gargoyle's magic flickered (error ${res.status}). Try again.`;
        return { ok: false, error: msg };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const ev = JSON.parse(payload);
            if (ev.type === "response.output_text.delta") text += ev.delta;
            if (ev.type === "error" || ev.type === "response.failed")
              return { ok: false, error: "The AI failed to respond. Try again." };
          } catch {
            /* partial */
          }
        }
      }
      const parsed = JSON.parse(text) as NpcResult;
      parsed.trustDelta = Math.max(-30, Math.min(30, Math.round(parsed.trustDelta || 0)));
      return { ok: true, result: parsed };
    } catch (e) {
      console.error(e);
      return { ok: false, error: "Vesper's words were lost in the wind (network/AI error). Try again." };
    }
  });
