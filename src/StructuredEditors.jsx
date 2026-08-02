import { useEffect, useMemo, useRef, useState } from "react";
import { ChartBarHorizontal, Copy, Export, Plus, Scissors, Table, TextAlignCenter, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextStrikethrough, TextUnderline, Trash } from "@phosphor-icons/react";

const DAY_MS = 86400000;
const isoDay = (offset = 0) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const dayTime = (value) => value ? new Date(`${value}T12:00:00`).getTime() : NaN;
const shiftDay = (value, offset) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const formatDay = (value) => {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};
const parseClipboardGrid = (value) => String(value || "").replace(/\r/g, "").split("\n").filter((line, index, lines) => line || index < lines.length - 1).map((line) => line.split("\t"));
const spreadsheetSeriesValue = (values, offset) => {
  const normalized = values.map((value) => String(value ?? ""));
  const numbers = normalized.map(Number);
  if (normalized.length >= 2 && numbers.every((value) => Number.isFinite(value))) {
    const step = numbers[numbers.length - 1] - numbers[numbers.length - 2];
    return String(numbers[numbers.length - 1] + step * (offset + 1));
  }
  const dates = normalized.map((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayTime(value) : NaN);
  if (dates.every(Number.isFinite) && dates.length) {
    const step = dates.length >= 2 ? Math.round((dates[dates.length - 1] - dates[dates.length - 2]) / DAY_MS) : 1;
    return shiftDay(normalized[normalized.length - 1], step * (offset + 1));
  }
  const trailingNumber = normalized.length === 1 && normalized[0].match(/^(.*?)(\d+)$/);
  if (trailingNumber) return `${trailingNumber[1]}${Number(trailingNumber[2]) + offset + 1}`;
  return normalized[offset % Math.max(1, normalized.length)] || "";
};

const blankGanttTask = () => ({ id: crypto.randomUUID(), name: "", start: "", end: "", progress: 0 });

export const createInitialGanttContent = () => ({
  type: "gantt",
  tasks: [blankGanttTask()],
});

export const createInitialSpreadsheetContent = () => ({
  type: "spreadsheet",
  excel_mode: true,
  columns: Array(8).fill(""),
  rows: Array.from({ length: 20 }, () => Array(8).fill("")),
  formats: {},
});

function StructuredHeader({ icon: Icon, kind, document, readOnly, onTitleChange, children }) {
  return <header className="structured-header"><div><Icon weight="fill" /><span>{kind}</span><input disabled={readOnly} value={document.title} onChange={(event) => onTitleChange(event.target.value)} /></div>{children}</header>;
}

export function GanttEditor({ document, onTitleChange, onContentChange }) {
  const readOnly = document.access_role === "viewer";
  const tasks = document.content?.tasks || [];
  const updateTask = (id, patch) => onContentChange({ type: "gantt", tasks: tasks.map((task) => task.id === id ? { ...task, ...patch } : task) });
  const addTask = () => onContentChange({ type: "gantt", tasks: [...tasks, blankGanttTask()] });
  const removeTask = (id) => onContentChange({ type: "gantt", tasks: tasks.filter((task) => task.id !== id) });

  const datedValues = tasks.flatMap((task) => [task.start, task.end]).filter(Boolean).map(dayTime).filter(Number.isFinite);
  const today = dayTime(isoDay());
  const timelineStartTime = datedValues.length ? Math.min(...datedValues, today) : today;
  const latestTaskTime = datedValues.length ? Math.max(...datedValues) : today;
  const timelineEndTime = Math.max(latestTaskTime, timelineStartTime + 13 * DAY_MS);
  const timelineStart = new Date(timelineStartTime).toISOString().slice(0, 10);
  const dayCount = Math.round((timelineEndTime - timelineStartTime) / DAY_MS) + 1;
  const days = Array.from({ length: dayCount }, (_, index) => shiftDay(timelineStart, index));
  const axisStyle = { "--gantt-days": dayCount };

  const selectTimelineDay = (task, day) => {
    if (readOnly) return;
    if (!task.start || task.end) {
      updateTask(task.id, { start: day, end: "" });
      return;
    }
    if (dayTime(day) < dayTime(task.start)) updateTask(task.id, { start: day, end: task.start });
    else updateTask(task.id, { end: day });
  };

  return <div className="structured-surface"><StructuredHeader icon={ChartBarHorizontal} kind="甘特图" document={document} readOnly={readOnly} onTitleChange={onTitleChange}><button disabled={readOnly} onClick={addTask}><Plus />新建任务</button></StructuredHeader><div className="gantt-board" style={axisStyle}><div className="gantt-head"><span>任务</span><span>开始</span><span>结束</span><span>进度</span><div className="gantt-axis-head" aria-label="按天时间轴">{days.map((day) => <time key={day} dateTime={day} className={[0, 6].includes(new Date(`${day}T12:00:00`).getDay()) ? "is-weekend" : ""}>{formatDay(day)}</time>)}</div><span /></div>{tasks.map((task) => {
    const startIndex = task.start ? Math.max(0, days.indexOf(task.start)) : -1;
    const endIndex = task.end ? Math.max(startIndex, days.indexOf(task.end)) : startIndex;
    const duration = startIndex >= 0 && endIndex >= startIndex ? endIndex - startIndex + 1 : 0;
    return <div className="gantt-row" key={task.id}><input disabled={readOnly} value={task.name} onChange={(event) => updateTask(task.id, { name: event.target.value })} placeholder="输入任务名称" /><input disabled={readOnly} type="date" value={task.start || ""} onChange={(event) => updateTask(task.id, { start: event.target.value, end: task.end && dayTime(task.end) >= dayTime(event.target.value) ? task.end : "" })} /><input disabled={readOnly} type="date" value={task.end || ""} min={task.start || undefined} onChange={(event) => updateTask(task.id, { end: event.target.value })} /><label><input disabled={readOnly} type="number" min="0" max="100" value={task.progress} onChange={(event) => updateTask(task.id, { progress: Math.min(100, Math.max(0, Number(event.target.value))) })} />%</label><div className="gantt-track" aria-label={`${task.name || "未命名任务"}的按天时间轴`}>
      <div className="gantt-day-grid">{days.map((day, index) => { const inRange = startIndex >= 0 && index >= startIndex && index <= endIndex; return <button type="button" key={day} disabled={readOnly} className={`${index === startIndex ? "is-start" : ""} ${index === endIndex && task.end ? "is-end" : ""} ${inRange ? "is-in-range" : ""}`} onClick={() => selectTimelineDay(task, day)} aria-label={`选择 ${day}`} title={`${day}${index === startIndex ? " · 开始" : index === endIndex && task.end ? " · 结束" : ""}`} />; })}</div>
      {duration > 0 && <i style={{ left: `calc(${startIndex} * (100% / var(--gantt-days)))`, width: `calc(${duration} * (100% / var(--gantt-days)))` }}><b style={{ width: `${task.progress}%` }} /><span>{duration} 天</span></i>}
    </div><button disabled={readOnly} onClick={() => removeTask(task.id)} aria-label={`删除${task.name || "未命名任务"}`}><Trash /></button></div>;
  })}</div></div>;
}

export function SpreadsheetEditor({ document, onTitleChange, onContentChange }) {
  const readOnly = document.access_role === "viewer";
  const legacyColumns = document.content?.columns || [""];
  const storedRows = document.content?.rows || [[]];
  const isExcelMode = Boolean(document.content?.excel_mode);
  const width = Math.max(8, legacyColumns.length, ...storedRows.map((row) => row.length));
  const sourceRows = isExcelMode ? storedRows : [legacyColumns, ...storedRows];
  const [renderedRowCount, setRenderedRowCount] = useState(() => Math.max(100, sourceRows.length));
  const gridRows = [...sourceRows.map((row) => Array.from({ length: width }, (_, index) => row[index] || "")), ...Array.from({ length: Math.max(0, renderedRowCount - sourceRows.length) }, () => Array(width).fill(""))];
  const formats = document.content?.formats || {};
  const [selection, setSelection] = useState({ anchor: { row: 0, column: 0 }, focus: { row: 0, column: 0 } });
  const [clipboardBounds, setClipboardBounds] = useState(null);
  const [operationPreview, setOperationPreview] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const cellRefs = useRef(new Map());
  const selectingRef = useRef(false);
  const clipboardRef = useRef(null);
  const operationRef = useRef(null);
  const operationEndRef = useRef(null);
  const selectedRow = Math.min(selection.focus.row, gridRows.length - 1);
  const selectedColumn = Math.min(selection.focus.column, width - 1);
  const selectionBounds = useMemo(() => ({
    top: Math.min(selection.anchor.row, selection.focus.row),
    bottom: Math.max(selection.anchor.row, selection.focus.row),
    left: Math.min(selection.anchor.column, selection.focus.column),
    right: Math.max(selection.anchor.column, selection.focus.column),
  }), [selection]);
  const selectionCount = (selectionBounds.bottom - selectionBounds.top + 1) * (selectionBounds.right - selectionBounds.left + 1);
  const selectedKey = `${selectedRow}:${selectedColumn}`;
  const selectedFormat = formats[selectedKey] || {};
  const selectedValue = gridRows[selectedRow]?.[selectedColumn] || "";

  useEffect(() => {
    setRenderedRowCount(Math.max(100, sourceRows.length));
  }, [document.id]);

  useEffect(() => {
    const stopSelecting = () => { selectingRef.current = false; operationEndRef.current?.(); operationEndRef.current = null; };
    window.addEventListener("pointerup", stopSelecting);
    window.addEventListener("pointercancel", stopSelecting);
    return () => {
      window.removeEventListener("pointerup", stopSelecting);
      window.removeEventListener("pointercancel", stopSelecting);
    };
  }, []);

  const columnLabel = (index) => {
    let value = index + 1;
    let label = "";
    while (value > 0) { const remainder = (value - 1) % 26; label = String.fromCharCode(65 + remainder) + label; value = Math.floor((value - 1) / 26); }
    return label;
  };
  const saveGrid = (nextRows, nextFormats = formats, nextWidth = width) => onContentChange({ type: "spreadsheet", excel_mode: true, columns: Array(nextWidth).fill(""), rows: nextRows, formats: nextFormats });
  const setCell = (rowIndex, columnIndex, value) => saveGrid(gridRows.map((row, index) => index === rowIndex ? row.map((cell, cellIndex) => cellIndex === columnIndex ? value : cell) : row));
  const isCellSelected = (row, column) => row >= selectionBounds.top && row <= selectionBounds.bottom && column >= selectionBounds.left && column <= selectionBounds.right;
  const focusCell = (row, column, extend = false) => {
    const next = { row: Math.max(0, Math.min(gridRows.length - 1, row)), column: Math.max(0, Math.min(width - 1, column)) };
    setSelection((current) => ({ anchor: extend ? current.anchor : next, focus: next }));
    window.requestAnimationFrame(() => cellRefs.current.get(`${next.row}:${next.column}`)?.focus());
  };
  const startSelection = (event, row, column) => {
    if (event.button !== 0) return;
    const point = { row, column };
    selectingRef.current = true;
    setSelection((current) => ({ anchor: event.shiftKey ? current.anchor : point, focus: point }));
  };
  const extendSelection = (event, row, column) => {
    if (operationRef.current) { operationRef.current.target = { row, column }; setOperationPreview({ kind: operationRef.current.kind, target: { row, column }, source: { ...selectionBounds } }); return; }
    if (!selectingRef.current || event.buttons !== 1) return;
    setSelection((current) => ({ ...current, focus: { row, column } }));
  };
  const clearSelection = () => {
    if (readOnly) return;
    saveGrid(gridRows.map((row, rowIndex) => row.map((cell, columnIndex) => isCellSelected(rowIndex, columnIndex) ? "" : cell)));
  };
  const captureSelection = (mode = "copy") => {
    const rows = gridRows.slice(selectionBounds.top, selectionBounds.bottom + 1).map((row) => row.slice(selectionBounds.left, selectionBounds.right + 1));
    const copiedFormats = {};
    for (let row = selectionBounds.top; row <= selectionBounds.bottom; row += 1) {
      for (let column = selectionBounds.left; column <= selectionBounds.right; column += 1) {
        const format = formats[`${row}:${column}`];
        if (format) copiedFormats[`${row - selectionBounds.top}:${column - selectionBounds.left}`] = { ...format };
      }
    }
    const payload = { mode, rows, formats: copiedFormats, bounds: { ...selectionBounds } };
    clipboardRef.current = payload;
    setClipboardBounds({ ...selectionBounds, mode });
    navigator.clipboard?.writeText(rows.map((row) => row.join("\t")).join("\n")).catch(() => {});
    return payload;
  };
  const pastePayload = (payload, destination = { row: selectedRow, column: selectedColumn }) => {
    if (readOnly || !payload?.rows?.length) return;
    const pasteHeight = payload.rows.length;
    const pasteWidth = Math.max(...payload.rows.map((row) => row.length));
    const nextWidth = Math.max(width, destination.column + pasteWidth);
    const nextHeight = Math.max(gridRows.length, destination.row + pasteHeight);
    const nextRows = Array.from({ length: nextHeight }, (_, row) => Array.from({ length: nextWidth }, (_, column) => gridRows[row]?.[column] || ""));
    const nextFormats = { ...formats };
    if (payload.mode === "cut" && payload.bounds) {
      for (let row = payload.bounds.top; row <= payload.bounds.bottom; row += 1) for (let column = payload.bounds.left; column <= payload.bounds.right; column += 1) {
        if (nextRows[row]) nextRows[row][column] = "";
        delete nextFormats[`${row}:${column}`];
      }
    }
    payload.rows.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
      const targetRow = destination.row + rowOffset;
      const targetColumn = destination.column + columnOffset;
      nextRows[targetRow][targetColumn] = value;
      const sourceFormat = payload.formats?.[`${rowOffset}:${columnOffset}`];
      if (sourceFormat) nextFormats[`${targetRow}:${targetColumn}`] = { ...sourceFormat };
      else delete nextFormats[`${targetRow}:${targetColumn}`];
    }));
    saveGrid(nextRows, nextFormats, nextWidth);
    setRenderedRowCount((count) => Math.max(count, nextHeight));
    setSelection({ anchor: destination, focus: { row: destination.row + pasteHeight - 1, column: destination.column + pasteWidth - 1 } });
    if (payload.mode === "cut") clipboardRef.current = null;
    setClipboardBounds(payload.mode === "cut" ? null : { top: destination.row, bottom: destination.row + pasteHeight - 1, left: destination.column, right: destination.column + pasteWidth - 1, mode: "copy" });
  };
  const pasteFromClipboard = (event) => {
    if (readOnly) return;
    event?.preventDefault();
    const externalRows = parseClipboardGrid(event?.clipboardData?.getData("text/plain"));
    const payload = clipboardRef.current || (externalRows.length ? { mode: "copy", rows: externalRows, formats: {} } : null);
    pastePayload(payload);
  };
  const applyFill = (target) => {
    if (readOnly || !target) return;
    const nextRows = gridRows.map((row) => [...row]);
    const nextFormats = { ...formats };
    if (target.row > selectionBounds.bottom) {
      for (let column = selectionBounds.left; column <= selectionBounds.right; column += 1) {
        const values = nextRows.slice(selectionBounds.top, selectionBounds.bottom + 1).map((row) => row[column]);
        for (let row = selectionBounds.bottom + 1; row <= target.row; row += 1) {
          nextRows[row] ||= Array(width).fill("");
          nextRows[row][column] = spreadsheetSeriesValue(values, row - selectionBounds.bottom - 1);
          const sourceRow = selectionBounds.top + ((row - selectionBounds.bottom - 1) % values.length);
          const sourceFormat = formats[`${sourceRow}:${column}`];
          if (sourceFormat) nextFormats[`${row}:${column}`] = { ...sourceFormat };
        }
      }
      setSelection((current) => ({ anchor: current.anchor, focus: { row: target.row, column: selectionBounds.right } }));
    } else if (target.column > selectionBounds.right) {
      for (let row = selectionBounds.top; row <= selectionBounds.bottom; row += 1) {
        const values = nextRows[row].slice(selectionBounds.left, selectionBounds.right + 1);
        for (let column = selectionBounds.right + 1; column <= target.column; column += 1) {
          nextRows[row][column] = spreadsheetSeriesValue(values, column - selectionBounds.right - 1);
          const sourceColumn = selectionBounds.left + ((column - selectionBounds.right - 1) % values.length);
          const sourceFormat = formats[`${row}:${sourceColumn}`];
          if (sourceFormat) nextFormats[`${row}:${column}`] = { ...sourceFormat };
        }
      }
      setSelection((current) => ({ anchor: current.anchor, focus: { row: selectionBounds.bottom, column: target.column } }));
    }
    saveGrid(nextRows, nextFormats);
  };
  const startRangeOperation = (event, kind) => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    selectingRef.current = false;
    const payload = kind === "move" ? captureSelection(event.ctrlKey || event.metaKey ? "copy" : "cut") : null;
    operationRef.current = { kind, payload, target: { row: selectionBounds.bottom, column: selectionBounds.right } };
    setOperationPreview({ kind, target: { row: selectionBounds.bottom, column: selectionBounds.right }, source: { ...selectionBounds } });
    operationEndRef.current = () => {
      const operation = operationRef.current;
      operationRef.current = null;
      setOperationPreview(null);
      if (!operation) return;
      if (operation.kind === "move") pastePayload(operation.payload, operation.target);
      else applyFill(operation.target);
    };
  };
  const beginCellEdit = (row, column, replacement) => {
    if (readOnly) return;
    const key = `${row}:${column}`;
    if (replacement !== undefined) setCell(row, column, replacement);
    setEditingCell(key);
    window.requestAnimationFrame(() => {
      const input = cellRefs.current.get(key);
      input?.focus();
      const caret = replacement !== undefined ? String(replacement).length : input?.value?.length || 0;
      input?.setSelectionRange(caret, caret);
    });
  };
  const handleCellKeyDown = (event, row, column) => {
    const cellKey = `${row}:${column}`;
    if (editingCell === cellKey) {
      if (event.key === "Escape") { event.preventDefault(); setEditingCell(null); }
      else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); setEditingCell(null); focusCell(row + 1, column); }
      else if (event.key === "Tab") { event.preventDefault(); setEditingCell(null); focusCell(row, column + (event.shiftKey ? -1 : 1)); }
      return;
    }
    if (event.key === "F2") { event.preventDefault(); beginCellEdit(row, column); return; }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); beginCellEdit(row, column, event.key); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") { event.preventDefault(); captureSelection("copy"); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "x") { event.preventDefault(); captureSelection("cut"); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") { event.preventDefault(); applyFormat({ bold: !selectedFormat.bold }); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") { event.preventDefault(); applyFormat({ italic: !selectedFormat.italic }); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u") { event.preventDefault(); applyFormat({ underline: !selectedFormat.underline }); return; }
    if (event.key === "Delete") { event.preventDefault(); clearSelection(); return; }
    if (event.key === "Escape") { clipboardRef.current = null; setClipboardBounds(null); return; }
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [event.shiftKey ? -1 : 1, 0], Tab: [0, event.shiftKey ? -1 : 1] };
    const move = moves[event.key];
    if (move) { event.preventDefault(); focusCell(row + move[0], column + move[1], event.shiftKey && event.key.startsWith("Arrow")); }
  };
  const applyFormat = (patch) => {
    if (readOnly) return;
    const nextFormats = { ...formats };
    for (let row = selectionBounds.top; row <= selectionBounds.bottom; row += 1) {
      for (let column = selectionBounds.left; column <= selectionBounds.right; column += 1) {
        const key = `${row}:${column}`;
        nextFormats[key] = { ...(formats[key] || {}), ...patch };
      }
    }
    saveGrid(gridRows, nextFormats);
  };
  const addRow = () => saveGrid([...gridRows, Array(width).fill("")]);
  const addColumn = () => saveGrid(gridRows.map((row) => [...row, ""]), formats, width + 1);
  const removeSelectedRow = () => {
    if (gridRows.length <= 1) return;
    saveGrid(gridRows.filter((_, index) => index !== selectedRow));
    const nextRow = Math.max(0, selectedRow - (selectedRow === gridRows.length - 1 ? 1 : 0));
    setSelection({ anchor: { row: nextRow, column: selectedColumn }, focus: { row: nextRow, column: selectedColumn } });
  };
  const removeSelectedColumn = () => {
    if (width <= 1) return;
    saveGrid(gridRows.map((row) => row.filter((_, index) => index !== selectedColumn)), formats, width - 1);
    const nextColumn = Math.max(0, selectedColumn - (selectedColumn === width - 1 ? 1 : 0));
    setSelection({ anchor: { row: selectedRow, column: nextColumn }, focus: { row: selectedRow, column: nextColumn } });
  };
  const exportCsv = () => {
    const csv = gridRows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${document.title || "表格"}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const cellStyle = (row, column) => { const format = formats[`${row}:${column}`] || {}; return { fontWeight: format.bold ? 700 : 400, fontStyle: format.italic ? "italic" : "normal", textDecoration: [format.underline ? "underline" : "", format.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none", textAlign: format.align || "left", color: format.color || "#405069", backgroundColor: format.fill || "#fff", fontSize: `${format.fontSize || 13}px`, fontFamily: format.fontFamily || "inherit" }; };
  const selectionName = selectionCount > 1 ? `${columnLabel(selectionBounds.left)}${selectionBounds.top + 1}:${columnLabel(selectionBounds.right)}${selectionBounds.bottom + 1}` : `${columnLabel(selectedColumn)}${selectedRow + 1}`;
  const isClipboardCell = (row, column) => clipboardBounds && row >= clipboardBounds.top && row <= clipboardBounds.bottom && column >= clipboardBounds.left && column <= clipboardBounds.right;
  const isOperationPreviewCell = (row, column) => {
    if (!operationPreview) return false;
    const { source, target, kind } = operationPreview;
    if (kind === "fill") {
      if (target.row > source.bottom) return row >= source.top && row <= target.row && column >= source.left && column <= source.right;
      if (target.column > source.right) return row >= source.top && row <= source.bottom && column >= source.left && column <= target.column;
      return row >= source.top && row <= source.bottom && column >= source.left && column <= source.right;
    }
    const height = source.bottom - source.top;
    const widthOffset = source.right - source.left;
    return row >= target.row && row <= target.row + height && column >= target.column && column <= target.column + widthOffset;
  };
  const growRowsOnScroll = (event) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 320) setRenderedRowCount((count) => count + 100);
  };

  return <div className="structured-surface spreadsheet-workspace">
    <div className="sheet-toolbar" role="toolbar" aria-label="表格工具栏">
      <input className="sheet-document-title" disabled={readOnly} value={document.title} onChange={(event) => onTitleChange(event.target.value)} aria-label="表格标题" />
      <span className="sheet-toolbar-divider" />
      <button disabled={readOnly} onClick={() => captureSelection("cut")} title="剪切 Ctrl/⌘ X"><Scissors /></button><button disabled={readOnly} onClick={() => captureSelection("copy")} title="复制 Ctrl/⌘ C"><Copy /></button><button disabled={readOnly || !clipboardRef.current} onClick={() => pastePayload(clipboardRef.current)} title="粘贴 Ctrl/⌘ V">粘贴</button><span className="sheet-toolbar-divider" />
      <button disabled={readOnly} onClick={addRow}><Plus />行</button><button disabled={readOnly} onClick={addColumn}><Plus />列</button><span className="sheet-toolbar-divider" />
      <select className="sheet-font-family" disabled={readOnly} value={selectedFormat.fontFamily || "inherit"} onChange={(event) => applyFormat({ fontFamily: event.target.value })} aria-label="字体"><option value="inherit">默认字体</option><option value='"Noto Sans SC", sans-serif'>无衬线</option><option value='"Noto Serif SC", serif'>宋体</option><option value='"SFMono-Regular", Consolas, monospace'>等宽</option></select>
      <select className="sheet-font-size" disabled={readOnly} value={selectedFormat.fontSize || 13} onChange={(event) => applyFormat({ fontSize: Number(event.target.value) })} aria-label="字号">{[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map((size) => <option key={size} value={size}>{size}</option>)}</select>
      <button disabled={readOnly} className={selectedFormat.bold ? "active" : ""} onClick={() => applyFormat({ bold: !selectedFormat.bold })} title="加粗"><TextB /></button><button disabled={readOnly} className={selectedFormat.italic ? "active" : ""} onClick={() => applyFormat({ italic: !selectedFormat.italic })} title="斜体"><TextItalic /></button><button disabled={readOnly} className={selectedFormat.underline ? "active" : ""} onClick={() => applyFormat({ underline: !selectedFormat.underline })} title="下划线"><TextUnderline /></button><button disabled={readOnly} className={selectedFormat.strike ? "active" : ""} onClick={() => applyFormat({ strike: !selectedFormat.strike })} title="删除线"><TextStrikethrough /></button>
      <label className="sheet-color-control" title="字体颜色"><span>A</span><input disabled={readOnly} type="color" value={selectedFormat.color || "#405069"} onChange={(event) => applyFormat({ color: event.target.value })} /></label><label className="sheet-color-control fill" title="填充颜色"><span>■</span><input disabled={readOnly} type="color" value={selectedFormat.fill || "#ffffff"} onChange={(event) => applyFormat({ fill: event.target.value })} /></label><span className="sheet-toolbar-divider" />
      <button disabled={readOnly} className={selectedFormat.align === "left" || !selectedFormat.align ? "active" : ""} onClick={() => applyFormat({ align: "left" })} title="左对齐"><TextAlignLeft /></button><button disabled={readOnly} className={selectedFormat.align === "center" ? "active" : ""} onClick={() => applyFormat({ align: "center" })} title="居中"><TextAlignCenter /></button><button disabled={readOnly} className={selectedFormat.align === "right" ? "active" : ""} onClick={() => applyFormat({ align: "right" })} title="右对齐"><TextAlignRight /></button><span className="sheet-toolbar-spacer" />
      <button onClick={exportCsv} title="导出 CSV"><Export /></button><button disabled={readOnly || gridRows.length <= 1} className="danger" onClick={removeSelectedRow}><Trash />删除行</button><button disabled={readOnly || width <= 1} className="danger" onClick={removeSelectedColumn}><Trash />删除列</button>
    </div>
    <div className="sheet-formula-bar"><span className="sheet-name-box">{selectionName}</span><span className="sheet-fx">fx</span><input disabled={readOnly} value={selectedValue} onChange={(event) => setCell(selectedRow, selectedColumn, event.target.value)} aria-label="公式栏" placeholder={selectionCount > 1 ? `已选择 ${selectionCount} 个单元格，输入会修改活动单元格` : "输入值或公式"} /></div>
    <div className="sheet-scroll" onScroll={growRowsOnScroll}><table className="data-sheet excel-sheet"><thead><tr><th className="sheet-corner" onPointerDown={(event) => { if (event.button !== 0) return; setSelection({ anchor: { row: 0, column: 0 }, focus: { row: gridRows.length - 1, column: width - 1 } }); }} />{Array.from({ length: width }, (_, index) => <th key={index} className={index >= selectionBounds.left && index <= selectionBounds.right ? "is-selected" : ""}>{columnLabel(index)}</th>)}</tr></thead><tbody>{gridRows.map((row, rowIndex) => <tr key={rowIndex}><th className={rowIndex >= selectionBounds.top && rowIndex <= selectionBounds.bottom ? "is-selected" : ""}>{rowIndex + 1}</th>{Array.from({ length: width }, (_, columnIndex) => { const inSelection = isCellSelected(rowIndex, columnIndex); const active = selectedRow === rowIndex && selectedColumn === columnIndex; const cellKey = `${rowIndex}:${columnIndex}`; const isEditing = editingCell === cellKey; const selectionTopLeft = rowIndex === selectionBounds.top && columnIndex === selectionBounds.left; const selectionBottomRight = rowIndex === selectionBounds.bottom && columnIndex === selectionBounds.right; return <td key={columnIndex} className={`${inSelection ? "is-in-range" : ""} ${active ? "is-selected" : ""} ${isOperationPreviewCell(rowIndex, columnIndex) ? `is-operation-preview is-${operationPreview.kind}-preview` : ""} ${isClipboardCell(rowIndex, columnIndex) ? `is-clipboard-source is-${clipboardBounds.mode}` : ""}`} style={cellStyle(rowIndex, columnIndex)} onPointerDown={(event) => startSelection(event, rowIndex, columnIndex)} onPointerEnter={(event) => extendSelection(event, rowIndex, columnIndex)}><input ref={(element) => { if (element) cellRefs.current.set(cellKey, element); else cellRefs.current.delete(cellKey); }} className={isEditing ? "is-editing" : ""} disabled={readOnly} readOnly={!isEditing} value={row[columnIndex] || ""} onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)} onDoubleClick={() => beginCellEdit(rowIndex, columnIndex)} onBlur={() => { if (editingCell === cellKey) setEditingCell(null); }} onKeyDown={(event) => handleCellKeyDown(event, rowIndex, columnIndex)} onPaste={pasteFromClipboard} />{selectionTopLeft && inSelection && !readOnly && <button type="button" className="sheet-range-move-handle" title="拖动移动选区·按 Ctrl/⌘ 复制" onPointerDown={(event) => startRangeOperation(event, "move")} />}{selectionBottomRight && inSelection && !readOnly && <button type="button" className="sheet-fill-handle" title="拖拽填充或生成序列" onPointerDown={(event) => startRangeOperation(event, "fill")} />}</td>; })}</tr>)}</tbody></table></div>
    <footer className="sheet-statusbar"><span>工作表 1</span><span>{selectionCount > 1 ? `已选择 ${selectionCount} 个单元格 · ` : ""}{gridRows.length} 行 × {width} 列</span></footer>
  </div>;
}
