# Notion: public feature and UI reference

Scraped on 2026-11-03 from Notion's public marketing and help pages (notion.com/product, /product/docs, /wikis, /projects, /ai, /calendar, /sites, /pricing, and the help articles on databases, properties, views, relations, sharing, sidebar, writing basics, keyboard shortcuts, automations). Only public pages were read. No Notion code, assets or private APIs were inspected.

Items marked "(not verified from the scrape)" below are common Notion behavior added from general knowledge, not read from a page: Columns, Synced block in the block menu, Map view, Feed view details, page analytics, import and export formats, version history details, suggesting mode details, Trash retention, and the in-app pixel numbers in section 11 other than fonts, colors and radii.

Pages that returned "not found" at the time: `/help/database-views`, `/help/page-history`, `/help/guides/category/database`. Version history, templates and import/export are therefore described from the feature lists on the product pages only.

## 1. Product shape

Notion is one workspace of **pages**. Everything on a page is a **block**. A **database** is a collection of pages, and every row is itself a full page. Docs, wikis and projects are three uses of the same two parts (pages and databases), sold at one price.

Marketing pillars on the product page: capture knowledge (one system of record), find answers (with citations), automate busywork (agents that run 24/7).

## 2. Pages and blocks

Editing tools: a `+` handle and a `⋮⋮` drag handle appear in the left margin on hover; `/` opens the block menu.

`⋮⋮` menu: Turn into, Color, Copy link to block, Duplicate, Move to, Delete, Comment, Suggest edits, Edit with AI, Ask AI, plus word and character count for the selection.

Block catalog, grouped as the `/` menu groups it:

- **Basic:** Text, Page (sub-page), To-do list, Heading 1/2/3, Table (simple), Bulleted list, Numbered list, Toggle list, Quote, Divider, Link to page, Callout (with emoji).
- **Database (inline):** Table, Board, Gallery, List, Calendar views.
- **Media:** Image, Video, Audio, File, Code (many languages), Web bookmark.
- **Embeds:** 500+ apps via `/embed`; named shortcuts for Google Drive, Tweet, GitHub Gist, Google Maps, Framer, Invision, PDF, Figma, Loom, Typeform, CodePen, Whimsical.
- **Advanced:** Inline equation, Button, Breadcrumb, Table of contents, Synced block, Columns, Charts.
- **Inline:** Mention a person, Mention a page, Date or reminder, Emoji (`:name`, custom emoji upload).

Page chrome: emoji icon, cover image, three typefaces (Default, Serif, Mono), Small text, Full width, Lock page, page ••• menu with page word count, Customize page (property visibility, backlinks, comments), Duplicate, Move to, Copy link, Export, Delete.

Selection: drag from margin to select blocks, `Esc` selects the current block, `Shift+click` ranges, partial text selection across blocks, blue drop guides while dragging, `Alt+drag` duplicates, `Tab` and `Shift+Tab` nest and un-nest.

### Markdown shortcuts

`**bold**`, `*italic*`, `` `code` ``, `~strike~`; line starts: `*`/`-`/`+` + space bullet, `[]` to-do, `1.`/`a.`/`i.` numbered, `#`/`##`/`###` headings, `>` toggle, `"` quote, `---` divider.

### @ , [[ , + commands

- `@name` mentions a person (notifies them). `@page` links a page and the link text follows renames. `@today`, `@tomorrow`, `@next Wednesday` insert dates. `@remind <date>` sets a reminder.
- `[[page` and `+page` link a page or create a sub-page, or create a page in another place.

### Keyboard shortcuts (Ctrl on Windows and Linux, Cmd on Mac)

