# ContextOS — Durable Learnings Log

This file contains operational learnings, project quirks, command fixes, and patterns discovered by agents over time. 
During the SHIP phase, agents are instructed to record any durable learnings here so that future workflows can benefit from them.

## Learnings

- Benchmark evidence must bind each response to the exact prompt-pack run and prompt hash; manually imported chat answers otherwise can be attributed to the wrong ContextOS context.
- Treat missing provider usage for retries as incomplete token accounting, never as zero. Label chat UI counts as user-reported and leave hidden/unavailable token counts null.
