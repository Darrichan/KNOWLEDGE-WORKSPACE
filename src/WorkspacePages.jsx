import { useEffect, useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  ChartBarHorizontal,
  ClockCounterClockwise,
  DotsThree,
  FileText,
  Folder,
  FolderOpen,
  House,
  MagnifyingGlass,
  MapTrifold,
  Plus,
  SortAscending,
  SpinnerGap,
  Table,
  Trash,
  Users,
} from "@phosphor-icons/react";

const sectionCopy = {
  home: { icon: House, eyebrow: "工作台", title: "首页", description: "继续最近的工作，或创建新的知识内容。" },
  space: { icon: FolderOpen, eyebrow: "个人内容", title: "我的空间", description: "用文件夹管理你创建的文档和知识结构。" },
  shared: { icon: Users, eyebrow: "协作内容", title: "与我共享", description: "查看其他成员邀请你阅读或编辑的文档。" },
  recent: { icon: ClockCounterClockwise, eyebrow: "访问记录", title: "最近浏览", description: "按最近打开时间查找你访问过的内容。" },
  trash: { icon: Trash, eyebrow: "内容安全", title: "回收站", description: "删除的内容保留 7 天，期间可以恢复或永久删除。" },
};

function formatTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  const delta = Date.now() - date.getTime();
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function remainingDays(deletedAt) {
  if (!deletedAt) return 7;
  const elapsed = Math.max(0, Date.now() - new Date(deletedAt).getTime());
  return Math.max(0, 7 - Math.floor(elapsed / 86_400_000));
}

function NewContentMenu({ currentFolderId, creatingDocument, creatingMindMap, creatingGantt, creatingSpreadsheet, onCreateDocument, onCreateMindMap, onCreateGantt, onCreateSpreadsheet, onCreateFolder }) {
  const choose = (event, action) => {
    action(currentFolderId);
    event.currentTarget.closest("details")?.removeAttribute("open");
  };
  return (
    <details className="new-content-menu">
      <summary><Plus weight="bold" /> 新建 <CaretDown /></summary>
      <div>
        <button disabled={creatingDocument} onClick={(event) => choose(event, onCreateDocument)}><FileText /><span><strong>{creatingDocument ? "创建中…" : "文档"}</strong><small>开始撰写内容</small></span></button>
        <button disabled={creatingMindMap} onClick={(event) => choose(event, onCreateMindMap)}><MapTrifold /><span><strong>{creatingMindMap ? "创建中…" : "思维导图"}</strong><small>独立梳理主题分支</small></span></button>
        <button disabled={creatingGantt} onClick={(event) => choose(event, onCreateGantt)}><ChartBarHorizontal /><span><strong>{creatingGantt ? "创建中…" : "甘特图"}</strong><small>管理任务、日期与进度</small></span></button>
        <button disabled={creatingSpreadsheet} onClick={(event) => choose(event, onCreateSpreadsheet)}><Table /><span><strong>{creatingSpreadsheet ? "创建中…" : "表格"}</strong><small>编辑行列与结构化数据</small></span></button>
        <button onClick={(event) => choose(event, onCreateFolder)}><Folder /><span><strong>文件夹</strong><small>整理空间内容</small></span></button>
        <p>所有内容类型统一从这里创建</p>
      </div>
    </details>
  );
}

function DocumentRow({ document, selectable, selected, openingDocumentId, onSelect, onOpen, onDuplicate, onMove, onDelete, onHistory }) {
  const isFolder = document.type === "folder";
  const isOwner = document.access_role === "owner";
  const Icon = isFolder ? Folder : document.type === "mindmap" ? MapTrifold : document.type === "gantt" ? ChartBarHorizontal : document.type === "spreadsheet" ? Table : FileText;
  const summary = isFolder ? "文件夹" : document.type === "gantt" ? `甘特图 · ${document.content?.tasks?.length || 0} 项任务` : document.type === "spreadsheet" ? `表格 · ${document.content?.rows?.length || 0} 行` : document.plain_text || "暂无正文内容";
  return (
    <div className={`library-row ${selectable ? "has-selection" : ""}`} role="row">
      {selectable && <label className="library-select"><input type="checkbox" checked={selected} onChange={(event) => onSelect(document.id, event.target.checked)} aria-label={`选择${document.title}`} /></label>}
      <button className="library-name" disabled={!isFolder && Boolean(openingDocumentId)} onClick={() => onOpen(document)}>
        <span className={`library-file-icon ${isFolder ? "is-folder" : ""}`}>{openingDocumentId === document.id ? <SpinnerGap className="loading-spinner" /> : <Icon weight="fill" />}</span>
        <span><strong>{openingDocumentId === document.id ? "打开中…" : document.title}</strong><small>{summary}</small></span>
      </button>
      <span className="library-owner">{document.owner_name || "我"}</span>
      <span className="library-role">{document.access_role === "editor" ? "可编辑" : document.access_role === "viewer" ? "可阅读" : "所有者"}</span>
      <span className="library-time">{formatTime(document.last_viewed_at || document.updated_at)}</span>
      <div className="library-row-actions">
        {isOwner && <button className="library-move-action" onClick={() => onMove(document)}><Folder /> 移动</button>}
        <details className="row-actions">
          <summary aria-label={`${document.title}的更多操作`}><DotsThree /></summary>
          <div>
            {!isFolder && <button onClick={() => onHistory(document)}>版本记录</button>}
            {isOwner && <button onClick={() => onMove(document)}>移动到…</button>}
            {isOwner && <button onClick={() => onDuplicate(document)}>创建副本</button>}
            {isOwner && <button className="danger" onClick={() => onDelete(document)}>移到回收站</button>}
          </div>
        </details>
      </div>
    </div>
  );
}

