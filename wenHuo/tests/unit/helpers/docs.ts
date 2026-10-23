import type { ProseMirrorDoc } from '@shared/editor-doc';

export function paragraphDoc(paragraphs: string[]): ProseMirrorDoc {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

export function emptyDoc(): ProseMirrorDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function docJson(paragraphs: string[]): string {
  return JSON.stringify(paragraphDoc(paragraphs));
}
