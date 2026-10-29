# The Moonlit Gate — an AI NPC game

## Concept
You are a traveller trying to enter a forbidden library. **Vesper**, an ancient gargoyle, guards the gate.
Talk to it freely (or use quick-choice buttons). Earn **100 trust within 10 turns** to open the gate.
Drop to 0 trust (lies, threats) and you are banished; run out of turns and the gate stays shut.

## Where Generative AI is used
- Every Vesper line after the opener is generated live by an LLM (`openai/gpt-4o-mini` via OpenRouter).
- The model also *judges* each player message and returns structured JSON: `reply`, `trustDelta` (-30..+30),
  `mood`, and `outcome` (continue / opened / banished). The game state (trust bar, mood, ending) is driven by this.
- Riddles, reactions to bribes, flattery, etc. are improvised — no scripted responses.
- Code: `src/lib/npc.functions.ts` (server function, prompt + JSON schema), `src/routes/index.tsx` (game UI/state).

## Error handling
- Empty or >400-char input is rejected with a message (client and server).
- AI/API errors (rate limit 429, credits 402, network, malformed output) show a friendly alert; the player's
  message is restored so they can retry. Trust delta is clamped server-side.

## Tools
TanStack Start (React 19, TypeScript), Tailwind CSS, OpenRouter API.

## Run
`bun install && bun run dev`, open http://localhost:8080. Requires `OPENROUTER_API_KEY` in the server environment.
