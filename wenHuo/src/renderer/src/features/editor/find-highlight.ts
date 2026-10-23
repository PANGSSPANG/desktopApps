import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface FindHighlightState {
  query: string;
  activeIndex: number;
}

export const findHighlightKey = new PluginKey<FindHighlightState>('findHighlight');

/**
 * 把查找命中画成编辑器里的高亮。
 *
 * 之前只 setTextSelection，选中色又和纸色接近，看起来像"没反应"。
 * 这里用 ProseMirror decoration 把所有命中都标出来，当前一处更深。
 */
export const FindHighlight = Extension.create({
  name: 'findHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindHighlightState>({
        key: findHighlightKey,
        state: {
          init: () => ({ query: '', activeIndex: 0 }),
          apply(transaction, value) {
            const meta = transaction.getMeta(findHighlightKey) as FindHighlightState | undefined;
            return meta ?? value;
          },
        },
        props: {
          decorations(state) {
            const current = findHighlightKey.getState(state);
            if (!current?.query) return null;

            const ranges: { from: number; to: number }[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              let index = node.text.indexOf(current.query);
              while (index !== -1) {
                ranges.push({ from: pos + index, to: pos + index + current.query.length });
                index = node.text.indexOf(current.query, index + current.query.length);
              }
            });

            if (ranges.length === 0) return null;
            return DecorationSet.create(
              state.doc,
              ranges.map((range, index) =>
                Decoration.inline(range.from, range.to, {
                  class: index === current.activeIndex ? 'wh-find-active' : 'wh-find-match',
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});
