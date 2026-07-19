interface InstallYouTubeTracksBridgeOptions {
  host: object;
  publish: () => void;
  addNavigationListener: (listener: () => void) => void;
  addRequestListener?: (listener: () => void) => void;
}

const publishersByHost = new WeakMap<object, () => void>();

const runSafely = (callback: () => void): void => {
  try {
    callback();
  } catch {
    // Page-facing publication is best-effort.
  }
};

export function installYouTubeTracksBridge({
  host,
  publish,
  addNavigationListener,
  addRequestListener,
}: InstallYouTubeTracksBridgeOptions): void {
  const existingPublish = publishersByHost.get(host);
  if (existingPublish !== undefined) {
    existingPublish();
    return;
  }

  const safePublish = () => runSafely(publish);
  try {
    addNavigationListener(safePublish);
  } catch {
    safePublish();
    return;
  }

  try {
    addRequestListener?.(safePublish);
  } catch {
    // Navigation publication still works if the request channel is unavailable.
  }

  publishersByHost.set(host, safePublish);
  safePublish();
}
