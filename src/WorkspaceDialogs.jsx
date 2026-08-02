import { useEffect, useMemo, useState } from "react";
import { CaretDown, ClockCounterClockwise, FileText, Folder, Link, Trash, Users, X } from "@phosphor-icons/react";

export function Modal({ title, description, onClose, children, className = "" }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`workspace-modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button onClick={onClose} aria-label="关闭"><X /></button></header>
        {children}
      </section>
    </div>
  );
}

export function ShareDialog({ document, shares, loading, onClose, onInvite, onPermission, onRemove }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("viewer");
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await onInvite({ email, permission });
      setEmail("");
    } catch (inviteError) {
      setError(inviteError.message || "邀请失败");
    }
  };
  const copyLink = async () => navigator.clipboard.writeText(window.location.href);
  return (
    <Modal title={`分享「${document.title}」`} description="邀请已注册成员，并为每位协作者设置权限。" onClose={onClose} className="share-modal">
      <form className="share-invite" onSubmit={submit}>
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="输入成员邮箱" />
        <label><select value={permission} onChange={(event) => setPermission(event.target.value)}><option value="viewer">可阅读</option><option value="editor">可编辑</option></select><CaretDown /></label>
        <button disabled={loading}><Users /> 邀请</button>
      </form>
      {error && <div className="dialog-error">{error}</div>}
      <div className="share-list-heading"><strong>协作者</strong><span>{shares.length} 人</span></div>
      <div className="share-list">
        {shares.map((share) => (
          <div key={share.id}>
            <span className="collaborator-avatar">{share.display_name.slice(0, 1)}</span>
            <span><strong>{share.display_name}</strong><small>{share.email}</small></span>
            <select value={share.permission} onChange={(event) => onPermission(share.id, event.target.value)}><option value="viewer">可阅读</option><option value="editor">可编辑</option></select>
            <button onClick={() => onRemove(share.id)} aria-label={`移除${share.display_name}`}><Trash /></button>
          </div>
        ))}
        {shares.length === 0 && <p className="share-empty">还没有协作者</p>}
      </div>
      <footer className="share-footer"><div><Link /><span><strong>文档链接</strong><small>只有拥有权限的成员可以访问</small></span></div><button onClick={copyLink}>复制链接</button></footer>
    </Modal>
  );
}

export function MoveDialog({ document, folders, loading = false, onClose, onMove }) {
  const [parentId, setParentId] = useState(document.parent_id || "");
  const folderRows = useMemo(() => {
    const childrenByParent = new Map();
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    folders.forEach((folder) => {
      const parent = folderById.has(folder.parent_id) ? folder.parent_id : null;
      childrenByParent.set(parent, [...(childrenByParent.get(parent) || []), folder]);
    });
    const blocked = new Set([document.id]);
    if (document.type === "folder") {
      const queue = [document.id];
      while (queue.length) {
        const current = queue.shift();
        (childrenByParent.get(current) || []).forEach((child) => {
          if (!blocked.has(child.id)) { blocked.add(child.id); queue.push(child.id); }
        });
      }
    }
    const rows = [];
    const visit = (folder, depth, ancestors) => {
      if (ancestors.has(folder.id)) return;
      if (!blocked.has(folder.id)) rows.push({ folder, depth });
      const nextAncestors = new Set(ancestors).add(folder.id);
      (childrenByParent.get(folder.id) || []).forEach((child) => visit(child, depth + 1, nextAncestors));
    };
    (childrenByParent.get(null) || []).forEach((folder) => visit(folder, 0, new Set()));
    return rows;
  }, [document.id, document.type, folders]);
  return (
    <Modal title="移动文档" description={`为「${document.title}」选择新的位置。`} onClose={onClose} className="compact-modal">
      <div className="move-options">
        <button className={!parentId ? "active" : ""} onClick={() => setParentId("")}><Folder weight="fill" /><span><strong>我的空间</strong><small>根目录</small></span></button>
        {folderRows.map(({ folder, depth }) => (
          <button key={folder.id} style={{ "--folder-depth": depth }} className={parentId === folder.id ? "active" : ""} onClick={() => setParentId(folder.id)}><Folder weight="fill" /><span><strong>{folder.title}</strong><small>{depth === 0 ? "根目录下" : `第 ${depth + 1} 层文件夹`}</small></span></button>
        ))}
      </div>
      <footer className="dialog-footer"><button disabled={loading} onClick={onClose}>取消</button><button disabled={loading} className="primary" onClick={() => onMove(parentId || null)}>{loading ? "移动中…" : "移动到这里"}</button></footer>
    </Modal>
  );
}

const historyBlockTypes = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock"]);

function HistoryInline({ node }) {
  if (!node) return null;
  if (node.type === "hardBreak") return <br />;
  if (node.type !== "text") return (node.content || []).map((child, index) => <HistoryInline key={index} node={child} />);
  const marks = node.marks || [];
  const textStyle = marks.find((mark) => mark.type === "textStyle")?.attrs || {};
  const link = marks.find((mark) => mark.type === "link")?.attrs;
  let content = <span style={{ color: textStyle.color || undefined }}>{node.text}</span>;
  if (marks.some((mark) => mark.type === "code")) content = <code>{content}</code>;
  if (marks.some((mark) => mark.type === "bold")) content = <strong>{content}</strong>;
  if (marks.some((mark) => mark.type === "italic")) content = <em>{content}</em>;
  if (marks.some((mark) => mark.type === "underline")) content = <u>{content}</u>;
  if (marks.some((mark) => mark.type === "strike")) content = <s>{content}</s>;
  if (link?.href) content = <a href={link.href} target="_blank" rel="noreferrer">{content}</a>;
  return content;
}

function HistoryRichNode({ node }) {
  if (!node) return null;
  const children = (node.content || []).map((child, index) => <HistoryRichNode key={index} node={child} />);
  const inline = (node.content || []).map((child, index) => <HistoryInline key={index} node={child} />);
  if (node.type === "text" || node.type === "hardBreak") return <HistoryInline node={node} />;
  if (node.type === "doc") return <>{children}</>;
  if (node.type === "paragraph") return <p>{inline.length ? inline : <br />}</p>;
  if (node.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
    const Heading = `h${level}`;
    return <Heading>{inline}</Heading>;
  }
  if (node.type === "bulletList") return <ul>{children}</ul>;
  if (node.type === "orderedList") return <ol start={node.attrs?.start || 1}>{children}</ol>;
  if (node.type === "listItem") return <li>{children}</li>;
  if (node.type === "taskList") return <ul className="history-task-list">{children}</ul>;
  if (node.type === "taskItem") return <li className={node.attrs?.checked ? "checked" : ""}><span>{node.attrs?.checked ? "✓" : "○"}</span><div>{children}</div></li>;
  if (node.type === "blockquote") return <blockquote>{children}</blockquote>;
  if (node.type === "codeBlock") return <pre data-language={node.attrs?.language || "文本"}><code>{node.content?.map((child) => child.text || "").join("")}</code></pre>;
  if (node.type === "horizontalRule") return <hr />;
  if (node.type === "image" && node.attrs?.src) return <figure><img src={node.attrs.src} alt={node.attrs.alt || "历史版本图片"} /><figcaption>{node.attrs.alt || "图片"}</figcaption></figure>;
  if (node.type === "mindMapBlock") return <div className="history-embed-card"><strong>思维导图</strong><span>{node.attrs?.title || "未命名思维导图"}</span><small>历史快照中的嵌入内容</small></div>;
  return children.length ? <>{children}</> : null;
}

function HistorySnapshot({ content, historyKind }) {
  if (!content) return <div className="history-snapshot-empty">这个版本没有正文内容</div>;
  if (historyKind === "mindmap" || Array.isArray(content.nodes)) {
    const nodes = content.nodes || [];
    const byParent = new Map();
    const incoming = new Map((content.edges || []).map((edge) => [edge.target, edge.source]));
    nodes.forEach((node) => { const parentId = incoming.get(node.id) || null; byParent.set(parentId, [...(byParent.get(parentId) || []), node]); });
    const renderNodes = (parentId = null, depth = 0, visited = new Set()) => (byParent.get(parentId) || []).map((node) => {
      if (visited.has(node.id)) return null;
      const nextVisited = new Set(visited).add(node.id);
      return <div className="history-map-branch" style={{ "--history-depth": depth }} key={node.id}><div><i />{node.data?.priority && <b>P{node.data.priority}</b>}<span>{node.data?.label || "未命名节点"}</span></div>{renderNodes(node.id, depth + 1, nextVisited)}</div>;
    });
    const roots = nodes.filter((node) => !incoming.has(node.id));
    return <div className="history-mindmap-snapshot">{roots.length ? renderNodes() : nodes.map((node) => <div className="history-map-branch" key={node.id}><div><i /><span>{node.data?.label || "未命名节点"}</span></div></div>)}</div>;
  }
  if (content.type === "gantt") return <div className="history-structured-snapshot"><table><thead><tr><th>任务</th><th>开始</th><th>结束</th><th>进度</th></tr></thead><tbody>{(content.tasks || []).map((task, index) => <tr key={task.id || index}><td>{task.name || "未命名任务"}</td><td>{task.start || "—"}</td><td>{task.end || "—"}</td><td>{task.progress || 0}%</td></tr>)}</tbody></table></div>;
  if (content.type === "spreadsheet") {
    const rows = content.rows || [];
    const width = Math.max(content.columns?.length || 0, ...rows.map((row) => row.length), 1);
    return <div className="history-structured-snapshot history-sheet-snapshot"><table><thead><tr><th />{Array.from({ length: width }, (_, index) => <th key={index}>{String.fromCharCode(65 + (index % 26))}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><th>{rowIndex + 1}</th>{Array.from({ length: width }, (_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || ""}</td>)}</tr>)}</tbody></table></div>;
  }
  return <article className="history-rich-snapshot"><HistoryRichNode node={content} /></article>;
}

function extractHistoryLines(content) {
  const lines = [];
  const inlineText = (value) => {
    if (!value) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(inlineText).join("");
    if (typeof value === "object") return `${value.text || ""}${inlineText(value.content || [])}`;
    return "";
  };
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value !== "object") return;
    if (historyBlockTypes.has(value.type)) {
      const text = inlineText(value).trim();
      if (text) lines.push(text);
      return;
    }
    if (value.type === "mindMapBlock" && value.attrs?.title) lines.push(`[思维导图] ${value.attrs.title}`);
    if (value.type === "gantt" && Array.isArray(value.tasks)) value.tasks.forEach((task) => lines.push(`[任务] ${task.name || "未命名"} ${task.start || ""}–${task.end || ""}`.trim()));
    if (value.type === "spreadsheet" && Array.isArray(value.rows)) value.rows.forEach((row) => lines.push(`[表格] ${Array.isArray(row) ? row.join(" | ") : JSON.stringify(row)}`));
    if (Array.isArray(value.nodes)) value.nodes.forEach((node) => { const label = node?.data?.label?.trim(); if (label) lines.push(`[节点] ${label}`); });
    visit(value.content);
  };
  visit(content);
  return lines.slice(0, 240);
}

function diffHistoryVersion(older, newer) {
  const before = extractHistoryLines(older?.content);
  const after = extractHistoryLines(newer?.content);
  const beforeCounts = new Map();
  const afterCounts = new Map();
  before.forEach((line) => beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1));
  after.forEach((line) => afterCounts.set(line, (afterCounts.get(line) || 0) + 1));
  const added = [];
  const deleted = [];
  afterCounts.forEach((count, line) => { for (let index = beforeCounts.get(line) || 0; index < count; index += 1) added.push(line); });
  beforeCounts.forEach((count, line) => { for (let index = afterCounts.get(line) || 0; index < count; index += 1) deleted.push(line); });
  return {
    added,
    deleted,
    titleChanged: older?.title !== newer?.title,
    oldTitle: older?.title,
    newTitle: newer?.title,
  };
}

export function VersionDialog({ document, versions, loading = false, historyKind = "document", onClose, onRestore, onDelete }) {
  const sortedVersions = useMemo(() => {
    const ordered = [...versions].sort((left, right) => right.version - left.version);
    let newerSnapshot = { title: document.title, content: document.content };
    return ordered.filter((version) => {
      const isDuplicate = version.title === newerSnapshot.title && JSON.stringify(version.content) === JSON.stringify(newerSnapshot.content);
      if (!isDuplicate) newerSnapshot = version;
      return !isDuplicate;
    });
  }, [document.content, document.title, versions]);
  const hiddenDuplicateCount = versions.length - sortedVersions.length;
  const [selectedId, setSelectedId] = useState(sortedVersions[0]?.id || null);
  const [confirmAction, setConfirmAction] = useState(null);
  useEffect(() => {
    if (selectedId && sortedVersions.some((version) => version.id === selectedId)) return;
    setSelectedId(sortedVersions[0]?.id || null);
  }, [selectedId, sortedVersions]);
  const selectedIndex = sortedVersions.findIndex((version) => version.id === selectedId);
  const selectedVersion = selectedIndex >= 0 ? sortedVersions[selectedIndex] : null;
  const newerVersion = selectedIndex === 0 ? document : selectedIndex > 0 ? sortedVersions[selectedIndex - 1] : document;
  const changes = useMemo(() => selectedVersion ? diffHistoryVersion(selectedVersion, newerVersion) : null, [newerVersion, selectedVersion]);
  const performConfirmedAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "restore") await onRestore(confirmAction.version);
    else await onDelete(confirmAction.version);
    setConfirmAction(null);
  };
  return (
    <Modal title={historyKind === "mindmap" ? "思维导图编辑历史" : "编辑历史"} description={`查看谁增加、删除或修改了${historyKind === "mindmap" ? "节点" : "内容"}；恢复旧版本会创建一个新版本，不会覆盖后续历史。`} onClose={onClose} className="version-history-modal">
      <div className="version-history-layout">
        <aside className="version-timeline">
          <div className="version-current"><span><FileText weight="fill" /></span><p><strong>当前版本 · v{document.version}</strong><small>{new Date(document.updated_at).toLocaleString("zh-CN")}</small></p></div>
          {sortedVersions.map((version, index) => {
            const next = index === 0 ? document : sortedVersions[index - 1];
            const rowChanges = diffHistoryVersion(version, next);
            return <button key={version.id} className={selectedId === version.id ? "active" : ""} onClick={() => { setSelectedId(version.id); setConfirmAction(null); }}><span><ClockCounterClockwise /></span><p><strong>v{version.version} → v{next.version}</strong><small>{version.actor_name || "未知成员"} · {new Date(version.created_at).toLocaleString("zh-CN")}</small><em><i className="history-added">+{rowChanges.added.length}</i><i className="history-deleted">−{rowChanges.deleted.length}</i>{rowChanges.titleChanged && <i>标题</i>}</em></p></button>;
          })}
          {hiddenDuplicateCount > 0 && <div className="version-collapsed-note">已自动隐藏 {hiddenDuplicateCount} 个无实际变化的重复保存</div>}
          {sortedVersions.length === 0 && <div className="version-empty">还没有可审计的历史版本</div>}
        </aside>
        <section className="version-diff-panel">
          {selectedVersion && changes ? <>
            <header><div><strong>v{selectedVersion.version} 完整内容</strong><small>{selectedVersion.title || "无标题内容"}</small></div><span>历史快照</span></header>
            <div className="history-editor-card"><span className="history-editor-avatar">{(selectedVersion.actor_name || "成员").slice(0, 1)}</span><div><strong>{selectedVersion.actor_name || "未知成员"}</strong><small>{selectedVersion.reason === "restore" ? "执行了版本恢复" : selectedVersion.reason === "interval" ? "自动保存了本次编辑" : "编辑并保存了内容"} · {new Date(selectedVersion.created_at).toLocaleString("zh-CN")}</small></div><em>v{selectedVersion.version} → v{newerVersion.version}</em></div>
            <div className="history-snapshot-scroll"><HistorySnapshot content={selectedVersion.content} historyKind={historyKind} /></div>
            <details className="history-changes-panel">
              <summary><span>查看本次增删明细</span><em><i className="history-added">+{changes.added.length}</i><i className="history-deleted">−{changes.deleted.length}</i>{changes.titleChanged && <i>标题已修改</i>}</em></summary>
              {changes.titleChanged && <div className="history-title-change"><small>标题修改</small><del>{changes.oldTitle}</del><span>→</span><ins>{changes.newTitle}</ins></div>}
              <div className="history-change-list">
                {changes.added.map((line, index) => <div className="added" key={`added-${index}`}><b>+</b><span>{line}</span></div>)}
                {changes.deleted.map((line, index) => <div className="deleted" key={`deleted-${index}`}><b>−</b><span>{line}</span></div>)}
                {changes.added.length === 0 && changes.deleted.length === 0 && !changes.titleChanged && <p>这个版本只包含格式或结构调整，没有可读文本的增删。</p>}
              </div>
            </details>
            {confirmAction ? <div className={`version-action-confirm ${confirmAction.type === "delete" ? "danger" : ""}`}><span>{confirmAction.type === "restore" ? `恢复 v${selectedVersion.version} 后，当前内容会作为新历史保留。` : `确定永久删除历史版本 v${selectedVersion.version}？`}</span><button disabled={loading} onClick={() => setConfirmAction(null)}>取消</button><button disabled={loading} onClick={performConfirmedAction}>{loading ? "处理中…" : "确认"}</button></div> : <footer><button disabled={loading || document.access_role === "viewer"} onClick={() => setConfirmAction({ type: "delete", version: selectedVersion })}><Trash /> 删除此版本</button><button disabled={loading || document.access_role === "viewer"} className="primary" onClick={() => setConfirmAction({ type: "restore", version: selectedVersion })}><ClockCounterClockwise /> 恢复为新版本</button></footer>}
          </> : <div className="version-diff-empty">选择左侧历史版本查看增删内容</div>}
        </section>
      </div>
    </Modal>
  );
}

export function TextInputDialog({ title, description, label, initialValue = "", confirmLabel = "确认", loading = false, multiline = false, onClose, onConfirm }) {
  const [value, setValue] = useState(initialValue);
  const submit = (event) => { event.preventDefault(); if (value.trim()) onConfirm(value.trim()); };
  return (
    <Modal title={title} description={description} onClose={onClose} className="compact-modal">
      <form className="text-input-dialog" onSubmit={submit}>
        <label>{label}{multiline ? <textarea autoFocus rows="3" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (value.trim()) onConfirm(value.trim()); } }} /> : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} />}</label>
        <footer className="dialog-footer"><button type="button" disabled={loading} onClick={onClose}>取消</button><button className="primary" disabled={loading || !value.trim()}>{loading ? "处理中…" : confirmLabel}</button></footer>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ title, description, confirmLabel = "确认", danger = false, loading = false, onClose, onConfirm }) {
  return (
    <Modal title={title} description={description} onClose={onClose} className="compact-modal">
      <div className="confirm-dialog-copy">此操作会立即生效，请确认后继续。</div>
      <footer className="dialog-footer"><button disabled={loading} onClick={onClose}>取消</button><button disabled={loading} className={danger ? "danger-primary" : "primary"} onClick={onConfirm}>{loading ? "处理中…" : confirmLabel}</button></footer>
    </Modal>
  );
}
