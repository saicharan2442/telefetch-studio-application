import fs from "fs/promises";
import path from "path";

const dataDir = path.join(process.cwd(), ".data");
const dbFile = path.join(dataDir, "db.json");

export interface Setting {
  key: string;
  value: any;
  updatedAt: string;
}

export interface Account {
  id: number;
  telegramUserId: string | null;
  displayName: string | null;
  username: string | null;
  phoneMasked: string | null;
  connectedAt: string | null;
}

export interface Channel {
  id: number;
  telegramId: string;
  accessHash: string | null;
  title: string;
  username: string | null;
  kind: string;
  participants: number | null;
  selected: boolean;
  monitor: boolean;
  lastScannedAt: string | null;
  createdAt: string;
}

export interface FilterProfile {
  id: number;
  name: string;
  config: any;
  createdAt: string;
}

export interface DownloadTask {
  id: number;
  channelTelegramId: string;
  channelTitle: string;
  messageId: number;
  fileName: string;
  mimeType: string | null;
  size: number;
  matchedKeyword: string | null;
  destinationDir: string;
  finalPath: string | null;
  status: string;
  progress: number;
  downloadedBytes: number;
  attempts: number;
  error: string | null;
  source: string;
  messageDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryRow {
  id: number;
  taskId: number | null;
  channelTitle: string;
  channelTelegramId: string;
  messageId: number;
  fileName: string;
  size: number;
  matchedKeyword: string | null;
  destination: string;
  status: string;
  error: string | null;
  completedAt: string;
}

export interface DedupRecord {
  id: number;
  channelTelegramId: string;
  messageId: number;
  fileUniqueKey: string;
  finalPath: string | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: number;
  level: string;
  kind: string;
  message: string;
  meta: any | null;
  createdAt: string;
}

interface DatabaseSchema {
  settings: Setting[];
  accounts: Account[];
  channels: Channel[];
  filterProfiles: FilterProfile[];
  downloadTasks: DownloadTask[];
  downloadHistory: HistoryRow[];
  dedupRecords: DedupRecord[];
  activityEvents: ActivityEvent[];
}

const defaultData: DatabaseSchema = {
  settings: [],
  accounts: [],
  channels: [],
  filterProfiles: [],
  downloadTasks: [],
  downloadHistory: [],
  dedupRecords: [],
  activityEvents: [],
};

class FileDB {
  private data: DatabaseSchema = defaultData;
  private isLoaded = false;
  private savePromise: Promise<void> | null = null;
  private saveQueued = false;

  async load() {
    if (this.isLoaded) return;
    try {
      await fs.mkdir(dataDir, { recursive: true });
      const raw = await fs.readFile(dbFile, "utf-8");
      const parsed = JSON.parse(raw);
      this.data = { ...defaultData, ...parsed };
    } catch (e: any) {
      if (e.code !== "ENOENT") {
        console.error("Failed to load db.json", e);
      }
      this.data = { ...defaultData };
    }
    this.isLoaded = true;
  }

  private async performSave() {
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(dbFile, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save db.json", e);
    }
    this.savePromise = null;
    if (this.saveQueued) {
      this.saveQueued = false;
      this.savePromise = this.performSave();
    }
  }

  async save() {
    if (this.savePromise) {
      this.saveQueued = true;
      return this.savePromise;
    }
    this.savePromise = this.performSave();
    return this.savePromise;
  }

  get dataRef() {
    return this.data;
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __fileDb?: FileDB;
};

export const db = globalForDb.__fileDb ?? new FileDB();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__fileDb = db;
}
