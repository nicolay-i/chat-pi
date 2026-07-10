import { redactSecrets, hasSecretKey, REDACTED } from '../redaction';

describe('redactSecrets', () => {
  it('redacts a top-level api key by key name', () => {
    const result = redactSecrets({ apiKey: 'sk-xxx' });
    expect(result).toEqual({ apiKey: REDACTED });
  });

  it('redacts nested secret keys', () => {
    const result = redactSecrets({ config: { token: 't', name: 'bot' } });
    expect(result).toEqual({ config: { token: REDACTED, name: 'bot' } });
  });

  it('leaves non-secret values untouched', () => {
    const result = redactSecrets({ name: 'bot', count: 3, ok: true });
    expect(result).toEqual({ name: 'bot', count: 3, ok: true });
  });

  it('regex-redacts common secret shapes in string values', () => {
    const result = redactSecrets({ note: 'token=sk-live-abcdef1234 done' });
    expect(result).toEqual({ note: `token=${REDACTED} done` });
  });

  it('regex-redacts ghp tokens', () => {
    const result = redactSecrets('ghp-aBcDeFgHiJkLmNop');
    expect(result).toBe(REDACTED);
  });

  it('does not mutate the input object', () => {
    const input = { apiKey: 'sk-xxx', nested: { token: 't' } };
    const snapshot = JSON.stringify(input);
    redactSecrets(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('handles arrays of values', () => {
    const result = redactSecrets([{ password: 'p' }, { name: 'x' }]);
    expect(result).toEqual([{ password: REDACTED }, { name: 'x' }]);
  });

  it('redacts values inside arrays', () => {
    const result = redactSecrets({ items: [{ api_key: 'v' }] });
    expect(result).toEqual({ items: [{ api_key: REDACTED }] });
  });
});

describe('hasSecretKey', () => {
  it('detects secret-like keys case-insensitively', () => {
    expect(hasSecretKey('APIKey')).toBe(true);
    expect(hasSecretKey('Authorization')).toBe(true);
    expect(hasSecretKey('name')).toBe(false);
  });

  it('detects substring matches', () => {
    expect(hasSecretKey('openai_api_key')).toBe(true);
    expect(hasSecretKey('session_id')).toBe(true);
    expect(hasSecretKey('title')).toBe(false);
  });
});
