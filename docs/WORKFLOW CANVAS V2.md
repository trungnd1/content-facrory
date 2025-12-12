# 🔥 **CONTENT FACTORY — WORKFLOW ADD / EDIT / EXECUTE PAGE (VERSION 2)**

### *Overview Product Spec & UI/UX Breakdown*

---

# 🎯 **1. PURPOSE OF THIS SCREEN**

Đây là giao diện cho phép người dùng:

### **1) Xem workflow dạng tuyến tính (step list)**

### **2) Chạy workflow & xem tiến trình theo từng step (progress)**

### **3) Re-order steps, thêm agent, chỉnh step**

### **4) Xem output của agent ở Document canvas (editor)**

### **5) Pausing, editing, regenerating output tại từng step**

### **6) Sử dụng Tiptap để hiển thị/migrate output thành rich document**

Đây là giao diện **"workflow execution + editing"**, không phải workflow builder dạng kéo-thả nodes.

---

# 🌐 **2. SCREEN LAYOUT — THREE MAIN REGIONS**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ TOP NAVBAR                                                                 │
├────────────────────────────────────────────────────────────────────────────┤
│ SIDEBAR (Steps Panel) │          MAIN WORK AREA (Document Canvas)          │
└────────────────────────────────────────────────────────────────────────────┘
```

---

# 🧭 **3. TOP NAVBAR SPEC**

### **Location**: Full width top bar

### **Contains:**

- Breadcrumb: `Workflows > SEO Blog Generator`
- Workflow Title: **SEO Blog Post Generation**
- Workflow status badge: **Running**
- Metadata row:

- Project ID
- Started time
- Estimated completion time
- Buttons (Right):

- **History** (shadcn button outline)
- **Config** (icon button)
- **Stop Workflow** (destructive variant)
- User avatar

### **Behavior:**

- Stays sticky
- While running → shows status pulse
- Stop workflow triggers confirmation dialog

---

# 🧱 **4. LEFT PANEL — WORKFLOW STEPS PANEL**

This is a **vertical stepper**, similar to production AI tools (e.g., Jasper, Copy.ai, OpenAI workflow steps).

### **4.1 Step Panel Components**

Each step card includes:

```
[State Icon]   Step Title
               Agent Name
               Badge (Done / Pending / Running)
```

### **4.2 Step States**

| State | UI |
| --- | --- |
| **Done** | Green check + “Done badge” |
| **Running** | Blue spinner + highlight |
| **Pending** | Gray circle |
| **Error** | Red badge + warning icon |
| **Selected** | Blue-glow border |

### **4.3 Interaction**

User can:

- Click a step → Right panel updates document preview according to this step output
- Reorder steps via drag & drop
- Add new agent via **Add Agent to Flow** button at bottom
- Right click step → context menu:

- Edit agent config
- Duplicate step
- Delete step
- Move up/down

### **4.4 Add Agent Flow**

Click **“+ Add Agent to Flow”**:

- Opens modal listing available agents (similar to Agent Toolbox)
- Selecting an agent inserts it after current step OR at end

---

# 📝 **5. RIGHT PANEL — DOCUMENT CANVAS**

## **5.1 Essence**

This panel is a **multi-purpose rich document viewer/editor**, implemented with:

### ⭐ **Tiptap**

Allows:

- Headings
- Rich text
- Lists
- Code blocks
- AI streaming output
- Editable mode
- Commenting or annotation (optional)

---

# **5.2 Document Canvas Layout**

```
┌──────────────────────────────────────────────────────────────┐
│ Header Tabs: Preview | Raw JSON | Logs                        │
├──────────────────────────────────────────────────────────────┤
│ // Document (Tiptap output)                                   │
│                                                              │
│ < AI-generated content appears here >                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘

