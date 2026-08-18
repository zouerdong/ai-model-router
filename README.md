# Claude Model Router

Current public Latest stable version: **`1.4.0`**.
This checkout is an **unreleased `1.5.0` repository candidate**.

Kimi Code repository implementation candidate is complete.
Real membership Provider validation is pending.
The current public Latest stable release remains v1.4.0.

Version `1.4.0` added two explicit GLM profiles in one release: GLM-5.2 Coding Plan and the GLM standard API pay-as-you-go channel. They remain separate Provider, authentication, billing, and Secret Store boundaries. This checkout also contains the unreleased GLM-5.3 Coding Plan upgrade candidate; `glm-api` intentionally remains GLM-5.2.

The `1.5.0` candidate adds three Kimi Code membership profiles. They are repository-candidate functionality only until real membership Provider validation is completed; they are not part of the public `1.4.0` Latest release.

Claude Model Router (`cmr`) is a cross-platform profile launcher for Claude Code. Before Claude Code starts, it lets you choose the public Kimi, DeepSeek, GLM Coding Plan, or GLM standard API pay-as-you-go profiles; this checkout also contains the unreleased Kimi Code candidate profiles. It injects the selected provider's environment for the child process and forwards every remaining Claude Code argument unchanged.

Version `1.3.0` adds self-update support through a fixed GitHub Release asset. The updater only replaces the regular npm global package mapped to the currently active `cmr` command. It safely refuses source-linked checkouts, junctions, Homebrew or WinGet installations, and any installation whose prefix cannot be identified unambiguously.

Profiles are not tied to planning or execution roles. CMR does not manage Codex, Claude Code sessions, prompt classification, dynamic routing, or a proxy layer.

On the first interactive run, `cmr` displays the `configured` or `missing` status of every provider and opens the setup flow. API keys are accepted only through hidden TTY input and stored in the CMR Secret Store outside the repository. Non-interactive sessions never wait for key input.

## Installation

Prerequisites:

