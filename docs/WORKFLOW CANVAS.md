# 🎨 **WORKFLOW CANVAS — FULL UI/UX SPEC**

*(Node-based Workflow Builder)*

Ảnh bạn gửi tương ứng với một **canvas dạng flow editor**, có sidebar trái (Agent Toolbox), canvas giữa (Nodes & connections), và panel phải (Node Properties).

Màn hình này tương đương với cấp độ UX của:

- OpenAI Workflows
- n8n
- ReAct Flow editors
- AxiomAI Flow builder
- Bubble Logic Flow

---

# 🔥 **1. HIGH-LEVEL LAYOUT (THREE-PANE WORKFLOW EDITOR)**

Màn hình được chia làm 3 phần chính:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOP NAVBAR (global actions)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ SIDEBAR (Agent Toolbox) │               CANVAS (Node Graph)                │ PROPERTIES PANEL │
│ fixed left               │               drag-drop nodes                    │ dynamic           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.1 Regions

### **A) Top Navigation Bar**

- Hiển thị:

- 🧩 Tên workflow
- State: Draft / Saved
- Save Draft button
- Run Workflow button (CTA)
- User avatar

### **B) Left Sidebar – Agent Toolbox**

- Thành phần:

- Search bar: “Search agents…”
- Category grouping:

- TEXT GENERATION
- IMAGE & MEDIA
- LOGIC & FLOW
- Each agent = card item with icon + name + brief description
- Interaction:

- **Drag agent → Drop on canvas** để tạo node mới
- Click = preview tooltip

### **C) Canvas (Node Graph Area)**

- Dark themed canvas with subtle grid pattern
- Nodes are draggable, interactive
- Connections via Bézier curve lines
- Zoom controls:

- Zoom in/out
- Fit to screen

### **D) Right Panel – Node Properties**

- Opens when selecting a node
- Editable fields depending on node type
- Contains:

- Header (node name + node type icon)
- Node config
- Validation UI
- Delete / Apply actions

---

# 🔥 **2. CANVAS INTERACTION SPEC**

## 2.1 Node Types

From the screenshot example:

### **Node: Trigger**

- Type: Manual Input
- Has a **variable** (Topic)
- Output port: 1 (right side)

### **Node: Topic Researcher**

- Type: Web Search Agent
- Input port: 1 (left)
- Output port: 1 (right)
- Properties editable in side panel

---

## 2.2 Node UI Specification

### **Structure**

```
┌───────────────────────────────┐
│ Icon   Node Title             │
│ Subtitle (agent type)         │
│ Tags (source: Google API, etc)│
│ Output preview (optional)     │
└────○──────────────────────○───┘
  (in-port)               (out-port)
```

### **States**

- Default
- Selected (glowing blue outline)
- Executing (pulsing blue)
- Error state (red border + error badge)

---

## 2.3 Connection Rules

- Drag from output → input
- Inputs accept single link
- Outputs may feed multiple nodes
- Invalid connection → bounce animation

---

# 🔥 **3. SIDEBAR (AGENT TOOLBOX) SPEC**

### Components inside sidebar:

- **Search bar**
- Category labels
- Agent cards

### Agent Card spec

```
┌───────────────────────┐
│ Icon                   │
│ Title (GPT-4 Writer)   │
│ Subtitle               │
└───────────────────────┘
```

### Agent Categories from screenshot

- **TEXT GENERATION**

- GPT-4 Writer
- Summarizer
- **IMAGE & MEDIA**

- DALL·E 3
- **LOGIC & FLOW**

- Condition Split
- Delay

### Interaction

- Drag to canvas
- Hover = shows tooltip description
- Clicking: not required

---

# 🔥 **4. RIGHT PROPERTIES PANEL SPEC**

Triggered when selecting node.

### **Sections**

---

## 4.1 Node Header

```
Icon   Node Name
ID: node_identifier
```

---

## 4.2 Configuration Fields (Dynamic per node)

Based on screenshot, for Topic Researcher:

### **Dropdown: Search Query Source**

- Options:

- Use Trigger Input
- Manual Input
- Use Previous Node Output

---

### **Slider: Max Results**

- Default: 5
- Range 1 → 20
- Tooltip: "Limit number of results returned"

---

### **Search Depth toggle**

```
[ Basic ]   [ Deep ]
```

---

### **Text Area: Excluded Domains**

- Example placeholder:

`"example.com, pinterest.com"`

---

### **Advanced Mode (Switch)**

Enabling this reveals:

- Raw JSON config
- API parameters
- Additional transform options

---

### **Bottom Buttons**

```
[ Delete ]           [ Apply ]
```

- Delete = red
- Apply = violet primary

---

# 🔥 **5. UX BEHAVIORS**

## 5.1 Node Selection

- Clicking node highlights
- Opens right panel
- Deselect = left-click on empty canvas

---

## 5.2 Undo/Redo

Invisible in screenshot, but recommended:

- cmd/ctrl + Z
- cmd/ctrl + shift + Z

---

## 5.3 Autosave

- On editing node properties
- On dragging nodes
- Save status shown in top bar

---

## 5.4 Zoom

- Canvas has scale indicator (bottom center):

```
100%   [+]   [-]   [Fit]
```

- Fit button centers all nodes

---

# 🔥 **6. VISUAL STYLE GUIDE**

## 6.1 Colors

- Background: #0F1116 (dark neutral)
- Nodes: #161B22
- Glows: #3B82F6 (blue primary)
- Text: Neutral light slate gray
- Accents: desaturated blue/violet tones

---

## 6.2 Spacing

- Nodes: 24px padding
- Grid spacing: 16px
- Panel padding: 20px

---

## 6.3 Animations

- Node hover: subtle elevation
- Active node: blue glow pulse
- Connection draw: smooth bézier

---

# 🔥 **7. DATA STRUCTURE (FRONTEND MODEL)**

### Node model:

```
interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  data: Record<string, any>;
  inputs: PortSpec[];
  outputs: PortSpec[];
}
```

### Edge model:

```
interface WorkflowEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}
```

### Canvas state (Zustand)

```
{
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  
  addNode();
  updateNode();
  deleteNode();
  connectNodes();
  disconnectNodes();
  setSelectedNode();
  moveNode();
}
```

---

# 🔥 **8. EXPECTED USER FLOW**

## **Flow: Create Workflow**

1. User opens Workflow Canvas
2. Sidebar shows agent list
3. User drags **Trigger** onto canvas
4. User drags **Topic Researcher**
5. User connects nodes
6. User configures node in right panel
7. Click **Run Workflow**

---

# 🔥 **9. WHAT TO BUILD (DETAILED FRONTEND TASKS)**

### **Canvas System**

- Node graph rendering
- Edge drawing
- Dragging & snapping
- Zooming and viewport behaviors

### **Node Inspector (Right Panel)**

- Schema-driven UI generation
- Save & validation
- Mode switching (basic/advanced)

### **Agent Toolbox**

- Category filtering
- Search
- Drag & drop

### **Top Navbar**

- Save draft
- Run workflow

---

# 🎯 **CONCLUSION**

Màn hình bạn gửi là một **node-based workflow builder** gồm:

- Sidebar (agent list)
- Node canvas
- Node inspector

Mình đã phân tích và mô tả chi tiết từng thành phần, behavior, state, data model, và user flows — đủ để team frontend/UX bắt đầu build bản high-fidelity hoặc implement trực tiếp.