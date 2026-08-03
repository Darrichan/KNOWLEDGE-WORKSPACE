# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable product decisions

- This is an independently deployable collaboration product, not a Feishu app or integration.
- The first release focuses on long-form block-style documents, embedded/editable mind maps, and an agent that can understand and modify the current content.
- Chat, meetings, approvals, and other Feishu suite modules are explicitly out of scope for the first release.
- The product name displayed in the interface is `KW`; its full expanded name is `Knowledge Workspace`. Never present `知流` as the product name. The brand direction is a light, restrained future workspace: cloud-white foundations, mist blue as the primary identity color, pale violet for the agent, cool-gray structure, and a pure-white editorial reading canvas. Green is reserved for small semantic success states; avoid dark full-page chrome, loud neon, gradients, and large bright-green surfaces.
- Keep the existing Vite/Sites frontend at the repository root until the API integration is complete. The Python backend lives in `apps/web-service` and uses FastAPI, SQLAlchemy 2, Alembic, and PostgreSQL 16. The local Docker stack is defined in `deploy/compose.yaml`.
- Finish the visible knowledge-workspace business flows before connecting the real AI agent. Visible controls must either perform a coherent action or be explicitly disabled with an explanation; do not leave inert buttons.
- Authentication should use a restrained, single-card light layout. Login requires a modal slider challenge that is verified by the Python backend before credentials are accepted.
- Navigation follows cloud-document semantics: Home summarizes recent work, My Space manages the user's own hierarchy, Shared lists documents explicitly shared with the user, and Recent is ordered by recorded document access time.
- Documents and mind maps are separate content types. Do not place a permanent document/mind-map switch in the top bar, and do not create a mind map for every document. A document may insert multiple draggable mind-map overview blocks at arbitrary positions in its content, while My Space can also create a standalone mind map.
- Editor insertion controls need discoverable keyboard shortcuts. Mutating actions must show loading feedback, debounce continuous edits, reject duplicate in-flight requests, and retain server-side write rate limiting.
- The sidebar document tree must support all root items with its own scrolling region. Every visible three-dot control must open a working move/duplicate/delete menu, and long titles or large document counts must not displace the account footer.
- Creation is exposed through one extensible `新建` menu instead of separate or duplicated document/mind-map cards. The editor likewise uses one `插入` menu so tables and future block types can be added without expanding the toolbar horizontally.
- My Space supports multi-select deletion. Deleted content moves to a database-backed recycle bin, can be restored or permanently deleted, and is automatically purged with stored assets after 7 days.
- Public reading is a separate deployable React + Vite repository, not a package in this project. Authors are addressed by a unique editable public ID (`/@username`), and only explicitly published, non-deleted documents are available through unauthenticated read-only APIs.
