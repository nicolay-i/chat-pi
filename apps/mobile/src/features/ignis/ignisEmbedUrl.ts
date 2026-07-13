export function ignisEmbedUrl(url: string): string {
  return `${url.replace(/\/+$/, '')}/embed.html`;
}
