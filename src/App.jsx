import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BaseEdge,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  getSmoothStepPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  ArrowBendDownRight,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowsLeftRight,
  Article,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CheckSquare,
  ChartBarHorizontal,
  CirclesFour,
  ClockCounterClockwise,
  Code,
  Command,
  Copy,
  DotsThree,
  Export,
  FileText,
  Flag,
  Folder,
  Globe,
  House,
  Image,
  Info,
  Keyboard,
  ListBullets,
  MagnifyingGlass,
  MapTrifold,
  NotePencil,
  Palette,
  PaintBrush,
  Plus,
  Question,
  Robot,
  SignOut,
  SidebarSimple,
  SpinnerGap,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Table,
  TreeStructure,
  Trash,
  Users,
  WarningCircle,
  Star,
} from "@phosphor-icons/react";
import { api, ApiError } from "./api.js";
import { AuthScreen } from "./AuthScreen.jsx";
import { blankDocumentContent, cloneDocumentContent, defaultDocumentContent } from "./defaultContent.js";
import { TiptapDocument } from "./TiptapDocument.jsx";
import { createInitialGanttContent, createInitialSpreadsheetContent, GanttEditor, SpreadsheetEditor } from "./StructuredEditors.jsx";
import { WorkspacePages } from "./WorkspacePages.jsx";
import { ConfirmDialog, MoveDialog, ShareDialog, TextInputDialog, VersionDialog } from "./WorkspaceDialogs.jsx";

const starterNodes = [
  { id: "root", position: { x: 120, y: 220 }, data: { label: "中心主题" }, className: "mind-node mind-node-root" },
];

const starterEdges = [];