[Footer Controls]
( Pause ) ( Edit Output ) ( Regenerate )
```

---

# **5.3 Mode Tabs**

### **1. Preview**

- Tiptap rich content
- Can highlight newly generated parts
- Shows streaming AI output
- Editable depending on execution state

### **2. Raw JSON**

- Collapsible JSON viewer
- Shows raw LLM output

### **3. Logs**

- System logs (tokens, runtime, debug info)
- Errors / retries

---

# 🖋 **5.4 Footer Interaction**

Footer under Tiptap supports:

### **Pause**

- Stops live execution
- Workflow remains resumable

### **Edit Output**

- Switches Tiptap to **editable mode**
- Saves edited version to step result

### **Regenerate**

- Triggers only **the selected step agent** to re-run
- Updates downstream steps if workflow set to “auto-propagate changes”

(We can define later whether re-running step invalidates later steps.)

---

# 🚀 **6. WORKFLOW EXECUTION UX**

This page is designed for **real-time step-by-step execution**.

### **6.1 Progress Bar**

- Shows percentage based on number of steps completed
- Animated fill

### **6.2 Step Processing Behavior**

When step finishes:

- Left panel updates status → “Done”
- Blue highlight moves to next step
- Document canvas scrolls to new section
- Auto-switch to preview mode

### **6.3 Auto-Scroll**

When new content streams, Tiptap autoscrolls just like AI chat apps.

---

# 🔧 **7. FRONTEND TECHNICAL IMPLEMENTATION NOTES**

### **Framework**

- Next.js 14 App Router
- Tiptap (React binding)
- Zustand for workflow store
- WebSocket or SSE for streaming output

### **State Model**

```
{
  workflow: {
    id: string
    title: string
    status: "running" | "paused" | "done" | "error"
    steps: StepNode[]
    activeStepId: string | null
    document: TiptapDocumentState
  }
}
```

### **StepNode structure**

```
interface StepNode {
  id: string
  agent: string
  name: string
  status: "pending" | "running" | "done" | "error"
  output: any
  order: number
}
```

### **Document Canvas Structure**

Each step may append a new “section” inside Tiptap:

```
{
  stepId: string,
  content: tiptapJson
}
```

---

# 🎨 **8. UI STYLE GUIDELINES (Match Your Screenshot)**

### Colors

- Background: #0F1117 (dark)
- Panel background: #111827
- Step Item Active: #1E2A44
- Accent Blue: #3B82F6
- Text: slate-100
- Border: #1F2937

### Components

- ShadCN: Button, Card, Badge, Tabs, Separator, ScrollArea
- Tiptap custom nodes for:

- headings
- paragraphs
- code blocks
- AI streaming node

### Typography

- Display: SemiBold
- Body: Regular
- Line height: comfortable for reading long-form text

---

# 📌 **9. KEY UX PRINCIPLES**

- Workflow must feel like “watching AI build a document live.”
- Step list should operate like a timeline + logical flow.
- Document canvas is always the main focus.
- Editing document must *not* break previous step output.
- Actions must be visible and minimal.

---

# 🎯 **10. HIGH-LEVEL USER FLOWS**

## **Flow A — Adding Steps**

1. Click “Add Agent to Flow”
2. Select agent
3. Step inserted below current one
4. Step auto-selected for editing
5. Canvas shows placeholder for its output

---

## **Flow B — Running Workflow**

1. User clicks Run Workflow
2. Steps update sequentially
3. Canvas updates as agents generate content
4. User may pause/regenerate at any step

---

## **Flow C — Editing Outputs**

1. User clicks Edit Output
2. Tiptap becomes editable
3. User adjusts text
4. Save changes (auto-lock step)

---

# 🚀 SUMMARY

This screen is:

**A linear workflow execution interface**

- **Left panel step navigator**
- **Right panel Tiptap-based document preview/editor**
- **Ability to add/reorder agents**
- **Real-time AI content streaming**
- **Inline editing/regeneration per step**

It is essentially a **document-centric AI workflow runner**, optimized for content creation workflows (blogs,