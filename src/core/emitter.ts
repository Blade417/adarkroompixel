/** Minimal typed event emitter. */
export class Emitter<E extends { type: string }> {
  private handlers = new Set<(e: E) => void>();

  on(fn: (e: E) => void): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  emit(e: E): void {
    for (const h of [...this.handlers]) h(e);
  }
}
