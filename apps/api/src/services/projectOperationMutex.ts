export interface ProjectOperationMutex {
  run<T>(projectId: string, operation: () => Promise<T>): Promise<T>;
}

/** Serializes Git-mutating operations for one project inside an API process. */
export class InMemoryProjectOperationMutex implements ProjectOperationMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(projectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => current);
    this.tails.set(projectId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(projectId) === tail) this.tails.delete(projectId);
    }
  }
}
