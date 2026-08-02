import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import {
  ArrowRight,
  Copy,
  DotsThree,
  DotsSixVertical,
  MapTrifold,
  NotePencil,
  Trash,
} from "@phosphor-icons/react";

function MindMapBlockView({ node, editor, getPos, updateAttributes, deleteNode, extension }) {
  const { mapId, title, nodeCount, previewLabels = [] } = node.attrs;
  const actions = extension.options.actions || {};
  const readOnly = !editor.isEditable;

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const openMap = (event) => {
    stop(event);
    actions.onOpen?.({ mapId, updateAttributes });
  };

  const renameMap = (event) => {
    stop(event);
    actions.onRename?.({ mapId, title, updateAttributes });
  };

  const duplicateMap = async (event) => {
    stop(event);
    const duplicate = await actions.onDuplicate?.(mapId);
    if (!duplicate) return;
    const position = typeof getPos === "function" ? getPos() + node.nodeSize : null;
    if (position == null) return;
    editor
      .chain()
      .focus()
      .insertContentAt(position, {
        type: "mindMapBlock",
        attrs: {
          mapId: duplicate.id,
          title: duplicate.title,
          nodeCount: duplicate.graph?.nodes?.length || 1,
          previewLabels: (duplicate.graph?.nodes || []).slice(0, 5).map((item) => item.data?.label || "新主题"),
        },
      })
      .run();
  };

  const removeMap = (event) => {
    stop(event);
    actions.onDelete?.({ mapId, title, deleteNode });
  };

  return (
    <NodeViewWrapper className="mind-map-block" data-map-id={mapId}>
      {!readOnly && <button className="mind-map-drag-handle" type="button" data-drag-handle aria-label="拖动思维导图" data-tooltip="拖动调整位置"><DotsSixVertical /></button>}
      <button className="mind-map-block-main" type="button" onClick={openMap}>
        <span className="mind-map-block-heading"><span className="mind-map-block-icon"><MapTrifold weight="fill" /></span><span><strong>{title || "未命名思维导图"}</strong><small>{nodeCount || 1} 个主题 · 点击进入编辑</small></span><ArrowRight /></span>
        <span className="mind-map-block-preview">
          <i className="mind-map-preview-root">{previewLabels[0] || title || "中心主题"}</i>
          <i className="mind-map-preview-trunk" />
          {(previewLabels.slice(1, 5).length ? previewLabels.slice(1, 5) : ["添加分支"]).map((label, index) => <i className={`mind-map-preview-topic topic-${index + 1}`} key={`${label}-${index}`}>{label}</i>)}
        </span>
      </button>
      {!readOnly && <details className="mind-map-block-menu" onClick={(event) => event.stopPropagation()}>
        <summary aria-label="思维导图快捷操作" data-tooltip="更多操作"><DotsThree /></summary>
        <div>
          <button type="button" onClick={openMap}><MapTrifold />打开编辑</button>
          <button type="button" onClick={renameMap}><NotePencil />重命名</button>
          <button type="button" onClick={duplicateMap}><Copy />创建副本</button>
          <button type="button" className="danger" onClick={removeMap}><Trash />删除导图</button>
        </div>
      </details>}
    </NodeViewWrapper>
  );
}

export const MindMapBlock = Node.create({
  name: "mindMapBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { actions: {} };
  },

  addAttributes() {
    return {
      mapId: { default: null, parseHTML: (element) => element.dataset.mapId },
      title: { default: "未命名思维导图", parseHTML: (element) => element.dataset.title },
      nodeCount: { default: 1, parseHTML: (element) => Number(element.dataset.nodeCount || 1) },
      previewLabels: { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-mind-map-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-mind-map-block": "true",
        "data-map-id": HTMLAttributes.mapId,
        "data-title": HTMLAttributes.title,
        "data-node-count": HTMLAttributes.nodeCount,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MindMapBlockView);
  },
});
