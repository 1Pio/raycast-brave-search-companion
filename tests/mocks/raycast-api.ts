export const localStorageItems = new Map<string, string>();
export const localStorageCalls = {
  removeItem: [] as string[],
  setItem: [] as string[],
};

export const LocalStorage = {
  async getItem(key: string): Promise<string | undefined> {
    return localStorageItems.get(key);
  },
  async removeItem(key: string): Promise<void> {
    localStorageCalls.removeItem.push(key);
    localStorageItems.delete(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorageCalls.setItem.push(key);
    localStorageItems.set(key, value);
  },
};

export function resetRaycastApiMock(): void {
  localStorageItems.clear();
  localStorageCalls.removeItem = [];
  localStorageCalls.setItem = [];
}
