# 🎨 **CONTENT FACTORY — FRONTEND UI/UX SPEC (ShadCN + Blocks Version)**

**Framework:** Next.js 14 / App Router

**UI Library:** ShadCN UI ([https://ui.shadcn.com/](https://ui.shadcn.com/))

**Component Blocks:** Blocks UI ([https://blocks.so/](https://blocks.so/))

**State:** Zustand

**Styling:** TailwindCSS

**Navigation:** Sidebar + Header

**Tone & Mood:** Minimalist, creator-style, tím nhạt (#C084FC / #A855F7), sáng

---

# 1) 🌐 GLOBAL LAYOUT SPEC

## 1.1 Layout structure

```
app/
 ├─ (dashboard)/layout.tsx    <-- Global layout cho user logged-in
 ├─ (dashboard)/page.tsx
 ├─ projects/
 ├─ workflows/
 ├─ agents/
 └─ executions/
```

## 1.2 Layout UI Components (ShadCN)

- `Sidebar` — dùng **shadcn: navigation-menu + sheet** cho mobile
- `TopBar` — dùng **shadcn: breadcrumb + avatar**
- `MainContent` — container max-w-[1400px]

## 1.3 Layout Wireframe (ASCII)

```
┌───────────────────────────────────────────────────────────────────┐
│ Sidebar (fixed) |  Content Panel                                  │
│                  |  ┌───────────────────────────────────────────┐ │
│  Dashboard       |  │ Breadcrumbs   UserAvatar                │ │
│  Projects        |  ├──────────────────────────────────────────┤ │
│  Workflows       |  │ Main Content (cards/forms/tables)       │ │
│  Agents          |  └──────────────────────────────────────────┘ │
│  Executions      |                                               │
└───────────────────────────────────────────────────────────────────┘
```

---

# 2) ✨ DESIGN SYSTEM

## 2.1 Colors

| Purpose | Color |
| --- | --- |
| Primary | `#C084FC` (violet-300) |
| Primary Dark | `#A855F7` (violet-500) |
| Accent | `#7C3AED` (violet-700) |
| Background | `#F9FAFB` |
| Surface | `#FFFFFF` |
| Borders | `#E5E7EB` |

## 2.2 Typography

- Font: **Inter, 14–16px base**
- Headings: **Semibold**
- Use Tailwind utilities

## 2.3 Components

ALL components must use **ShadCN UI** variants:

- Buttons → `buttonVariants`
- Cards → `Card, CardHeader, CardContent`
- Input → `Input, Textarea`
- Table → `Table`
- Modal → `Dialog`
- Tabs → `Tabs`

## 2.4 Blocks Components (blocks.so)

Use Blocks for **visual-rich components**:

- Kanban-ish boards
- Step timeline
- Animated cards
- Charts
- Drag-and-drop lists (Blocks list builder)

These become **workflow-specific** UI elements.

---

# 3) 🗂 PAGE-BY-PAGE UI/UX SPEC

---

# PAGE 1 — DASHBOARD

## Purpose

- Overview system status
- Quick actions
- Recent executions

## Components (ShadCN)

- `Card`
- `Button`
- `Table`
- Blocks: “Summary Cards”, “Stats Blocks”

## Wireframe

```
Dashboard
──────────
[Quick Actions Card]
  - New Project
  - New Workflow
  - New Agent

[Stats Grid] (Blocks Stats)
  - Projects Count
  - Workflows Count
  - Executions (24h)

[Recent Executions Table]
```

---

# PAGE 2 — PROJECTS LIST

## Components

- `Card`
- `Table`
- `DropdownMenu`
- Blocks: “List Row Cards”

## Wireframe

```
Projects
──────────
[ New Project ]

| Project | Workflows | Updated | Actions |
|---------|-----------|---------|---------|
| A       |     3     | 2h ago  | View >  |
| B       |     1     | 1d ago  | View >  |
```

---

# PAGE 3 — PROJECT DETAIL

Tabs layout (ShadCN Tabs).

## Tabs

- Overview
- Workflows
- Executions

## Components

- `Tabs`
- `Card`
- Blocks: “Timeline Mini”, “Metric Cards”

## Wireframe

```
Project A
────────────
[Tabs: Overview | Workflows | Executions]

Overview:
  - Description card
  - Metrics (Blocks)
  - Recent Runs timeline
```

---

# PAGE 4 — WORKFLOW LIST

## Components

- `Card`
- `Button`
- `Table`

## Wireframe

```
Workflows in Project A
────────────────────────
[New Workflow]

[Workflow Cards]
  - Name
  - Steps count
  - Active toggle
  - Run button
```

---

# PAGE 5 — WORKFLOW BUILDER (CORE UI)

⚡ This is the HEART of the app.

⚡ Use Blocks "Flow Builder" + ShadCN forms.

## Required Capabilities

- Add steps (Agent / Manual / End)
- Edit steps in modal
- Drag & drop (Blocks draggable)
- Step dependency visualization
- Real-time validation

## Components

- ShadCN: `Card`, `Popover`, `Dialog`, `Form`, `Input`, `Select`
- Blocks:

- **Flowchart Canvas**
- **Vertical Stepper**
- **Draggable List**

### Recommend: Vertical Step List Layout (fastest to build)

## Wireframe (ASCII)

```
Workflow: Loop 1 Pipeline
───────────────────────────────
[ Add Step ]

1. (Agent) Insight Extractor         [Edit] [Delete]
   Model: Claude 3 Haiku
   Requires Approval: Yes

2. (Agent) Seeds Generator           [Edit] [Delete]
   Model: Claude 3 Haiku

3. (End)
```

### Step Editor (Dialog)

```
[Dialog: Edit Step]
Step Name: [ Input ]
Step Type: [ Agent | Manual | End ]

If Agent:
  Agent: [Select Agent]
  Input Mapping:
    raw_notes -> {{raw_notes}}
  Output Mapping:
    output -> next_step.input

Requires Approval: [checkbox]

[ Save ]
```

---

# PAGE 6 — RUN EXECUTION VIEWER

Use Blocks "Timeline" component.

## Components

- Blocks: Timeline, Accordion
- ShadCN: Button, CodeBlock (custom), Alert

## UX Behavior

- Each step shows:

- Status (running / waiting / failed / success)
- Input payload
- Output payload (json preview)
- If step requires approval → show:

- Edit JSON in textarea
- Approve / Reject buttons

## Wireframe

```
Execution #24 — RUNNING
────────────────────────
● Step 1: Insight Extractor  (SUCCESS)
  Output:
  { insights: [...] }

● Step 2: Seeds Generator   (WAITING APPROVAL)
  Preview:
  { seeds: [...] }
  [ Edit Output ] [ Approve ] [ Reject ]

○ Step 3: Script Writer     (PENDING)
```

---

# PAGE 7 — AGENTS LIST

## Components

- Card Grid (Blocks)
- ShadCN: Button, DropdownMenu

## Wireframe

```
Agents
─────────────
[New Agent]

[Agent Cards Grid]
  Insight Extractor   Model: Claude 3
  Seeds Generator     Model: Claude 3
  Script Writer       Model: Llama 3
```

---

# PAGE 8 — AGENT EDITOR

## Components

- ShadCN Form
- ShadCN Code Editor (Monaco wrapper)
- Blocks: “Settings Panel Cards”

## Fields

- Name
- Type
- Model (dropdown)
- System Prompt (textarea)
- Template Prompt (textarea)
- Temperature
- Max Tokens
- Input schema (JSON editor)
- Output schema (JSON editor)

## Wireframe

```
Edit Agent: Insight Extractor
──────────────────────────────
Name: [           ]
Model: [ Claude Haiku v3 ]
Temperature: [0.3]

System Prompt:
[ Textarea ]

Prompt Template:
[ Textarea ]

Input Schema:
[ Code Editor ]

Output Schema:
[ Code Editor ]

[ Save ]
```

---

# 4) 🧩 COMPONENT CATALOG (ShadCN + Blocks)

### **Buttons**

- `buttonVariants` with:

- primary violet
- secondary outline
- subtle ghost variant

### **Cards**

Use:

```
<Card>
  <CardHeader>
  <CardContent>
</Card>
```

### **Tables**

- Use **Data Table** + pagination (Blocks template recommended)

### **Dialogs**

- For editing steps, editing agents

### **Flow Builder Components (Blocks)**

- Draggable vertical step list
- Node editor
- Timeline viewer
- Status chips

---

# 5) 🧭 NAVIGATION UX RULES

- Sidebar fixed on desktop, collapsible on mobile
- Breadcrumb always visible
- Use command menu (⌘K) for quick actions (Blocks component available)

---

# 6) 🎨 VISUAL GUIDELINES

### Border radius

`rounded-xl` for cards

`rounded-lg` for inputs

### Shadows

`shadow-sm` (avoid big shadows)

### Animations (Blocks defaults)

- Fade in for cards
- Slide transitions for dialogs

### Spacing

Use vertical rhythm 24/32px.

---

# 7) 📱 RESPONSIVE RULES

### Mobile

- Sidebar collapses into Sheet (ShadCN)
- Timeline collapses into Accordion
- Workflow Builder uses stacked cards

### Desktop

- Full workflow builder with drag/drop
- Multi-column layout for Agents / Projects

---

# 8) 🔧 FRONTEND TECHNICAL GUIDELINES

### Folder Structure

```
app/
  projects/
  workflows/
  agents/
  executions/
components/
  ui/              -- ShadCN components
  blocks/          -- Blocks custom wrappers
  workflow/        -- StepCard, StepEditor, Timeline
store/             -- Zustand stores
lib/               -- API client, utils
```

### API Client

- Use typed fetch wrappers
- SRR optional, primarily client components

### State Management

- Each builder uses a dedicated Zustand store:

- workflowStore
- agentEditorStore
- executionStore

---

# 9) ✔️ ACCEPTANCE CRITERIA (UI/UX DONE)

A screen is **DONE** when:

### ✔ Uses ShadCN + Blocks components

### ✔ Has full responsive breakpoints

### ✔ Animation smooth & consistent

### ✔ Forms validate & error toast visible

### ✔ JSON payload visible & copyable

### ✔ Workflow builder supports drag & drop

### ✔ Execution viewer shows live state transitions

---

# 10) ⚡ WHAT YOU GET WITH THIS SPEC

- UI layout chuẩn
- Design system thống nhất
- Workflow builder UX rõ ràng
- Execution viewer đầy đủ
- Ready-to-build with ShadCN + Blocks

---

# What Next?

### A) Mình tạo **ShadCN component kit** riêng cho Content Factory

### B) Mình tạo **interactive prototype (ASCII → UI mock)**