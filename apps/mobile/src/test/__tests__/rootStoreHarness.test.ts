import { getTestRootStore, resetTestRootStore } from '../rootStoreHarness';

describe('rootStoreHarness', () => {
  it('releases the current store before creating the next test store', () => {
    const first = getTestRootStore();
    const dispose = jest.spyOn(first, 'dispose');

    resetTestRootStore();
    const second = getTestRootStore();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
  });
});
