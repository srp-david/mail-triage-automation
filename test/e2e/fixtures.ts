import {
  test as base,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test';

// Different scenarioName values force worker isolation for legacy server module
// configuration and in-memory API fixtures. No scenario connects to a live service.
export const test = base.extend<{ scenarioBrowser: Browser }, { scenarioName: string }>({
  scenarioName: ['default', { scope: 'worker', option: true }],
  scenarioBrowser: async ({ browser, scenarioName }, use, info) => {
    const contexts: BrowserContext[] = [];
    let closed = false;
    async function newContext(options?: BrowserContextOptions) {
      const context = await browser.newContext(options);
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      contexts.push(context);
      return context;
    }
    async function close() {
      if (closed) return;
      closed = true;
      for (const [index, context] of contexts.entries()) {
        const trace = info.outputPath(`${scenarioName}-${index}.zip`);
        await context.tracing.stop({ path: trace });
        await info.attach(`trace-${index}`, { path: trace, contentType: 'application/zip' });
        await context.close();
      }
    }
    const owned = new Proxy(browser, {
      get(target, property) {
        if (property === 'newContext') return newContext;
        if (property === 'newPage')
          return async (options?: BrowserContextOptions) => (await newContext(options)).newPage();
        if (property === 'close') return close;
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      await use(owned);
    } finally {
      await close();
    }
  },
});