Search `Ctrl+P` or `Ctrl+K` · in-page find `Ctrl+F` · copy page URL `Ctrl+L` · back `Ctrl+[` · forward `Ctrl+]` · dark/light `Ctrl+Shift+L` · new page `Ctrl+N` · new window `Ctrl+Shift+N` · new tab `Ctrl+T` · toggle sidebar `Ctrl+\` · up one level `Ctrl+Shift+U` · comment `Ctrl+Shift+M` · bold/italic/underline `B`/`I`/`U` · strike `Ctrl+Shift+S` · link `Ctrl+K` on selection · inline code `Ctrl+E` · duplicate block `Ctrl+D` · edit selected blocks `Ctrl+/` · move block `Ctrl+Shift+Arrows` · apply last color `Ctrl+Shift+H` · open/toggle/check `Ctrl+Enter` · expand or close all toggles `Ctrl+Alt+T` · block type by number `Ctrl+Shift+0..9` (text, H1, H2, H3, to-do, bullet, number, toggle, code, page) · `Shift+Enter` line break · `/turn`, `/color`, `/blue`, `/blue background`, `/delete`, `/duplicate`.

## 3. Databases

- A database is a collection of pages. Every item is a page with properties on top and free blocks below.
- **Full-page** (appears in the sidebar, can be locked) or **inline** (controls appear on hover; expand to full page; turn into inline).
- Create from the page picker ("Get started with: Table"), `/database`, or by linking an existing data source. Optional "Build with AI". Suggested templates.
- Multiple **data sources** per database; **linked views** of a database from anywhere.
- Duplicate with or without content. Max 500 properties per database. Over 1,000 items, new rows may not append at the end.
- Item context menu: Delete, Duplicate, Copy link, Rename, Move to, Edit property.
- Open pages in **side peek**, **center peek** or **full page**, chosen per view. Defaults: table, board, list, timeline side peek; gallery, calendar center peek. Peek has previous/next navigation.
- Page layout inside a database: properties (Always show, Hide when empty, Always hide), comments, backlinks (Expanded, Compact, Hidden).

### Property types (23)

Text, Number (also currency, progress bar), Select, Status (To-do, In progress, Complete groups), Multi-select, Date (range, time, reminder, format and timezone), Formula, Relation (one-way, two-way, limit 1 or no limit, display chosen properties of related pages), Rollup, Person, File, Checkbox, URL, Email, Phone, Created time, Created by, Last edited time, Last edited by, Button, ID (auto-increment), Place, and AI autofill on supported types.

Select and multi-select: add tags by typing, colors, rename, reorder, delete.

Conditional color: per-view rules by property (select, multi-select, status, title, text, number, date, person, checkbox, formula, relation, rollup), applied to the row or the property, many rules per view. Works on table, calendar, timeline, list, board, feed.

### Views (per-database, each with its own settings)

Table, Board (group by property, sub-group), Timeline (with dependencies), Calendar (by date property), List (minimal), Gallery (cover from file property or page content), Chart (bar, line, donut), Feed. Map view for Place exists in current Notion. Forms write into a database.

View tabs: add with `+`, rename, duplicate, delete, copy link, reorder by drag, display as icon only, text only or both. In the sidebar, views nest under a full-page database.

View settings: Layout, Property visibility, **Filter** (simple, or advanced with AND/OR groups nested three deep; "Save for everyone" or only me), **Sort** (multiple, reorderable), **Group**, **Sub-group**, Conditional color, Copy link to view, Open pages in. Calculations per column (count, sum, average, min, max, percent, and so on).

Row creation: `New` button (blue), `+ New` at the bottom of table, list, board; `+` on hover per day in calendar; empty card in gallery. Hover the title cell and click OPEN in tables. Select many rows and press `Ctrl+/` to edit them together.

Sub-items and dependencies on tasks; "My tasks" view; progress bar from sub-items.

### Relations and rollups

Relation links pages across two databases; two-way relations mirror edits; a database can relate to itself. Rollups aggregate a property across related pages. Formulas use a formula language over properties.

### Automations and buttons

Database automation = triggers + actions. Triggers: Page added, Property edited (with conditions such as "starts with"), Every {frequency} (recurring, start and end date, timezone). Multiple triggers combine with "any" or "all". Actions: Edit property (add or remove single values in multi-select, person, relation), add page to a database, send Slack notification, send webhook. Automations skip restricted pages and cannot trigger other automations; a button click can trigger one. Button property and Button block run one-click actions.

## 4. Sidebar and navigation

- Collapsible with `Ctrl+\`; drag to resize; hover-peek when collapsed.
- Top shortcuts: Search, Home, Chats with AI, Meetings, Inbox (top-right, never hideable), New item menu, Library.
- Sections: Upcoming events, Recents, Favorites, Agents, Teamspaces, Shared, Private, Notion apps. Fixed footer entries: My Tasks, Library, Marketplace, Help, Trash. Workspace name and switcher at the bottom.
- Pages nest to unlimited depth; every row has a toggle arrow, hover `⋯` menu and `+` to add a child page. Drag and drop reorders, nests and moves between sections.
- Customize: show N items per section, move sections, hide sections, reset to preset, workspace-defined presets.
- **Inbox:** mentions, comments, page updates, reminders, work assignments. Mark all read, archive all, archive read, filter by type, per-notification settings, unread badge.
- **Home:** pages and tasks that need attention.
- **Library:** browse everything in a section.
- **Breadcrumbs** in the top bar, plus Share, Comments, Updates (history), Favorite star, and ••• menu on the right.
- **Search** (`Ctrl+K`): type or jump to recent; filters by type, creator, date, teamspace; results with snippets.
- Tabs inside the desktop app; back and forward buttons.

## 5. Collaboration

- Real-time co-editing with presence cursors and avatars.
- Comments on a block, a text selection or a page; threads; resolve; `@` mentions; reactions.
- **Suggest edits** mode (suggesting versus editing).
- **Page analytics** and view history (on higher plans).
- **Verification:** mark a page verified, with owner and expiry, so people know it is current.
- **Synced blocks:** edit once, update everywhere.
- Meeting notes with AI summary and action items.

## 6. Sharing and permissions

- **Share** menu: invite people, groups, teamspaces, or a guest by email. Emails on the organization's domain become members, not guests.
- **General access:** only people invited · everyone at the workspace (with "Hide in search") · anyone on the web with the link (optional expiry; commenting or editing needs sign-in).
- **Permission levels:** Full access · Can edit · Can edit content (database pages) · Can comment · Can view · Can create (database).
- Inheritance down the page tree, with restriction and override; shared pages appear in the sidebar's Shared section.
- **Teamspaces:** a space per team with its own members, owners and permission levels. Default teamspace includes everyone. Private teamspaces on higher plans.
- Roles: workspace owner, admin, member, guest. Fine-grained admin roles, domain management, audit log, analytics tiers, granular database permissions (page-level rules by assignee or owner) on higher plans.
- Publish to web as a **site**: custom domain or Notion domain, theme (light or dark), favicon, navigation bar with breadcrumbs and search, remove-branding, Google Analytics, SEO tools, 30,000+ templates.
- **Forms** collect requests into a database and can start workflows.

## 7. AI (Notion AI)

Notion Agent (acts on anything you can do in Notion), Custom Agents (run on a schedule or trigger), AI Meeting Notes, Enterprise Search across connected apps with citations, AI autofill for database properties, "Build with AI" for databases and pages, edit with AI and ask AI on any block, model-agnostic switching, usage dashboards and credits, admin controls over what AI can see and do. Marketing claims: no training on customer data, SOC 2 Type 2, ISO 27001, GDPR, CCPA, HIPAA and zero retention on Enterprise.

## 8. Notion Calendar

Menu-bar schedule, join meetings in one click, built-in scheduling links, multiple calendars (Google, Apple, Notion), time zones, command menu, drag to edit Notion database dates, auto-block busy slots, 12 languages, mobile widgets.

## 9. Templates, imports, connections

Template gallery (docs, wikis, projects, OKRs, onboarding, PRD, meeting notes, design system, pitch deck, editorial calendar, engineering roadmap, daily standup). Database templates with repeat schedules. Connections to Figma, Amplitude, GitHub, Slack (paste a link to unfurl), Jira, Asana, Google Drive. Import from other tools; export to Markdown, CSV and PDF.

## 10. Plans (for scoping only)

Free · Plus ($10 per seat) · Business ($20) · Enterprise. Free has databases with subtasks, dependencies and custom properties, basic forms, basic sites. Plus adds custom forms and sites, charts, collaborative blocks, file uploads. Business adds agents, AI meeting notes, enterprise search, SAML SSO, granular database permissions, verify any page, private teamspaces. Enterprise adds SCIM, audit log, zero retention, DLP and SIEM connections. Relay runs everything unlocked with no seat limits, as with the Slack reference.

## 11. Visual design (read from the live page, 2026-11-03)

- **Font:** `NotionInter, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif`. Body 16px. Page title about 40px bold, tight tracking. In-app page body is 16px with 1.5 line height.
- **Text:** `rgba(0,0,0,.95)` on `#fff`. Secondary text `#615d59` and `#78736f`. Placeholder `#a39e98`.
- **Warm gray scale:** 100 `#f9f9f8` · 200 `#f6f5f4` (sidebar and cards) · 300 `#dfdcd9` (borders) · 400 `#a39e98` · 500 `#78736f` · 600 `#615d59` · 700 `#494744` · 800 `#31302e` · 900 `#191918`.
- **Colors** (each has 100 to 900): red 500 `#f64932`, orange 500 `#ff6d00`, yellow 500 `#ffb110`, teal 500 `#27918d`, blue 100 `#f2f9ff` and a bright blue primary button, plus green, purple, pink, brown for tags.
- **Radii:** 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, pill. Hairline borders 1px solid gray-300.
- **Shape language:** flat surfaces, hairline borders, no heavy shadows; hover is a soft gray wash; blue `New` buttons; tags are rounded 3px rectangles in tinted colors; cards on warm gray `#f6f5f4`.
- **In-app layout:** left sidebar about 240px on warm gray; top bar with breadcrumb left and Share, comment, history, star, ••• right; content column about 708px centered (wide or full width optional); cover image 30vh; 78px emoji icon overlapping the cover; properties table above body; hover handles in the left margin.
- **Interaction patterns:** slash menu with fuzzy search and grouped results; floating selection toolbar (Turn into, link, comment, bold, italic, underline, strike, code, color, AI); drop guides in blue; side peek panel slides from the right; toasts bottom-left; command palette search.

