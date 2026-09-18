/**
 * filename-template.ts — Pha 13: Template đặt tên file linh hoạt.
 * Hàm pure thay token, KHÔNG sanitize ở đây — sanitize (chống path traversal)
 * luôn phải là bước cuối cùng phía gọi (downloader.ts), theo đúng yêu cầu bảo
 * mật đã chốt từ Pha 1.
 */

export interface FilenameTemplateContext {
  username: string;
  tweetId: string;
  date: string;
  type: string;
  ext: string;
  index: number;
}

const TOKEN_PATTERN = /\{(username|tweetId|date|type|ext|index)\}/g;

export function renderFilenameTemplate(template: string, ctx: FilenameTemplateContext): string {
  return template.replace(TOKEN_PATTERN, (_match, token: keyof FilenameTemplateContext) => {
    const value = ctx[token];
    return value === undefined || value === null ? '' : String(value);
  });
}
