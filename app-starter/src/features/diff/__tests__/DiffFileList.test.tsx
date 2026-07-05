import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { DiffEntry } from '@pi-agents/contracts';
import { DiffFileList, encodePathForTestID } from '../DiffFileList';

const ENTRIES: DiffEntry[] = [
  { path: 'src/a.ts', status: 'added', additions: 10, deletions: 0 },
  { path: 'src/b.ts', status: 'modified', additions: 4, deletions: 2 },
  { path: 'src/c.ts', status: 'deleted', additions: 0, deletions: 8 },
  { path: 'src/d.ts', status: 'renamed', additions: 1, deletions: 1 },
];

describe('DiffFileList', () => {
  it('renders all entries with encoded testIDs', async () => {
    const { getByTestId } = await render(
      <DiffFileList entries={ENTRIES} selectedPath={null} onSelect={() => {}} />,
    );
    expect(getByTestId('diff.fileList')).toBeTruthy();
    expect(getByTestId(`diff.file.${encodePathForTestID('src/a.ts')}`)).toBeTruthy();
    expect(getByTestId(`diff.file.${encodePathForTestID('src/b.ts')}`)).toBeTruthy();
    expect(getByTestId(`diff.file.${encodePathForTestID('src/c.ts')}`)).toBeTruthy();
    expect(getByTestId(`diff.file.${encodePathForTestID('src/d.ts')}`)).toBeTruthy();
  });

  it('shows status badge text and +/- counts', async () => {
    const { getByText } = await render(
      <DiffFileList entries={ENTRIES} selectedPath={null} onSelect={() => {}} />,
    );
    expect(getByText('added')).toBeTruthy();
    expect(getByText('modified')).toBeTruthy();
    expect(getByText('deleted')).toBeTruthy();
    expect(getByText('renamed')).toBeTruthy();
    expect(getByText('+10')).toBeTruthy();
    expect(getByText('-8')).toBeTruthy();
  });

  it('calls onSelect with the path when a row is pressed', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      <DiffFileList entries={ENTRIES} selectedPath={null} onSelect={onSelect} />,
    );
    await act(async () => {
      fireEvent.press(getByTestId(`diff.file.${encodePathForTestID('src/b.ts')}`));
    });
    expect(onSelect).toHaveBeenCalledWith('src/b.ts');
  });
});