## 12. Observed in the real app (2026-11-03, dark mode, screenshots of the user's own open Notion; layout only, no content recorded)

- **Sidebar** (about 18% of the window): top row has a collapse button on the left, then Inbox and New page icons on the right. Below, a "Search or ask" field with a `Ctrl+K` hint. A pill row with Home (active, with label), AI chat and Calendar icons. Then "New chat" and "Library". Sections have small muted headings ("Upcoming events", "Shared", "Private"); the first line of Shared is "+ Start collaborating". Rows are about 28px tall with a 16px icon, 14px text, a hover wash, and a slightly lighter fill for the open page. A thin scrollbar sits inside the sidebar. At the bottom: a dismissible promo card, then a footer with the workspace name and avatar (left) and icons for help and apps (right).
- **Top bar:** page title with a lock and "Private" dropdown beside it (the page's access level), then on the right "Edited <date>", Share (with lock icon), copy link, star, and a ••• menu. No heavy border under it.
- **Database page:** the database title in H2 weight, then view tabs (the open one is a pill with its icon: List, Calendar). A compact icon toolbar on the right of the tabs: filter, sort, automations (bolt), AI (sparkle), search, expand, settings; then a solid blue **New** button with a split chevron. Column headers show a type icon plus the name (Aa Task, checkbox Done, # Count, calendar Date, lines Subtasks). Rows are 34px with hairline row and column dividers, a page icon and a bold title in the first column, numbers right-aligned, empty checkbox squares, and a muted "+ New page" last row. A horizontal scrollbar shows when columns overflow.
- **Dark palette:** page about `#191919`, sidebar about `#202020`, text near white at 90%, muted text mid gray, primary button `#2383e2`.
- **Premium and AI signs visible in the sidebar and a database page (same session, trial account):** a "Search or ask" field (search plus AI question box), an AI chat tab in the Home pill row with "New chat", an AI sparkle button in the database toolbar, an automations bolt, and a "New to Notion AI? Learn the basics and test a few prompts while you're in trial" card with "Get the guide". The sidebar ends with a "Customize sidebar" row. Anything deeper (Settings, plans, Agents, meeting notes, AI menus) was not on screen, so it is not recorded here.
