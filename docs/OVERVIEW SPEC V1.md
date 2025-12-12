**OVERVIEW SPEC - CONTENT FACTORY**

Kiến trúc **Frontend → API → DB**, có **Agents ở backend**, **Orchestrator** điều phối, **workflow linh hoạt** cho user tự thiết kế.

Bạn có thể đưa spec này cho dev / team tech là họ làm được.

---

## 1. Mục tiêu sản phẩm

**Content Factory** = web app cho creator dùng AI theo *workflow*:

- User định nghĩa **Agents** ở backend (LLM tools: Insight, Seeds, Script, Monetization, v.v.)
- User tự thiết kế **Workflow** bằng các Agent này (drag & drop / list step)
- Có **Orchestrator** điều phối chạy workflow (tự động hoặc có bước chờ user confirm)
- Mỗi **Workflow** tương đương 1 **Project** nội dung
- User có thể:

- CRUD Agents
- CRUD Project
- CRUD Workflow (bước, thứ tự, logic)
- Run workflow
- Xem state từng agent khi chạy
- Dừng / Restart / chỉnh sửa output giữa chừng

---

## 2. Kiến trúc tổng thể

### 2.1. Tech stack (gợi ý)

- **Frontend**:

- React / Next.js
- TailwindCSS
- Zustand / Redux Toolkit cho state
- Component lib: Shadcn Blocks (https://blocks.so/)
- **Backend API**:

- Python + FastAPI
- Orchestrator là service/bộ module trong backend
- **Database**:

- Supabase
- **LLM provider**:

- Tầng abstract “LLMProvider” để sau này đổi OpenAI / OpenRouter / v.v.

---

## 3. Domain Model (DB / Entities)

### 3.1. User

- `id`
- `email`
- `password_hash`
- `name`
- `role` (admin, creator)
- `created_at`, `updated_at`

### 3.2. Agent

Đại diện cho 1 “AI worker” có config riêng.

- `id`
- `owner_id` (FK → user.id hoặc null nếu là system agent)
- `name`
- `slug`
- `description`
- `type` (enum):

- `llm` | `tool` | `webhook` (v1 tập trung `llm`)
- `model` (vd: `gpt-4.1`, `anthropic/claude-3-haiku`)
- `prompt_system` (text)
- `prompt_template` (text, dùng {{variables}})
- `input_schema` (JSON schema)
- `output_schema` (JSON schema)
- `temperature` (float)
- `max_tokens` (int)
- `is_active` (bool)
- `created_at`, `updated_at`

> CRUD trên Agent: user có thể tạo Agent mới, sửa prompt, đổi model, tắt/bật.

---

### 3.3. Project

Mỗi workflow = 1 project trong mindset của bạn.

- `id`
- `owner_id`
- `name`
- `description`
- `status` (active, archived)
- `created_at`, `updated_at`

---

### 3.4. Workflow

Workflow logic (bạn cho mỗi project 1 workflow chính, hoặc cho phép nhiều workflow trong 1 project – spec này cho phép **nhiều**).

- `id`
- `project_id` (FK)
- `name`
- `description`
- `is_active`
- `created_at`, `updated_at`

### 3.5. WorkflowStep

Mỗi bước = 1 node trong workflow.

- `id`
- `workflow_id`
- `step_number` (int, thứ tự cơ bản)
- `name`
- `type` (enum):

- `AGENT` – chạy 1 Agent
- `MANUAL_REVIEW` – chờ user xem & confirm
- `BRANCH` – (v2) rẽ nhánh
- `END` – kết thúc
- `agent_id` (nullable, nếu type=AGENT)
- `config` (JSON: param custom, mapping input/output, điều kiện tiếp theo)
- `requires_approval` (bool) – riêng từng step AGENT có thể yêu cầu confirm
- `next_step_id` (nullable) – linear
- (v2) `next_step_on_approve`, `next_step_on_reject`
- `created_at`, `updated_at`

---

### 3.6. WorkflowExecution

Mỗi lần user bấm “Run workflow” là 1 execution.

- `id`
- `workflow_id`
- `project_id`
- `user_id`
- `status` (pending, running, waiting_approval, completed, failed, cancelled)
- `input` (JSON – input ban đầu)
- `result` (JSON – output cuối)
- `created_at`, `updated_at`

### 3.7. WorkflowExecutionStep

Log từng bước trong một execution.

- `id`
- `execution_id`
- `step_id`
- `agent_id` (nullable)
- `status` (pending, running, waiting_approval, approved, rejected, success, failed)
- `input` (JSON)
- `output` (JSON)
- `error` (text nullable)
- `started_at`
- `finished_at`

---

## 4. Orchestrator (ở Backend API)

### 4.1. Nhiệm vụ

- Nhận yêu cầu: `POST /workflows/{id}/run`
- Tạo 1 `WorkflowExecution`
- Chạy từng `WorkflowStep` theo thứ tự (hoặc graph)
- Gọi đúng **Agent** khi tới step type `AGENT`
- Nếu step cần confirm → dừng execution, đặt status `waiting_approval`
- Sau khi user xác nhận → chạy tiếp
- Lưu log state của từng step → phục vụ UI hiển thị state

### 4.2. Luồng đơn giản (v1)

1. Execution created: status = `running`
2. Lấy step đầu tiên (lowest `step_number` chưa chạy)
3. Nếu `type = AGENT`:

- Build input từ:

- `execution.input`
- kết quả step trước (`prev_step.output`)
- mapping trong `WorkflowStep.config`
- Gọi AgentService → gọi LLM / tool
- Lưu output vào `WorkflowExecutionStep.output`
- Nếu `requires_approval = true`:

- Set `execution.status = waiting_approval`
- Dừng
- Ngược lại → tiếp tục step sau
4. Nếu `type = MANUAL_REVIEW`:

- Tạo step record với status = `waiting_approval`
- Dừng
5. Khi user approve:

- `POST /executions/{id}/steps/{stepId}/approve`
- Orchestrator resume từ step tiếp theo
6. Nếu tới `END` step → `execution.status = completed`

---

## 5. API Spec (v1 – high-level)

Chỉ liệt kê endpoints chính, đủ cho dev triển khai.

### 5.1. Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

---

### 5.2. Agent CRUD

- `GET /agents` – list agents (user + system)
- `POST /agents` – create new agent
- `GET /agents/{id}`
- `PUT /agents/{id}`
- `DELETE /agents/{id}`

Body khi tạo/sửa:

```
{
  "name": "Insight Extractor",
  "description": "Chiết xuất insight từ text",
  "type": "llm",
  "model": "gpt-4.1",
  "prompt_system": "You are ...",
  "prompt_template": "Input:\n{{text}}",
  "input_schema": {...},
  "output_schema": {...},
  "temperature": 0.3,
  "max_tokens": 1024
}
```

---

### 5.3. Project CRUD

- `GET /projects`
- `POST /projects`
- `GET /projects/{id}`
- `PUT /projects/{id}`
- `DELETE /projects/{id}`

---

### 5.4. Workflow CRUD

- `GET /projects/{projectId}/workflows`
- `POST /projects/{projectId}/workflows`
- `GET /workflows/{id}`
- `PUT /workflows/{id}`
- `DELETE /workflows/{id}`

---

### 5.5. WorkflowSteps CRUD

- `GET /workflows/{workflowId}/steps`
- `POST /workflows/{workflowId}/steps`
- `PUT /workflows/{workflowId}/steps/{stepId}`
- `DELETE /workflows/{workflowId}/steps/{stepId}`

---

### 5.6. Orchestrator / Execution

- `POST /workflows/{id}/run`

- body: `input` (JSON)
- response: execution summary
- `GET /executions/{id}` – trạng thái tổng
- `GET /executions/{id}/steps` – log từng step
- `POST /executions/{id}/steps/{stepId}/approve`
- `POST /executions/{id}/steps/{stepId}/reject`
- `POST /executions/{id}/cancel`

---

## 6. Frontend Spec

### 6.1. Style

- **Minimalist**
- **Creator style, tím nhạt, sáng**:

- Background: trắng / xám rất nhạt
- Accent primary: tím nhạt (#a855f7 / #c084fc style)
- Font: Sans (Inter / SF)
- Nhiều whitespace, layout thoáng
- Icon mảnh, line-based

---

### 6.2. Layout chung

- **Top bar**:

- Logo: “Content Factory”
- Nút: “New Project”
- User avatar / settings
- **Sidebar trái**:

- Dashboard
- Projects
- Workflows
- Agents
- Executions (Runs)
- Settings

---

### 6.3. Màn hình chính

#### 1) Dashboard

- Box “Quick start”:

- New Project
- New Agent
- New Workflow
- List:

- Recent Projects
- Recent Executions (+ status badge: running, waiting, done, failed)

---

#### 2) Projects List

- Bảng:

- Name
- Status
- #Workflows
- Last run
- Actions:

- View / Edit / Archive / Delete

#### 3) Project Detail

- Tabs:

- Overview
- Workflows
- Executions
- Nút “Create Workflow from template”

---

#### 4) Agent Library

- List các Agent:

- Name
- Type (LLM / Tool)
- Model
- Active / Inactive
- Actions:

- Create / Duplicate / Edit / Delete
- Edit modal:

- Textarea prompt_system
- Prompt_template
- Model, temperature, max_tokens

---

#### 5) Workflow Builder (cốt lõi UX)

Có 2 chế độ:

1. **List view** (v1):

- Steps hiển thị theo list:

1. Agent A
2. Manual Review
3. Agent B
- Drag & drop reorder
- Inline select agent / type / config
2. (v2) **Canvas view** (flowchart)

**Step item** hiển thị:

- Icon theo type (Agent vs Review vs End)
- Name
- Subtitle: tên agent hoặc “Review”
- Switch: “Require approval?”
- Dropdown: “Next step” (nếu không linear)

Nút **“Run Workflow”** ngay trên header.

---

#### 6) Run Workflow / Execution Detail

Khi user chạy workflow:

- Form input (JSON editor / form friendly)
- Sau khi run:

- Timeline steps:

| Step | Type | Agent | Status |
| --- | --- | --- | --- |
| #1 | Agent | InsightAgent | ✅ Done |
| #2 | Agent | SeedAgent | ⏳ Waiting approval |
| #3 | Agent | ScriptAgent | ⏹ Not started |
- Khi step ở trạng thái `waiting_approval`:

- Panel phải hiển thị output (insights / seeds / script)
- Cho phép user:

- Edit text
- Approve (→ tiếp tục)
- Reject (→ fail hoặc chọn agent khác – v2)

State hiển thị rõ:

- Badge color:

- Grey: pending
- Blue: running
- Yellow: waiting_approval
- Green: success
- Red: failed

---

## 7. Orchestrator – State & UX kết hợp

- **Backend** giữ state thật trong DB (Execution + ExecutionStep)
- **Frontend** poll hoặc dùng WebSocket:

- `GET /executions/{id}` mỗi 2–3s
- hoặc subscribe WS channel “execution:{id}”
- UI cập nhật live step state (kiểu “pipeline run”).

---

## 8. Tóm tắt lại những gì bạn yêu cầu – đã cover:

- ✅ **Frontend → API → DB**
- ✅ **Agents định nghĩa ở backend, CRUD được**
- ✅ **Orchestrator điều phối thứ tự Agent**
- ✅ **User tự thiết kế workflow (chọn Agent + thứ tự + điểm cần xác nhận)**
- ✅ **Run workflow, xem state từng Agent**
- ✅ **Mỗi workflow = 1 project, project có CRUD**
- ✅ **UI minimalist, creator style, tím nhạt, sáng**