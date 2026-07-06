import { render } from '@testing-library/react-native';
import { Composer } from '../chat/Composer';
import { QuickActionChip } from '../chat/QuickActionChip';
import { ToolCard } from '../chat/ToolCard';

describe('Accessibility labels on critical interactive components', () => {
  it('Composer exposes a label for the send button', async () => {
    const { getByLabelText } = await render(
      <Composer value="hello" onValueChange={() => {}} onSend={() => {}} />,
    );
    expect(() => getByLabelText(/Режим отправить/)).not.toThrow();
  });

  it('Composer exposes a label for the attach button', async () => {
    const { getByLabelText } = await render(<Composer />);
    expect(() => getByLabelText('Прикрепить файл')).not.toThrow();
  });

  it('Composer exposes a label for the mode toggle', async () => {
    const { getByLabelText } = await render(<Composer />);
    expect(() => getByLabelText('Выбрать режим отправки')).not.toThrow();
  });

  it('QuickActionChip is announced by its label', async () => {
    const { getByLabelText } = await render(
      <QuickActionChip label="Улучшить" onPress={() => {}} />,
    );
    expect(() => getByLabelText('Улучшить')).not.toThrow();
  });

  it('ToolCard status badge is announced by its status label', async () => {
    const { getByLabelText } = await render(<ToolCard status="completed" />);
    expect(() => getByLabelText('готово')).not.toThrow();
  });
});