function DocumentTable({ documents, emptyText, actions, selectable, selectedIds, openingDocumentId, onSelect, onSelectAll }) {
  if (documents.length === 0) {
    return <div className="library-empty"><MagnifyingGlass /><strong>{emptyText}</strong><span>创建内容，或使用文档右侧的“移动”将内容整理到文件夹。</span></div>;
  }
  const allSelected = selectable && documents.every((document) => selectedIds.has(document.id));
  return (
    <div className={`library-table ${selectable ? "is-selectable" : ""}`} role="table" aria-label="文档列表">
      <div className="library-table-head" role="row">
        {selectable && <label className="library-select"><input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} aria-label="选择当前列表全部内容" /></label>}
        <span>名称</span><span>所有者</span><span>权限</span><span>最近更新</span><span>操作</span>
      </div>
      {documents.map((document) => <DocumentRow key={document.id} document={document} selectable={selectable} selected={selectedIds.has(document.id)} openingDocumentId={openingDocumentId} onSelect={onSelect} {...actions} />)}
    </div>
  );
}

function TrashTable({ documents, restoringIds, deletingIds, selectedIds, onSelect, onSelectAll, onRestore, onPermanentDelete }) {
  if (documents.length === 0) {
    return <div className="library-empty"><Trash /><strong>回收站是空的</strong><span>移到回收站的内容会在这里保留 7 天。</span></div>;
  }
  const allSelected = documents.every((document) => selectedIds.has(document.id));
  return (
    <div className="trash-list">
      <div className="trash-table-head" role="row">
        <label className="library-select"><input type="checkbox" checked={allSelected} onChange={(event) => onSelectAll(event.target.checked)} aria-label="选择回收站全部内容" /></label>
        <span aria-hidden="true" /><span>名称</span><span>还原</span><span>操作</span>
      </div>
      {documents.map((document) => {
        const Icon = document.type === "folder" ? Folder : document.type === "mindmap" ? MapTrifold : document.type === "gantt" ? ChartBarHorizontal : document.type === "spreadsheet" ? Table : FileText;
        const restoring = restoringIds.has(document.id);
        const deleting = deletingIds.has(document.id);
        return <div className="trash-row" key={document.id}>
          <label className="library-select"><input type="checkbox" checked={selectedIds.has(document.id)} onChange={(event) => onSelect(document.id, event.target.checked)} aria-label={`选择${document.title}`} /></label>
          <span className="library-file-icon"><Icon weight="fill" /></span>
          <span><strong>{document.title}</strong><small>{formatTime(document.deleted_at)}删除 · 剩余 {remainingDays(document.deleted_at)} 天</small></span>
          <button disabled={restoring || deleting} onClick={() => onRestore(document)}>{restoring ? "恢复中…" : "还原"}</button>
          <button disabled={restoring || deleting} className="danger" onClick={() => onPermanentDelete(document)}>{deleting ? "删除中…" : "永久删除"}</button>
        </div>;
      })}
    </div>
  );
}

