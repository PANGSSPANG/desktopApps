import { createHash } from 'node:crypto';

/** 正文内容指纹：用于快照去重与乐观并发比对。 */
export function hashContent(contentJson: string): string {
  return createHash('sha256').update(contentJson).digest('hex');
}
