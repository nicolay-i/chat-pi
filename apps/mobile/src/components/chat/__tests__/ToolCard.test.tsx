import { render } from '@testing-library/react-native';
import { ToolCard } from '../ToolCard';

describe('ToolCard', () => {
  it('shows the completed badge text', async () => {
    const { getByText } = await render(<ToolCard status="completed" />);
    expect(getByText('готово')).toBeTruthy();
  });

  it('shows the running badge text', async () => {
    const { getByText } = await render(<ToolCard status="running" />);
    expect(getByText(/выполняется/)).toBeTruthy();
  });

  it('shows the failed badge text', async () => {
    const { getByText } = await render(<ToolCard status="failed" />);
    expect(getByText('ошибка')).toBeTruthy();
  });

  it('hides the diff block when collapsed', async () => {
    const { queryByTestId } = await render(<ToolCard status="completed" diff={['+ x']} expanded={false} />);
    expect(queryByTestId('chat.toolCard.diff')).toBeNull();
  });

  it('shows the diff block when expanded', async () => {
    const { getByTestId } = await render(<ToolCard status="completed" diff={['+ x']} />);
    expect(getByTestId('chat.toolCard.diff')).toBeTruthy();
  });
});
