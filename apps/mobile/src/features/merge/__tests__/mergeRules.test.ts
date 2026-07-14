import {
  canMerge,
  checksSummaryFor,
  defaultCommitMessage,
  isConflict,
} from '../mergeRules';

describe('mergeRules', () => {
  describe('canMerge', () => {
    it('returns false while the task is running', () => {
      expect(canMerge('running')).toBe(false);
    });

    it('returns false during aborting/checks/merge/conflict lifecycle states', () => {
      expect(canMerge('aborting')).toBe(false);
      expect(canMerge('checks_running')).toBe(false);
      expect(canMerge('checks_failed')).toBe(false);
      expect(canMerge('merge_running')).toBe(false);
      expect(canMerge('merge_conflict')).toBe(false);
    });

    it('returns true only for idle and needs_review', () => {
      expect(canMerge('idle')).toBe(true);
      expect(canMerge('needs_review')).toBe(true);
    });

    it('returns false for terminal/queued states', () => {
      expect(canMerge('queued')).toBe(false);
      expect(canMerge('merged')).toBe(false);
      expect(canMerge('failed')).toBe(false);
      expect(canMerge('archived')).toBe(false);
    });
  });

  describe('isConflict', () => {
    it('returns true only for merge_conflict', () => {
      expect(isConflict('merge_conflict')).toBe(true);
      expect(isConflict('merge_running')).toBe(false);
      expect(isConflict('idle')).toBe(false);
    });
  });

  describe('helpers', () => {
    it('defaultCommitMessage uses the title and trims empty', () => {
      expect(defaultCommitMessage('Add login')).toBe('feat: merge Add login');
      expect(defaultCommitMessage('   ')).toBe('feat: merge task');
    });

    it('checksSummaryFor maps status to summary', () => {
      expect(checksSummaryFor('checks_running')).toBe('running');
      expect(checksSummaryFor('checks_failed')).toBe('failed');
      expect(checksSummaryFor('idle')).toBe('passed');
    });
  });
});
