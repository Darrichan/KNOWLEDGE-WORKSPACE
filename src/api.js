export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notifyAuthExpired(response) {
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zhiliu:auth-expired"));
  }
}

async function request(path, options = {}) {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    notifyAuthExpired(response);
    const error = payload?.error;
    throw new ApiError(error?.message || "请求失败，请稍后重试", {
      status: response.status,
      code: error?.code,
      details: error?.details,
    });
  }
  return payload;
}

const imageMimeByExtension = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

async function uploadImage(documentId, file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeType = file.type || imageMimeByExtension[extension] || "application/octet-stream";
  const response = await fetch(`/api/v1/documents/${documentId}/assets`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": mimeType,
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    notifyAuthExpired(response);
    const error = payload?.error;
    const fallbackMessage = response.status === 413
      ? "图片超过 20 MB，请压缩后重新上传"
      : response.status === 415
        ? "图片格式不支持，请选择 JPG、PNG、GIF、WebP 或 AVIF"
        : response.status === 401
          ? "登录已过期，请重新登录后上传"
          : response.status >= 500
            ? "图片服务暂时不可用，请稍后重试"
            : "图片上传失败，请重新选择图片";
    throw new ApiError(error?.message || fallbackMessage, {
      status: response.status,
      code: error?.code,
      details: error?.details,
    });
  }
  return payload;
}

export const api = {
  me: () => request("/auth/me"),
  updatePublicId: (publicId) => request("/auth/me/public-id", { method: "PATCH", body: JSON.stringify({ public_id: publicId }) }),
  captchaChallenge: () => request("/auth/captcha/challenge"),
  verifyCaptcha: (payload) => request("/auth/captcha/verify", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  wechatBinding: () => request("/auth/wechat/binding"),
  logout: () => request("/auth/logout", { method: "POST" }),
  listWorkspaces: () => request("/workspaces"),
  listDocuments: (workspaceId) => request(`/workspaces/${workspaceId}/documents`),
  listSharedDocuments: () => request("/documents/shared"),
  listRecentDocuments: (limit = 30) => request(`/documents/recent?limit=${limit}`),
  listTrashedDocuments: () => request("/documents/trash"),
  searchDocuments: (query) => request(`/documents/search?query=${encodeURIComponent(query)}`),
  getDocument: (documentId) => request(`/documents/${documentId}`),
  createDocument: (payload) => request("/documents", { method: "POST", body: JSON.stringify(payload) }),
  updateDocument: (documentId, payload) => request(`/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),
  publishDocument: (documentId) => request(`/documents/${documentId}/publish`, { method: "POST" }),
  unpublishDocument: (documentId) => request(`/documents/${documentId}/publish`, { method: "DELETE" }),
  uploadDocumentImage: uploadImage,
  moveDocument: (documentId, parentId) => request(`/documents/${documentId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ parent_id: parentId }),
  }),
  duplicateDocument: (documentId) => request(`/documents/${documentId}/duplicate`, { method: "POST" }),
  deleteDocument: (documentId) => request(`/documents/${documentId}`, { method: "DELETE" }),
  batchDeleteDocuments: (documentIds) => request("/documents/batch-delete", {
    method: "POST",
    body: JSON.stringify({ document_ids: documentIds }),
  }),
  restoreDocument: (documentId) => request(`/documents/${documentId}/restore`, { method: "POST" }),
  permanentlyDeleteDocument: (documentId) => request(`/documents/${documentId}/permanent`, { method: "DELETE" }),
  batchPermanentlyDeleteDocuments: (documentIds) => request("/documents/trash/batch-delete", {
    method: "POST",
    body: JSON.stringify({ document_ids: documentIds }),
  }),
  listVersions: (documentId) => request(`/documents/${documentId}/versions`),
  restoreVersion: (documentId, versionId) => request(`/documents/${documentId}/versions/${versionId}/restore`, { method: "POST" }),
  deleteVersion: (documentId, versionId) => request(`/documents/${documentId}/versions/${versionId}`, { method: "DELETE" }),
  listShares: (documentId) => request(`/documents/${documentId}/shares`),
  shareDocument: (documentId, payload) => request(`/documents/${documentId}/shares`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  updateShare: (documentId, shareId, permission) => request(`/documents/${documentId}/shares/${shareId}`, {
    method: "PATCH",
    body: JSON.stringify({ permission }),
  }),
  deleteShare: (documentId, shareId) => request(`/documents/${documentId}/shares/${shareId}`, { method: "DELETE" }),
  getMindMap: (documentId) => request(`/documents/${documentId}/mind-map`),
  saveMindMap: (documentId, payload) => request(`/documents/${documentId}/mind-map`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }),
  listMindMaps: (documentId) => request(`/documents/${documentId}/mind-maps`),
  createMindMap: (documentId, payload) => request(`/documents/${documentId}/mind-maps`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  getMindMapById: (documentId, mapId) => request(`/documents/${documentId}/mind-maps/${mapId}`),
  updateMindMap: (documentId, mapId, payload) => request(`/documents/${documentId}/mind-maps/${mapId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }),
  duplicateMindMap: (documentId, mapId) => request(`/documents/${documentId}/mind-maps/${mapId}/duplicate`, { method: "POST" }),
  deleteMindMap: (documentId, mapId) => request(`/documents/${documentId}/mind-maps/${mapId}`, { method: "DELETE" }),
  listMindMapVersions: (documentId, mapId) => request(`/documents/${documentId}/mind-maps/${mapId}/versions`),
  restoreMindMapVersion: (documentId, mapId, versionId) => request(`/documents/${documentId}/mind-maps/${mapId}/versions/${versionId}/restore`, { method: "POST" }),
  deleteMindMapVersion: (documentId, mapId, versionId) => request(`/documents/${documentId}/mind-maps/${mapId}/versions/${versionId}`, { method: "DELETE" }),
};
