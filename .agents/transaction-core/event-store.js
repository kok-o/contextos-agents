/**
 * .agents/runtime/event-store.js
 * ContextOS — Event-Sourced Durable Event Store
 *
 * Implements Section 17.3 of CONTEXTOS_IMPLEMENTATION_PLAN.md:
 *   - Monotonically incrementing revision log with SHA-256 event checksums
 *   - Periodic snapshots with replay recovery
 *   - Torn tail detection and automatic quarantine (zero lost valid snapshots)
 *   - Atomic event append with collision prevention
 *   - Zero install-time dependencies (pure Node.js crypto & fs)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str || '').digest('hex');
}

class DurableEventStore {
  /**
   * @param {Object} options
   * @param {string} options.baseDir - Base state directory (.agents/.contextos/state)
   * @param {number} [options.snapshotInterval=50] - Events between snapshots
   */
  constructor(options = {}) {
    if (!options.baseDir) {
      throw new Error('DurableEventStore requires baseDir');
    }

    this.baseDir = path.resolve(options.baseDir);
    this.eventsDir = path.join(this.baseDir, 'events');
    this.snapshotsDir = path.join(this.baseDir, 'snapshots');
    this.quarantineDir = path.join(this.baseDir, 'quarantine');
    this.snapshotInterval = Math.max(5, options.snapshotInterval || 50);

    fs.mkdirSync(this.eventsDir, { recursive: true });
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
    fs.mkdirSync(this.quarantineDir, { recursive: true });
  }

  /**
   * Appends an immutable event to the log.
   *
   * @param {string} streamId - Identifier of the entity/thread
   * @param {Object} eventData - Payload data
   * @param {number} expectedRevision - Optimistic concurrency revision check
   * @returns {Object} Stored event record
   */
  append(streamId, eventData = {}, expectedRevision = null) {
    const streamDir = path.join(this.eventsDir, streamId);
    fs.mkdirSync(streamDir, { recursive: true });

    // Determine next monotonic revision
    const existingEvents = this._listEventFiles(streamId);
    const lastRevision = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].revision : 0;

    if (typeof expectedRevision === 'number' && expectedRevision !== lastRevision) {
      const err = new Error(
        `Optimistic concurrency conflict in stream "${streamId}": expected revision ${expectedRevision}, last revision is ${lastRevision}`
      );
      err.code = 'CTX_EVENT_CONCURRENCY_CONFLICT';
      throw err;
    }

    const nextRevision = lastRevision + 1;
    const eventId = crypto.randomUUID();
    const timestamp = Date.now();

    const record = {
      streamId,
      eventId,
      revision: nextRevision,
      timestamp,
      data: eventData,
    };

    const checksum = sha256(JSON.stringify(record));
    const fullEnvelope = {
      ...record,
      checksum,
    };

    const revPadded = String(nextRevision).padStart(6, '0');
    const filename = `${revPadded}-${eventId}.json`;
    const targetFile = path.join(streamDir, filename);
    const tempFile = `${targetFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;

    try {
      fs.writeFileSync(tempFile, JSON.stringify(fullEnvelope, null, 2), 'utf8');
      fs.renameSync(tempFile, targetFile);
    } catch (err) {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      throw err;
    }

    return Object.freeze(fullEnvelope);
  }

  /**
   * Creates a snapshot of the reduced state up to a given revision.
   *
   * @param {string} streamId
   * @param {Object} state
   * @param {number} revision
   * @returns {Object} Snapshot record
   */
  createSnapshot(streamId, state, revision) {
    const streamSnapDir = path.join(this.snapshotsDir, streamId);
    fs.mkdirSync(streamSnapDir, { recursive: true });

    const revPadded = String(revision).padStart(6, '0');
    const filename = `snapshot-${revPadded}.json`;
    const targetFile = path.join(streamSnapDir, filename);
    const tempFile = `${targetFile}.${crypto.randomBytes(4).toString('hex')}.tmp`;

    const snapshot = {
      streamId,
      revision,
      timestamp: Date.now(),
      state,
      checksum: sha256(JSON.stringify(state)),
    };

    try {
      fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
      fs.renameSync(tempFile, targetFile);
    } catch (err) {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      throw err;
    }

    return Object.freeze(snapshot);
  }

  /**
   * Reads latest valid snapshot for stream if available.
   *
   * @param {string} streamId
   * @returns {Object|null}
   */
  getLatestSnapshot(streamId) {
    const streamSnapDir = path.join(this.snapshotsDir, streamId);
    if (!fs.existsSync(streamSnapDir)) return null;

    const files = fs.readdirSync(streamSnapDir)
      .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
      .sort();

    if (files.length === 0) return null;

    const latestFile = files[files.length - 1];
    try {
      const content = fs.readFileSync(path.join(streamSnapDir, latestFile), 'utf8');
      const snap = JSON.parse(content);
      // Check integrity
      if (snap.checksum && snap.checksum !== sha256(JSON.stringify(snap.state))) {
        // Corrupted snapshot -> quarantine
        this._quarantineFile(path.join(streamSnapDir, latestFile), 'corrupted_snapshot_checksum');
        return null;
      }
      return snap;
    } catch {
      this._quarantineFile(path.join(streamSnapDir, latestFile), 'unparseable_snapshot');
      return null;
    }
  }

  /**
   * Reads all valid events in stream.
   *
   * @param {string} streamId
   * @returns {Array<Object>}
   */
  readStream(streamId) {
    const eventFiles = this._listEventFiles(streamId);
    const events = [];
    for (const item of eventFiles) {
      const evt = this._readAndVerifyEvent(item.filePath);
      if (evt) {
        events.push(evt);
      }
    }
    return events;
  }

  /**
   * Replays events from snapshot or beginning to restore current state.
   * Tolerates and quarantines torn tail events from unexpected crashes.
   *
   * @param {string} streamId
   * @param {Function} reducer - (state, event) => newState
   * @param {Object} [initialState={}]
   * @returns {{ state: Object, revision: number, replayedEvents: number, quarantinedCount: number }}
   */
  replay(streamId, reducer, initialState = {}) {
    if (typeof reducer !== 'function') {
      throw new Error('replay requires a reducer function');
    }

    const snapshot = this.getLatestSnapshot(streamId);
    let state = snapshot ? JSON.parse(JSON.stringify(snapshot.state)) : JSON.parse(JSON.stringify(initialState));
    let lastRevision = snapshot ? snapshot.revision : 0;

    const eventFiles = this._listEventFiles(streamId);
    let replayedEvents = 0;
    let quarantinedCount = 0;

    for (const item of eventFiles) {
      if (item.revision <= lastRevision) continue;

      const eventData = this._readAndVerifyEvent(item.filePath);
      if (!eventData) {
        // Torn tail detected at end of stream! Quarantine it to recover.
        this._quarantineFile(item.filePath, 'torn_tail_corrupted_event');
        quarantinedCount++;
        break; // Stop replaying past torn tail
      }

      state = reducer(state, eventData);
      lastRevision = eventData.revision;
      replayedEvents++;
    }

    return {
      state: Object.freeze(state),
      revision: lastRevision,
      replayedEvents,
      quarantinedCount,
    };
  }

  _listEventFiles(streamId) {
    const streamDir = path.join(this.eventsDir, streamId);
    if (!fs.existsSync(streamDir)) return [];

    const files = fs.readdirSync(streamDir)
      .filter(f => /^\d{6}-[a-zA-Z0-9-]+\.json$/.test(f))
      .sort();

    return files.map(f => {
      const rev = parseInt(f.slice(0, 6), 10);
      return {
        filename: f,
        revision: rev,
        filePath: path.join(streamDir, f),
      };
    });
  }

  _readAndVerifyEvent(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const envelope = JSON.parse(content);

      if (!envelope.revision || !envelope.checksum) {
        return null;
      }

      const { checksum, ...rest } = envelope;
      const expectedChecksum = sha256(JSON.stringify(rest));
      if (checksum !== expectedChecksum) {
        return null; // Checksum mismatch
      }

      return envelope;
    } catch {
      return null;
    }
  }

  _quarantineFile(filePath, reason) {
    try {
      const filename = path.basename(filePath);
      const target = path.join(this.quarantineDir, `${Date.now()}-${reason}-${filename}`);
      fs.renameSync(filePath, target);
    } catch {
      // ignore
    }
  }
}

module.exports = {
  DurableEventStore,
};