const cloneGraph = (items) => JSON.parse(JSON.stringify(items));
const mapTextStyleToCss = (textStyle = {}) => ({
  color: textStyle.color || undefined,
  fontSize: textStyle.fontSize ? `${textStyle.fontSize}px` : undefined,
  fontFamily: textStyle.fontFamily && textStyle.fontFamily !== "inherit" ? textStyle.fontFamily : undefined,
  fontWeight: textStyle.bold ? 700 : undefined,
  fontStyle: textStyle.italic ? "italic" : undefined,
  textDecoration: [textStyle.underline ? "underline" : "", textStyle.strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
});
const mergeMapTextRuns = (characters) => characters.reduce((runs, character) => {
  const style = character.style || {};
  const previous = runs[runs.length - 1];
  if (previous && JSON.stringify(previous.style || {}) === JSON.stringify(style)) previous.text += character.text;
  else runs.push({ text: character.text, style });
  return runs;
}, []);
const expandMapTextRuns = (label, textRuns, fallbackStyle = {}) => {
  const validRuns = Array.isArray(textRuns) && textRuns.map((run) => run?.text || "").join("") === label;
  if (!validRuns) return [...label].map((text) => ({ text, style: { ...fallbackStyle } }));
  return textRuns.flatMap((run) => [...(run.text || "")].map((text) => ({ text, style: { ...(run.style || {}) } })));
};
const reconcileMapTextRuns = (oldLabel, nextLabel, textRuns, fallbackStyle = {}) => {
  if (!Array.isArray(textRuns) || oldLabel === nextLabel) return textRuns;
  const oldCharacters = expandMapTextRuns(oldLabel, textRuns, fallbackStyle);
  let prefix = 0;
  while (prefix < oldLabel.length && prefix < nextLabel.length && oldLabel[prefix] === nextLabel[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldLabel.length - prefix && suffix < nextLabel.length - prefix && oldLabel[oldLabel.length - 1 - suffix] === nextLabel[nextLabel.length - 1 - suffix]) suffix += 1;
  const insertedText = nextLabel.slice(prefix, nextLabel.length - suffix);
  const insertedStyle = oldCharacters[Math.max(0, prefix - 1)]?.style || oldCharacters[prefix]?.style || fallbackStyle;
  return mergeMapTextRuns([
    ...oldCharacters.slice(0, prefix),
    ...[...insertedText].map((text) => ({ text, style: { ...insertedStyle } })),
    ...(suffix ? oldCharacters.slice(oldCharacters.length - suffix) : []),
  ]);
};
const normalizeMapLayout = (layoutStyle) => layoutStyle === "logic-tree" ? "logic-right" : (layoutStyle || "logic-right");
const isStructuredMapLayout = (layoutStyle) => normalizeMapLayout(layoutStyle) !== "cards";
const getMapBranchSide = (layoutStyle, preferredSide) => {
  const normalized = normalizeMapLayout(layoutStyle);
  if (normalized === "logic-left") return "left";
  if (normalized === "logic-down" || normalized === "cards") return "down";
  if (normalized === "balanced") return preferredSide === "left" ? "left" : "right";
  return "right";
};
const getMapHandles = (layoutStyle, preferredSide) => {
  const side = getMapBranchSide(layoutStyle, preferredSide);
  return side === "left"
    ? { side, sourceHandle: "source-left", targetHandle: "target-right", sourcePosition: Position.Left, targetPosition: Position.Right }
    : side === "down"
      ? { side, sourceHandle: "source-bottom", targetHandle: "target-top", sourcePosition: Position.Bottom, targetPosition: Position.Top }
      : { side, sourceHandle: "source-right", targetHandle: "target-left", sourcePosition: Position.Right, targetPosition: Position.Left };
};
const createStarterGraph = (title) => {
  const nodes = cloneGraph(starterNodes);
  nodes[0].data.label = title;
  nodes[0].type = "mindMap";
  nodes[0].data.layoutStyle = "logic-right";
  return { nodes, edges: cloneGraph(starterEdges), layout_style: "logic-right" };
};

const mindMapThemes = [
  { id: "spectrum", label: "多彩分支", colors: ["#ef6b66", "#e9a63a", "#45a97b", "#4f82d9", "#8b6cc7"] },
  { id: "graphite", label: "经典黑白", colors: ["#30343b", "#737b86"] },
  { id: "ocean", label: "海洋渐层", colors: ["#3f7ac6", "#51a7c5", "#69b69e"] },
  { id: "iris", label: "鸢尾柔彩", colors: ["#7761c7", "#a66bb1", "#d47c9e"] },
  { id: "sunset", label: "暖阳枝叶", colors: ["#d66b55", "#db9b3f", "#8da755"] },
];

const mindMapMarkers = [
  { id: "info", label: "提示", Icon: Info, color: "#3f7fd0", tone: "blue" },
  { id: "warning", label: "警告", Icon: WarningCircle, color: "#d98a24", tone: "amber" },
  { id: "risk", label: "风险", Icon: WarningCircle, color: "#d85252", tone: "red" },
  { id: "important", label: "重点", Icon: Star, color: "#8a64c9", tone: "violet" },
  { id: "question", label: "问题", Icon: Question, color: "#5279b5", tone: "indigo" },
  { id: "done", label: "完成", Icon: CheckCircle, color: "#35a775", tone: "green" },
];

const textColors = [
  { label: "默认", value: null, swatch: "#30343b" },
  { label: "石墨", value: "#202733" },
  { label: "深灰", value: "#4b5563" },
  { label: "灰蓝", value: "#65758b" },
  { label: "雾灰", value: "#8b95a5" },
  { label: "海军蓝", value: "#274c77" },
  { label: "深蓝", value: "#416f9f" },
  { label: "湖蓝", value: "#3478b8" },
  { label: "天蓝", value: "#4d9bd6" },
  { label: "青色", value: "#238c9a" },
  { label: "青绿", value: "#3f8279" },
  { label: "墨绿", value: "#39705d" },
  { label: "草绿", value: "#5d8a45" },
  { label: "紫罗兰", value: "#735f9d" },
  { label: "深紫", value: "#5d4785" },
  { label: "玫红", value: "#a65362" },
  { label: "朱红", value: "#b24f48" },
  { label: "暖橙", value: "#a96f36" },
  { label: "赭黄", value: "#9a7737" },
  { label: "咖啡", value: "#765b4b" },
  { label: "纯黑", value: "#111827" },
  { label: "钢灰", value: "#596579" },
  { label: "岩灰", value: "#71717a" },
  { label: "棕褐", value: "#7b4d35" },
  { label: "砖红", value: "#934b44" },
  { label: "珊瑚红", value: "#c05b52" },
  { label: "樱桃红", value: "#a83f55" },
  { label: "莓果", value: "#984667" },
  { label: "紫红", value: "#944b82" },
  { label: "葡萄紫", value: "#684994" },
  { label: "靛青", value: "#4f56a6" },
  { label: "钴蓝", value: "#315fa8" },
  { label: "亮蓝", value: "#2d83c5" },
  { label: "孔雀蓝", value: "#267b91" },
  { label: "松石绿", value: "#2e887f" },
  { label: "森林绿", value: "#3d7650" },
  { label: "橄榄绿", value: "#6f7d37" },
  { label: "金棕", value: "#9f722c" },
  { label: "焦糖", value: "#b66a32" },
  { label: "陶土", value: "#a85d46" },
];

const codeLanguages = [
  { value: "plaintext", label: "纯文本" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Shell / Bash" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "markdown", label: "Markdown" },
];

const detectCodeLanguage = (source = "") => {
  const code = source.trim();
  if (!code) return "plaintext";
  if (/^[\[{]/.test(code)) {
    try { JSON.parse(code); return "json"; } catch { /* continue detecting */ }
  }
  if (/^#!.*\b(?:bash|sh|zsh)\b/m.test(code) || /\b(?:npm|pnpm|yarn|docker|kubectl)\s+[\w:-]+/.test(code)) return "bash";
  if (/<(?:!doctype|html|head|body|div|span|script|style|section)\b/i.test(code)) return "html";
  if (/^[.#]?[\w\s>+~,:-]+\s*\{\s*[\w-]+\s*:/m.test(code)) return "css";
  if (/\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b[\s\S]*\b(?:FROM|INTO|TABLE|SET|VALUES)\b/i.test(code)) return "sql";
  if (/^\s*(?:def|class)\s+\w+|^\s*(?:from\s+\S+\s+)?import\s+|\bself\./m.test(code)) return "python";
  if (/^\s*package\s+main\b|\bfunc\s+\w+\s*\(/m.test(code)) return "go";
  if (/\bfn\s+\w+\s*\(|\blet\s+mut\b|\bimpl\s+\w+/m.test(code)) return "rust";
  if (/^\s*#include\s*<[^>]+>|\bstd::|\bcout\s*<</m.test(code)) return "cpp";
  if (/\busing\s+System\b|\bnamespace\s+\w+|\bConsole\.WriteLine/m.test(code)) return "csharp";
  if (/\bpublic\s+(?:static\s+)?(?:class|void)\b|\bSystem\.out\.print/m.test(code)) return "java";
  if (/^\s*#include\s*<[^>]+>|\bprintf\s*\(/m.test(code)) return "c";
  if (/\b(?:interface|type|enum)\s+\w+|:\s*(?:string|number|boolean|unknown)\b/m.test(code)) return "typescript";
  if (/\b(?:const|let|var|function)\s+\w+|=>|\bconsole\.log\s*\(/m.test(code)) return "javascript";
  if (/^\s*(?:---|[\w.-]+:)\s*$|^\s*[\w.-]+:\s+.+$/m.test(code)) return "yaml";
  if (/^#{1,6}\s+|^\s*[-*+]\s+|\[[^\]]+\]\([^)]+\)/m.test(code)) return "markdown";
  return "plaintext";
};

function MindMapNode({ data, selected }) {
  const isRoot = Boolean(data?.isRoot);
  const layoutStyle = normalizeMapLayout(data?.layoutStyle);
  const isStructured = layoutStyle !== "cards";
  const branchSide = data?.branchSide || (layoutStyle === "logic-left" ? "left" : (layoutStyle === "logic-down" || layoutStyle === "cards") ? "down" : "right");
  const marker = mindMapMarkers.find((item) => item.id === data?.marker);
  const MarkerIcon = marker?.Icon;
  const textStyle = data?.textStyle || {};
  const renderedTextStyle = mapTextStyleToCss(textStyle);
  const label = data?.label || "新主题";
  const hasTextRuns = Array.isArray(data?.textRuns) && data.textRuns.map((run) => run?.text || "").join("") === label;
  const inputRef = useRef(null);
  useEffect(() => {
    if (!data?.editing) return;
    const frame = window.requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
      data.onEditingSelect?.(0, inputRef.current.value?.length || 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [data?.editing]);
  const sourceHandles = isRoot && layoutStyle === "balanced"
    ? <><Handle id="source-left" type="source" position={Position.Left} /><Handle id="source-right" type="source" position={Position.Right} /></>
    : <Handle id={branchSide === "left" ? "source-left" : branchSide === "down" ? "source-bottom" : "source-right"} type="source" position={branchSide === "left" ? Position.Left : branchSide === "down" ? Position.Bottom : Position.Right} />;
  return (
    <div className={`mind-map-node-inner ${isRoot ? "is-root" : ""} ${isStructured ? "is-structured" : "is-card"} branch-${branchSide} ${selected ? "is-selected" : ""}`}>
      <NodeResizer
        isVisible={selected && !data?.editing && !data?.readOnly}
        minWidth={isRoot ? 150 : 68}
        minHeight={isRoot ? 52 : 30}
        maxWidth={isRoot ? 720 : 560}
        maxHeight={320}
        color="#64c7eb"
        lineClassName="mind-node-resize-line"
        handleClassName="mind-node-resize-handle"
        onResize={(_, size) => data?.onResize?.(size.width, size.height)}
        onResizeEnd={(_, size) => data?.onResizeEnd?.(size.width, size.height)}
      />
      {!isRoot && <Handle id={branchSide === "left" ? "target-right" : branchSide === "down" ? "target-top" : "target-left"} type="target" position={branchSide === "left" ? Position.Right : branchSide === "down" ? Position.Top : Position.Left} />}
      <div className="mind-node-content" style={renderedTextStyle} onDoubleClick={(event) => { if (data?.readOnly) return; event.preventDefault(); event.stopPropagation(); data?.onStartEditing?.(); }}>
        {data?.priority && <i className={`mind-node-priority priority-${data.priority}`}>{data.priority}</i>}
        {MarkerIcon && <i className={`mind-node-marker marker-${marker.tone}`} title={marker.label}><MarkerIcon weight="fill" /></i>}
        <span className="mind-node-label-slot"><span className={data?.editing ? "is-editing-placeholder" : ""}>{data?.editing ? (data.editingValue || " ") : hasTextRuns ? data.textRuns.map((run, index) => <span key={`${index}-${run.text}`} style={mapTextStyleToCss(run.style)}>{run.text}</span>) : label}</span>{data?.editing && <textarea ref={inputRef} className="nodrag nowheel mind-node-inline-editor" value={data.editingValue} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onChange={(event) => data.onEditingChange?.(event.target.value)} onSelect={(event) => data.onEditingSelect?.(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)} onBlur={() => data.onCommit?.()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); data.onCancel?.(); } }} />}</span>
      </div>
      {sourceHandles}
    </div>
  );
}

const mindMapNodeTypes = { mindMap: MindMapNode };

function XMindBranchEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }) {
  const horizontal = sourcePosition === Position.Left || sourcePosition === Position.Right;
  const pathOptions = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 18, offset: 18 };
  if (horizontal) pathOptions.centerX = sourcePosition === Position.Left ? Math.max(targetX + 24, sourceX - 42) : Math.min(targetX - 24, sourceX + 42);
  else pathOptions.centerY = Math.min(targetY - 24, sourceY + 42);
  const [edgePath] = getSmoothStepPath(pathOptions);
  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ stroke: "#34383d", strokeWidth: 1.55, ...style }} interactionWidth={18} />;
}

const mindMapEdgeTypes = { xmind: XMindBranchEdge };

const decorateMapNodes = (nodes, layoutStyle) => {
  const normalizedLayout = normalizeMapLayout(layoutStyle);
  const isStructured = normalizedLayout !== "cards";
  return cloneGraph(nodes).map((node) => ({
    ...node,
    type: "mindMap",
    data: { ...node.data, isRoot: node.id === "root", layoutStyle: normalizedLayout },
    className: isStructured
      ? node.id === "root" ? "mind-node mind-node-root" : "mind-node mind-node-logic"
      : node.className,
  }));
};

const decorateMapEdges = (edges, layoutStyle) => cloneGraph(edges).map((edge) => ({
  ...edge,
  type: isStructuredMapLayout(layoutStyle) ? "xmind" : "smoothstep",
  style: { ...edge.style, stroke: isStructuredMapLayout(layoutStyle) ? (edge.style?.stroke || "#34383d") : "var(--edge-blue)", strokeWidth: isStructuredMapLayout(layoutStyle) ? 1.7 : 2.2 },
}));

function IconButton({ label, children, className = "", onClick, active = false, disabled = false }) {
  return <button type="button" disabled={disabled} className={`icon-button ${active ? "is-active" : ""} ${className}`} aria-label={label} data-tooltip={label} onClick={onClick}>{children}</button>;
}

function BrandMark() {
  return <svg className="brand-logo" viewBox="0 0 512 512" role="img" aria-label="Knowledge Workspace"><rect x="20" y="20" width="472" height="472" rx="132" fill="currentColor" /><path d="M128 126V386M145 257L245 148M145 257L236 362" stroke="white" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" /><path d="M266 166L305 374L348 259L390 374L430 166" stroke="white" strokeWidth="31" strokeLinecap="round" strokeLinejoin="round" /><circle cx="145" cy="257" r="16" fill="#e8e4ff" /></svg>;
}

function ContentOpenLoading({ document }) {
  const labels = { spreadsheet: "正在打开表格", mindmap: "正在打开思维导图", gantt: "正在打开甘特图", document: "正在打开文档" };
  return <div className="content-open-loading" role="status" aria-live="polite"><span><SpinnerGap /></span><strong>{labels[document?.type] || "正在打开内容"}…</strong><small>{document?.title || "正在从服务器读取最新内容"}</small></div>;
}

function DocumentTreeNode({ document, depth, childrenByParent, expandedFolderIds, activeDocumentId, openingDocumentId, section, onToggleFolder, onOpenDocument, onOpenFolder, onMove, onDuplicate, onDelete, ancestors = new Set() }) {
  if (ancestors.has(document.id)) return null;
  const isFolder = document.type === "folder";
  const children = childrenByParent.get(document.id) || [];
  const expanded = isFolder && expandedFolderIds.has(document.id);
  const active = document.id === activeDocumentId && section === "document";
  const DocIcon = isFolder ? Folder : document.type === "mindmap" ? MapTrifold : document.type === "gantt" ? ChartBarHorizontal : document.type === "spreadsheet" ? Table : FileText;
  const nextAncestors = new Set(ancestors).add(document.id);
  return <div className="doc-tree-branch">
    <div className={`doc-tree-row ${active ? "active" : ""}`} style={{ "--tree-depth": depth }}>
      {isFolder && children.length > 0 ? <button className="doc-tree-toggle" aria-label={expanded ? `收起${document.title}` : `展开${document.title}`} aria-expanded={expanded} onClick={() => onToggleFolder(document.id)}>{expanded ? <CaretDown /> : <CaretRight />}</button> : <span className="doc-tree-toggle-spacer" />}
      <button className="doc-tree-open" disabled={!isFolder && Boolean(openingDocumentId)} onClick={() => isFolder ? onOpenFolder(document.id) : onOpenDocument(document.id)}>{openingDocumentId === document.id ? <SpinnerGap className="loading-spinner" /> : <DocIcon weight={active || isFolder ? "fill" : "regular"} />}<span>{openingDocumentId === document.id ? "打开中…" : document.title}</span></button>
      <details className="doc-tree-menu"><summary aria-label={`${document.title}的操作菜单`}><DotsThree /></summary><div><button onClick={() => onMove(document)}><Folder />移动到…</button><button onClick={() => onDuplicate(document)}><Copy />创建副本</button><button className="danger" onClick={() => onDelete(document)}><Trash />移到回收站</button></div></details>
    </div>
    {expanded && <div className="doc-tree-children">{children.map((child) => <DocumentTreeNode key={child.id} document={child} depth={depth + 1} childrenByParent={childrenByParent} expandedFolderIds={expandedFolderIds} activeDocumentId={activeDocumentId} openingDocumentId={openingDocumentId} section={section} onToggleFolder={onToggleFolder} onOpenDocument={onOpenDocument} onOpenFolder={onOpenFolder} onMove={onMove} onDuplicate={onDuplicate} onDelete={onDelete} ancestors={nextAncestors} />)}</div>}
  </div>;
}

function Sidebar({
  collapsed, onToggle, documents, activeDocumentId, openingDocumentId, onOpenDocument,
  workspace, user, onLogout, section, onNavigate, onOpenFolder, onSearch,
  onMove, onDuplicate, onDelete, onUpdatePublicId,
  appearanceTheme, glassEnabled, onAppearanceTheme, onGlassEnabled,
}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [publicId, setPublicId] = useState(user.public_id || "");
  const [publicIdError, setPublicIdError] = useState("");
  const workspaceSwitcherRef = useRef(null);

  useEffect(() => {
    const closeWorkspaceMenu = (event) => {
      if (!workspaceSwitcherRef.current?.contains(event.target)) setWorkspaceMenu(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setWorkspaceMenu(false);
    };
    document.addEventListener("pointerdown", closeWorkspaceMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWorkspaceMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return undefined; }
    const timer = window.setTimeout(async () => {
      try { setSearchResults(await onSearch(query.trim())); } catch { setSearchResults([]); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);

  const childrenByParent = useMemo(() => {
    const documentIds = new Set(documents.map((item) => item.id));
    const grouped = new Map();
    documents.forEach((item) => {
      const parentId = item.parent_id && documentIds.has(item.parent_id) ? item.parent_id : null;
      grouped.set(parentId, [...(grouped.get(parentId) || []), item]);
    });
    grouped.forEach((items) => items.sort((left, right) => {
      if ((left.type === "folder") !== (right.type === "folder")) return left.type === "folder" ? -1 : 1;
      return left.title.localeCompare(right.title, "zh-CN");
    }));
    return grouped;
  }, [documents]);

  const navItems = [
    ["home", "首页", House], ["space", "我的空间", Article],
    ["shared", "与我共享", Users], ["recent", "最近浏览", ClockCounterClockwise],
    ["trash", "回收站", Trash],
  ];

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="brand-logo-button" onClick={onToggle} aria-label="展开侧栏">
          <BrandMark />
        </button>
        <nav className="collapsed-main-nav" aria-label="主导航">
          {navItems.map(([key, label, NavIcon]) => <IconButton key={key} label={label} active={section === key} onClick={() => onNavigate(key)}><NavIcon weight={section === key ? "fill" : "regular"} /></IconButton>)}
        </nav>
      </aside>
    );
  }

  const treeDocuments = childrenByParent.get(null) || [];
  const toggleFolder = (folderId) => setExpandedFolderIds((current) => {
    const next = new Set(current);
    if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
    return next;
  });
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-live-lockup"><BrandMark /><span className="brand-copy"><strong className="brand-name">KNOWLEDGE</strong><span>WORKSPACE</span></span></div>
        <IconButton label="收起侧栏" onClick={onToggle}><SidebarSimple /></IconButton>
      </div>
      <div className="workspace-switcher-wrap" ref={workspaceSwitcherRef}>
        <div className="workspace-switcher-card">
          <button className="workspace-switcher" onClick={() => setWorkspaceMenu(!workspaceMenu)} aria-expanded={workspaceMenu}>
            <span className="workspace-avatar">Z</span><span className="workspace-copy"><strong>{workspace?.name}</strong><small>PRIVATE NODE</small></span><CaretDown weight="bold" />
          </button>
          <button className="workspace-appearance-trigger" onClick={() => setWorkspaceMenu(!workspaceMenu)} aria-expanded={workspaceMenu} aria-label="打开外观设置" title="外观设置"><Palette weight="fill" /></button>
        </div>
        {workspaceMenu && <div className="workspace-popover"><strong>{workspace.name}</strong><span>当前为个人自托管空间</span><small>{documents.length} 个内容节点</small><section className="workspace-appearance-settings"><div><Palette /><strong>工作区外观</strong></div><label>主题色<span className="appearance-swatches">{appearanceThemes.map((theme) => <button type="button" key={theme.id} className={appearanceTheme === theme.id ? "selected" : ""} style={{ "--appearance-color": theme.color }} title={theme.label} aria-label={theme.label} onClick={() => onAppearanceTheme(theme.id)} />)}</span></label><label>导航栏与侧边栏毛玻璃<input type="checkbox" checked={glassEnabled} onChange={(event) => onGlassEnabled(event.target.checked)} /></label></section><form className="public-id-setting" onSubmit={async (event) => { event.preventDefault(); setPublicIdError(""); try { await onUpdatePublicId(publicId); } catch (error) { setPublicIdError(error.message || "保存失败"); } }}><label>公开用户名 ID<input required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]*" value={publicId} onChange={(event) => setPublicId(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></label><button>保存</button></form>{publicIdError && <em>{publicIdError}</em>}</div>}
      </div>
      <div className="search-box">
        <MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题和正文" /><span className="shortcut">⌘ K</span>
      </div>
      {query.trim() && (
        <div className="sidebar-search-results">
          <span>搜索结果</span>
          {searchResults.map((item) => <button key={item.id} disabled={Boolean(openingDocumentId)} onClick={() => { onOpenDocument(item.id); setQuery(""); }}>{openingDocumentId === item.id ? <SpinnerGap className="loading-spinner" /> : <FileText />}<span><strong>{openingDocumentId === item.id ? "打开中…" : item.title}</strong><small>{item.plain_text || "暂无正文"}</small></span></button>)}
          {searchResults.length === 0 && <p>没有匹配内容</p>}
        </div>
      )}
      <nav className="main-nav" aria-label="主导航">
        {navItems.map(([key, label, NavIcon]) => <button key={key} className={section === key ? "active" : ""} onClick={() => onNavigate(key)}><NavIcon weight={section === key ? "fill" : "regular"} /><span>{label}</span></button>)}
      </nav>
      <div className="sidebar-section">
        <div className="section-title"><span>知识库</span></div>
        <div className="tree-parent-row">
          <button className="tree-toggle" aria-label={treeExpanded ? "收起我的文档库" : "展开我的文档库"} aria-expanded={treeExpanded} onClick={() => setTreeExpanded((value) => !value)}>{treeExpanded ? <CaretDown /> : <CaretRight />}</button>
          <button className="tree-parent" onClick={() => onNavigate("space")}><Folder weight="fill" /><span>我的文档库</span></button>
        </div>
        {treeExpanded && <div className="doc-tree">
          {treeDocuments.map((document) => <DocumentTreeNode key={document.id} document={document} depth={0} childrenByParent={childrenByParent} expandedFolderIds={expandedFolderIds} activeDocumentId={activeDocumentId} openingDocumentId={openingDocumentId} section={section} onToggleFolder={toggleFolder} onOpenDocument={onOpenDocument} onOpenFolder={onOpenFolder} onMove={onMove} onDuplicate={onDuplicate} onDelete={onDelete} />)}
        </div>}
      </div>
      <div className="sidebar-footer">
        <div className="user-avatar">{user.display_name.slice(0, 1)}</div><div><strong>{user.display_name}</strong><span>{user.email}</span></div><IconButton label="退出登录" onClick={onLogout}><SignOut /></IconButton>
      </div>
    </aside>
  );
}

const appearanceThemes = [
  { id: "blue", label: "雾蓝", color: "#668fd7" },
  { id: "violet", label: "藤紫", color: "#816fc8" },
  { id: "teal", label: "青绿", color: "#4f9b91" },
  { id: "rose", label: "玫瑰", color: "#c77686" },
  { id: "amber", label: "暖金", color: "#c58b45" },
];

function Topbar({ onToggleSidebar, document, saveLabel, onShare, onPublish, publishing, onDuplicate, onMove, onDelete, onHistory }) {
  const readOnly = document.access_role === "viewer";
  const savedStatus = readOnly || saveLabel.includes("已保存") || saveLabel.includes("自动保存") || saveLabel.includes("已经保存");
  const SaveStatusIcon = savedStatus ? Check : NotePencil;
  return (
    <header className="topbar">
      <div className="breadcrumbs"><IconButton label="侧栏" onClick={onToggleSidebar}><SidebarSimple /></IconButton><span className="space-code">MY SPACE</span><CaretRight /><strong>{document.title}</strong></div>
      <div className="top-actions">
        <span className="private-badge">{readOnly ? "仅阅读" : document.access_role === "editor" ? "可编辑" : "私有空间"}</span>
        {(readOnly || saveLabel) && <span className={`save-state ${saveLabel.includes("失败") || saveLabel.includes("冲突") ? "is-error" : ""}`}><SaveStatusIcon /> {readOnly ? "只读模式" : saveLabel}</span>}
        <button className="history-button" onClick={onHistory}><ClockCounterClockwise /> 编辑历史</button>
        <button className="share-button" disabled={document.access_role !== "owner"} onClick={onShare}><Users /> 分享</button>
        {document.type === "document" && document.access_role === "owner" && <button className={`publish-button ${document.published_at ? "is-published" : ""}`} disabled={publishing} onClick={onPublish}><Globe /> {publishing ? "处理中…" : document.published_at ? "已发布" : "发布"}</button>}
        {document.access_role === "owner" && <button className="move-document-button" onClick={onMove}><Folder /> 移动</button>}
        {document.access_role === "owner" && <button className="delete-document-button" onClick={onDelete}><Trash /> 删除</button>}
        <details className="top-more-menu"><summary aria-label="文档更多操作"><DotsThree /></summary><div>{document.access_role === "owner" && <button onClick={onDuplicate}><Copy />创建副本</button>}</div></details>
        <button className="agent-toggle" disabled title="知识库功能完成后接入"><Robot /> 智能体 · 稍后</button>
      </div>
    </header>
  );
}

function FormattingBar({ editor, readOnly, documentId, insertingMindMap, onInsertMindMap }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("https://");
  const [linkText, setLinkText] = useState("");
  const [blockType, setBlockType] = useState("paragraph");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadError, setUploadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState("#30343b");
  const [codeLanguage, setCodeLanguage] = useState("plaintext");
  const [selectionInView, setSelectionInView] = useState(true);
  const [lineTriggerActive, setLineTriggerActive] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const imageInputRef = useRef(null);
  const formattingBarRef = useRef(null);
  const menuPluginKey = `document-context-menu-${documentId}`;
  const codeMenuPluginKey = `document-code-language-menu-${documentId}`;
  const run = (command) => { if (!editor || readOnly) return; command(editor.chain().focus()).run(); };
  const getMenuReference = useCallback(() => {
    if (!editor || editor.isDestroyed || toolbarOpen) return undefined;
    try {
      const caret = editor.view.coordsAtPos(editor.state.selection.head);
      const editorBounds = editor.view.dom.getBoundingClientRect();
      const rect = new DOMRect(editorBounds.left, caret.top, 1, Math.max(18, caret.bottom - caret.top));
      return { getBoundingClientRect: () => rect, getClientRects: () => [rect], contextElement: editor.view.dom };
    } catch {
      return undefined;
    }
  }, [editor, toolbarOpen]);
  const getCodeMenuReference = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isActive("codeBlock")) return undefined;
    try {
      const selection = editor.state.selection.$from;
      let codeDepth = selection.depth;
      while (codeDepth > 0 && selection.node(codeDepth).type.name !== "codeBlock") codeDepth -= 1;
      if (codeDepth <= 0) return undefined;
      const codeElement = editor.view.nodeDOM(selection.before(codeDepth));
      if (!(codeElement instanceof Element)) return undefined;
      const bounds = codeElement.getBoundingClientRect();
      const rect = new DOMRect(bounds.left + 12, bounds.top + 8, 1, 1);
      return { getBoundingClientRect: () => rect, getClientRects: () => [rect], contextElement: codeElement };
    } catch {
      return undefined;
    }
  }, [editor]);
  useEffect(() => {
    const closeFormattingPopovers = (event) => {
      if (formattingBarRef.current?.contains(event.target)) return;
      setLinkOpen(false);
      setShortcutsOpen(false);
      setToolbarOpen(false);
      setLineTriggerActive(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setLinkOpen(false);
        setShortcutsOpen(false);
        setToolbarOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeFormattingPopovers);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFormattingPopovers);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined;
    const scrollArea = editor.view.dom.closest(".document-scroll");
    let pointerFrame;
    const updateLineTrigger = (event) => {
      if (toolbarOpen) return;
      if (event.target instanceof Element && event.target.closest(".document-format-trigger")) {
        setLineTriggerActive(true);
        return;
      }
      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = window.requestAnimationFrame(() => {
        try {
          const caret = editor.view.coordsAtPos(editor.state.selection.head);
          const editorBounds = editor.view.dom.getBoundingClientRect();
          const linePadding = Math.max(8, (caret.bottom - caret.top) * .45);
          const isOnCurrentLine = event.clientX >= editorBounds.left - 48 && event.clientX <= editorBounds.right && event.clientY >= caret.top - linePadding && event.clientY <= caret.bottom + linePadding;
          setLineTriggerActive(isOnCurrentLine);
        } catch {
          setLineTriggerActive(false);
        }
      });
    };
    const hideLineTrigger = () => { if (!toolbarOpen) setLineTriggerActive(false); };
    document.addEventListener("pointermove", updateLineTrigger, { passive: true });
    scrollArea?.addEventListener("scroll", hideLineTrigger, { passive: true });
    return () => {
      window.cancelAnimationFrame(pointerFrame);
      document.removeEventListener("pointermove", updateLineTrigger);
      scrollArea?.removeEventListener("scroll", hideLineTrigger);
    };
  }, [editor, toolbarOpen]);
  useEffect(() => {
    if (!editor) return undefined;
    const updateFormattingState = () => {
      setCurrentTextColor(editor.getAttributes("textStyle").color || "#30343b");
      setCodeLanguage(editor.getAttributes("codeBlock").language || "plaintext");
    };
    updateFormattingState();
    editor.on("selectionUpdate", updateFormattingState);
    editor.on("transaction", updateFormattingState);
    return () => {
      editor.off("selectionUpdate", updateFormattingState);
      editor.off("transaction", updateFormattingState);
    };
  }, [editor]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined;
    const scrollArea = editor.view.dom.closest(".document-scroll");
    let visibilityFrame;
    const measureSelectionVisibility = () => {
      window.cancelAnimationFrame(visibilityFrame);
      visibilityFrame = window.requestAnimationFrame(() => {
        if (editor.isDestroyed || !scrollArea) return;
        try {
          const position = editor.state.selection.head;
          const caret = editor.view.coordsAtPos(position);
          const viewport = scrollArea.getBoundingClientRect();
          const visible = caret.bottom >= viewport.top && caret.top <= viewport.bottom && caret.right >= viewport.left && caret.left <= viewport.right;
          setSelectionInView(visible);
        } catch {
          setSelectionInView(false);
        }
      });
    };
    measureSelectionVisibility();
    editor.on("selectionUpdate", measureSelectionVisibility);
    editor.on("transaction", measureSelectionVisibility);
    scrollArea?.addEventListener("scroll", measureSelectionVisibility, { passive: true });
    window.addEventListener("resize", measureSelectionVisibility);
    return () => {
      window.cancelAnimationFrame(visibilityFrame);
      editor.off("selectionUpdate", measureSelectionVisibility);
      editor.off("transaction", measureSelectionVisibility);
      scrollArea?.removeEventListener("scroll", measureSelectionVisibility);
      window.removeEventListener("resize", measureSelectionVisibility);
    };
  }, [editor]);
  useEffect(() => {
    if (!selectionInView || !editor || editor.isDestroyed) return undefined;
    let settleTimer;
    const updateMenuPosition = () => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta(menuPluginKey, "updatePosition"));
      if (editor.isActive("codeBlock")) editor.view.dispatch(editor.state.tr.setMeta(codeMenuPluginKey, "updatePosition"));
    };
    const frame = window.requestAnimationFrame(() => {
      updateMenuPosition();
      // Re-measure once more after icons and native controls finish laying out.
      settleTimer = window.setTimeout(updateMenuPosition, 60);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [codeMenuPluginKey, editor, lineTriggerActive, menuPluginKey, selectionInView, toolbarOpen]);
  const applyTextColor = (event, color) => {
    if (!editor || readOnly) return;
    const chain = editor.chain().focus();
    if (color) chain.setColor(color).run();
    else chain.unsetColor().removeEmptyTextStyle().run();
    event.currentTarget.closest("details")?.removeAttribute("open");
  };
  const setLink = () => {
    if (!editor || readOnly) return;
    if (editor.isActive("link")) { editor.chain().focus().unsetLink().run(); setLinkOpen(false); return; }
    setShortcutsOpen(false);
    setLinkOpen((value) => !value);
  };
  const confirmLink = (event) => {
    event.preventDefault();
    const href = linkValue.trim();
    if (!editor || !href) return;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({ type: "text", text: linkText.trim() || href, marks: [{ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkText("");
  };
  const changeBlockType = (event) => {
    const value = event.target.value;
    setBlockType(value);
    if (value === "paragraph") run((chain) => chain.setParagraph());
    else run((chain) => chain.setHeading({ level: Number(value.slice(1)) }));
  };
  const applyCodeLanguage = (language) => {
    if (!editor || readOnly || !editor.isActive("codeBlock")) return;
    setCodeLanguage(language);
    editor.chain().focus().updateAttributes("codeBlock", { language }).run();
  };
  const autoDetectCodeLanguage = () => {
    if (!editor || !editor.isActive("codeBlock")) return;
    applyCodeLanguage(detectCodeLanguage(editor.state.selection.$from.parent.textContent));
  };
  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor || readOnly || uploading) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const supportedExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);
    if (!supportedExtensions.has(extension)) {
      setUploadError(true);
      setUploadLabel(extension === "heic" || extension === "heif" ? "HEIC 暂不支持，请先转为 JPG 或 PNG" : "图片格式不支持，请选择 JPG、PNG、GIF、WebP 或 AVIF");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError(true);
      setUploadLabel("图片超过 20 MB，请压缩后重试");
      return;
    }
    setUploading(true);
    setUploadError(false);
    setUploadLabel("上传中…");
    try {
      const uploaded = await api.uploadDocumentImage(documentId, file);
      editor.chain().focus().setImage({ src: uploaded.thumbnail_url || uploaded.url, originalSrc: uploaded.url, alt: uploaded.name, title: uploaded.name }).run();
      setUploadLabel("已插入");
      window.setTimeout(() => setUploadLabel(""), 1400);
    } catch (error) {
      setUploadError(true);
      if (error instanceof ApiError && error.status === 401) setUploadLabel("登录已过期，请重新登录后上传");
      else setUploadLabel(error.message || "图片上传失败，请稍后重试");
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    const handleShortcut = (event) => {
      if (!editor || readOnly || !(event.metaKey || event.ctrlKey) || !event.target.closest?.(".document-surface") || event.target.matches?.("input, textarea, select")) return;
      const key = event.key.toLowerCase();
      if (event.altKey && ["0", "1", "2", "3", "4", "5", "6"].includes(key)) {
        event.preventDefault();
        if (key === "0") editor.chain().focus().setParagraph().run();
        else editor.chain().focus().setHeading({ level: Number(key) }).run();
        setBlockType(key === "0" ? "paragraph" : `h${key}`);
      } else if (event.shiftKey && key === "i") {
        event.preventDefault(); imageInputRef.current?.click();
      } else if (event.altKey && key === "c") {
        event.preventDefault(); editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run();
      } else if (!event.shiftKey && !event.altKey && key === "k") {
        event.preventDefault(); setLinkOpen(true);
      } else if (event.shiftKey && key === "m") {
        event.preventDefault(); onInsertMindMap(editor);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [editor, onInsertMindMap, readOnly]);
  if (!editor) return null;
  const mainTriggerVisible = selectionInView && (toolbarOpen || lineTriggerActive);
  return <><BubbleMenu editor={editor} pluginKey={menuPluginKey} updateDelay={0} resizeDelay={0} getReferencedVirtualElement={getMenuReference} shouldShow={({ editor: currentEditor }) => !readOnly && selectionInView && currentEditor.isFocused} options={{ placement: toolbarOpen ? "top-start" : "left-start", offset: 10, flip: true, shift: { padding: 10 }, inline: true }} className={`${toolbarOpen ? "document-format-menu-shell" : "document-format-trigger"} ${mainTriggerVisible ? "" : "is-out-of-view"}`}>
    {!toolbarOpen ? <button type="button" aria-label="打开当前段落工具栏" data-tooltip="打开编辑工具" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); editor.chain().focus().run(); setToolbarOpen(true); }}><Plus /></button> : <div className="formatting-bar" ref={formattingBarRef} role="toolbar" aria-label="格式工具栏">
      <label className="block-type-control" aria-label="段落样式"><select disabled={readOnly} value={blockType} onChange={changeBlockType}><option value="paragraph">正文</option>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`h${level}`}>标题 {level}</option>)}</select><CaretDown /></label><span className="divider" />
      <IconButton disabled={readOnly} label="加粗（⌘B）" active={editor?.isActive("bold")} onClick={() => run((chain) => chain.toggleBold())}><TextB weight="bold" /></IconButton>
      <IconButton disabled={readOnly} label="斜体（⌘I）" active={editor?.isActive("italic")} onClick={() => run((chain) => chain.toggleItalic())}><TextItalic /></IconButton>
      <IconButton disabled={readOnly} label="下划线（⌘U）" active={editor?.isActive("underline")} onClick={() => run((chain) => chain.toggleUnderline())}><TextUnderline /></IconButton>
      <IconButton disabled={readOnly} label="删除线" active={editor?.isActive("strike")} onClick={() => run((chain) => chain.toggleStrike())}><TextStrikethrough /></IconButton><span className="divider" />
      <IconButton disabled={readOnly} label="列表" active={editor?.isActive("bulletList")} onClick={() => run((chain) => chain.toggleBulletList())}><ListBullets /></IconButton>
      <IconButton disabled={readOnly} label="待办" active={editor?.isActive("taskList")} onClick={() => run((chain) => chain.toggleTaskList())}><CheckSquare /></IconButton>
      <details className="text-color-menu">
        <summary data-tooltip="字体颜色" aria-label="字体颜色"><Palette /><i style={{ background: currentTextColor }} /></summary>
        <div><div className="document-color-picker-heading"><strong>字体颜色</strong><label><Palette /><span>自定义取色</span><input disabled={readOnly} type="color" value={currentTextColor} onChange={(event) => applyTextColor(event, event.target.value)} /></label></div><span>{textColors.map((color) => <button type="button" key={color.label} disabled={readOnly} className={currentTextColor.toLowerCase() === (color.value || color.swatch).toLowerCase() ? "active" : ""} aria-label={color.label} title={color.label} onClick={(event) => applyTextColor(event, color.value)}><i style={{ background: color.value || color.swatch }} />{color.label === "默认" && <em>×</em>}</button>)}</span></div>
      </details>
      <details className="insert-content-menu">
        <summary data-tooltip="插入内容"><Plus /> 插入 <CaretDown /></summary>
        <div>
          <button disabled={readOnly} onClick={(event) => { run((chain) => chain.toggleCodeBlock({ language: "plaintext" })); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Code /><span><strong>代码块</strong><small>⌘⌥C</small></span></button>
          <button disabled={readOnly || uploading} onClick={(event) => { imageInputRef.current?.click(); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Image /><span><strong>{uploading ? "上传中…" : "图片"}</strong><small>⌘⇧I</small></span></button>
          <button disabled={readOnly || insertingMindMap} onClick={(event) => { onInsertMindMap(editor); event.currentTarget.closest("details")?.removeAttribute("open"); }}><MapTrifold /><span><strong>{insertingMindMap ? "插入中…" : "思维导图"}</strong><small>⌘⇧M</small></span></button>
          <button disabled={readOnly} onClick={(event) => { setLink(); event.currentTarget.closest("details")?.removeAttribute("open"); }}><ArrowBendDownRight /><span><strong>{editor?.isActive("link") ? "移除链接" : "外链"}</strong><small>⌘K</small></span></button>
          <p>表格等内容类型会继续加入这里</p>
        </div>
      </details>
      <input ref={imageInputRef} className="visually-hidden" type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.avif,image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={uploadImage} />
      <span className="divider" />
      <IconButton disabled={readOnly} label="撤销（⌘Z）" onClick={() => run((chain) => chain.undo())}><ArrowCounterClockwise /></IconButton><IconButton disabled={readOnly} label="重做（⌘⇧Z）" onClick={() => run((chain) => chain.redo())}><ArrowClockwise /></IconButton>
      <IconButton label="查看快捷键" active={shortcutsOpen} onClick={() => { setLinkOpen(false); setShortcutsOpen((value) => !value); }}><Keyboard /></IconButton>
      {uploadLabel && <span className={`upload-status ${uploadError ? "is-error" : ""}`}>{uploadLabel}</span>}
      {shortcutsOpen && <div className="shortcut-popover"><strong>编辑快捷键</strong><span><kbd>⌘ B</kbd> 加粗</span><span><kbd>⌘ I</kbd> 斜体</span><span><kbd>⌘⌥ 1–6</kbd> 标题层级</span><span><kbd>⌘⌥ 0</kbd> 正文</span><span><kbd>⌘ K</kbd> 插入外链</span><span><kbd>⌘⇧ I</kbd> 上传图片</span><span><kbd>⌘⌥ C</kbd> 代码块</span><span><kbd>⌘⇧ M</kbd> 思维导图</span></div>}
      {linkOpen && <form className="formatting-link-popover" onSubmit={confirmLink}><label>显示文字<input value={linkText} onChange={(event) => setLinkText(event.target.value)} placeholder="可选，默认显示网址" /></label><label>链接地址<input autoFocus value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder="https://example.com" /></label><div><button type="button" onClick={() => setLinkOpen(false)}>取消</button><button>插入链接</button></div></form>}
    </div>}
  </BubbleMenu>
  <BubbleMenu editor={editor} pluginKey={codeMenuPluginKey} updateDelay={0} resizeDelay={0} getReferencedVirtualElement={getCodeMenuReference} shouldShow={({ editor: currentEditor }) => !readOnly && selectionInView && currentEditor.isFocused && currentEditor.isActive("codeBlock")} options={{ placement: "bottom-start", offset: 0, flip: false, shift: { padding: 12 }, inline: false }} className={`code-language-bubble ${selectionInView ? "" : "is-out-of-view"}`}>
    <div className="code-language-control" role="toolbar" aria-label="代码块语言" onPointerDown={(event) => event.stopPropagation()}>
      <Code /><label><span>代码语言</span><select value={codeLanguage} onChange={(event) => applyCodeLanguage(event.target.value)}>{codeLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select></label>
      <button type="button" onClick={autoDetectCodeLanguage}><MagnifyingGlass /> 自动识别</button>
    </div>
  </BubbleMenu></>;
}

function extractHeadings(content) {
  return (content?.content || []).filter((node) => node.type === "heading").map((node, index) => ({
    id: `heading-${index}`,
    level: node.attrs?.level || 2,
    text: (node.content || []).map((child) => child.text || "").join("") || "无标题段落",
    index,
  }));
}

function OutlineRail({ title, content, scrollRef }) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState("document-title");

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    const updateActiveHeading = () => {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const headingElements = [...scroller.querySelectorAll(".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6")];
      let nextActiveId = "document-title";
      headingElements.forEach((element, index) => {
        if (element.getBoundingClientRect().top - scrollerTop <= 150) nextActiveId = headings[index]?.id || nextActiveId;
      });
      setActiveId((current) => current === nextActiveId ? current : nextActiveId);
    };
    updateActiveHeading();
    scroller.addEventListener("scroll", updateActiveHeading, { passive: true });
    return () => scroller.removeEventListener("scroll", updateActiveHeading);
  }, [headings, scrollRef]);

  const scrollToHeading = (index) => {
    const element = scrollRef.current?.querySelectorAll(".tiptap-editor h1, .tiptap-editor h2, .tiptap-editor h3, .tiptap-editor h4, .tiptap-editor h5, .tiptap-editor h6")?.[index];
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const scrollToTitle = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  return (
    <aside className={`outline-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="文档大纲">
      <button className="outline-header" aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><span className="outline-label">大纲</span>{collapsed ? <CaretRight /> : <CaretDown />}</button>
      {!collapsed && <div className="outline-items">
        <button className={`outline-title ${activeId === "document-title" ? "active" : ""}`} style={{ "--outline-level": 0 }} onClick={scrollToTitle} title={title || "无标题文档"}><i className="outline-anchor-dot" /><span>{title || "无标题文档"}</span></button>
        {headings.map((heading) => <button className={activeId === heading.id ? "active" : ""} key={heading.id} style={{ "--outline-level": Math.max(0, heading.level - 1) }} onClick={() => scrollToHeading(heading.index)} title={heading.text}><i className="outline-anchor-dot" /><span>{heading.text}</span></button>)}
        {headings.length === 0 && <small>使用“标题 1–6”后，会在这里自动生成章节导航。</small>}
      </div>}
    </aside>
  );
}

function DocumentEditor({ document, user, insertingMindMap, onInsertMindMap, mindMapActions, onTitleChange, onContentChange }) {
  const [editor, setEditor] = useState(null);
  const scrollRef = useRef(null);
  const readOnly = document.access_role === "viewer";
  return (
    <div className="document-surface">
      <OutlineRail title={document.title} content={document.content} scrollRef={scrollRef} />
      <div className="document-scroll" ref={scrollRef}><article className="document-page">
        <div className="document-title-row"><div className="doc-icon"><Article weight="fill" /></div><div className="doc-meta"><span className="document-code">DOC / {document.id.slice(0, 4).toUpperCase()}</span><span>{document.owner_name || user.display_name}</span><i>·</i><span>版本 {document.version}</span></div></div>
        <label className="document-title-field">
          <input className="document-title-input" disabled={readOnly} value={document.title} onChange={(event) => onTitleChange(event.target.value)} placeholder="输入文档标题" aria-label="文档标题" />
          {!readOnly && <small>点击即可修改，内容会自动保存</small>}
        </label>
        <TiptapDocument documentId={document.id} content={document.content} onChange={onContentChange} onEditorReady={setEditor} mindMapActions={mindMapActions} editable={!readOnly} />
        <div className="document-bottom-space" />
      </article></div>
      <FormattingBar editor={editor} readOnly={readOnly} documentId={document.id} insertingMindMap={insertingMindMap} onInsertMindMap={onInsertMindMap} />
    </div>
  );
}

function MindMap({ title, nodes, edges, layoutStyle, onNodesChange, onEdgesChange, onConnect, onAddChild, onAddSibling, onRename, onDelete, onPriority, onMarker, onTextStyle, onNodeResize, onTheme, onLayout, onLayoutStyle, onExport, onTitleChange, onBack, backLabel, readOnly }) {
  const [selected, setSelected] = useState("root");
  const [themeOpen, setThemeOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [markerOpen, setMarkerOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [formatBrush, setFormatBrush] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingSelection, setEditingSelection] = useState({ start: 0, end: 0 });
  const themeControlRef = useRef(null);
  const structureControlRef = useRef(null);
  const markerControlRef = useRef(null);
  const textControlRef = useRef(null);
  const editingSelectionRef = useRef({ start: 0, end: 0 });
  const lastEditingNodeRef = useRef(null);
  const flowInstanceRef = useRef(null);
  const initialFitDoneRef = useRef(false);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selected) || nodes[0], [nodes, selected]);
  const selectedCharacters = expandMapTextRuns(selectedNode?.data?.label || "", selectedNode?.data?.textRuns, selectedNode?.data?.textStyle || {});
  const selectedTextStyle = editingNodeId === selected
    ? (selectedCharacters[editingSelection.start]?.style || selectedNode?.data?.textStyle || {})
    : (selectedNode?.data?.textRuns?.[0]?.style || selectedNode?.data?.textStyle || {});
  const beginNodeEdit = (nodeId, fallback = "新主题") => {
    if (readOnly) return;
    const node = nodes.find((item) => item.id === nodeId);
    setSelected(nodeId);
    lastEditingNodeRef.current = nodeId;
    setEditingValue(node?.data?.label || fallback);
    editingSelectionRef.current = { start: 0, end: (node?.data?.label || fallback).length };
    setEditingSelection(editingSelectionRef.current);
    setEditingNodeId(nodeId);
  };
  const commitNodeEdit = () => {
    if (!editingNodeId) return;
    lastEditingNodeRef.current = editingNodeId;
    onRename(editingNodeId, editingValue.trim() ? editingValue : "新主题");
    setEditingNodeId(null);
  };
  const fitAfterLayout = () => window.setTimeout(() => flowInstanceRef.current?.fitView({ padding: 0.22, duration: 260, maxZoom: 1.08 }), 80);
  const fitInitialViewport = useCallback((instance = flowInstanceRef.current) => {
    if (!instance || initialFitDoneRef.current || nodes.length === 0) return;
    initialFitDoneRef.current = true;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => instance.fitView({ padding: 0.28, duration: 0, minZoom: 0.15, maxZoom: 1 })));
    window.setTimeout(() => instance.fitView({ padding: 0.28, duration: 220, minZoom: 0.15, maxZoom: 1 }), 180);
  }, [nodes.length]);
  const initializeMapViewport = (instance) => {
    flowInstanceRef.current = instance;
    fitInitialViewport(instance);
  };
  useEffect(() => { fitInitialViewport(); }, [fitInitialViewport]);
  const applySelectedTextStyle = (patch) => {
    const isEditingSelected = editingNodeId === selected;
    const hasRecentSelection = isEditingSelected || lastEditingNodeRef.current === selected;
    if (isEditingSelected) onRename(selected, editingValue);
    const selection = hasRecentSelection && editingSelectionRef.current.end > editingSelectionRef.current.start
      ? { ...editingSelectionRef.current }
      : null;
    onTextStyle(selected, patch, selection);
    lastEditingNodeRef.current = null;
    if (isEditingSelected) setEditingNodeId(null);
  };
  const activateFormatBrush = () => {
    if (!selectedNode) return;
    const rangeStart = editingNodeId === selected ? editingSelectionRef.current.start : 0;
    const characters = expandMapTextRuns(selectedNode.data?.label || "", selectedNode.data?.textRuns, selectedNode.data?.textStyle || {});
    const copiedStyle = characters[rangeStart]?.style || selectedNode.data?.textStyle || {};
    setFormatBrush({ ...copiedStyle });
    setTextOpen(false);
  };
  const selectMapNode = (node) => {
    if (formatBrush && !readOnly) {
      onTextStyle(node.id, formatBrush, null);
      setFormatBrush(null);
    }
    lastEditingNodeRef.current = null;
    setSelected(node.id);
  };
  const renderedNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    type: "mindMap",
    data: {
      ...node.data,
      isRoot: node.id === "root",
      layoutStyle,
      editing: node.id === editingNodeId,
      editingValue: node.id === editingNodeId ? editingValue : node.data?.label,
      onEditingChange: setEditingValue,
      onEditingSelect: (start, end) => { editingSelectionRef.current = { start, end }; setEditingSelection({ start, end }); },
      onStartEditing: () => beginNodeEdit(node.id),
      onCommit: commitNodeEdit,
      onCancel: () => setEditingNodeId(null),
      onResize: (width, height) => onNodeResize(node.id, width, height, false),
      onResizeEnd: (width, height) => onNodeResize(node.id, width, height, true),
      readOnly,
    },
  })), [editingNodeId, editingValue, layoutStyle, nodes, onNodeResize, readOnly]);
  useEffect(() => {
    const closeMapPopovers = (event) => {
      if (!themeControlRef.current?.contains(event.target)) setThemeOpen(false);
      if (!structureControlRef.current?.contains(event.target)) setStructureOpen(false);
      if (!markerControlRef.current?.contains(event.target)) setMarkerOpen(false);
      if (!textControlRef.current?.contains(event.target)) setTextOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") { setThemeOpen(false); setStructureOpen(false); setMarkerOpen(false); setTextOpen(false); }
    };
    document.addEventListener("pointerdown", closeMapPopovers);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMapPopovers);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <div className="mindmap-surface"><div className="map-header"><div><MapTrifold weight="fill" /><input aria-label="思维导图标题" disabled={readOnly} value={title} onChange={(event) => onTitleChange(event.target.value)} /><span>{nodes.length} 个节点</span></div><div className="map-toolbar">
      <button disabled={readOnly} onClick={() => { const id = onAddChild(selected); if (id) beginNodeEdit(id); }}><Plus /> 子主题</button>
      <div className="map-theme-control" ref={themeControlRef}><button disabled={readOnly} className={themeOpen ? "active" : ""} onClick={() => { setStructureOpen(false); setMarkerOpen(false); setTextOpen(false); setThemeOpen((value) => !value); }}><CirclesFour /> 主题样式 <CaretDown /></button>{themeOpen && <div className="map-theme-popover"><strong>整图主题</strong>{mindMapThemes.map((theme) => <button key={theme.id} onClick={() => { onTheme(theme.id); setThemeOpen(false); }}><span className="theme-swatches">{theme.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><span>{theme.label}</span></button>)}</div>}</div>
      <div className="map-theme-control map-structure-control" ref={structureControlRef}><button disabled={readOnly} className={structureOpen ? "active" : ""} onClick={() => { setThemeOpen(false); setMarkerOpen(false); setTextOpen(false); setStructureOpen((value) => !value); }}><TreeStructure /> 结构布局 <CaretDown /></button>{structureOpen && <div className="map-theme-popover map-structure-popover"><strong>思维导图结构</strong><div className="structure-option-grid">
        <button className={normalizeMapLayout(layoutStyle) === "logic-right" ? "selected" : ""} onClick={() => { onLayoutStyle("logic-right"); setStructureOpen(false); fitAfterLayout(); }}><ArrowRight className="structure-option-svg" /><span><b>向右</b><small>逻辑梳理</small></span></button>
        <button className={normalizeMapLayout(layoutStyle) === "logic-left" ? "selected" : ""} onClick={() => { onLayoutStyle("logic-left"); setStructureOpen(false); fitAfterLayout(); }}><ArrowLeft className="structure-option-svg" /><span><b>向左</b><small>反向展开</small></span></button>
        <button className={normalizeMapLayout(layoutStyle) === "logic-down" ? "selected" : ""} onClick={() => { onLayoutStyle("logic-down"); setStructureOpen(false); fitAfterLayout(); }}><ArrowDown className="structure-option-svg" /><span><b>向下</b><small>层级结构</small></span></button>
        <button className={normalizeMapLayout(layoutStyle) === "balanced" ? "selected" : ""} onClick={() => { onLayoutStyle("balanced"); setStructureOpen(false); fitAfterLayout(); }}><ArrowsLeftRight className="structure-option-svg" /><span><b>左右均衡</b><small>发散思考</small></span></button>
        <button className={layoutStyle === "cards" ? "selected" : ""} onClick={() => { onLayoutStyle("cards"); setStructureOpen(false); fitAfterLayout(); }}><CirclesFour className="structure-option-svg" /><span><b>自由卡片</b><small>自由拖放</small></span></button>
      </div></div>}</div>
      <div className="map-theme-control map-text-control" ref={textControlRef} onPointerDown={(event) => { if (editingNodeId && event.target.closest("button")) event.preventDefault(); }}>
        <button disabled={readOnly} className={textOpen ? "active" : ""} onClick={() => { setThemeOpen(false); setStructureOpen(false); setMarkerOpen(false); setTextOpen((value) => !value); }}><TextB /> 文字 <CaretDown /></button>
        {textOpen && <div className="map-theme-popover map-text-popover">
          <strong>{editingNodeId === selected && editingSelection.end > editingSelection.start ? `已选 ${editingSelection.end - editingSelection.start} 个字` : "节点文字"}</strong>
          <div className="map-text-fields">
            <label>字体<select value={selectedTextStyle.fontFamily || "inherit"} onChange={(event) => applySelectedTextStyle({ fontFamily: event.target.value })}><option value="inherit">默认</option><option value='"Noto Sans SC", sans-serif'>无衬线</option><option value='"Noto Serif SC", serif'>宋体</option><option value='"SFMono-Regular", Consolas, monospace'>等宽</option></select></label>
            <label>字号<select value={selectedTextStyle.fontSize || 14} onChange={(event) => applySelectedTextStyle({ fontSize: Number(event.target.value) })}>{[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          </div>
          <div className="map-text-buttons"><button className={selectedTextStyle.bold ? "active" : ""} onClick={() => applySelectedTextStyle({ bold: !selectedTextStyle.bold })} title="加粗"><TextB /></button><button className={selectedTextStyle.italic ? "active" : ""} onClick={() => applySelectedTextStyle({ italic: !selectedTextStyle.italic })} title="斜体"><TextItalic /></button><button className={selectedTextStyle.underline ? "active" : ""} onClick={() => applySelectedTextStyle({ underline: !selectedTextStyle.underline })} title="下划线"><TextUnderline /></button><button className={selectedTextStyle.strike ? "active" : ""} onClick={() => applySelectedTextStyle({ strike: !selectedTextStyle.strike })} title="删除线"><TextStrikethrough /></button></div>
          <div className="map-color-heading"><strong>字体颜色</strong><label className="map-custom-color"><Palette /><span>自定义取色</span><input type="color" value={selectedTextStyle.color || "#24344a"} onChange={(event) => applySelectedTextStyle({ color: event.target.value })} /></label></div>
          <div className="map-text-color-grid">{textColors.filter((item, index, list) => item.value && list.findIndex((candidate) => candidate.value === item.value) === index).map((color) => <button key={color.label} className={color.value === selectedTextStyle.color ? "selected" : ""} style={{ "--text-swatch": color.value }} aria-label={color.label} title={color.label} onClick={() => applySelectedTextStyle({ color: color.value })} />)}</div>
          <div className="map-text-footer"><button onClick={() => applySelectedTextStyle({ fontFamily: "inherit", fontSize: null, bold: false, italic: false, underline: false, strike: false, color: null })}>恢复默认</button><button className="map-format-brush-action" onClick={activateFormatBrush}><PaintBrush /> 格式刷</button></div>
        </div>}
      </div>
      <div className="map-theme-control map-marker-control" ref={markerControlRef}><button disabled={readOnly} className={markerOpen ? "active" : ""} onClick={() => { setThemeOpen(false); setStructureOpen(false); setTextOpen(false); setMarkerOpen((value) => !value); }}><Flag /> 标记 <CaretDown /></button>{markerOpen && <div className="map-theme-popover map-marker-popover"><strong>优先级</strong><div className="marker-priority-grid">{[1, 2, 3, 4, 5, 6, 7].map((priority) => <button key={priority} aria-label={`优先级 ${priority}`} className={`priority-${priority}`} onClick={() => onPriority(selected, priority)}>{priority}</button>)}</div><strong>语义标签</strong><div className="semantic-marker-grid">{mindMapMarkers.map(({ id, label, Icon, tone }) => <button key={id} className={`semantic-marker marker-${tone}`} onClick={() => onMarker(selected, id)}><Icon weight="fill" /><span>{label}</span></button>)}</div><div className="marker-clear-row"><button onClick={() => onPriority(selected, null)}>清除优先级</button><button onClick={() => onMarker(selected, null)}>清除标签</button></div></div>}</div>
      <button disabled={readOnly} onClick={() => { onLayout(); fitAfterLayout(); }}><Command /> 自动布局</button><button onClick={onExport}><Export /> 导出 JSON</button><button disabled={readOnly || selected === "root"} onClick={() => onDelete(selected)}><Trash /> 删除</button>
    </div></div>
      <div className={`map-canvas ${formatBrush ? "is-format-brushing" : ""}`} tabIndex={0} onKeyDown={(event) => { if (readOnly || event.target.matches("input, textarea")) return; if (event.key === "Escape" && formatBrush) { setFormatBrush(null); } else if (event.altKey && /^[1-7]$/.test(event.key)) { event.preventDefault(); onPriority(selected, Number(event.key)); } else if (event.key === "Tab") { event.preventDefault(); const id = onAddChild(selected); if (id) beginNodeEdit(id); } else if (event.key === "Enter" && event.shiftKey) { event.preventDefault(); beginNodeEdit(selected); } else if (event.key === "Enter") { event.preventDefault(); const id = onAddSibling(selected); if (id) beginNodeEdit(id); } else if (event.key === " " || event.key === "F2") { event.preventDefault(); beginNodeEdit(selected); } else if (["Delete", "Backspace"].includes(event.key) && selected !== "root") { event.preventDefault(); onDelete(selected); setSelected("root"); } }}><ReactFlow onInit={initializeMapViewport} nodeTypes={mindMapNodeTypes} edgeTypes={mindMapEdgeTypes} nodes={renderedNodes} edges={edges} onNodesChange={readOnly ? undefined : onNodesChange} onEdgesChange={readOnly ? undefined : onEdgesChange} onConnect={readOnly ? undefined : onConnect} onNodeClick={(_, node) => selectMapNode(node)} onNodeDoubleClick={(_, node) => { if (!formatBrush) beginNodeEdit(node.id); }} nodesDraggable={!readOnly && !editingNodeId && !formatBrush} nodesConnectable={!readOnly && !editingNodeId && !formatBrush} elementsSelectable minZoom={0.15} maxZoom={1.8} proOptions={{ hideAttribution: true }}>
        <Background color="#e1e6ec" gap={24} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(node) => node.id === "root" ? "#4052b5" : (node.style?.["--branch-color"] || "#d8dde4")} />
      </ReactFlow><div className="map-tip">{formatBrush ? <><PaintBrush /> 格式刷已开启·点击目标节点应用·Esc 取消</> : <><Command /> {readOnly ? "只读导图" : "Tab 子主题 · Enter 同级主题 · Shift+Enter 编辑 · Alt+1–7 优先级"}</>}</div><button className="back-doc" onClick={onBack}>{backLabel === "返回文档" ? <Article /> : <Folder />} {backLabel}</button></div>
    </div>
  );
}

export function App() {
  const [sessionState, setSessionState] = useState("loading");
  const [bootError, setBootError] = useState("");
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [sharedDocuments, setSharedDocuments] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [trashedDocuments, setTrashedDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [section, setSection] = useState("home");
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [mode, setMode] = useState("document");
  const [activeMindMapTitle, setActiveMindMapTitle] = useState("未命名思维导图");
  const [mapLayoutStyle, setMapLayoutStyle] = useState("cards");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [dialog, setDialog] = useState(null);
  const [shares, setShares] = useState([]);
  const [versions, setVersions] = useState([]);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState(() => new Set());
  const [openingDocumentId, setOpeningDocumentId] = useState(null);
  const [appearanceTheme, setAppearanceTheme] = useState(() => window.localStorage.getItem("zhiliu-appearance-theme") || "blue");
  const [glassEnabled, setGlassEnabled] = useState(() => window.localStorage.getItem("zhiliu-glass-enabled") === "true");
  const [nodes, setNodes, applyNodesChange] = useNodesState(cloneGraph(starterNodes));
  const [edges, setEdges, applyEdgesChange] = useEdgesState(cloneGraph(starterEdges));

  const bootStartedRef = useRef(false);
  const activeDocumentRef = useRef(null);
  const documentSaveTimerRef = useRef(null);
  const documentSaveSerialRef = useRef(0);
  const documentDirtyRef = useRef(false);
  const mapSaveTimerRef = useRef(null);
  const mapVersionRef = useRef(null);
  const mapDirtyRef = useRef(false);
  const mapSaveSerialRef = useRef(0);
  const mapSaveInFlightRef = useRef(false);
  const lastMapAutoSaveAtRef = useRef(0);
  const activeMindMapIdRef = useRef(null);
  const activeMindMapTitleRef = useRef("未命名思维导图");
  const mapLayoutStyleRef = useRef("cards");
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const actionLocksRef = useRef(new Set());
  useEffect(() => {
    const handleAuthExpired = () => {
      window.clearTimeout(documentSaveTimerRef.current);
      window.clearTimeout(mapSaveTimerRef.current);
      documentDirtyRef.current = false;
      mapDirtyRef.current = false;
      actionLocksRef.current.clear();
      setPendingActions(new Set());
      setDialog(null);
      setOpeningDocumentId(null);
      setSaveLabel("");
      setUser(null);
      setWorkspace(null);
      setDocuments([]);
      setSharedDocuments([]);
      setRecentDocuments([]);
      setTrashedDocuments([]);
      activeDocumentRef.current = null;
      setActiveDocument(null);
      setSessionState("anonymous");
    };
    window.addEventListener("zhiliu:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("zhiliu:auth-expired", handleAuthExpired);
  }, []);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => {
    const closeOutsideMenus = (event) => {
      document.querySelectorAll("details[open]").forEach((details) => {
        if (!details.contains(event.target)) details.removeAttribute("open");
      });
      if (!event.target.closest?.("[data-tooltip]")) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.matches("[data-tooltip]")) active.blur();
      }
    };
    const closeMenusOnEscape = (event) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll("details[open]").forEach((details) => details.removeAttribute("open"));
    };
    const keepSingleMenuOpen = (event) => {
      if (!(event.target instanceof HTMLDetailsElement) || !event.target.open) return;
      document.querySelectorAll("details[open]").forEach((details) => {
        if (details !== event.target) details.removeAttribute("open");
      });
    };
    document.addEventListener("pointerdown", closeOutsideMenus);
    document.addEventListener("keydown", closeMenusOnEscape);
    document.addEventListener("toggle", keepSingleMenuOpen, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutsideMenus);
      document.removeEventListener("keydown", closeMenusOnEscape);
      document.removeEventListener("toggle", keepSingleMenuOpen, true);
    };
  }, []);

  const replaceActiveDocument = useCallback((document) => { activeDocumentRef.current = document; setActiveDocument(document); }, []);
  const runOnce = useCallback(async (key, operation) => {
    if (actionLocksRef.current.has(key)) return null;
    actionLocksRef.current.add(key);
    setPendingActions((current) => new Set(current).add(key));
    try { return await operation(); }
    finally {
      actionLocksRef.current.delete(key);
      setPendingActions((current) => { const next = new Set(current); next.delete(key); return next; });
    }
  }, []);

  const refreshCollections = useCallback(async (workspaceId) => {
    const [owned, shared, recent, trashed] = await Promise.all([api.listDocuments(workspaceId), api.listSharedDocuments(), api.listRecentDocuments(), api.listTrashedDocuments()]);
    setDocuments(owned); setSharedDocuments(shared); setRecentDocuments(recent); setTrashedDocuments(trashed);
    return owned;
  }, []);

  const hydrateWorkspace = useCallback(async (currentUser) => {
    setSessionState("loading");
    const spaces = await api.listWorkspaces();
    if (spaces.length === 0) throw new Error("账户还没有可用工作空间");
    const currentWorkspace = spaces[0];
    let currentDocuments = await refreshCollections(currentWorkspace.id);
    if (currentDocuments.length === 0) {
      const welcome = await api.createDocument({ workspace_id: currentWorkspace.id, title: "AI 产品规划", content: cloneDocumentContent(defaultDocumentContent) });
      currentDocuments = [welcome]; setDocuments(currentDocuments);
    }
    setUser(currentUser); setWorkspace(currentWorkspace); replaceActiveDocument(currentDocuments.find((item) => item.type === "document") || currentDocuments[0] || null); setSection("home"); setSessionState("ready");
  }, [refreshCollections, replaceActiveDocument]);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    api.me().then(hydrateWorkspace).catch((error) => { if (error instanceof ApiError && error.status === 401) setSessionState("anonymous"); else { setBootError(error.message || "无法连接 Knowledge Workspace 服务"); setSessionState("error"); } });
  }, [hydrateWorkspace]);

  useEffect(() => {
    window.clearTimeout(mapSaveTimerRef.current);
    if (!activeDocument || activeDocument.type !== "mindmap") {
      activeMindMapIdRef.current = null;
      mapVersionRef.current = null;
      mapDirtyRef.current = false;
      mapSaveSerialRef.current = 0;
      lastMapAutoSaveAtRef.current = 0;
      return undefined;
    }
    let cancelled = false;
    api.listMindMaps(activeDocument.id).then(async (mindMaps) => {
      if (cancelled) return;
      let mindMap = mindMaps[0];
      if (!mindMap && activeDocument.access_role !== "viewer") {
        mindMap = await api.createMindMap(activeDocument.id, { title: activeDocument.title, graph: createStarterGraph(activeDocument.title) });
      }
      if (cancelled || !mindMap) return;
      const layoutStyle = normalizeMapLayout(mindMap.graph.layout_style || "cards");
      activeMindMapIdRef.current = mindMap.id; setActiveMindMapTitle(mindMap.title); activeMindMapTitleRef.current = mindMap.title; setMapLayoutStyle(layoutStyle); mapLayoutStyleRef.current = layoutStyle; mapVersionRef.current = mindMap.version; mapDirtyRef.current = false; mapSaveSerialRef.current = 0; lastMapAutoSaveAtRef.current = 0; setNodes(decorateMapNodes(mindMap.graph.nodes || [], layoutStyle)); setEdges(decorateMapEdges(mindMap.graph.edges || [], layoutStyle));
      if (isStructuredMapLayout(layoutStyle)) window.setTimeout(() => layoutMap(layoutStyle), 80);
    }).catch(() => { if (!cancelled) setSaveLabel("导图加载失败"); });
    return () => { cancelled = true; };
  }, [activeDocument?.id, setEdges, setNodes]);

  const persistDocument = useCallback(async (serial) => {
    const snapshot = activeDocumentRef.current;
    if (!snapshot || snapshot.access_role === "viewer") return true;
    setSaveLabel("保存中…");
    try {
      const saved = await api.updateDocument(snapshot.id, { base_version: snapshot.version, title: snapshot.title.trim() || "无标题文档", content: snapshot.content, reason: "interval" });
      if (activeDocumentRef.current?.id !== saved.id) return true;
      const merged = { ...snapshot, ...saved, access_role: snapshot.access_role, owner_name: snapshot.owner_name };
      if (documentSaveSerialRef.current === serial) { documentDirtyRef.current = false; replaceActiveDocument(merged); }
      else { replaceActiveDocument({ ...activeDocumentRef.current, version: saved.version }); window.clearTimeout(documentSaveTimerRef.current); documentSaveTimerRef.current = window.setTimeout(() => persistDocument(documentSaveSerialRef.current), 250); }
      setDocuments((items) => items.map((item) => item.id === saved.id ? { ...item, ...saved } : item)); setSaveLabel("已自动保存"); return true;
    } catch (error) { setSaveLabel(error instanceof ApiError && error.status === 409 ? "保存冲突" : "保存失败"); return false; }
  }, [replaceActiveDocument]);

  const updateActiveDocument = useCallback((patch) => {
    const current = activeDocumentRef.current; if (!current || current.access_role === "viewer") return;
    const next = { ...current, ...patch }; replaceActiveDocument(next);
    if (patch.title !== undefined) setDocuments((items) => items.map((item) => item.id === next.id ? { ...item, title: patch.title || "无标题文档" } : item));
    documentSaveSerialRef.current += 1; documentDirtyRef.current = true; const serial = documentSaveSerialRef.current; setSaveLabel("等待保存…"); window.clearTimeout(documentSaveTimerRef.current); documentSaveTimerRef.current = window.setTimeout(() => persistDocument(serial), 800);
  }, [persistDocument, replaceActiveDocument]);

  const updateEmbeddedMapBlock = useCallback((mapId, attrs) => {
    const document = activeDocumentRef.current;
    if (!document || document.type !== "document") return;
    const content = cloneDocumentContent(document.content || blankDocumentContent);
    let changed = false;
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.type === "mindMapBlock" && String(value.attrs?.mapId) === String(mapId)) {
        value.attrs = { ...value.attrs, ...attrs };
        changed = true;
      }
      (value.content || []).forEach(visit);
    };
    visit(content);
    if (changed) updateActiveDocument({ content });
  }, [updateActiveDocument]);

  const persistMindMap = useCallback(async (origin = "auto") => {
    const document = activeDocumentRef.current; if (!document || document.access_role === "viewer") return true;
    if (!activeMindMapIdRef.current) return true;
    if (mapSaveInFlightRef.current) {
      window.clearTimeout(mapSaveTimerRef.current);
      mapSaveTimerRef.current = window.setTimeout(() => persistMindMap("auto"), 450);
      return true;
    }
    const savingSerial = mapSaveSerialRef.current;
    mapSaveInFlightRef.current = true;
    setSaveLabel(origin === "auto" ? "正在自动保存…" : "导图保存中…");
    const graph = { layout_style: mapLayoutStyleRef.current, nodes: nodesRef.current.map(({ id, type, position, data, className, style, sourcePosition, targetPosition }) => ({ id, type, position, data, className, style, sourcePosition, targetPosition })), edges: edgesRef.current.map(({ id, source, target, sourceHandle, targetHandle, type, style, pathOptions }) => ({ id, source, target, sourceHandle, targetHandle, type, style, pathOptions })) };
    try {
      const saved = await api.updateMindMap(document.id, activeMindMapIdRef.current, { base_version: mapVersionRef.current, title: activeMindMapTitleRef.current, graph, reason: origin === "auto" ? "interval" : "manual" });
      mapVersionRef.current = saved.version;
      if (mapSaveSerialRef.current === savingSerial) mapDirtyRef.current = false;
      if (origin === "auto") lastMapAutoSaveAtRef.current = Date.now();
      updateEmbeddedMapBlock(saved.id, { title: saved.title, nodeCount: graph.nodes.length, previewLabels: graph.nodes.slice(0, 5).map((item) => item.data?.label || "新主题") });
      const successLabel = origin === "auto" ? "已自动保存" : "导图已保存";
      setSaveLabel(successLabel);
      window.setTimeout(() => setSaveLabel((current) => current === successLabel ? "" : current), 1400);
      return true;
    } catch (error) {
      setSaveLabel(error instanceof ApiError && error.status === 409 ? "导图保存冲突" : "导图保存失败");
      return false;
    } finally {
      mapSaveInFlightRef.current = false;
    }
  }, [updateEmbeddedMapBlock]);

  const scheduleMindMapSave = useCallback(() => { if (activeDocumentRef.current?.access_role === "viewer") return; mapSaveSerialRef.current += 1; mapDirtyRef.current = true; window.clearTimeout(mapSaveTimerRef.current); setSaveLabel("等待自动保存…"); mapSaveTimerRef.current = window.setTimeout(() => persistMindMap("auto"), 1000); }, [persistMindMap]);
  const onNodesChange = useCallback((changes) => { applyNodesChange(changes); if (changes.some(({ type }) => ["position", "add", "remove", "replace"].includes(type))) scheduleMindMapSave(); }, [applyNodesChange, scheduleMindMapSave]);
  const onEdgesChange = useCallback((changes) => { applyEdgesChange(changes); if (changes.some(({ type }) => ["add", "remove", "replace"].includes(type))) scheduleMindMapSave(); }, [applyEdgesChange, scheduleMindMapSave]);
  const onConnect = useCallback((params) => { const structured = isStructuredMapLayout(mapLayoutStyleRef.current); setEdges((current) => addEdge({ ...params, type: structured ? "xmind" : "smoothstep", style: { stroke: structured ? "#34383d" : "var(--edge-blue)", strokeWidth: structured ? 1.7 : 2.2 } }, current)); scheduleMindMapSave(); }, [scheduleMindMapSave, setEdges]);

  const flushPendingSaves = async () => {
    window.clearTimeout(documentSaveTimerRef.current); window.clearTimeout(mapSaveTimerRef.current);
    const docSaved = documentDirtyRef.current ? await persistDocument(documentSaveSerialRef.current) : true; if (!docSaved) return false;
    return mapDirtyRef.current ? persistMindMap("auto") : true;
  };

  useEffect(() => {
    const saveWithShortcut = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      window.clearTimeout(documentSaveTimerRef.current);
      window.clearTimeout(mapSaveTimerRef.current);
      if (mode === "mindmap") {
        if (Date.now() - lastMapAutoSaveAtRef.current < 5000) {
          setSaveLabel("刚刚已经自动保存，请稍后");
          window.setTimeout(() => setSaveLabel((current) => current === "刚刚已经自动保存，请稍后" ? "" : current), 1600);
        } else if (mapDirtyRef.current) persistMindMap("manual");
        else {
          setSaveLabel("当前内容已经保存");
          window.setTimeout(() => setSaveLabel((current) => current === "当前内容已经保存" ? "" : current), 1200);
        }
      } else if (documentDirtyRef.current) {
        persistDocument(documentSaveSerialRef.current);
      }
    };
    window.addEventListener("keydown", saveWithShortcut);
    return () => window.removeEventListener("keydown", saveWithShortcut);
  }, [mode, persistDocument, persistMindMap]);

  const authenticate = async (authMode, form) => {
    const result = authMode === "login"
      ? await api.login({ email: form.email, password: form.password, captcha_ticket: form.captcha_ticket })
      : await api.register({ email: form.email, display_name: form.display_name, public_id: form.public_id, password: form.password, invite_code: form.invite_code, captcha_ticket: form.captcha_ticket });
    await hydrateWorkspace(result.user);
  };

  const updateCurrentPublicId = async (publicId) => {
    const updated = await api.updatePublicId(publicId);
    setUser(updated);
    setSaveLabel(`公开主页已更新为 /${updated.public_id}`);
    return updated;
  };

  const logout = async () => { if (!(await flushPendingSaves())) return; await api.logout(); setUser(null); setWorkspace(null); setDocuments([]); setSharedDocuments([]); setRecentDocuments([]); setTrashedDocuments([]); replaceActiveDocument(null); setSessionState("anonymous"); };

  const navigate = async (nextSection) => {
    if (!(await flushPendingSaves())) return;
    setSection(nextSection); setDialog(null); setSaveLabel("");
    if (workspace && ["home", "shared", "recent", "space", "trash"].includes(nextSection)) await refreshCollections(workspace.id);
  };

  const openDocument = async (documentId) => {
    return runOnce("open-document", async () => {
      setOpeningDocumentId(documentId);
      setSaveLabel("正在打开内容…");
      if (!(await flushPendingSaves())) { setOpeningDocumentId(null); return; }
      try {
      let selected = await api.getDocument(documentId);
      const source = [...documents, ...sharedDocuments].find((item) => item.id === documentId);
      const accessRole = source?.access_role || selected.access_role;
      if (selected.type === "document" && accessRole !== "viewer") {
        try {
          const mindMaps = await api.listMindMaps(documentId);
          const referencedMapIds = new Set();
          const collectMapIds = (value) => {
            if (!value || typeof value !== "object") return;
            if (value.type === "mindMapBlock" && value.attrs?.mapId) referencedMapIds.add(String(value.attrs.mapId));
            (value.content || []).forEach(collectMapIds);
          };
          collectMapIds(selected.content);
          const missingMaps = mindMaps.filter((mindMap) => !referencedMapIds.has(String(mindMap.id)));
          if (missingMaps.length > 0) {
            const migratedContent = cloneDocumentContent(selected.content || blankDocumentContent);
            migratedContent.content = [...(migratedContent.content || []), ...missingMaps.map((mindMap) => ({ type: "mindMapBlock", attrs: { mapId: mindMap.id, title: mindMap.title, nodeCount: mindMap.graph?.nodes?.length || 1, previewLabels: (mindMap.graph?.nodes || []).slice(0, 5).map((item) => item.data?.label || "新主题") } }))];
            const migrated = await api.updateDocument(documentId, { base_version: selected.version, content: migratedContent, reason: "migration" });
            selected = { ...selected, ...migrated };
          }
        } catch (migrationError) {
          setSaveLabel(`文档已打开，旧导图稍后迁移：${migrationError.message || "迁移失败"}`);
        }
      }
      if (selected.type === "mindmap") {
        setNodes([]);
        setEdges([]);
        setActiveMindMapTitle(selected.title);
      }
      replaceActiveDocument({ ...selected, access_role: accessRole, owner_name: source?.owner_name || selected.owner_name });
      documentDirtyRef.current = false; mapDirtyRef.current = false; mapSaveSerialRef.current = 0; lastMapAutoSaveAtRef.current = 0; setMode(["mindmap", "gantt", "spreadsheet"].includes(selected.type) ? selected.type : "document"); setSection("document"); setSaveLabel("");
        if (workspace) refreshCollections(workspace.id);
      } catch (error) { setSaveLabel(error.message || "无法打开文档"); }
      finally { setOpeningDocumentId(null); }
    });
  };

  const createItem = async (type, parentId = null) => {
    if (!workspace || !(await flushPendingSaves())) return;
    const isFolder = type === "folder";
    const isMindMap = type === "mindmap";
    if (isFolder) { setDialog({ type: "new-folder", parentId }); return; }
    const titles = { mindmap: "无标题思维导图", gantt: "无标题甘特图", spreadsheet: "无标题表格", document: "无标题文档" };
    const title = titles[type] || "无标题文档";
    const content = type === "gantt" ? createInitialGanttContent() : type === "spreadsheet" ? createInitialSpreadsheetContent() : cloneDocumentContent(blankDocumentContent);
    return runOnce(`create:${type}:${parentId || "root"}`, async () => {
      setSaveLabel(isMindMap ? "正在创建思维导图…" : "正在创建文档…");
      try {
        const created = await api.createDocument({ workspace_id: workspace.id, parent_id: parentId, type, title, content });
        setDocuments((items) => [created, ...items]); setSaveLabel("已创建");
        if (isMindMap) {
          const graph = createStarterGraph(title);
          await api.createMindMap(created.id, { title, graph });
        }
        await openDocument(created.id);
      } catch (error) { setSaveLabel(error.message || "创建失败"); }
    });
  };

  const insertMindMap = async (editor) => {
    const document = activeDocumentRef.current;
    if (!document || !editor || document.access_role === "viewer") return null;
    return runOnce(`insert-map:${document.id}`, async () => {
      const title = `${document.title}导图`;
      const graph = createStarterGraph(title);
      setSaveLabel("正在插入思维导图…");
      try {
        const saved = await api.createMindMap(document.id, { title, graph });
        editor.chain().focus().insertContent({ type: "mindMapBlock", attrs: { mapId: saved.id, title: saved.title, nodeCount: graph.nodes.length, previewLabels: graph.nodes.slice(0, 5).map((item) => item.data?.label || "新主题") } }).run();
        setSaveLabel("已在当前位置插入思维导图");
        return saved;
      } catch (error) { setSaveLabel(error.message || "插入思维导图失败"); return null; }
    });
  };

  const openEmbeddedMindMap = useCallback(async ({ mapId }) => {
    const document = activeDocumentRef.current;
    if (!document) return;
    return runOnce("open-document", async () => {
      setOpeningDocumentId(document.id);
      if (!(await flushPendingSaves())) { setOpeningDocumentId(null); return; }
      setSaveLabel("正在打开思维导图…");
      try {
      const mindMap = await api.getMindMapById(document.id, mapId);
      activeMindMapIdRef.current = mindMap.id;
      setActiveMindMapTitle(mindMap.title);
      activeMindMapTitleRef.current = mindMap.title;
      const layoutStyle = normalizeMapLayout(mindMap.graph.layout_style || "cards");
      setMapLayoutStyle(layoutStyle);
      mapLayoutStyleRef.current = layoutStyle;
      mapVersionRef.current = mindMap.version;
      mapDirtyRef.current = false;
      mapSaveSerialRef.current = 0;
      lastMapAutoSaveAtRef.current = 0;
      setNodes(decorateMapNodes(mindMap.graph.nodes || [], layoutStyle));
      setEdges(decorateMapEdges(mindMap.graph.edges || [], layoutStyle));
      if (isStructuredMapLayout(layoutStyle)) window.setTimeout(() => layoutMap(layoutStyle), 80);
      setMode("mindmap");
        setSaveLabel("");
      } catch (error) { setSaveLabel(error.message || "思维导图加载失败"); }
      finally { setOpeningDocumentId(null); }
    });
  }, [runOnce, setEdges, setNodes]);

  const duplicateEmbeddedMindMap = useCallback(async (mapId) => {
    const document = activeDocumentRef.current;
    if (!document) return null;
    return runOnce(`duplicate-map:${mapId}`, async () => {
      try {
        const duplicate = await api.duplicateMindMap(document.id, mapId);
        setSaveLabel("思维导图副本已插入");
        return duplicate;
      } catch (error) { setSaveLabel(error.message || "复制思维导图失败"); return null; }
    });
  }, [runOnce]);

  const renameEmbeddedMindMap = useCallback(({ mapId, title, updateAttributes }) => {
    setDialog({ type: "rename-mind-map", mapId, value: title, updateAttributes });
  }, []);

  const confirmRenameEmbeddedMindMap = async (title) => {
    const document = activeDocumentRef.current;
    if (!document || dialog?.type !== "rename-mind-map") return;
    const { mapId, updateAttributes } = dialog;
    return runOnce(`rename-map:${mapId}`, async () => {
      try {
        const current = await api.getMindMapById(document.id, mapId);
        const saved = await api.updateMindMap(document.id, mapId, { base_version: current.version, title, graph: current.graph });
        updateAttributes?.({ title: saved.title });
        setDialog(null);
        setSaveLabel("思维导图已重命名");
      } catch (error) { setSaveLabel(error.message || "重命名失败"); }
    });
  };

  const requestDeleteEmbeddedMindMap = useCallback(({ mapId, title, deleteNode }) => {
    setDialog({ type: "delete-mind-map", mapId, title, deleteNode });
  }, []);

  const confirmDeleteEmbeddedMindMap = async () => {
    const document = activeDocumentRef.current;
    if (!document || dialog?.type !== "delete-mind-map") return;
    const { mapId, deleteNode } = dialog;
    return runOnce(`delete-map:${mapId}`, async () => {
      try {
        await api.deleteMindMap(document.id, mapId);
        deleteNode?.();
        if (activeMindMapIdRef.current === mapId) activeMindMapIdRef.current = null;
        setDialog(null);
        setSaveLabel("思维导图已删除");
      } catch (error) { setSaveLabel(error.message || "删除思维导图失败"); }
    });
  };

  const createFolder = async (parentId, title) => {
    if (!workspace) return;
    setDialog(null); setSaveLabel("正在创建文件夹…");
    return runOnce(`create:folder:${parentId || "root"}`, async () => {
      try { const created = await api.createDocument({ workspace_id: workspace.id, parent_id: parentId, type: "folder", title, content: cloneDocumentContent(blankDocumentContent) }); setDocuments((items) => [created, ...items]); setSection("space"); setCurrentFolderId(parentId); setSaveLabel("文件夹已创建，可点击文档右侧“移动”进行整理"); window.setTimeout(() => setSaveLabel(""), 3200); }
      catch (error) { setSaveLabel(error.message || "创建失败"); }
    });
  };

  const duplicateItem = async (document) => runOnce(`duplicate:${document.id}`, async () => { setSaveLabel("正在创建副本…"); try { const created = await api.duplicateDocument(document.id); setDocuments((items) => [created, ...items]); setDialog(null); setSaveLabel("副本已创建"); } catch (error) { setSaveLabel(error.message || "复制失败"); } });
  const deleteItem = (document) => setDialog({ type: "delete", document });
  const confirmDeleteItem = async () => { const document = dialog?.document; if (!document) return; return runOnce(`delete:${document.id}`, async () => { try { await api.deleteDocument(document.id); if (workspace) await refreshCollections(workspace.id); setDialog(null); if (document.type === "folder") setCurrentFolderId(null); if (activeDocumentRef.current?.id === document.id) { replaceActiveDocument(null); setSection("space"); } } catch (error) { setSaveLabel(error.message || "删除失败"); } }); };
  const requestBatchDelete = (items) => setDialog({ type: "batch-delete", documents: items });
  const confirmBatchDelete = async () => {
    const items = dialog?.documents || [];
    if (items.length === 0) return;
    const ids = items.map((item) => item.id);
    return runOnce(`batch-delete:${[...ids].sort().join(":")}`, async () => {
      try {
        await api.batchDeleteDocuments(ids);
        const idSet = new Set(ids);
        if (workspace) await refreshCollections(workspace.id);
        if (items.some((item) => item.type === "folder")) setCurrentFolderId(null);
        if (activeDocumentRef.current && idSet.has(activeDocumentRef.current.id)) replaceActiveDocument(null);
        setDialog(null);
        setSaveLabel(`已将 ${items.length} 项移到回收站`);
      } catch (error) { setSaveLabel(error.message || "批量删除失败"); }
    });
  };
  const restoreTrashItem = async (document) => runOnce(`restore:${document.id}`, async () => {
    try {
      const restored = await api.restoreDocument(document.id);
      setTrashedDocuments((items) => items.filter((item) => item.id !== document.id && item.parent_id !== document.id));
      setDocuments((items) => [restored, ...items.filter((item) => item.id !== restored.id)]);
      if (workspace) await refreshCollections(workspace.id);
      setSaveLabel(`已还原「${document.title}」`);
    } catch (error) { setSaveLabel(error.message || "还原失败"); }
  });
  const requestPermanentDelete = (document) => setDialog({ type: "permanent-delete", document });
  const confirmPermanentDelete = async () => {
    const document = dialog?.document;
    if (!document) return;
    return runOnce(`permanent-delete:${document.id}`, async () => {
      try {
        await api.permanentlyDeleteDocument(document.id);
        if (workspace) await refreshCollections(workspace.id);
        setDialog(null);
        setSaveLabel("内容已永久删除");
      } catch (error) { setSaveLabel(error.message || "永久删除失败"); }
    });
  };
  const requestBatchPermanentDelete = (items) => setDialog({ type: "batch-permanent-delete", documents: items });
  const confirmBatchPermanentDelete = async () => {
    const items = dialog?.documents || [];
    if (items.length === 0) return;
    const ids = items.map((item) => item.id);
    return runOnce(`batch-permanent-delete:${[...ids].sort().join(":")}`, async () => {
      try {
        await api.batchPermanentlyDeleteDocuments(ids);
        if (workspace) await refreshCollections(workspace.id);
        setDialog(null);
        setSaveLabel(`已永久删除 ${items.length} 项内容`);
      } catch (error) { setSaveLabel(error.message || "批量永久删除失败"); }
    });
  };
  const moveItem = async (parentId) => { if (!dialog?.document) return; const document = dialog.document; return runOnce(`move:${document.id}`, async () => { setSaveLabel("正在移动…"); try { const moved = await api.moveDocument(document.id, parentId); setDocuments((items) => items.map((item) => item.id === moved.id ? { ...item, ...moved } : item)); setDialog(null); setSaveLabel("已移动到目标文件夹"); } catch (error) { setSaveLabel(error.message || "移动失败"); } }); };
  const showMove = (document) => setDialog({ type: "move", document });
  const showMindMapHistory = async (parentDocument = activeDocumentRef.current, requestedMapId = activeMindMapIdRef.current) => {
    if (!parentDocument) return;
    return runOnce(`load-map-history:${requestedMapId || parentDocument.id}`, async () => {
      try {
        if (activeDocumentRef.current?.id === parentDocument.id) await flushPendingSaves();
        let mapId = requestedMapId;
        if (!mapId) mapId = (await api.listMindMaps(parentDocument.id))[0]?.id;
        if (!mapId) { setSaveLabel("这个思维导图还没有可查看的历史"); return; }
        const mindMap = await api.getMindMapById(parentDocument.id, mapId);
        const historyDocument = { ...mindMap, content: mindMap.graph, access_role: parentDocument.access_role, owner_name: parentDocument.owner_name };
        setDialog({ type: "mind-map-versions", document: historyDocument, parentDocument, mapId });
        setVersions((await api.listMindMapVersions(parentDocument.id, mapId)).map((version) => ({ ...version, content: version.graph })));
      } catch (error) { setSaveLabel(error.message || "无法加载思维导图历史"); }
    });
  };
  const showHistory = async (document) => {
    if (document.type === "mindmap") return showMindMapHistory(document, activeDocumentRef.current?.id === document.id ? activeMindMapIdRef.current : null);
    if (activeDocumentRef.current?.id === document.id) await flushPendingSaves();
    const latestDocument = activeDocumentRef.current?.id === document.id ? activeDocumentRef.current : document;
    setDialog({ type: "versions", document: latestDocument });
    setVersions(await api.listVersions(document.id));
  };
  const restoreHistoryVersion = async (version) => {
    const historyDocument = dialog?.document;
    if (!historyDocument) return;
    return runOnce(`restore-version:${version.id}`, async () => {
      try {
        const restored = await api.restoreVersion(historyDocument.id, version.id);
        const merged = { ...historyDocument, ...restored, access_role: historyDocument.access_role, owner_name: historyDocument.owner_name };
        if (activeDocumentRef.current?.id === merged.id) replaceActiveDocument(merged);
        setDocuments((items) => items.map((item) => item.id === merged.id ? { ...item, ...merged } : item));
        setDialog((current) => current?.type === "versions" ? { ...current, document: merged } : current);
        setVersions(await api.listVersions(merged.id));
        setSaveLabel(`已将 v${version.version} 恢复为新版本 v${merged.version}`);
      } catch (error) { setSaveLabel(error.message || "恢复版本失败"); }
    });
  };
  const deleteHistoryVersion = async (version) => {
    const historyDocument = dialog?.document;
    if (!historyDocument) return;
    return runOnce(`delete-version:${version.id}`, async () => {
      try {
        await api.deleteVersion(historyDocument.id, version.id);
        setVersions((items) => items.filter((item) => item.id !== version.id));
        setSaveLabel(`已删除历史版本 v${version.version}`);
      } catch (error) { setSaveLabel(error.message || "删除历史版本失败"); }
    });
  };
  const restoreMindMapHistoryVersion = async (version) => {
    const parentDocument = dialog?.parentDocument;
    const mapId = dialog?.mapId;
    if (!parentDocument || !mapId) return;
    return runOnce(`restore-map-version:${version.id}`, async () => {
      try {
        const restored = await api.restoreMindMapVersion(parentDocument.id, mapId, version.id);
        const layoutStyle = normalizeMapLayout(restored.graph.layout_style || "logic-right");
        if (activeMindMapIdRef.current === mapId) {
          activeMindMapTitleRef.current = restored.title;
          activeMindMapIdRef.current = restored.id;
          mapVersionRef.current = restored.version;
          mapLayoutStyleRef.current = layoutStyle;
          mapDirtyRef.current = false;
          setActiveMindMapTitle(restored.title);
          setMapLayoutStyle(layoutStyle);
          setNodes(decorateMapNodes(restored.graph.nodes || [], layoutStyle));
          setEdges(decorateMapEdges(restored.graph.edges || [], layoutStyle));
          updateEmbeddedMapBlock(restored.id, { title: restored.title, nodeCount: restored.graph.nodes?.length || 1, previewLabels: (restored.graph.nodes || []).slice(0, 5).map((item) => item.data?.label || "新主题") });
        }
        setDialog((current) => current?.type === "mind-map-versions" ? { ...current, document: { ...restored, content: restored.graph, access_role: parentDocument.access_role, owner_name: parentDocument.owner_name } } : current);
        setVersions((await api.listMindMapVersions(parentDocument.id, mapId)).map((item) => ({ ...item, content: item.graph })));
        setSaveLabel(`已将导图 v${version.version} 恢复为新版本 v${restored.version}`);
      } catch (error) { setSaveLabel(error.message || "恢复思维导图版本失败"); }
    });
  };
  const deleteMindMapHistoryVersion = async (version) => {
    const parentDocument = dialog?.parentDocument;
    const mapId = dialog?.mapId;
    if (!parentDocument || !mapId) return;
    return runOnce(`delete-map-version:${version.id}`, async () => {
      try {
        await api.deleteMindMapVersion(parentDocument.id, mapId, version.id);
        setVersions((items) => items.filter((item) => item.id !== version.id));
        setSaveLabel(`已删除导图历史版本 v${version.version}`);
      } catch (error) { setSaveLabel(error.message || "删除思维导图历史失败"); }
    });
  };
  const showShare = async () => { if (!activeDocument) return; setDialog({ type: "share", document: activeDocument }); setShares(await api.listShares(activeDocument.id)); };
  const inviteShare = async (payload) => { setDialogLoading(true); try { const created = await api.shareDocument(activeDocument.id, payload); setShares((items) => [...items.filter((item) => item.user_id !== created.user_id), created]); } finally { setDialogLoading(false); } };
  const updateShare = async (shareId, permission) => { const updated = await api.updateShare(activeDocument.id, shareId, permission); setShares((items) => items.map((item) => item.id === shareId ? updated : item)); };
  const removeShare = async (shareId) => { await api.deleteShare(activeDocument.id, shareId); setShares((items) => items.filter((item) => item.id !== shareId)); };

  const requestPublish = async () => {
    const document = activeDocumentRef.current;
    if (!document || !(await flushPendingSaves())) return;
    if (document.published_at) { setDialog({ type: "unpublish", document }); return; }
    return runOnce(`publish:${document.id}`, async () => {
      try {
        const published = await api.publishDocument(document.id);
        const merged = { ...document, ...published };
        replaceActiveDocument(merged);
        setDocuments((items) => items.map((item) => item.id === document.id ? { ...item, ...published } : item));
        setSaveLabel(`已发布到 /${user.public_id}`);
      } catch (error) { setSaveLabel(error.message || "发布失败"); }
    });
  };
  const confirmUnpublish = async () => {
    const document = dialog?.document;
    if (!document) return;
    return runOnce(`unpublish:${document.id}`, async () => {
      try {
        const unpublished = await api.unpublishDocument(document.id);
        replaceActiveDocument({ ...document, ...unpublished });
        setDocuments((items) => items.map((item) => item.id === document.id ? { ...item, ...unpublished } : item));
        setDialog(null);
        setSaveLabel("文章已从公开前台下线");
      } catch (error) { setSaveLabel(error.message || "取消发布失败"); }
    });
  };

  const addMapChild = (parentId) => {
    const parent = nodesRef.current.find((node) => node.id === parentId) || nodesRef.current[0]; const id = `node-${Date.now()}`;
    const siblingCount = edgesRef.current.filter((edge) => edge.source === parent.id).length;
    const layoutStyle = normalizeMapLayout(mapLayoutStyleRef.current);
    const structured = isStructuredMapLayout(layoutStyle);
    const rootChildren = edgesRef.current.filter((edge) => edge.source === "root");
    const balancedSide = layoutStyle === "balanced" && parent.id === "root"
      ? rootChildren.filter((edge) => nodesRef.current.find((node) => node.id === edge.target)?.data?.branchSide === "left").length <= rootChildren.length / 2 ? "left" : "right"
      : parent.data?.branchSide;
    const handles = getMapHandles(layoutStyle, balancedSide);
    const theme = mindMapThemes.find((item) => item.id === nodesRef.current.find((node) => node.id === "root")?.data?.themeId) || mindMapThemes[0];
    const branchColor = parent.id === "root" ? theme.colors[siblingCount % theme.colors.length] : (parent.style?.["--branch-color"] || theme.colors[0]);
    const delta = handles.side === "left" ? { x: -210, y: siblingCount * 52 } : handles.side === "down" ? { x: siblingCount * 150, y: 110 } : { x: 210, y: siblingCount * 52 };
    const child = { id, position: { x: parent.position.x + delta.x, y: parent.position.y + delta.y }, data: { label: "新主题", isRoot: false, layoutStyle, branchSide: handles.side }, type: "mindMap", style: { "--branch-color": branchColor }, className: structured ? "mind-node mind-node-logic" : "mind-node mind-node-leaf" };
    const edge = { id: `${parent.id}-${id}`, source: parent.id, target: id, sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle, type: structured ? "xmind" : "smoothstep", pathOptions: { borderRadius: 18, offset: 16 }, style: { stroke: structured ? branchColor : "var(--edge-blue)", strokeWidth: structured ? 1.7 : 2.2 } };
    const nextNodes = [...nodesRef.current, child];
    const nextEdges = [...edgesRef.current, edge];
    // Keep the graph refs in sync immediately. Enter/Tab can fire again before React's
    // state effects run, and stale refs previously made new branches use wrong parents.
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    if (structured) window.requestAnimationFrame(() => layoutMap(layoutStyle));
    else scheduleMindMapSave();
    return id;
  };
  const addMapSibling = (nodeId) => {
    const parentId = edgesRef.current.find((edge) => edge.target === nodeId)?.source || "root";
    return addMapChild(parentId);
  };
  const renameMapNode = (nodeId, label) => { setNodes((items) => items.map((item) => {
    if (item.id !== nodeId) return item;
    const oldLabel = item.data?.label || "";
    const textRuns = reconcileMapTextRuns(oldLabel, label, item.data?.textRuns, item.data?.textStyle || {});
    return { ...item, data: { ...item.data, label, ...(textRuns ? { textRuns } : {}) } };
  })); scheduleMindMapSave(); };
  const setMapNodePriority = (nodeId, priority) => { setNodes((items) => items.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, priority } } : item)); scheduleMindMapSave(); };
  const setMapNodeMarker = (nodeId, marker) => { setNodes((items) => items.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, marker } } : item)); scheduleMindMapSave(); };
  const setMapNodeTextStyle = (nodeId, patch, selection = null) => { setNodes((items) => items.map((item) => {
    if (item.id !== nodeId) return item;
    const label = item.data?.label || "";
    const hasPartialSelection = selection && selection.end > selection.start && selection.start < label.length;
    if (hasPartialSelection || Array.isArray(item.data?.textRuns)) {
      const characters = expandMapTextRuns(label, item.data?.textRuns, item.data?.textStyle || {});
      const start = hasPartialSelection ? Math.max(0, selection.start) : 0;
      const end = hasPartialSelection ? Math.min(label.length, selection.end) : label.length;
      const textRuns = mergeMapTextRuns(characters.map((character, index) => index >= start && index < end ? { ...character, style: { ...character.style, ...patch } } : character));
      return { ...item, data: { ...item.data, textStyle: {}, textRuns } };
    }
    return { ...item, data: { ...item.data, textStyle: { ...(item.data?.textStyle || {}), ...patch } } };
  })); scheduleMindMapSave(); };
  const resizeMapNode = useCallback((nodeId, width, height, commit = false) => {
    setNodes((items) => items.map((item) => item.id === nodeId ? { ...item, style: { ...item.style, width, height, "--mind-node-width": `${Math.round(width)}px`, "--mind-node-height": `${Math.round(height)}px` } } : item));
    if (commit) scheduleMindMapSave();
  }, [scheduleMindMapSave, setNodes]);
  const confirmRenameMapNode = (label) => { const nodeId = dialog.nodeId; setNodes((items) => items.map((item) => {
    if (item.id !== nodeId) return item;
    const textRuns = reconcileMapTextRuns(item.data?.label || "", label, item.data?.textRuns, item.data?.textStyle || {});
    return { ...item, data: { ...item.data, label, ...(textRuns ? { textRuns } : {}) } };
  })); setDialog(null); scheduleMindMapSave(); };
  const deleteMapNode = (nodeId) => { setNodes((items) => items.filter((item) => item.id !== nodeId)); setEdges((items) => items.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)); scheduleMindMapSave(); };
  const applyMapTheme = (themeId) => {
    const palette = (mindMapThemes.find((theme) => theme.id === themeId) || mindMapThemes[0]).colors;
    const childMap = new Map();
    edgesRef.current.forEach((edge) => childMap.set(edge.source, [...(childMap.get(edge.source) || []), edge.target]));
    const branchColors = new Map([["root", palette[0]]]);
    (childMap.get("root") || []).forEach((childId, index) => {
      const color = palette[index % palette.length];
      const queue = [childId];
      while (queue.length) { const currentId = queue.shift(); branchColors.set(currentId, color); queue.push(...(childMap.get(currentId) || [])); }
    });
    setNodes((items) => items.map((item) => ({ ...item, data: { ...item.data, ...(item.id === "root" ? { themeId } : {}) }, style: { ...item.style, "--branch-color": branchColors.get(item.id) || palette[0] }, className: item.id === "root" ? "mind-node mind-node-root" : isStructuredMapLayout(mapLayoutStyleRef.current) ? "mind-node mind-node-logic" : "mind-node mind-node-leaf" })));
    setEdges((items) => items.map((edge) => ({ ...edge, style: { ...edge.style, stroke: branchColors.get(edge.target) || palette[0] } })));
    scheduleMindMapSave();
  };
  const layoutMap = (requestedStyle = mapLayoutStyleRef.current) => {
    const layoutStyle = normalizeMapLayout(requestedStyle);
    const structured = isStructuredMapLayout(layoutStyle);
    const nodeIds = new Set(nodesRef.current.map((node) => node.id));
    const children = new Map();
    edgesRef.current.forEach((edge) => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) children.set(edge.source, [...(children.get(edge.source) || []), edge.target]);
    });
    const rootId = nodeIds.has("root") ? "root" : nodesRef.current[0]?.id;
    if (!rootId) return;

    const depthById = new Map();
    const assignDepth = (nodeId, depth, ancestors = new Set()) => {
      if (ancestors.has(nodeId) || (depthById.has(nodeId) && depthById.get(nodeId) <= depth)) return;
      depthById.set(nodeId, depth);
      const nextAncestors = new Set(ancestors).add(nodeId);
      (children.get(nodeId) || []).forEach((childId) => assignDepth(childId, depth + 1, nextAncestors));
    };
    assignDepth(rootId, 0);
    nodesRef.current.forEach((node) => { if (!depthById.has(node.id)) depthById.set(node.id, 0); });

    const dimensions = new Map();
    const widthByDepth = [];
    const heightByDepth = [];
    nodesRef.current.forEach((node) => {
      const depth = depthById.get(node.id) || 0;
      const isRoot = node.id === rootId;
      const lines = String(node.data?.label || "新主题").split("\n");
      const longestLine = Math.max(...lines.map((line) => line.length), 1);
      const markerSpace = (node.data?.priority ? 22 : 0) + (node.data?.marker ? 22 : 0);
      const width = structured
        ? isRoot ? Math.min(340, Math.max(196, longestLine * 19 + 52)) : Math.min(360, Math.max(94, longestLine * 12 + 22 + markerSpace))
        : isRoot ? 196 : Math.min(250, Math.max(138, longestLine * 12 + 34));
      const charsPerLine = Math.max(5, Math.floor((width - 22 - markerSpace) / (isRoot ? 17 : 11)));
      const visualLines = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
      const height = isRoot ? Math.max(64, visualLines * 28 + 26) : structured ? Math.max(34, visualLines * 19 + 10) : Math.max(50, visualLines * 18 + 22);
      dimensions.set(node.id, { width, height });
      widthByDepth[depth] = Math.max(widthByDepth[depth] || 0, width);
      heightByDepth[depth] = Math.max(heightByDepth[depth] || 0, height);
    });

    const siblingGap = structured ? 22 : 42;
    const subtreeHeights = new Map();
    const measureSubtreeHeight = (nodeId, ancestors = new Set()) => {
      if (subtreeHeights.has(nodeId)) return subtreeHeights.get(nodeId);
      if (ancestors.has(nodeId)) return dimensions.get(nodeId)?.height || 34;
      const nextAncestors = new Set(ancestors).add(nodeId);
      const branchChildren = (children.get(nodeId) || []).filter((childId) => !nextAncestors.has(childId));
      const childrenHeight = branchChildren.reduce((sum, childId) => sum + measureSubtreeHeight(childId, nextAncestors), 0) + Math.max(0, branchChildren.length - 1) * siblingGap;
      const height = Math.max(dimensions.get(nodeId)?.height || 34, childrenHeight);
      subtreeHeights.set(nodeId, height);
      return height;
    };

    const positions = new Map();
    const branchSides = new Map([[rootId, "root"]]);
    const placed = new Set();
    const rightX = [660];
    const leftX = [660];
    for (let depth = 1; depth < widthByDepth.length; depth += 1) {
      rightX[depth] = rightX[depth - 1] + (widthByDepth[depth - 1] || 120) + 84;
      leftX[depth] = leftX[depth - 1] - (widthByDepth[depth] || 120) - 84;
    }
    const placeHorizontalBranch = (nodeId, top, side, ancestors = new Set()) => {
      if (ancestors.has(nodeId) || placed.has(nodeId)) return;
      const nextAncestors = new Set(ancestors).add(nodeId);
      const branchChildren = (children.get(nodeId) || []).filter((childId) => !nextAncestors.has(childId));
      const subtreeHeight = measureSubtreeHeight(nodeId);
      const nodeHeight = dimensions.get(nodeId)?.height || 34;
      const depth = depthById.get(nodeId) || 0;
      positions.set(nodeId, { x: side === "left" ? leftX[depth] : rightX[depth], y: top + (subtreeHeight - nodeHeight) / 2 });
      branchSides.set(nodeId, side);
      placed.add(nodeId);
      const childrenHeight = branchChildren.reduce((sum, childId) => sum + measureSubtreeHeight(childId), 0) + Math.max(0, branchChildren.length - 1) * siblingGap;
      let childTop = top + Math.max(0, (subtreeHeight - childrenHeight) / 2);
      branchChildren.forEach((childId) => {
        placeHorizontalBranch(childId, childTop, side, nextAncestors);
        childTop += measureSubtreeHeight(childId) + siblingGap;
      });
    };

    if (layoutStyle === "logic-down" || layoutStyle === "cards") {
      const horizontalGap = structured ? 38 : 54;
      const subtreeWidths = new Map();
      const measureSubtreeWidth = (nodeId, ancestors = new Set()) => {
        if (subtreeWidths.has(nodeId)) return subtreeWidths.get(nodeId);
        if (ancestors.has(nodeId)) return dimensions.get(nodeId)?.width || 120;
        const nextAncestors = new Set(ancestors).add(nodeId);
        const branchChildren = (children.get(nodeId) || []).filter((childId) => !nextAncestors.has(childId));
        const childrenWidth = branchChildren.reduce((sum, childId) => sum + measureSubtreeWidth(childId, nextAncestors), 0) + Math.max(0, branchChildren.length - 1) * horizontalGap;
        const width = Math.max(dimensions.get(nodeId)?.width || 120, childrenWidth);
        subtreeWidths.set(nodeId, width);
        return width;
      };
      const yByDepth = [70];
      for (let depth = 1; depth < heightByDepth.length; depth += 1) yByDepth[depth] = yByDepth[depth - 1] + (heightByDepth[depth - 1] || 40) + 82;
      const placeDownBranch = (nodeId, left, ancestors = new Set()) => {
        if (ancestors.has(nodeId) || placed.has(nodeId)) return;
        const nextAncestors = new Set(ancestors).add(nodeId);
        const depth = depthById.get(nodeId) || 0;
        const subtreeWidth = measureSubtreeWidth(nodeId);
        const nodeWidth = dimensions.get(nodeId)?.width || 120;
        positions.set(nodeId, { x: left + (subtreeWidth - nodeWidth) / 2, y: yByDepth[depth] || 70 });
        branchSides.set(nodeId, "down");
        placed.add(nodeId);
        const branchChildren = (children.get(nodeId) || []).filter((childId) => !nextAncestors.has(childId));
        const childrenWidth = branchChildren.reduce((sum, childId) => sum + measureSubtreeWidth(childId), 0) + Math.max(0, branchChildren.length - 1) * horizontalGap;
        let childLeft = left + Math.max(0, (subtreeWidth - childrenWidth) / 2);
        branchChildren.forEach((childId) => { placeDownBranch(childId, childLeft, nextAncestors); childLeft += measureSubtreeWidth(childId) + horizontalGap; });
      };
      placeDownBranch(rootId, 90);
    } else if (layoutStyle === "balanced") {
      const rootChildren = children.get(rootId) || [];
      const leftChildren = [];
      const rightChildren = [];
      let leftHeight = 0;
      let rightHeight = 0;
      rootChildren.forEach((childId) => {
        const branchHeight = measureSubtreeHeight(childId) + siblingGap;
        if (rightHeight <= leftHeight) { rightChildren.push(childId); rightHeight += branchHeight; }
        else { leftChildren.push(childId); leftHeight += branchHeight; }
      });
      leftHeight = Math.max(0, leftHeight - siblingGap);
      rightHeight = Math.max(0, rightHeight - siblingGap);
      const totalHeight = Math.max(leftHeight, rightHeight, dimensions.get(rootId)?.height || 64);
      const top = 70;
      positions.set(rootId, { x: rightX[0], y: top + (totalHeight - (dimensions.get(rootId)?.height || 64)) / 2 });
      placed.add(rootId);
      const placeSide = (ids, side, sideHeight) => {
        let childTop = top + Math.max(0, (totalHeight - sideHeight) / 2);
        ids.forEach((childId) => { placeHorizontalBranch(childId, childTop, side, new Set([rootId])); childTop += measureSubtreeHeight(childId) + siblingGap; });
      };
      placeSide(leftChildren, "left", leftHeight);
      placeSide(rightChildren, "right", rightHeight);
    } else {
      const side = layoutStyle === "logic-left" ? "left" : "right";
      placeHorizontalBranch(rootId, 70, side);
    }

    let detachedTop = Math.max(...[...positions.values()].map((position) => position.y), 70) + 110;
    nodesRef.current.forEach((node) => {
      if (!placed.has(node.id)) {
        const side = getMapBranchSide(layoutStyle, node.data?.branchSide);
        positions.set(node.id, { x: 660, y: detachedTop });
        branchSides.set(node.id, side);
        detachedTop += (dimensions.get(node.id)?.height || 40) + siblingGap;
      }
    });

    const activeThemeId = nodesRef.current.find((node) => node.id === rootId)?.data?.themeId || "spectrum";
    const activePalette = (mindMapThemes.find((theme) => theme.id === activeThemeId) || mindMapThemes[0]).colors;
    const branchColors = new Map([[rootId, activePalette[0]]]);
    (children.get(rootId) || []).forEach((childId, index) => {
      const color = activePalette[index % activePalette.length];
      const queue = [childId];
      while (queue.length) { const currentId = queue.shift(); if (branchColors.has(currentId)) continue; branchColors.set(currentId, color); queue.push(...(children.get(currentId) || [])); }
    });

    setNodes((items) => items.map((item) => {
      const size = dimensions.get(item.id);
      const branchSide = branchSides.get(item.id) === "root" ? undefined : branchSides.get(item.id);
      return { ...item, position: positions.get(item.id) || item.position, type: "mindMap", style: { ...item.style, "--branch-color": branchColors.get(item.id) || activePalette[0], "--mind-node-width": `${size?.width || 120}px`, "--mind-node-height": `${size?.height || 34}px` }, data: { ...item.data, isRoot: item.id === rootId, layoutStyle, branchSide, ...(item.id === rootId ? { themeId: activeThemeId } : {}) }, className: item.id === rootId ? "mind-node mind-node-root" : structured ? "mind-node mind-node-logic" : "mind-node mind-node-leaf" };
    }));
    setEdges((items) => items.map((edge) => {
      const preferredSide = layoutStyle === "balanced" ? branchSides.get(edge.target) : undefined;
      const handles = getMapHandles(layoutStyle, preferredSide);
      return { ...edge, sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle, type: structured ? "xmind" : "smoothstep", pathOptions: { ...edge.pathOptions, borderRadius: structured ? 18 : 8, offset: structured ? 18 : 20 }, style: { ...edge.style, stroke: structured ? (branchColors.get(edge.target) || activePalette[0]) : "var(--edge-blue)", strokeWidth: structured ? 1.7 : 2.2 } };
    }));
    scheduleMindMapSave();
  };
  const applyMapLayoutStyle = (style) => {
    const normalized = normalizeMapLayout(style);
    setMapLayoutStyle(normalized);
    mapLayoutStyleRef.current = normalized;
    layoutMap(normalized);
  };
  const changeMindMapTitle = (title) => {
    setActiveMindMapTitle(title);
    activeMindMapTitleRef.current = title;
    updateEmbeddedMapBlock(activeMindMapIdRef.current, { title });
    if (activeDocumentRef.current?.type === "mindmap") updateActiveDocument({ title });
    scheduleMindMapSave();
  };
  const exportMap = () => { const blob = new Blob([JSON.stringify({ title: activeDocument.title, nodes: nodesRef.current, edges: edgesRef.current }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${activeDocument.title}-思维导图.json`; anchor.click(); URL.revokeObjectURL(url); };

  const mindMapActions = {
    onOpen: openEmbeddedMindMap,
    onRename: renameEmbeddedMindMap,
    onDuplicate: duplicateEmbeddedMindMap,
    onDelete: requestDeleteEmbeddedMindMap,
  };

  useEffect(() => { window.localStorage.setItem("zhiliu-appearance-theme", appearanceTheme); }, [appearanceTheme]);
  useEffect(() => { window.localStorage.setItem("zhiliu-glass-enabled", String(glassEnabled)); }, [glassEnabled]);
  const shellClass = useMemo(() => ["app-shell", sidebarCollapsed ? "sidebar-is-collapsed" : "", `theme-${appearanceTheme}`, glassEnabled ? "has-glass" : ""].filter(Boolean).join(" "), [appearanceTheme, glassEnabled, sidebarCollapsed]);
  if (sessionState === "loading") return <main className="app-loading"><img className="brand-loading-lockup" src="/brand/knowledge-workspace-lockup.png" alt="Knowledge Workspace" /><strong>正在连接知识节点…</strong></main>;
  if (sessionState === "error") return <main className="app-loading is-error"><div className="brand-mark">!</div><strong>{bootError}</strong><button onClick={() => window.location.reload()}>重新连接</button></main>;
  if (sessionState === "anonymous") return <AuthScreen onAuthenticate={authenticate} />;
  if (!user || !workspace) return null;

  const pageActions = { onDuplicate: duplicateItem, onMove: showMove, onDelete: deleteItem, onBatchDelete: requestBatchDelete, onBatchPermanentDelete: requestBatchPermanentDelete, onHistory: showHistory, onRestore: restoreTrashItem, onPermanentDelete: requestPermanentDelete };
  const openingDocument = openingDocumentId ? [...documents, ...sharedDocuments, ...recentDocuments].find((item) => item.id === openingDocumentId) : null;
  return (
    <main className={shellClass}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} documents={documents} activeDocumentId={activeDocument?.id} openingDocumentId={openingDocumentId} onOpenDocument={openDocument} workspace={workspace} user={user} onLogout={logout} section={section} onNavigate={navigate} onOpenFolder={(folderId) => { setCurrentFolderId(folderId); navigate("space"); }} onSearch={api.searchDocuments} onMove={showMove} onDuplicate={duplicateItem} onDelete={deleteItem} onUpdatePublicId={updateCurrentPublicId} appearanceTheme={appearanceTheme} glassEnabled={glassEnabled} onAppearanceTheme={setAppearanceTheme} onGlassEnabled={setGlassEnabled} />
      <section className="workspace">
        {openingDocumentId && <ContentOpenLoading document={openingDocument} />}
        {section !== "document" && saveLabel && <div className="save-toast library-save-toast"><Check /> {saveLabel}</div>}
        {section === "document" && activeDocument ? <>
          <Topbar onToggleSidebar={() => setSidebarCollapsed((value) => !value)} document={activeDocument} saveLabel={saveLabel} onShare={showShare} onPublish={requestPublish} publishing={pendingActions.has(`publish:${activeDocument.id}`) || pendingActions.has(`unpublish:${activeDocument.id}`)} onDuplicate={() => duplicateItem(activeDocument)} onMove={() => showMove(activeDocument)} onDelete={() => deleteItem(activeDocument)} onHistory={() => mode === "mindmap" ? showMindMapHistory(activeDocument, activeMindMapIdRef.current) : showHistory(activeDocument)} />
          {saveLabel && !["已自动保存", "导图已保存"].includes(saveLabel) && <div className="save-toast"><Check /> {saveLabel}</div>}
          {mode === "document" ? <DocumentEditor document={activeDocument} user={user} insertingMindMap={pendingActions.has(`insert-map:${activeDocument.id}`)} onInsertMindMap={insertMindMap} mindMapActions={mindMapActions} onTitleChange={(title) => updateActiveDocument({ title })} onContentChange={(content) => updateActiveDocument({ content })} /> : mode === "gantt" ? <GanttEditor document={activeDocument} onTitleChange={(title) => updateActiveDocument({ title })} onContentChange={(content) => updateActiveDocument({ content })} /> : mode === "spreadsheet" ? <SpreadsheetEditor document={activeDocument} onTitleChange={(title) => updateActiveDocument({ title })} onContentChange={(content) => updateActiveDocument({ content })} /> : <MindMap key={activeDocument.id} title={activeMindMapTitle} nodes={nodes} edges={edges} layoutStyle={mapLayoutStyle} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onAddChild={addMapChild} onAddSibling={addMapSibling} onRename={renameMapNode} onDelete={deleteMapNode} onPriority={setMapNodePriority} onMarker={setMapNodeMarker} onTextStyle={setMapNodeTextStyle} onNodeResize={resizeMapNode} onTheme={applyMapTheme} onLayout={layoutMap} onLayoutStyle={applyMapLayoutStyle} onExport={exportMap} onTitleChange={changeMindMapTitle} onBack={() => { activeDocument.type === "mindmap" ? navigate("space") : setMode("document"); }} backLabel={activeDocument.type === "mindmap" ? "返回空间" : "返回文档"} readOnly={activeDocument.access_role === "viewer"} />}
        </> : <WorkspacePages section={section} documents={documents} sharedDocuments={sharedDocuments} recentDocuments={recentDocuments} trashedDocuments={trashedDocuments} currentFolderId={currentFolderId} openingDocumentId={openingDocumentId} onFolderChange={(folderId) => { setCurrentFolderId(folderId); setSection("space"); }} onOpenDocument={openDocument} onCreateDocument={(parentId) => createItem("document", parentId)} onCreateMindMap={(parentId) => createItem("mindmap", parentId)} onCreateGantt={(parentId) => createItem("gantt", parentId)} onCreateSpreadsheet={(parentId) => createItem("spreadsheet", parentId)} onCreateFolder={(parentId) => createItem("folder", parentId)} creatingDocument={pendingActions.has(`create:document:${section === "space" && currentFolderId ? currentFolderId : "root"}`)} creatingMindMap={pendingActions.has(`create:mindmap:${section === "space" && currentFolderId ? currentFolderId : "root"}`)} creatingGantt={pendingActions.has(`create:gantt:${section === "space" && currentFolderId ? currentFolderId : "root"}`)} creatingSpreadsheet={pendingActions.has(`create:spreadsheet:${section === "space" && currentFolderId ? currentFolderId : "root"}`)} restoringIds={new Set([...pendingActions].filter((key) => key.startsWith("restore:")).map((key) => key.slice(8)))} permanentlyDeletingIds={new Set([...pendingActions].filter((key) => key.startsWith("permanent-delete:")).map((key) => key.slice(17)))} {...pageActions} />}
      </section>
      {dialog?.type === "share" && <ShareDialog document={dialog.document} shares={shares} loading={dialogLoading} onClose={() => setDialog(null)} onInvite={inviteShare} onPermission={updateShare} onRemove={removeShare} />}
      {dialog?.type === "move" && <MoveDialog document={dialog.document} folders={documents.filter((item) => item.type === "folder")} loading={pendingActions.has(`move:${dialog.document.id}`)} onClose={() => setDialog(null)} onMove={moveItem} />}
      {dialog?.type === "versions" && <VersionDialog document={dialog.document} versions={versions} loading={[...pendingActions].some((key) => key.startsWith("restore-version:") || key.startsWith("delete-version:"))} onRestore={restoreHistoryVersion} onDelete={deleteHistoryVersion} onClose={() => setDialog(null)} />}
      {dialog?.type === "mind-map-versions" && <VersionDialog document={dialog.document} versions={versions} historyKind="mindmap" loading={[...pendingActions].some((key) => key.startsWith("restore-map-version:") || key.startsWith("delete-map-version:"))} onRestore={restoreMindMapHistoryVersion} onDelete={deleteMindMapHistoryVersion} onClose={() => setDialog(null)} />}
      {dialog?.type === "new-folder" && <TextInputDialog title="新建文件夹" description="文件夹用于整理文档和其他内容。" label="文件夹名称" initialValue="新建文件夹" confirmLabel="创建" loading={pendingActions.has(`create:folder:${dialog.parentId || "root"}`)} onClose={() => setDialog(null)} onConfirm={(title) => createFolder(dialog.parentId, title)} />}
      {dialog?.type === "rename-node" && <TextInputDialog title="编辑节点" description="Enter 保存，Shift + Enter 在主题内换行。" label="节点名称" initialValue={dialog.value} confirmLabel="保存" multiline onClose={() => setDialog(null)} onConfirm={confirmRenameMapNode} />}
      {dialog?.type === "rename-mind-map" && <TextInputDialog title="重命名思维导图" description="名称会同步显示在文档中的概览卡片上。" label="思维导图名称" initialValue={dialog.value} confirmLabel="保存" loading={pendingActions.has(`rename-map:${dialog.mapId}`)} onClose={() => setDialog(null)} onConfirm={confirmRenameEmbeddedMindMap} />}
      {dialog?.type === "delete-mind-map" && <ConfirmDialog title="删除思维导图" description={`确定删除「${dialog.title}」吗？导图数据和文档中的概览卡片都会被移除，且无法恢复。`} confirmLabel="删除导图" danger loading={pendingActions.has(`delete-map:${dialog.mapId}`)} onClose={() => setDialog(null)} onConfirm={confirmDeleteEmbeddedMindMap} />}
      {dialog?.type === "delete" && <ConfirmDialog title="移到回收站" description={`确定移除「${dialog.document.title}」吗？`} confirmLabel="移到回收站" danger loading={pendingActions.has(`delete:${dialog.document.id}`)} onClose={() => setDialog(null)} onConfirm={confirmDeleteItem} />}
      {dialog?.type === "batch-delete" && <ConfirmDialog title="批量移到回收站" description={`确定移除选中的 ${dialog.documents.length} 项内容吗？7 天内可以恢复。`} confirmLabel={`移除 ${dialog.documents.length} 项`} danger loading={pendingActions.has(`batch-delete:${dialog.documents.map((item) => item.id).sort().join(":")}`)} onClose={() => setDialog(null)} onConfirm={confirmBatchDelete} />}
      {dialog?.type === "permanent-delete" && <ConfirmDialog title="永久删除" description={`「${dialog.document.title}」将从数据库和文件存储中彻底删除，无法恢复。`} confirmLabel="永久删除" danger loading={pendingActions.has(`permanent-delete:${dialog.document.id}`)} onClose={() => setDialog(null)} onConfirm={confirmPermanentDelete} />}
      {dialog?.type === "batch-permanent-delete" && <ConfirmDialog title="批量永久删除" description={`选中的 ${dialog.documents.length} 项内容将从数据库和文件存储中彻底删除，无法恢复。`} confirmLabel={`永久删除 ${dialog.documents.length} 项`} danger loading={pendingActions.has(`batch-permanent-delete:${dialog.documents.map((item) => item.id).sort().join(":")}`)} onClose={() => setDialog(null)} onConfirm={confirmBatchPermanentDelete} />}
      {dialog?.type === "unpublish" && <ConfirmDialog title="取消发布" description={`「${dialog.document.title}」将不再出现在公开前台，但仍保留在你的空间中。`} confirmLabel="取消发布" loading={pendingActions.has(`unpublish:${dialog.document.id}`)} onClose={() => setDialog(null)} onConfirm={confirmUnpublish} />}
    </main>
  );
}
