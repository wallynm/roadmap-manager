import { useEffect, forwardRef, useImperativeHandle } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteViewRaw } from "@blocknote/react";

export interface BlockNoteEditorHandle {
  setFirstHeadingText(text: string): void;
}

interface BlockNoteEditorProps {
  markdown: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
  onTitleChange?: (title: string) => void;
}

const bnThemeVars: React.CSSProperties = {
  ["--bn-colors-editor-background" as string]: "hsl(240, 15%, 14%)",
  ["--bn-colors-editor-text" as string]: "hsl(240, 10%, 90%)",
  ["--bn-colors-menu-background" as string]: "hsl(240, 16%, 17%)",
  ["--bn-colors-menu-text" as string]: "hsl(240, 10%, 90%)",
  ["--bn-colors-tooltip-background" as string]: "hsl(240, 15%, 19%)",
  ["--bn-colors-tooltip-text" as string]: "hsl(240, 10%, 90%)",
  ["--bn-colors-hovered-background" as string]: "hsl(240, 15%, 19%)",
  ["--bn-colors-hovered-text" as string]: "hsl(240, 10%, 90%)",
  ["--bn-colors-selected-background" as string]: "hsl(244, 76%, 65%, 0.18)",
  ["--bn-colors-selected-text" as string]: "hsl(240, 10%, 90%)",
  ["--bn-colors-disabled-background" as string]: "hsl(240, 18%, 11%)",
  ["--bn-colors-disabled-text" as string]: "hsl(240, 8%, 42%)",
  ["--bn-colors-border" as string]: "hsl(240, 13%, 22%)",
  ["--bn-colors-shadow" as string]: "transparent",
  ["--bn-colors-side-menu" as string]: "hsl(240, 8%, 40%)",
  ["--bn-border-radius" as string]: "6px",
};

export const BlockNoteEditor = forwardRef<BlockNoteEditorHandle, BlockNoteEditorProps>(
  function BlockNoteEditor({ markdown, editable = true, onChange, onTitleChange }, ref) {
    const editor = useCreateBlockNote();

    useImperativeHandle(ref, () => ({
      setFirstHeadingText(text: string) {
        const firstBlock = editor.document[0];
        if (firstBlock?.type === "heading") {
          editor.updateBlock(firstBlock.id, {
            content: [{ type: "text", text, styles: {} }],
          });
        }
      },
    }));

    useEffect(() => {
      const blocks = editor.tryParseMarkdownToBlocks(markdown);
      editor.replaceBlocks(editor.document, blocks);
    }, [markdown, editor]);

    useEffect(() => {
      if (!onChange && !onTitleChange) {
        return;
      }
      return editor.onChange(() => {
        const md = editor.blocksToMarkdownLossy(editor.document);
        onChange?.(md);

        if (onTitleChange) {
          const firstBlock = editor.document[0];
          if (firstBlock?.type === "heading") {
            type TextContent = { type: "text"; text: string };
            const title = (firstBlock.content as unknown[])
              .filter((c): c is TextContent =>
                typeof c === "object" && c !== null && (c as TextContent).type === "text"
              )
              .map((c) => c.text)
              .join("");
            onTitleChange(title);
          }
        }
      });
    }, [editor, onChange, onTitleChange]);

    return (
      <div style={bnThemeVars} className="rounded-lg overflow-hidden">
        <BlockNoteViewRaw
          editor={editor}
          editable={editable}
          theme="dark"
          className="[&_.bn-editor]:min-h-[200px] [&_.bn-editor]:px-0 [&_.bn-editor]:py-2"
        />
      </div>
    );
  }
);
