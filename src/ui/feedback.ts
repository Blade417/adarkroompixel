import type { Language } from '../core/i18n';
import { esc } from './dom';

const ENDPOINT = import.meta.env.VITE_FEEDBACK_ENDPOINT || 'https://driftmsg.top/adarkroompixel/feedback/api';

/** Nothing is sent until the player submits this form. Drafts stay in page memory. */
export class Feedback {
  readonly layer: HTMLElement;
  readonly card: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly result: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly fields: HTMLFieldSetElement;
  private opener: HTMLElement | null = null;
  private requestId = crypto.randomUUID();
  private sending = false;
  private release: Promise<string> | null = null;

  constructor(root: HTMLElement, private readonly language: Language,
    private readonly context: () => string, private readonly save: () => string,
    private readonly changed: () => void) {
    const t = (zh: string, en: string) => esc(this.t(zh, en));
    this.layer = document.createElement('div');
    this.layer.className = 'layer feedback-layer';
    this.layer.hidden = true;
    this.layer.innerHTML = `<section class="card feedback-card" role="dialog" aria-modal="true" aria-labelledby="feedback-title" tabindex="-1">
      <p class="kicker">${t('把问题留在这里', 'Leave a note')}</p>
      <h2 id="feedback-title">${t('问题反馈', 'Feedback')}</h2>
      <p class="feedback-intro">${t('遇到错误、卡关，或有想说的话？无需账号，直接告诉我们。', 'Found a bug, got stuck, or have a suggestion? No account needed.')}</p>
      <form><fieldset>
        <label for="feedback-kind">${t('反馈类型', 'Category')}</label>
        <select id="feedback-kind" name="category"><option value="bug">${t('程序错误', 'Bug')}</option><option value="stuck">${t('卡关 / 不知道怎么玩', 'Stuck / unclear instructions')}</option><option value="suggestion">${t('体验建议', 'Suggestion')}</option><option value="other">${t('其他', 'Other')}</option></select>
        <label for="feedback-message">${t('发生了什么？', 'What happened?')}</label>
        <textarea id="feedback-message" name="message" required minlength="10" maxlength="3000" rows="3" placeholder="${t('至少 10 个字，请描述你遇到的问题。', 'At least 10 characters. Describe the problem.')}" aria-describedby="feedback-privacy"></textarea>
        <label for="feedback-steps">${t('刚才进行了什么操作？（选填）', 'Steps to reproduce (optional)')}</label>
        <textarea id="feedback-steps" name="steps" maxlength="2000" rows="2"></textarea>
        <label for="feedback-contact">${t('联系方式（选填）', 'Contact (optional)')}</label>
        <input id="feedback-contact" name="contact" maxlength="200" placeholder="${t('邮箱或其他联系方式，便于追问和回复', 'Email or another way to reach you')}" autocomplete="off">
        <label class="feedback-check"><input type="checkbox" name="includeSave"> <span>${t('附上当前存档，帮助复现问题', 'Attach my current save to help reproduce the issue')}</span></label>
        <p class="feedback-privacy" id="feedback-privacy">${t('提交时附带版本、当前场景及浏览器信息，发送至 driftmsg.top，仅供维护者处理。联系方式和存档不会公开；未勾选时不上传存档。请勿填写密码等敏感信息。', 'Submission includes version, current scene and browser details, sent to driftmsg.top for the maintainer. Contact and saves stay private; saves are attached only if checked. Do not include passwords or sensitive information.')}</p>
      </fieldset>
      <p class="feedback-result" role="status" aria-live="polite"></p>
      <div class="set-actions end"><button type="button" class="btn" data-feedback="close">${t('关闭', 'Close')}</button><button type="button" class="btn" data-feedback="new" hidden>${t('再写一条', 'Write another')}</button><button class="btn feedback-submit" type="submit">${t('提交反馈', 'Send feedback')}</button></div></form>
    </section>`;
    root.append(this.layer);
    this.card = this.layer.querySelector<HTMLElement>('.feedback-card')!;
    this.form = this.layer.querySelector('form')!;
    this.fields = this.layer.querySelector('fieldset')!;
    this.result = this.layer.querySelector('.feedback-result')!;
    this.submit = this.layer.querySelector('[type="submit"]')!;
    this.form.addEventListener('submit', e => { e.preventDefault(); void this.send(); });
    this.form.addEventListener('input', () => { this.requestId = crypto.randomUUID(); });
    this.layer.querySelector('[data-feedback="close"]')!.addEventListener('click', () => this.close());
    this.layer.querySelector('[data-feedback="new"]')!.addEventListener('click', () => {
      this.form.reset(); this.fields.hidden = false; this.submit.hidden = false;
      this.result.textContent = ''; this.result.classList.remove('error');
      this.layer.querySelector<HTMLElement>('[data-feedback="new"]')!.hidden = true;
      this.requestId = crypto.randomUUID();
      this.form.querySelector<HTMLElement>('[name="message"]')!.focus();
    });
  }

  private t(zh: string, en: string): string { return this.language === 'zh' ? zh : en; }
  get opened(): boolean { return !this.layer.hidden; }

  open(opener: HTMLElement): void {
    this.opener = opener;
    this.layer.hidden = false;
    this.changed();
    this.card.focus({ preventScroll: true });
    this.release ??= fetch(new URL('release.json', document.baseURI), { cache: 'no-cache', signal: AbortSignal.timeout(4000) })
      .then(async r => r.ok ? (await r.json()).commit as string : 'unknown').catch(() => 'unknown');
  }

  close(): void {
    this.layer.hidden = true;
    this.changed();
    this.opener?.focus({ preventScroll: true });
  }

  private async send(): Promise<void> {
    if (this.sending || !this.form.reportValidity()) return;
    const data = new FormData(this.form);
    if (String(data.get('message')).trim().length < 10) {
      this.result.textContent = this.t('请至少填写 10 个字的问题描述。', 'Please enter a description of at least 10 characters.');
      this.result.classList.add('error'); return;
    }
    this.sending = true; this.fields.disabled = true; this.submit.disabled = true;
    this.result.classList.remove('error');
    this.result.textContent = this.t('正在提交…', 'Sending…');
    try {
      const payload = {
        requestId: this.requestId, category: data.get('category'), message: String(data.get('message')).trim(),
        steps: String(data.get('steps')).trim(), contact: String(data.get('contact')).trim(),
        context: { version: await this.release, scene: this.context(), language: this.language,
          browser: navigator.userAgent, viewport: `${innerWidth} × ${innerHeight}`, page: location.origin + location.pathname },
        ...(data.has('includeSave') ? { save: this.save() } : {})
      };
      const response = await fetch(ENDPOINT, { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(String(response.status));
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) throw new Error('response');
      this.fields.hidden = true; this.submit.hidden = true;
      this.result.textContent = this.t('已收到，谢谢！反馈编号：', 'Thank you! Feedback ID: ') + body.id;
      this.layer.querySelector<HTMLElement>('[data-feedback="new"]')!.hidden = false;
    } catch (error) {
      this.result.classList.add('error');
      this.result.textContent = error instanceof Error && error.message === '429'
        ? this.t('提交过于频繁，请稍后再试。内容已保留。', 'Too many submissions. Please try later; your draft is retained.')
        : this.t('暂时未能确认提交，请检查网络后重试。内容已保留，重试不会重复创建反馈。', 'Unable to confirm submission. Check your connection and retry. Your draft is retained; retries will not create duplicates.');
    } finally { this.sending = false; this.fields.disabled = false; this.submit.disabled = false; }
  }
}
