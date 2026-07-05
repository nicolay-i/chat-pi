# 03. Design system

Документ основан на приложенном reference image `design/reference/ChatAppMobile@1x.png`.

## 1. Visual direction

- Clean mobile chat.
- Light cool background.
- Strong purple accent for user messages and primary actions.
- Tool activity represented as cards, not raw logs.
- Code/diff preview compact by default.
- Quick actions visible but secondary.

## 2. Tokens

```ts
export const tokens = {
  color: {
    background: '#F5F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF2F7',
    text: '#243047',
    textMuted: '#93A0B8',
    primary: '#6258F4',
    primaryPressed: '#5147DD',
    border: '#DDE5F0',
    successBg: '#EAFBF2',
    successText: '#079452',
    danger: '#F05A6B',
    codeBg: '#EAFBF2',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  fontSize: {
    xs: 11,
    sm: 12,
    md: 14,
    lg: 16,
  },
};
```

## 3. Layout

### Mobile chat layout

```text
SafeArea
  Header optional / hidden in narrow preview
  MessageList flex: 1
  BottomBar fixed
    QuickActions horizontal scroll
    Composer row
```

### Web layout

```text
ProjectShell
  LeftSidebar width 280
  MainPanel flexible
  RightContextPanel width 380, collapsible
```

## 4. Components

### MessageBubble

Variants:

- assistant;
- user;
- system;
- queued;
- error.

Acceptance:

- User bubble is right-aligned and purple.
- Assistant bubble is left-aligned and white.
- Timestamp visible but muted.

### ToolCard

Variants:

- collapsed;
- expanded;
- running;
- completed;
- failed.

Acceptance:

- Tool name visible.
- File path visible for file edits.
- Status badge visible.
- Diff preview uses green background for additions.

### DiffPreview

- Compact monospace lines.
- `+` additions green.
- `-` deletions red/pink when present.
- Long lines truncated on mobile.

### QuickActionChip

- Pill shape.
- Icon optional.
- Label short.
- Horizontal scroll.

### Composer

- Attach button left.
- Input center.
- Expand/send mode button optional.
- Primary send button circular right.
- Keyboard-aware.

## 5. Animation

Use minimal motion:

- Message fade/slide on insert.
- Streaming cursor blinking.
- Tool card progress shimmer optional.
- Bottom sheet for send mode/actions.

## 6. Accessibility

- All buttons must have accessibility labels.
- Color is not the only status indicator.
- Tool status includes text badge.
- Font scaling should not break composer.

## 7. Reference-specific UI details

The provided image includes:

- first assistant bubble: `Привет! Чем могу помочь?`;
- user bubble: `Напиши debounce на TypeScript`;
- assistant response bubble;
- `edit_file` tool card with `src/utils/debounce.ts` path and `готово` badge;
- green diff preview;
- `search_files` tool card;
- quick action chips: `Улучшить debounce`, `Commit`, `Тесты`;
- bottom composer.

Subagents implementing chat UI must keep this structure available as a story/mock screen.
