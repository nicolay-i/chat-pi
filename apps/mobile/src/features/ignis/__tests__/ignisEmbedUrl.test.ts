import { ignisEmbedUrl } from '../ignisEmbedUrl';

describe('ignisEmbedUrl', () => {
  it('uses the same-origin wrapper without duplicating slashes', () => {
    expect(ignisEmbedUrl('https://ignis.tailnet.example')).toBe('https://ignis.tailnet.example/embed.html');
    expect(ignisEmbedUrl('https://ignis.tailnet.example/')).toBe('https://ignis.tailnet.example/embed.html');
  });
});
