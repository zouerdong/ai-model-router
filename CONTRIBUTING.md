# Contributing

## Before changing code

Read `AGENTS.md`, `docs/01-product-scope.md`, and `docs/02-architecture.md`.
Provider model IDs, endpoints, environment variables, context limits, and
prices must be verified against the official sources in
`docs/07-official-sources.md`.

Do not add real API keys, tokens, local settings, shell profiles, logs, prompts,
or machine-specific backups. Tests must use clearly fake credentials.

## Development

Claude Model Router requires Node.js 18 or newer and has no runtime
dependencies.

```bash
npm test
npm run lint
npm pack --dry-run
```

Keep changes within the documented product scope. Preserve opaque Claude Code
argument forwarding, child-process environment isolation, working-directory
inheritance, signal behavior, and exit codes.

## Pull requests

Explain what changed, why it changed, user impact, and the validation performed.
Provider-facing changes must include the official source URL and verification
date. Windows simulation is not a substitute for the documented Windows
real-machine acceptance phase.
