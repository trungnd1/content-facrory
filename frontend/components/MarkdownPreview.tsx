"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import { useEffect, useMemo } from "react";

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    const md = markdown ?? "";
    // Render markdown to HTML, but drop any raw HTML embedded in the markdown
    // (LLM outputs can contain HTML; we don't want to inject it into the DOM).
    const renderer = new marked.Renderer();
    renderer.html = () => "";

    const parsed = marked.parse(md, {
      breaks: true,
      gfm: true,
      renderer,
    });

    return typeof parsed === "string" ? parsed : "";
  }, [markdown]);

  const editor = useEditor({
    extensions: [StarterKit],
    // Avoid SSR/runtime crashes by deferring ProseMirror initialization.
    // Content is set in an effect after the editor instance exists.
    immediatelyRender: false,
    content: "",
    editable: false,
    editorProps: {
      attributes: {
        class:
          "prose-content focus:outline-none whitespace-pre-wrap text-sm leading-relaxed text-[#d4d6e6]",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, html]);

  if (!editor) {
    return <p className="text-[#5c6076] text-sm">Loading preview...</p>;
  }

  return <EditorContent editor={editor} />;
}
