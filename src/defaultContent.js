export const defaultDocumentContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "构建一个由文档、可视化思考与智能体共同驱动的知识工作台，让复杂想法更快变成清晰方案。" }],
    },
    {
      type: "blockquote",
      content: [{
        type: "paragraph",
        content: [{ type: "text", marks: [{ type: "bold" }], text: "本季度重点：" }, { type: "text", text: "完成编辑器与思维导图双向联动，并验证智能体直接操作内容的体验。" }],
      }],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "项目目标" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "面向需要持续整理知识的产品、研究与内容团队，提供一个可以独立部署、数据完全自主掌控的协作空间。" }],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "产品原则" }] },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "内容优先：" }, { type: "text", text: "界面克制，让注意力始终落在正文。" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "结构同源：" }, { type: "text", text: "文章标题层级与导图节点共享同一份数据。" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "人工可控：" }, { type: "text", text: "智能体执行修改前，清楚展示动作与影响。" }] }] },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "里程碑" }] },
    {
      type: "orderedList",
      attrs: { start: 1, type: null },
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "完成编辑器核心交互" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "打通文章与导图结构" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "接入可配置的大模型服务" }] }] },
      ],
    },
  ],
};

export const blankDocumentContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
};

export function cloneDocumentContent(content = defaultDocumentContent) {
  return JSON.parse(JSON.stringify(content));
}
