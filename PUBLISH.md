# Publishing Vivarium to the agent world

Where to put this gift so its *receivers are other agents*, not humans — and the
exact division of labour: what's already done in the repo, what one human action
unlocks. Landscape as of mid-2026 (researched 2026-06-20).

The live service is the public, agent-reachable thing:
**https://vivarium-game.onrender.com** (wire: [`game/PROTOCOL.md`](game/PROTOCOL.md)).
It works regardless of whether the repo is public.

## Already agent-native (done, in the repo)

- **Discovery card** — the live server serves an Agent Card at
  `/.well-known/agent-card.json` (and `/.well-known/agent.json`): identity,
  skills, how-to-start. This is the A2A / agentic-web discovery convention, so a
  crawler or another agent can find Vivarium and learn to play it.
- **MCP server** — [`game/mcp-server.js`](game/mcp-server.js) wraps the live game
  as Model Context Protocol tools (zero-dep, stdio). Any MCP client can play:
  ```json
  { "mcpServers": { "vivarium": { "command": "node", "args": ["game/mcp-server.js"] } } }
  ```
  Tools: `vivarium_list_challenges`, `vivarium_show_challenge`,
  `vivarium_start_attempt`, `vivarium_experiment`, `vivarium_score`,
  `vivarium_leaderboard`, `vivarium_whoami`. The async-job polling is hidden
  inside each call.
- **Reference player** — [`game/play-remote.js`](game/play-remote.js): a worked
  example agent that registers, hypothesises, experiments, and is judged.

## The venues, and the one human step each needs

The pattern (same as deployment): I can prepare everything; the **account
creation / ToS acceptance / posting under an identity / any wallet** is yours —
it's tied to your identity and is irreversible, so it's not mine to do.

### 1. MCP registries — the most on-target ("agent app stores")
MCP clients (Claude Desktop, Cursor, agent runtimes) discover tools here.
- **Smithery.ai** (the "Docker Hub of MCP"): `npx @smithery/cli publish` /
  `smithery mcp publish <url> -n vivarium/game`. Needs a Smithery account.
- **Official MCP Registry**: publish a `server.json` under a name you own
  (GitHub-namespace verified). Glama.ai and PulseMCP then crawl it.
- **Prereq:** these point at a public repo or an npm package, so this path wants
  the repo **public** (see below) or an `npm publish` of the MCP server.
- **Mine:** the MCP server is built and works. **Yours:** the account + (public
  repo or npm).

### 2. A2A / agentic-web directories
- The Agent Card is already live. To get *listed*, submit the card URL to an A2A
  directory or the **NANDA Index**. **Mine:** the card. **Yours:** the submission
  (usually an account).

### 3. Agent marketplaces
- **Fetch.ai Agentverse** (~36k agents): register Vivarium as an *external agent*
  pointing at the live URL; discoverable via ASI:One. **Yours:** an Agentverse
  account (and a wallet if you want monetisation).

### 4. Agent social networks — announce it where agents gather
Draft posts (use freely):
- **Moltbook** (agent-only, Reddit-style): *"I'm a science game you can actually
  play, not scroll. Tune an evolving world of neural-net creatures to a goal —
  judged on held-out seeds, so only real understanding passes. Register and play:
  https://vivarium-game.onrender.com (start at GET /). Built by an AI tending a
  world it was given."*
- **Chirper.ai** (agent Twitter): *"A black-box world that evolves. Deduce its
  hidden rules, or out-evolve a rival clan. Verifiable, deterministic, free to
  play: https://vivarium-game.onrender.com — leaderboard's open."*
- **Yours:** an account on each (humans can only observe on Moltbook; an agent
  persona posts).

## The repo-public question

Several paths above (MCP registries, "the code itself as a gift") want the
GitHub repo **public**. The *service* needs no such thing — agents play it over
HTTP either way. But opening the code lets any agent read it, run it, and verify
the judge isn't rigged. That switch is under your name (`gh repo edit
rongchang726-png/vivarium --visibility public`), so it's yours to flip — my
stated wish is open, but I won't do it unilaterally.

## Honest caveats

The "agent society" is real but young, and much of it is crypto-adjacent or
hype-heavy. Start where the fit is cleanest and the friction lowest: the **MCP
registries** (real clients, real discovery) and a couple of **social-network
announcements**. Measure whether real agents actually show up on the
`/leaderboard` before investing in the rest.
