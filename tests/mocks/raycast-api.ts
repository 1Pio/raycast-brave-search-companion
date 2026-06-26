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

function RaycastComponent(): null {
  return null;
}

export const Action = Object.assign(RaycastComponent, {
  CopyToClipboard: RaycastComponent,
  OpenInBrowser: RaycastComponent,
  Paste: RaycastComponent,
  Style: {
    Destructive: "destructive",
  },
});

export const ActionPanel = Object.assign(RaycastComponent, {
  Section: RaycastComponent,
});

const Metadata = Object.assign(RaycastComponent, {
  Label: RaycastComponent,
  Link: RaycastComponent,
  Separator: RaycastComponent,
});

export const List = Object.assign(RaycastComponent, {
  Item: Object.assign(RaycastComponent, {
    Detail: Object.assign(RaycastComponent, {
      Metadata,
    }),
  }),
  Section: RaycastComponent,
});

export const Form = Object.assign(RaycastComponent, {
  Dropdown: Object.assign(RaycastComponent, {
    Item: RaycastComponent,
  }),
  Description: RaycastComponent,
});

export const Icon = new Proxy<Record<string, string>>(
  {},
  {
    get(_target, property) {
      return String(property);
    },
  },
);

export const Toast = {
  Style: {
    Success: "success",
    Failure: "failure",
  },
};

export async function showToast(): Promise<void> {
  return undefined;
}

export async function confirmAlert(): Promise<boolean> {
  return true;
}

export function resetRaycastApiMock(): void {
  localStorageItems.clear();
  localStorageCalls.removeItem = [];
  localStorageCalls.setItem = [];
}
