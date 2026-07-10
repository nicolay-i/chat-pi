import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';
import { DiffPreview } from './DiffPreview';

const DEFAULT_DIFF: string[] = [
  '+ export function debounce<T>(fn: T, delay: number) {',
  '+   let timer: NodeJS.Timeout;',
  '+   return (...args) => {',
  '+     clearTimeout(timer);',
  '+     timer = setTimeout(() => fn(...args), delay);',
  '+   };',
  '+ }',
];

export type ToolStatus = 'running' | 'completed' | 'failed';

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: 'выполняется',
  completed: 'готово',
  failed: 'ошибка',
};

export function ToolCard({
  toolName = 'edit_file',
  filePath = 'src/utils/debounce.ts',
  status = 'completed',
  diff = DEFAULT_DIFF,
  expanded = true,
}: {
  toolName?: string;
  filePath?: string;
  status?: ToolStatus;
  diff?: string[];
  expanded?: boolean;
}) {
  const badgeBg = status === 'completed' ? tokens.color.successBg : status === 'failed' ? tokens.color.danger : tokens.color.surfaceMuted;
  const badgeColor = status === 'completed' ? tokens.color.successText : status === 'failed' ? '#fff' : tokens.color.textMuted;
  const label = STATUS_LABEL[status];
  return (
    <View testID="chat.toolCard" style={{ backgroundColor: tokens.color.surface, borderRadius: 14, overflow: 'hidden', marginVertical: 8 }}>
      <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: tokens.color.text, fontWeight: '700' }}>{toolName}</Text>
          {filePath ? <Text style={{ color: tokens.color.textMuted, fontSize: 12 }}>↳ {filePath}</Text> : null}
        </View>
        <View
          accessibilityLabel={label}
          style={{ backgroundColor: badgeBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
        >
          <Text style={{ color: badgeColor, fontSize: 11, fontStyle: status === 'running' ? 'italic' : 'normal' }}>
            {status === 'running' ? '··· ' : ''}
            {label}
          </Text>
        </View>
      </View>
      {expanded && diff && diff.length > 0 ? <DiffPreview lines={diff} testID="chat.toolCard.diff" /> : null}
    </View>
  );
}
