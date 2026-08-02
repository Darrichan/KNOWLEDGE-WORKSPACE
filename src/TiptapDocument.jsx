import { useEffect, useRef, useState } from "react";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { ArrowsInSimple, DotsSixVertical, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from "@phosphor-icons/react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { MindMapBlock } from "./MindMapBlock.jsx";

const lowlight = createLowlight(common);

function DraggableCodeBlockView({ node, selected }) {
  const language = node.attrs.language || "plaintext";
  return (
    <NodeViewWrapper as="pre" className={`draggable-code-block ${selected ? "is-selected" : ""}`} data-language={language}>
      <button className="code-block-drag-handle" type="button" contentEditable={false} data-drag-handle aria-label="拖拽移动代码块" title="拖拽移动代码块"><DotsSixVertical /></button>
      <NodeViewContent as="code" className={`language-${language}`} />
    </NodeViewWrapper>
  );
}

const DraggableCodeBlock = CodeBlockLowlight.extend({
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(DraggableCodeBlockView);
  },
});

const OptimizedDocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      originalSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-original-src"),
        renderHTML: (attributes) => attributes.originalSrc ? { "data-original-src": attributes.originalSrc } : {},
      },
    };
  },
});

export function TiptapDocument({ documentId, content, onChange, onEditorReady, mindMapActions, editable = true }) {
  const suppressUpdateRef = useRef(true);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
      }),
      DraggableCodeBlock.configure({ lowlight, defaultLanguage: "plaintext", enableTabIndentation: true, tabSize: 2 }),
      TextStyle,
      Color,
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      OptimizedDocumentImage.configure({
        allowBase64: false,
        HTMLAttributes: { class: "document-image", loading: "lazy", decoding: "async" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MindMapBlock.configure({ actions: mindMapActions || {} }),
      Placeholder.configure({ placeholder: "输入 / 开始写作…" }),
    ],
    content,
    editable,
    editorProps: { attributes: { class: "tiptap-editor" } },
    onUpdate: ({ editor: currentEditor }) => {
      if (!suppressUpdateRef.current) onChange(currentEditor.getJSON());
    },
  }, [documentId]);

  useEffect(() => {
    if (!editor) return;
    const nextContent = content || { type: "doc", content: [] };
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(nextContent)) { suppressUpdateRef.current = false; return; }
    suppressUpdateRef.current = true;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    const frame = window.requestAnimationFrame(() => { suppressUpdateRef.current = false; });
    return () => window.cancelAnimationFrame(frame);
  }, [content, documentId, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    onEditorReady(editor);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!imagePreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setImagePreview(null);
      else if (event.key === "+" || event.key === "=") setImageZoom((value) => Math.min(4, value + .25));
      else if (event.key === "-") setImageZoom((value) => Math.max(.25, value - .25));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview]);

  const openImagePreview = (event) => {
    const image = event.target.closest?.("img.document-image");
    if (!image) return;
    event.preventDefault();
    setImageZoom(1);
    setImagePreview({ src: image.dataset.originalSrc || image.src, alt: image.alt || "文档图片" });
  };

  return <><div className="document-editor-content" onClick={openImagePreview}><EditorContent editor={editor} /></div>{imagePreview && <div className="image-preview-backdrop" role="dialog" aria-modal="true" aria-label="高清图片预览" onMouseDown={(event) => { if (event.target === event.currentTarget) setImagePreview(null); }}><div className="image-preview-toolbar"><span>{Math.round(imageZoom * 100)}%</span><button onClick={() => setImageZoom((value) => Math.max(.25, value - .25))} aria-label="缩小"><MagnifyingGlassMinus /></button><button onClick={() => setImageZoom((value) => Math.min(4, value + .25))} aria-label="放大"><MagnifyingGlassPlus /></button><button onClick={() => setImageZoom(1)} aria-label="适应屏幕"><ArrowsInSimple /></button><button onClick={() => setImagePreview(null)} aria-label="关闭"><X /></button></div><div className="image-preview-canvas" onWheel={(event) => { event.preventDefault(); setImageZoom((value) => Math.min(4, Math.max(.25, value + (event.deltaY < 0 ? .15 : -.15)))); }}><div className="image-preview-stage" style={{ width: `${imageZoom * 100}%` }}><img src={imagePreview.src} alt={imagePreview.alt} draggable="false" style={{ maxHeight: imageZoom <= 1 ? "calc(100vh - 134px)" : "none" }} /></div></div></div>}</>;
}
