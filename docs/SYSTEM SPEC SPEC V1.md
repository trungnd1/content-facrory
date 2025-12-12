# ⭐ **CONTENT FACTORY — SYSTEM SPEC (VERSION 2, TECH-ALIGNED)**

Kiến trúc:

```
Frontend (Next.js + Tailwind + Zustand + Blocks.so UI)
↓
Backend API (FastAPI)
↓
Orchestrator Service (Python module)
↓
Supabase (DB, Auth optional, Storage)
↓
LLMProvider (abstract) → pluggable engines (OpenAI, OpenRouter, Anthropic…)
```

---

# 🔵 1. FRONTEND (Next.js 14 App Router)

## Framework & Libraries

- **Next.js 14 (App Router)**
- **React 18**
- **TailwindCSS**
- **Zustand** (state management — tốt hơn Redux cho app real-time)
- **Blocks.so** (UI blocks, component library)
- **React Query or SWR** (data fetching)
- **ShadCN (optional)** cho các control base (modals, forms)
- **React Flow (v2)** (for Workflow Builder canvas mode — nếu v1 chưa cần thì bỏ)

## Frontend Responsibilities

✔ Authentication (Supabase Auth or JWT from FastAPI)

✔ Projects CRUD

✔ Agents CRUD

✔ Workflow Builder (list mode v1, canvas v2)

✔ Workflow Run Viewer (step-by-step execution UI)

✔ Agent Runner Preview (test an agent individually)

✔ Realtime updates (polling or websockets)

✔ Minimalist creator UI (tím nhạt, mượt, whitespace nhiều)

---

# 🟣 2. BACKEND API (FastAPI)

## Structure

```
/api
  /auth
  /agents
  /projects
  /workflows
  /executions
  /orchestrator
  /llm_provider
```

## Key Concepts

### 2.1 Agents

Định nghĩa tại backend, lưu DB.

Backend load agent config → build prompt → gọi LLMProvider.

### 2.2 Orchestrator Service

Module Python xử lý logic chuỗi:

- load workflow
- iterate từng step
- gọi agent (qua LLMProvider)
- lưu logs
- pause khi cần approval
- resume khi user confirm

### 2.3 LLMProvider

Class abstract:

```
class LLMProvider:
    async def chat(self, model: str, messages: list, **kwargs) -> dict:
        pass
```

Implementation:

```
OpenAIProvider
OpenRouterProvider
AnthropicProvider
DeepSeekProvider
MockProvider (for test)
```

→ Bạn có thể switch provider bằng ENV:

```
LLM_PROVIDER=openrouter
DEFAULT_MODEL=anthropic/claude-3-haiku
```

### 2.4 API endpoints (rút gọn)

**Agents**

```
GET /agents
POST /agents
GET /agents/{id}
PUT /agents/{id}
DELETE /agents/{id}
```

**Projects**

```
GET /projects
POST /projects
GET /projects/{id}
PUT /projects/{id}
DELETE /projects/{id}
```

**Workflows**

```
GET /projects/{projectId}/workflows
POST /projects/{projectId}/workflows
GET /workflows/{id}
PUT /workflows/{id}
DELETE /workflows/{id}
```

**Workflow Steps**

```
GET /workflows/{workflowId}/steps
POST /workflows/{workflowId}/steps
PUT /workflow-steps/{stepId}
DELETE /workflow-steps/{stepId}
```

**Execution**

```
POST /workflows/{id}/run
POST /executions/{id}/steps/{stepId}/approve
POST /executions/{id}/steps/{stepId}/reject
GET /executions/{id}
GET /executions/{id}/steps
```

---

# 🟢 3. DATABASE — SUPABASE

Supabase tables:

### **users**

(optional nếu dùng Supabase Auth)

### **agents**

```
id UUID PK
owner_id UUID FK
name text
description text
type text (llm/tool/webhook)
model text
prompt_system text
prompt_template text
input_schema jsonb
output_schema jsonb
temperature float
max_tokens int
is_active bool
created_at timestamp
updated_at timestamp
```

---

### **projects**

```
id UUID
owner_id
name
description
status
created_at
updated_at
```

---

### **workflows**

```
id UUID
project_id FK
name
description
is_active bool
created_at
updated_at
```

---

### **workflow_steps**

```
id UUID
workflow_id FK
step_number int
name text
type text (AGENT/MANUAL/END)
agent_id UUID nullable
requires_approval bool
config jsonb
next_step_id UUID nullable
created_at
updated_at
```

---

### **workflow_executions**

```
id UUID
workflow_id
project_id
user_id
input jsonb
result jsonb
status text (pending/running/waiting/success/failed)
created_at
updated_at
```

---

### **workflow_execution_steps**

```
id UUID
execution_id
step_id
agent_id
status (pending/running/failed/success/waiting_approval)
input jsonb
output jsonb
error text
started_at
finished_at
```

---

# 🟡 4. ORCHESTRATOR (Python module trong backend)

Pseudo-logic:

```
class Orchestrator:
    def __init__(self, db, llm: LLMProvider):
        self.db = db
        self.llm = llm

    async def run_workflow(self, workflow_id, input_payload):
        # 1. Create execution record
        # 2. Loop through steps
        # 3. For Agent step → call AgentRunner
        # 4. For Manual step → pause + return pending state
        # 5. Save logs
        # 6. Return final output
```

### **AgentRunner**

```
class AgentRunner:
    def __init__(self, llm: LLMProvider):
        self.llm = llm

    async def run_agent(self, agent, input_data):
        messages = build_prompt(agent, input_data)
        result = await self.llm.chat(
            model=agent.model,
            messages=messages,
            temperature=agent.temperature,
            max_tokens=agent.max_tokens
        )
        return extract_output(result, agent.output_schema)
```

---

# 🟤 5. FRONTEND UI FLOWS

### 5.1. Dashboard

- Recent Projects
- Recent Runs
- New Project CTA

---

### 5.2. Agents Page

- List agents
- Button “New Agent”
- Edit form:

- Name
- Model select
- System prompt textarea
- User prompt template
- Input schema JSON editor
- Output schema JSON editor

---

### 5.3. Workflow Builder (creator style)

Minimalist UI:

```
Step 1 → Step 2 → Step 3  
[+] Add Step
```

Each step:

- Dropdown: Select Type (Agent / Manual / End)
- If Agent:

- Dropdown select Agent
- Toggle “Require approval”
- Reorder steps (drag handle)

---

### 5.4. Execution Viewer

A timeline or vertical list:

```
● Step 1: Insight Extractor – SUCCESS
Output:
{ ...json... }

● Step 2: Seeds Generator – WAITING APPROVAL
Output:
{ ...json... }

[APPROVE]  [EDIT & APPROVE]
```

Live updates via polling every 2 seconds.

---

# 🟠 6. COLOR STYLE (theming)

**Creator aesthetic (tím nhạt):**

- Primary: `#C084FC` (violet-300)
- Primary Dark: `#A855F7` (violet-500)
- Background: `#fafafa`
- Border: `#e5e7eb`
- Panel: `white`
- Font: Inter
- Radius: 10–14px
- Shadows nhẹ (drop shadow-md)

---

# 🟣 7. OPTIONAL V2 FEATURES

- Branching logic (IF/ELSE workflows)
- Parallel tasks
- LLM fine-tuning presets
- Auto-rerun failed step
- Public templates library
- Realtime websockets