export function WorkspacePages({
  section,
  documents,
  sharedDocuments,
  recentDocuments,
  trashedDocuments,
  currentFolderId,
  openingDocumentId = null,
  onFolderChange,
  onOpenDocument,
  onCreateDocument,
  onCreateMindMap,
  onCreateGantt,
  onCreateSpreadsheet,
  onCreateFolder,
  creatingDocument = false,
  creatingMindMap = false,
  creatingGantt = false,
  creatingSpreadsheet = false,
  onDuplicate,
  onMove,
  onDelete,
  onBatchDelete,
  onBatchPermanentDelete,
  onHistory,
  onRestore,
  onPermanentDelete,
  restoringIds,
  permanentlyDeletingIds,
}) {
  const [sort, setSort] = useState("updated");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const copy = sectionCopy[section] || sectionCopy.home;
  const SectionIcon = copy.icon;
  const folders = documents.filter((item) => item.type === "folder");
  const currentFolder = folders.find((item) => item.id === currentFolderId);
  const folderPath = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const path = [];
    const visited = new Set();
    let cursor = currentFolder;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      path.unshift(cursor);
      cursor = byId.get(cursor.parent_id);
    }
    return path;
  }, [currentFolder, folders]);
  const spaceSelectable = section === "space";
  const trashSelectable = section === "trash";

  const baseItems = useMemo(() => {
    if (section === "shared") return sharedDocuments;
    if (section === "recent") return recentDocuments;
    if (section === "trash") return trashedDocuments;
    if (section === "home") return recentDocuments.slice(0, 8);
    return documents.filter((item) => item.parent_id === currentFolderId);
  }, [currentFolderId, documents, recentDocuments, section, sharedDocuments, trashedDocuments]);

  const visibleItems = useMemo(() => [...baseItems].sort((left, right) => {
    if (sort === "name") return left.title.localeCompare(right.title, "zh-CN");
    return new Date(right.deleted_at || right.last_viewed_at || right.updated_at) - new Date(left.deleted_at || left.last_viewed_at || left.updated_at);
  }), [baseItems, sort]);

  useEffect(() => {
    const validIds = new Set(visibleItems.map((item) => item.id));
    setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [visibleItems]);

  const open = (document) => {
    if (document.type === "folder") onFolderChange(document.id);
    else onOpenDocument(document.id);
  };
  const actions = { onOpen: open, onDuplicate, onMove, onDelete, onHistory };
  const selectedDocuments = visibleItems.filter((document) => selectedIds.has(document.id));

  return (
    <div className="library-page">
      <header className="library-header">
        <span className="library-header-icon"><SectionIcon weight="fill" /></span>
        <div><small>{copy.eyebrow}</small><h1>{copy.title}</h1><p>{copy.description}</p></div>
        {(section === "home" || section === "space") && <div className="library-header-actions"><NewContentMenu currentFolderId={section === "space" ? currentFolderId : null} creatingDocument={creatingDocument} creatingMindMap={creatingMindMap} creatingGantt={creatingGantt} creatingSpreadsheet={creatingSpreadsheet} onCreateDocument={onCreateDocument} onCreateMindMap={onCreateMindMap} onCreateGantt={onCreateGantt} onCreateSpreadsheet={onCreateSpreadsheet} onCreateFolder={onCreateFolder} /></div>}
      </header>

      {section === "space" && <nav className="folder-breadcrumb" aria-label="文件夹路径"><button onClick={() => onFolderChange(null)}>我的空间</button>{folderPath.map((folder, index) => <span className="folder-crumb" key={folder.id}><CaretRight /><button aria-current={index === folderPath.length - 1 ? "page" : undefined} onClick={() => onFolderChange(folder.id)}>{folder.title}</button></span>)}</nav>}

      <section className="library-content-card">
        <div className="library-content-heading">
          <div><strong>{section === "home" ? "最近打开" : section === "space" ? currentFolder?.title || copy.title : copy.title}</strong><span>{visibleItems.length} 项</span></div>
          <button onClick={() => setSort(sort === "updated" ? "name" : "updated")}><SortAscending /> {sort === "updated" ? "按时间" : "按名称"}</button>
        </div>
        {spaceSelectable && selectedDocuments.length > 0 && <div className="library-bulk-bar"><span>已选择 {selectedDocuments.length} 项</span><button onClick={() => onBatchDelete(selectedDocuments)}><Trash /> 批量移到回收站</button></div>}
        {trashSelectable && selectedDocuments.length > 0 && <div className="library-bulk-bar is-danger"><span>已选择 {selectedDocuments.length} 项</span><button onClick={() => onBatchPermanentDelete(selectedDocuments)}><Trash /> 批量永久删除</button></div>}
        {section === "trash" ? <TrashTable documents={visibleItems} restoringIds={restoringIds} deletingIds={permanentlyDeletingIds} selectedIds={selectedIds} onSelect={(id, checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; })} onSelectAll={(checked) => setSelectedIds(checked ? new Set(visibleItems.map((item) => item.id)) : new Set())} onRestore={onRestore} onPermanentDelete={onPermanentDelete} /> : <DocumentTable documents={visibleItems} emptyText={section === "shared" ? "还没有共享给你的文档" : section === "recent" ? "还没有浏览记录" : "这里还是空的"} actions={actions} selectable={spaceSelectable} selectedIds={selectedIds} openingDocumentId={openingDocumentId} onSelect={(id, checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; })} onSelectAll={(checked) => setSelectedIds(checked ? new Set(visibleItems.map((item) => item.id)) : new Set())} />}
      </section>
    </div>
  );
}
