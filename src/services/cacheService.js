const DEFAULT_TTL_SECONDS = 600;

class MemoryCacheService {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }
}

module.exports = new MemoryCacheService();
