# 12. Source notes for current stack decisions

Generated on 2026-07-05.

These notes are for implementers to verify dependency choices at start time.

## React Native / Expo

- React Native official versions page listed latest stable version as `0.86` and says new `npx react-native init` projects use the most recent stable version automatically.
  - Source: https://reactnative.dev/versions
- Expo docs recommend `npx create-expo-app@latest` for quick start.
  - Source: https://docs.expo.dev/
- Expo `create-expo-app` docs currently show `npx create-expo-app@latest --template default@sdk-57` during the SDK 57 transition period.
  - Source: https://docs.expo.dev/more/create-expo/
- Expo SDK reference currently lists SDK `57.0.0` using React Native `0.86`, React `19.2.3`, React Native Web `0.21.0`, and minimum Node.js `22.13.x`.
  - Source: https://docs.expo.dev/versions/latest/
- Expo web docs say to install web dependencies with `npx expo install react-dom react-native-web @expo/metro-runtime`.
  - Source: https://docs.expo.dev/workflow/web/

## Hono / oRPC

- Hono RPC shares API specifications between server and client by exporting the `typeof` Hono app/route and using `hc` on the client.
  - Source: https://hono.dev/docs/guides/rpc
- Hono project bootstrap is available through `pnpm create hono@latest my-app`.
  - Source: https://hono.dev/docs/getting-started/basic
- oRPC describes itself as combining RPC with OpenAPI and supports type-safe API definitions.
  - Source: https://orpc.dev/docs/getting-started
- oRPC has a Hono adapter using `RPCHandler` from `@orpc/server/fetch`.
  - Source: https://orpc.dev/docs/adapters/hono

## Pi

- Pi SDK exposes `createAgentSession()` and uses `ResourceLoader` to supply extensions, skills, prompt templates, themes, and context files.
  - Source: https://pi.dev/docs/latest/sdk
- Pi sessions are JSONL files with entries forming a tree via `id`/`parentId`.
  - Source: https://pi.dev/docs/latest/session-format
- Pi packages can bundle extensions, skills, prompt templates, and themes.
  - Source: https://pi.dev/docs/latest/packages
- Pi custom providers can be registered by extensions with `pi.registerProvider()`.
  - Source: https://pi.dev/docs/latest/custom-provider

## Implementation rule

Before running bootstrap in a real repo, re-open the official Expo and React Native version pages. If the latest stable SDK changed after this archive was generated, update `scripts/bootstrap-react-native.sh` and the dependency policy before coding.
