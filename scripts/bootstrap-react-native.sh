#!/usr/bin/env bash
set -euo pipefail

# Bootstrap the React Native + Web app with the current Expo template.
# Generated on 2026-07-05.
# Re-check docs/12-source-notes.md before running in a real repo.

APP_DIR="${1:-apps/mobile}"

mkdir -p "$(dirname "$APP_DIR")"

# During SDK 57 transition, Expo docs recommend selecting the SDK 57 template explicitly.
pnpm dlx create-expo-app@latest "$APP_DIR" --template default@sdk-57

cd "$APP_DIR"

# Expo-managed versions. Use expo install for compatibility with the selected SDK.
npx expo install react-dom react-native-web @expo/metro-runtime
npx expo install react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated react-native-svg
npx expo install expo-secure-store expo-clipboard expo-haptics expo-linking expo-notifications expo-status-bar

# Non-Expo-managed app dependencies.
pnpm add @tanstack/react-query zustand zod lucide-react-native

# Dev/test tooling. Adjust if create-expo-app already installed equivalent tooling.
pnpm add -D typescript @types/react jest-expo @testing-library/react-native

cat <<'EOF'
Next steps:
1. Copy app-starter/src and app-starter/app into the generated app if using this archive as a template.
2. Run: pnpm typecheck
3. Run: pnpm web
EOF
