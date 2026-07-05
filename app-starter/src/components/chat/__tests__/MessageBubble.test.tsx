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
});
