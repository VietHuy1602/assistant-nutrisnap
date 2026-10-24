/**
 * In-memory Mock implementation of IndexedDB for jsdom testing.
 * Hỗ trợ open, transaction, put, get, getAll, delete, clear, createObjectStore, createIndex.
 */

export function setupMockIndexedDB() {
  const databases = new Map<string, Map<string, Map<any, any>>>();

  class MockIDBRequest {
    public result: any = undefined;
    public error: any = null;
    public onsuccess: ((e: any) => void) | null = null;
    public onerror: ((e: any) => void) | null = null;

    triggerSuccess(val: any) {
      this.result = val;
      if (this.onsuccess) {
        this.onsuccess({ target: this });
      }
    }

    triggerError(err: any) {
      this.error = err;
      if (this.onerror) {
        this.onerror({ target: this });
      }
    }
  }

  class MockIDBOpenDBRequest extends MockIDBRequest {
    public onupgradeneeded: ((e: any) => void) | null = null;
  }

  class MockIDBObjectStore {
    constructor(
      public name: string,
      public keyPath: string,
      private storeMap: Map<any, any>
    ) {}

    createIndex(_name: string, _keyPath: string, _opts?: any) {
      return {};
    }

    put(value: any): MockIDBRequest {
      const req = new MockIDBRequest();
      const key = this.keyPath ? value[this.keyPath] : value.id;
      this.storeMap.set(key, value);
      setTimeout(() => req.triggerSuccess(key), 0);
      return req;
    }

    get(key: any): MockIDBRequest {
      const req = new MockIDBRequest();
      const val = this.storeMap.get(key);
      setTimeout(() => req.triggerSuccess(val), 0);
      return req;
    }

    getAll(): MockIDBRequest {
      const req = new MockIDBRequest();
      const all = Array.from(this.storeMap.values());
      setTimeout(() => req.triggerSuccess(all), 0);
      return req;
    }

    delete(key: any): MockIDBRequest {
      const req = new MockIDBRequest();
      this.storeMap.delete(key);
      setTimeout(() => req.triggerSuccess(undefined), 0);
      return req;
    }

    clear(): MockIDBRequest {
      const req = new MockIDBRequest();
      this.storeMap.clear();
      setTimeout(() => req.triggerSuccess(undefined), 0);
      return req;
    }
  }

  class MockIDBTransaction {
    public oncomplete: (() => void) | null = null;
    public onerror: ((e: any) => void) | null = null;

    constructor(
      public storeNames: string[],
      public mode: string,
      private dbMap: Map<string, Map<any, any>>,
      private objectStoreMeta: Map<string, string>
    ) {
      setTimeout(() => {
        if (this.oncomplete) this.oncomplete();
      }, 5);
    }

    objectStore(name: string): MockIDBObjectStore {
      if (!this.dbMap.has(name)) {
        this.dbMap.set(name, new Map());
      }
      const storeMap = this.dbMap.get(name)!;
      const keyPath = this.objectStoreMeta.get(name) || 'id';
      return new MockIDBObjectStore(name, keyPath, storeMap);
    }
  }

  class MockIDBDatabase {
    public objectStoreNames = {
      contains: (name: string) => this.objectStoreMeta.has(name),
    };

    private objectStoreMeta = new Map<string, string>();

    constructor(public name: string, private dbMap: Map<string, Map<any, any>>) {}

    createObjectStore(name: string, options: { keyPath: string }) {
      this.objectStoreMeta.set(name, options.keyPath);
      if (!this.dbMap.has(name)) {
        this.dbMap.set(name, new Map());
      }
      return new MockIDBObjectStore(name, options.keyPath, this.dbMap.get(name)!);
    }

    transaction(storeNames: string | string[], mode: string) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      return new MockIDBTransaction(names, mode, this.dbMap, this.objectStoreMeta);
    }

    close() {}
  }

  const mockFactory = {
    open(name: string, _version?: number): MockIDBOpenDBRequest {
      const req = new MockIDBOpenDBRequest();
      if (!databases.has(name)) {
        databases.set(name, new Map());
      }
      const dbMap = databases.get(name)!;
      const db = new MockIDBDatabase(name, dbMap);

      setTimeout(() => {
        if (req.onupgradeneeded) {
          req.result = db;
          req.onupgradeneeded({ target: req } as any);
        }
        req.result = db;
        req.triggerSuccess(db);
      }, 0);

      return req;
    },
  };

  (window as any).indexedDB = mockFactory;
}