- Node.js 18 or later.
- Claude Code installed and available from your terminal. Follow the [official Claude Code installation guide](https://code.claude.com/docs/en/installation).
- A key for at least one supported Provider. Enter it through CMR's hidden local prompt; never place it in a command or repository.
- For GLM, use a Coding Plan Key with `cmr glm` or a distinct standard API Key with `cmr glm-api`. CMR does not identify Key types, combine slots, or switch between them.
- Kimi Code is intended only for the personal interactive development scenarios allowed by Kimi's official policy. Enterprise integrations, commercial services, and non-interactive batch use require a separate policy and product evaluation.

Install the reproducible `v1.4.0` Release asset:

```bash
npm install --global "https://github.com/zouerdong/ai-model-router/releases/download/v1.4.0/claude-model-router.tgz"
cmr version
cmr
```

Existing `1.3.0` users can run `cmr update`; `1.2.1` and older users must run the exact install command once to bootstrap self-update support.

If the existing installation uses a custom npm prefix, specify that same prefix so your terminal does not continue resolving an older copy:

```bash
npm install --global --prefix <current-prefix> "https://github.com/zouerdong/ai-model-router/releases/download/v1.4.0/claude-model-router.tgz"
```

You can also install the latest stable fixed asset:

```bash
npm install --global "https://github.com/zouerdong/ai-model-router/releases/latest/download/claude-model-router.tgz"
```

For reproducible installation, prefer the exact `releases/download/v1.4.0/claude-model-router.tgz` URL over `latest`.

To inspect and install from source:

```bash
git clone https://github.com/zouerdong/ai-model-router.git
cd ai-model-router
npm test
npm run lint
npm install --global .
cmr
```

Source-linked installations are not eligible for automatic replacement. Maintain them through their original source workflow.

A global installation creates the `cmr` command in the selected npm prefix. To uninstall:

```bash
npm uninstall --global claude-model-router
```

## Quick Start

Run either profile from your target project directory:

```bash
cmr kimi
cmr deepseek
cmr glm              # GLM Coding Plan
cmr glm-5.3          # GLM-5.3 Coding Plan alias
cmr glm-api          # GLM standard API pay-as-you-go
```

The unreleased `1.5.0` candidate also exposes these Kimi Code entries when run from this checkout:

```bash
cmr kimi-code              # kimi-for-coding, all Kimi Code membership tiers
cmr kimi-code-k3-256k      # k3-256k, Moderato or above, 256K context
cmr kimi-code-k3           # k3[1m], Allegretto or above, 1M context
```

Every argument after the profile is forwarded unchanged:

```bash
cmr kimi --continue
cmr deepseek --resume <session-id>
cmr deepseek --fork-session --resume <session-id>
cmr kimi -p "Analyze and update this project"
cmr deepseek --permission-mode plan
cmr kimi --model <provider-supported-model>
cmr glm --continue
cmr glm --model <provider-supported-model>
cmr glm-api --continue
cmr glm-api --model <provider-supported-model>
```

`plan` is a compatibility alias for `kimi`, and `build` is a compatibility alias for `deepseek`:

```bash
cmr plan [claude args...]
cmr build [claude args...]
cmr glm-payg [claude args...]
```

`glm`, `glm-5.3`, `glm-5.2`, and `glm-plan` all resolve to the GLM-5.3 Coding Plan Profile. It uses `ANTHROPIC_AUTH_TOKEN` and a subscription-quota entitlement. `glm-api` is the only standard API pay-as-you-go entry, and `glm-payg` is its only alias; it intentionally remains GLM-5.2 with `ANTHROPIC_API_KEY` and the existing 2/8/28 CNY/M Pricing because the official GLM-5.3 model API is still announced as coming soon. The two profiles share an Anthropic-compatible Base URL but use separate Secret Store slots and authentication variables. CMR never detects Key types, injects both variables, or automatically falls back between them.

Cross-provider `--continue` or `--resume` is always an explicit user choice. CMR does not modify project files or Claude Code session records. Plain-text and tool sessions can usually be resumed directly; sessions containing content blocks unsupported by the new provider may be rejected by Claude Code or that provider.

CMR does not prescribe a handoff workflow or document name. You can keep using a project-level `CLAUDE.md`, any task document you prefer, or the original Claude Code session.

The Kimi Code and GLM Coding Plan profiles print subscription-quota awareness notices when they start. `glm-api` prints a one-line direct standard API billing notice whose GLM-5.2 reference prices come from the bundled pricing record. Neither adds a CMR confirmation. CMR does not record prompts, session IDs, or forwarded arguments.

## Kimi Code `1.5.0` repository candidate

The three candidate profiles share the independent `kimi-code` Provider and Secret Store slot. Their model and membership requirements are:

| Profile | Alias | Claude Code value / upstream model | Minimum known membership tier | Context |
|---|---|---|---|---:|
| `kimi-code` | `kimi-membership` | `kimi-for-coding` / `kimi-for-coding` | Any Kimi Code membership | 262144 |
| `kimi-code-k3-256k` | `kimi-membership-k3-256k` | `k3-256k` / `k3-256k` | Moderato or above | 262144 |
| `kimi-code-k3` | `kimi-membership-k3` | `k3[1m]` / `k3` | Allegretto or above | 1048576 |

The candidate maps each profile's main, Opus, Sonnet, Haiku, Fable, and sub-agent model to that profile's Kimi Code model. `k3[1m]` is the Claude Code selection value; the upstream model ID remains `k3`.

Kimi Code uses subscription quota, not the open-platform token-pricing records. Official quota rules described by the project baseline include a seven-day subscription refresh with no carry-over, a separate rolling five-hour rate-limit window, shared quota across devices and API keys, and a monthly total that may freeze Kimi Code when exhausted. Extra Usage is an explicit Kimi-side option: after subscription quota is exhausted it may charge shared balance by actual usage. CMR does not query usage, enable Extra Usage, or promise unlimited quota or no additional charges; users should review the Kimi-side monthly spending limit.

Kimi Code and Kimi Open Platform are separate products and their Keys, Secret Store slots, endpoints, authentication variables, quotas, and billing are not interchangeable:

| Channel | Entry / Secret | Endpoint | Authentication | Billing |
|---|---|---|---|---|
| Kimi Open Platform | `cmr kimi` / `kimi` | `https://api.moonshot.cn/anthropic` | `ANTHROPIC_AUTH_TOKEN` | Open-platform token pay-as-you-go |
| Kimi Code membership | `cmr kimi-code*` / `kimi-code` | `https://api.kimi.com/coding/` | `ANTHROPIC_API_KEY` | Membership quota; Extra Usage may add charges when explicitly enabled |

Do not put an open-platform Key into the Kimi Code slot or the reverse. CMR does not detect Key types, copy Keys, query balances, or fall back between the channels.

Kimi Code is not a stable-release claim in this candidate. The `kimi-for-coding-highspeed` model and Claude Code `/fast` are both outside the stable scope; HighSpeed has not been added as a profile and `/fast` must not be treated as its entry point. Real membership validation, including model permissions, quota attribution, Extra Usage behavior, tools, and sub-agents, remains pending.

After the fifth `kimi-code` Secret is written, manually downgrading to public `1.4.0` may cause that version to reject the entire Secret Store because it knows only the original four Provider IDs. Do not silently delete the new Key; preserve a redacted backup/recovery plan and choose the version transition deliberately.

## Management Commands

```bash
cmr version
cmr list
cmr doctor
cmr update --check
cmr update
cmr config path
cmr secret status
cmr secret set kimi
cmr secret set deepseek
cmr secret set glm
cmr secret set glm-api
cmr secret set kimi-code
cmr help
```

Setup commands:

```bash
cmr setup
cmr setup kimi
cmr setup deepseek
cmr setup glm
cmr setup glm-api
cmr setup kimi-code
```

The setup flow performs local format validation and atomic storage only. It does not validate keys over the network, open a browser, or modify Claude Settings, shell profiles, or environment variables.

`cmr update --check` checks the fixed asset from the latest GitHub Release without changing the installation. `cmr update` backs up, installs, and verifies a candidate on the regular npm global package associated with the active command, then attempts rollback if verification fails. It never runs lifecycle scripts, changes provider configuration, or switches to npm's default prefix.

`cmr help` displays CMR help only. Use `cmr kimi --help`, `cmr deepseek --help`, `cmr glm --help`, `cmr glm-api --help`, or a Kimi Code candidate profile's `--help` to view Claude Code help.

API keys are written through hidden local TTY input to the Secret Store outside the repository. They are never placed in repository files, command arguments, logs, or chat messages.

## Security and Open Source

- License: [MIT](LICENSE).
- Vulnerability reporting: [Security Policy](SECURITY.md). Never submit API keys, tokens, logs, or local configuration in a public issue.
- Development guide: [Contributing](CONTRIBUTING.md).
- Issue tracker: [GitHub Issues](https://github.com/zouerdong/ai-model-router/issues).

## Documentation

1. [Product scope](docs/01-product-scope.md)
2. [System architecture](docs/02-architecture.md)
3. [Phase 1: Mac implementation record](docs/03-phase-1-mac-execution.md)
4. [Phase 2: GitHub plan](docs/04-phase-2-github.md)
5. [Phase 3: Windows plan](docs/05-phase-3-windows.md)
6. [Usage guide](docs/06-usage.md)
7. [Official-source baseline](docs/07-official-sources.md)
8. [Acceptance and recovery](docs/08-acceptance-and-recovery.md)
9. [Historical Phase 1 acceptance evidence](docs/09-phase-1-acceptance.md)
10. [Version 0.2.0 implementation contract and runtime evidence](docs/10-v0.2-transparent-profile-launcher-implementation-brief.md)
11. [Version 1.1.0 first-run setup implementation and acceptance](docs/11-v1.1-first-run-setup-implementation-brief.md)
12. [Version 1.2.1 Windows compatibility patch and release evidence](docs/12-v1.2.1-windows-compatibility-patch.md)
13. [Version 1.3.0 self-update implementation and acceptance contract](docs/13-v1.3-self-update-implementation-brief.md)
14. [Version 1.4.0 GLM-5.2 Coding Plan implementation contract](docs/14-v1.4-glm-5.2-coding-plan-implementation-brief.md)
15. [GLM standard API pay-as-you-go implementation contract](docs/15-v1.5-glm-standard-api-payg-implementation-brief.md)
16. [Version 1.4.0 unified GLM release and acceptance](docs/16-v1.4-unified-glm-release.md)
17. [Version 1.5.0 Kimi Code membership implementation guide](docs/17-v1.5-kimi-code-membership-implementation-guide.md)
18. [GLM-5.3 Coding Plan upgrade implementation guide](docs/18-v1.5-glm-5.3-upgrade-implementation-guide.md)

The runtime has no third-party dependencies. The public repository uses `main` as its default branch, and the current public stable tag remains `v1.4.0`; no `v1.5.0` tag, Release, checksum, or Latest update exists for this candidate.
