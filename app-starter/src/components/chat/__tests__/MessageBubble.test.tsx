import { render } from '@testing-library/react-native';
import { MessageBubble } from '../MessageBubble';

describe('MessageBubble', () => {
  it('renders the provided text', async () => {
    const { getByText } = await render(<MessageBubble role="user" text="hello world" />);
    expect(getByText('hello world')).toBeTruthy();
  });

  it('renders the optional time caption when provided', async () => {
    const { getByText } = await render(<MessageBubble role="assistant" text="hi" time="12:00" />);
    expect(getByText('hi')).toBeTruthy();
    expect(getByText('12:00')).toBeTruthy();
  });

  it('renders system messages in a muted pill', async () => {
    const { getByText } = await render(<MessageBubble role="system" text="session started" />);
    expect(getByText('session started')).toBeTruthy();
  });

  it('renders queued messages', async () => {
    const { getByText } = await render(<MessageBubble role="queued" text="waiting" />);
    expect(getByText('waiting')).toBeTruthy();
  });

  it('renders an explicit Ошибка label for error variant', async () => {
    const { getByText } = await render(<MessageBubble role="error" text="boom" />);
    expect(getByText('Ошибка')).toBeTruthy();
    expect(getByText('boom')).toBeTruthy();
  });
});
