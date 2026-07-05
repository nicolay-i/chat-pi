# 08. Pi sync, packages, providers

## 1. `.agents` compatibility layer

The app treats `.agents` as source of truth:

```text
.agents/
  project.json
  skills/
  prompts/
  extensions/
  packages/
  packages.lock.json
  mcp.json
  providers.json
  ui/actions.json
  ui/theme.json
```

Pi is integrated through an app-controlled `ResourceLoader` / adapter that maps these resources into Pi runtime.

## 2. Session sync

### App-created session

```text
App message -> Pi SDK prompt -> Pi JSONL append -> Pi events -> app event log -> UI
```

### CLI-created/continued session

```text
User opens Pi CLI with session path
Pi JSONL appends entries
Backend tailer imports entries
App chat projection updates
```

### Lock rule

- One writer per Pi session file.
- CLI handoff requires releasing web runtime lock.
- App can import read-only while CLI owns lock.

## 3. Export

Supported exports:

- raw Pi JSONL;
- app event log JSONL;
- human Markdown transcript;
- full trace Markdown;
- diff patches.

## 4. Package manager

Install process:

```text
1. resolve source in temp directory
2. read manifest/resources
3. display install review
4. copy into .agents/packages/<name>@<version>
5. update .agents/packages.lock.json
6. mark trusted=false by default for extensions
7. reload idle runtime only after explicit action
```

Trust levels:

```ts
type PackageTrust = 'untrusted' | 'trusted' | 'disabled';
```

## 5. Provider manager

Provider types:

```ts
type ProviderType =
  | 'pi_builtin'
  | 'openai_compatible'
  | 'anthropic_compatible'
  | 'google_compatible'
  | 'ollama_local'
  | 'ollama_cloud_like'
  | 'custom_pi_extension';
```

Provider config example:

```json
{
  "id": "ollama-cloud",
  "type": "openai_compatible",
  "baseUrl": "https://...",
  "apiKeyRef": "secret:ollama-cloud",
  "models": ["model-a", "model-b"]
}
```

## 6. MCP manager

Project-level MCP config lives in `.agents/mcp.json` except secrets. Secrets use backend secret refs.

## 7. Verification checklist

- A skill in `.agents/skills/x/SKILL.md` appears in UI and can be selected.
- Prompt templates in `.agents/prompts` can be rendered with variables.
- Package install writes lock file.
- Untrusted extension is not executed.
- Provider secret is never visible raw in frontend or export.
- Pi CLI handoff can import new JSONL entries after CLI exits.
