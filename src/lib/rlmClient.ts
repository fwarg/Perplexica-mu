export async function summarizeWithRLM(
  findings: { title: string; content: string }[],
  query: string,
  serviceURL: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${serviceURL}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findings, query }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`RLM service returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { condensed: string };
    return data.condensed ?? null;
  } catch (err) {
    console.error('RLM summarize failed:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
