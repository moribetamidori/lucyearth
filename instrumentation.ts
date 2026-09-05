export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertPaperMode } = await import('./lib/trade/config');
    assertPaperMode();
  }
}
