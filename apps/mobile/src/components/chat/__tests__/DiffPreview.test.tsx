import { render } from '@testing-library/react-native';
import { DiffPreview } from '../DiffPreview';

describe('DiffPreview', () => {
  it('renders addition and deletion lines', async () => {
    const { getByText } = await render(<DiffPreview lines={['+ added', '- removed', 'context']} />);
    expect(getByText('+ added')).toBeTruthy();
    expect(getByText('- removed')).toBeTruthy();
    expect(getByText('context')).toBeTruthy();
  });
});
