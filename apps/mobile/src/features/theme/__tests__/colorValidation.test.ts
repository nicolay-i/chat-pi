import { isValidHex, normalizeHex } from '../colorValidation';

describe('colorValidation', () => {
  describe('isValidHex', () => {
    it.each(['#6258F4', '#fff', '#FF880080'])('accepts %s', (value) => {
      expect(isValidHex(value)).toBe(true);
    });

    it.each(['red', '#12', 'xyz', '', '#GGGGGG'])('rejects %s', (value) => {
      expect(isValidHex(value)).toBe(false);
    });
  });

  describe('normalizeHex', () => {
    it('expands a 3-digit hex to 6-digit', () => {
      expect(normalizeHex('#fff')).toBe('#FFFFFF');
      expect(normalizeHex('#abc')).toBe('#AABBCC');
    });

    it('uppercases a 6-digit hex unchanged in length', () => {
      expect(normalizeHex('#6258f4')).toBe('#6258F4');
    });

    it('preserves an 8-digit hex with alpha', () => {
      expect(normalizeHex('#ff880080')).toBe('#FF880080');
    });
  });
});
