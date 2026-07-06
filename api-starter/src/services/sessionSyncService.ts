import { readFileSync, statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import {
  createPiSessionsRepository,
  type PiSessionsRepository,
} from '../db/repositories/piSessionsRepository';
import type { EventStore } from '../realtime/eventStore';
import { mapEntryToEvent, parseJsonl } from './piJsonl';

/**
 * Thrown when a Pi session file is already locked by a different writer.
 * Satisfies the docs/08 §2 Lock rule: one writer per Pi session file; CLI
 * handoff requires releasing the web runtime lock.
 */
export class SessionLockError extends Error {
  readonly existingOwner: string | null;
  constructor(existingOwner: string | null) {
    super(`Pi session is locked by another writer: ${existingOwner ?? 'unknown'}`);
    this.name = 'SessionLockError';
    this.existingOwner = existingOwner;
  }
}

export type SessionSyncDeps = {
  eventStore: EventStore;
  piSessions?: PiSessionsRepository;
};

export type ImportSessionInput = {
  piSessionId: string;
  filePath: string;
  owner: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  newLastOffset: number;
};

export interface SessionSyncService {
  importSessionFile(input: ImportSessionInput): Promise<ImportResult>;
  tailSessionFile(input: ImportSessionInput): Promise<ImportResult>;
}

/**
 * Append-only Pi JSONL importer.
 *
 * `importSessionFile` reads the WHOLE file but dedupes by entry id, so
 * re-running after appends only imports new entries (idempotent). This is
 * what makes tailing simple: `tailSessionFile` is the same idempotent
 * operation, intended to be called repeatedly.
 *
 * Dedup strategy: skip any entry whose id is <= the running max id (seeded
 * from piSession.last_entry_id). Assumes monotonic string-comparable ids
 * (ULID/UUIDv7-like), which matches docs/06 §3 event ordering.
 */
export function createSessionSyncService(
  db: DatabaseSync,
  deps: SessionSyncDeps,
): SessionSyncService {
  const piSessions: PiSessionsRepository =
    deps.piSessions ?? createPiSessionsRepository(db);
  const eventStore = deps.eventStore;

  async function importSessionFile(input: ImportSessionInput): Promise<ImportResult> {
    const session = piSessions.getById(input.piSessionId);
    if (!session) {
      throw new Error(`pi_session not found: ${input.piSessionId}`);
    }

    const acquired = piSessions.acquireLock(input.piSessionId, input.owner);
    if (!acquired) {
      const fresh = piSessions.getById(input.piSessionId);
      throw new SessionLockError(fresh?.lockOwner ?? session.lockOwner);
    }

    try {
      const text = readFileSync(input.filePath, 'utf8');
      const entries = parseJsonl(text);

      const floorEntryId = session.lastEntryId ?? '';
      let imported = 0;
      let skipped = 0;
      let maxEntryId = floorEntryId;
      let lastAcceptedEntryId: string | null = null;

      for (const entry of entries) {
        if (entry.id <= maxEntryId) {
          skipped++;
          continue;
        }
        const envelope = mapEntryToEvent(entry, {
          projectId: session.projectId,
          chatId: session.chatId,
          taskId: session.taskId,
        });
        await eventStore.append({
          ...envelope,
          projectId: session.projectId,
          chatId: session.chatId ?? undefined,
          taskId: session.taskId ?? undefined,
          piSessionId: session.id,
        });
        imported++;
        maxEntryId = entry.id;
        lastAcceptedEntryId = entry.id;
      }

      const newSize = statSync(input.filePath).size;
      const newLastEntryId =
        lastAcceptedEntryId ?? session.lastEntryId ?? null;
      piSessions.update(session.id, {
        lastImportedOffset: newSize,
        lastEntryId: newLastEntryId,
        activeLeafEntryId: newLastEntryId,
      });

      return { imported, skipped, newLastOffset: newSize };
    } finally {
      piSessions.releaseLock(input.piSessionId, input.owner);
    }
  }

  return {
    importSessionFile,
    tailSessionFile: importSessionFile,
  };
}
