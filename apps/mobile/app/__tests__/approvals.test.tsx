import { act } from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';
import ApprovalsScreen from '../approvals';
import { mockApprovals } from '@/features/approvals/mockApprovals';

describe('ApprovalsScreen', () => {
  it('renders all mock approvals in the list', async () => {
    const { getByTestId } = await render(<ApprovalsScreen />);

    expect(getByTestId('approvals.list')).toBeTruthy();
    for (const a of mockApprovals) {
      expect(getByTestId(`approvals.item.${a.id}`)).toBeTruthy();
      expect(getByTestId(`approvals.approve.${a.id}`)).toBeTruthy();
      expect(getByTestId(`approvals.reject.${a.id}`)).toBeTruthy();
    }
  });

  it('removes a row when approve is pressed', async () => {
    const { getByTestId, queryByTestId } = await render(<ApprovalsScreen />);
    const first = mockApprovals[0];

    await act(async () => {
      fireEvent.press(getByTestId(`approvals.approve.${first.id}`));
    });

    await waitFor(() => expect(queryByTestId(`approvals.item.${first.id}`)).toBeNull());
    expect(getByTestId(`approvals.item.${mockApprovals[1].id}`)).toBeTruthy();
  });

  it('removes a row when reject is pressed', async () => {
    const { getByTestId, queryByTestId } = await render(<ApprovalsScreen />);
    const target = mockApprovals[2];

    await act(async () => {
      fireEvent.press(getByTestId(`approvals.reject.${target.id}`));
    });

    await waitFor(() => expect(queryByTestId(`approvals.item.${target.id}`)).toBeNull());
  });

  it('shows the empty state once all approvals are resolved', async () => {
    const { getByTestId, queryByTestId } = await render(<ApprovalsScreen />);

    for (const a of mockApprovals) {
      await act(async () => {
        fireEvent.press(getByTestId(`approvals.approve.${a.id}`));
      });
    }

    await waitFor(() => expect(queryByTestId('approvals.list')).toBeNull());
    expect(getByTestId('approvals.empty')).toBeTruthy();
  });
});
