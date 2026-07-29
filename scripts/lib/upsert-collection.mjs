/**
 * Replays a normalized collection through deterministic upserts so rerunning
 * a real-data import refreshes changed values instead of silently ignoring them.
 */
export async function upsertCollection(rows, options) {
  for (const row of rows) {
    const id = options.toId(row);
    await options.upsert({
      where: { id },
      create: options.toCreate(row),
      update: options.toUpdate(row)
    });
  }
}
