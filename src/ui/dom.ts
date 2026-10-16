/** Small DOM helpers for the HUD. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function num(n: number, lang: string, fractionDigits = 0): string {
  return (fractionDigits ? n : Math.floor(n)).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: fractionDigits });
}

/** replace innerHTML only when the markup actually changed (keeps hover / focus stable) */
export class Patch {
  private last = new WeakMap<Element, string>();
  set(el: Element | null | undefined, html: string): void {
    if (!el) return;
    if (this.last.get(el) === html) return;
    this.last.set(el, html);
    el.innerHTML = html;
  }
}

/** true when keyboard focus is in something that takes typing or its own Space / Enter */
export function isInteractive(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || tag === 'A' || tag === 'SUMMARY' || el.isContentEditable;
}

export function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable;
}
