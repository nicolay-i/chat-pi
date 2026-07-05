import { ApiErrorSchema, ProjectSchema, type Project, type SendMessageInput } from '@pi-agents/contracts';

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw await this.toError(res);
    const json = await res.json();
    return ProjectSchema.array().parse(json);
  }

  async sendMessage(chatId: string, input: SendMessageInput): Promise<{ ok: true }> {
    const res = await fetch(`${this.baseUrl}/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw await this.toError(res);
    return { ok: true };
  }

  private async toError(res: Response) {
    const json = await res.json().catch(() => ({ code: 'HTTP_ERROR', message: res.statusText }));
    return ApiErrorSchema.parse(json);
  }
}
