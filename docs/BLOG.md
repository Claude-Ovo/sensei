# Building Sensei: an agent that sits next to you in the terminal

*This post was created for the purposes of entering the All Things Agentic Hackathon.*

I learn tools by breaking them. `git`, Docker, an MCP server — I type, it errors, I search, I try again, and three hours later it works and I couldn't tell you why. Chat assistants don't help with the *doing* part: they sit in another window, they only know what I paste, and they never see the stream.

So for the All Things Agentic Hackathon I built the thing I wanted: a senior engineer who sits beside the terminal, says nothing until the evidence says I'm stuck, takes notes the whole time, and at the end hands me the write-up I'd never have written myself. It's called **Sensei**, and it's a Collaborative Partner entry built on Gemini 3.7 Flash, the Google ADK for TypeScript, Cloud Firestore and Firebase Hosting.

## What it does

```
$ sensei start -g "build my first MCP server" --public
[sensei] watching · session 20260819-…
[sensei] agent: observer gemini-3.5-flash-lite · coach/compiler gemini-3.7-flash · triage gemma-4-26b-a4b-it
PS ~/mcp-demo> node server.js
SyntaxError: Cannot use import statement outside a module
PS ~/mcp-demo> node server.js
SyntaxError: Cannot use import statement outside a module

[sensei] Node.js 默认不支持在 .js 文件中直接使用 ES Module 的 import 语法。
         你可以根据报错提示，在 package.json 中添加一个配置项，或者更改文件的后缀名。
```

`sensei start` wraps your shell in a pty. Everything you type and everything the terminal prints is captured, redacted locally (API keys, tokens, emails, home paths never leave the machine), logged as JSONL, and mirrored to Firestore.

A background **Observer** agent reads the messy stream and decides, on evidence, whether you're flowing, exploring or stuck. Default is silence. It failed me once, I tried the same thing again, *then* it spoke — one line, in my language, "hint-first" because that's what my profile says. If I'd rather just have the answer: `sensei fb just-tell-me`. If I have a question: `sensei ask "stdio or http?"` gets a grounded answer from the **Coach**. If *it* needs to know something, it asks one clarifying question and I `sensei reply`.

`sensei done` runs the **Compiler**: the whole session — commands, errors, notes, milestones, Q&A — becomes a tutorial with a "pitfalls we hit" table and a 60-second script. I learned it; now I can teach it. (The 60-second script is going straight into my short-video pipeline.)

A web panel on Firebase Hosting shows the live session, hints, notes, questions, the learner profile and the compiled tutorial; replies and feedback typed there flow back into the terminal through a Firestore `inbound` collection.

## How it's built

**The gate, not the model, is the product.** The first version commented on everything. What fixed it was structural:

1. a free regex pre-filter (prompt-only output → skip; error words → escalate),
2. a **Gemma 4** triage call ("worth a senior engineer's attention right now?"),
3. only then the **Observer** on Gemini, with a structured JSON output (`status`, `stuck_reason`, `hint`, `question`, `note`, `milestone`, `profile_update`),
4. plus a hint cooldown and a prompt that forbids cheerleading and restating.

**ADK for TypeScript** gave me `LlmAgent` + `outputSchema` (zod) + `Runner` in a few lines. I run each observation as a one-shot run with the context assembled by my own code — the transcript window, notes, hints already given, the learner profile — instead of relying on session memory. That keeps every tick stateless and cheap to reason about.

**Model tiers.** Observation is high-frequency and needs to be fast: 3.5 Flash-Lite with thinking off. Coaching and compiling are rarer and need quality: 3.7 Flash. Each call has a timeout; models that time out, return 503 or hit a quota rest on a circuit breaker and the next tier takes over. (The free tier allows 20 requests per day per Flash model; building a product on that budget taught me a lot about gates.)

**Why the agent runs next to the terminal.** The stream is the data source and it lives on your machine; so does your API key. Firestore is the shared brain and realtime bus; the panel is a pure client of it. Being in mainland China, where Cloud Billing isn't offered, pushed me to this shape — and it's the better design anyway: Sensei works fully offline, and the cloud half is a mirror, never a dependency.

## What surprised me

The Observer caught my own lie. During a test I typed a deliberately wrong note — "git commit failed because user.name wasn't set" — and it answered: *no, the commit succeeded, see `[master (root-commit) 5f85f9d] first`; run `git log` to confirm.* It reads the actual output, not what I say about it. That was the moment it stopped being a demo.

## What's next

Voice hints through Gemini Live, a VS Code terminal integration, per-tool skill packs (git, docker, MCP), and turning those 60-second scripts into real videos.

Code: <repo URL> · Panel: https://sensei-agent.web.app · Video: <YouTube URL>

#AllThingsAgenticHackathon
