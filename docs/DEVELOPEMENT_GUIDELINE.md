
# 📘 CONTENT FACTORY — DEVELOPMENT GUIDELINE (Full Spec A → F)
Version: 1.0  
Audience: Engineering Team (Frontend + Backend + Infra)  
Purpose: Hướng dẫn thực thi các hạng mục A → F để hoàn thiện hệ thống Content Factory.

---

# ⚙️ A) SUPABASE + DATABASE LAYER — IMPLEMENTATION GUIDE

## 1. Setup Supabase Project
- Tạo Supabase project → lấy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- Bật Postgres, Auth, Storage

## 2. Initialize Prisma (FastAPI backend)
```bash
pip install prisma
prisma init
```

## 3. Prisma Schema
```prisma
model Agent {
  id              String   @id @default(uuid())
  name            String
  type            String
  model           String
  prompt_system   String?
  prompt_template String?
  temperature     Float? @default(0.3)
  is_active       Boolean @default(true)
  created_at      DateTime @default(now())
}

model Workflow {
  id          String   @id @default(uuid())
  project_id  String
  name        String
  description String?
  created_at  DateTime @default(now())
}

model WorkflowStep {
  id             String   @id @default(uuid())
  workflow_id    String
  step_number    Int
  type           String
  agent_id       String?
  requires_approval Boolean @default(false)
  config         Json?
}

model Execution {
  id          String @id @default(uuid())
  workflow_id String
  status      String
  input       Json
  result      Json?
  created_at  DateTime @default(now())
}
```

## 4. Migration
```bash
prisma migrate dev --name init
```

## 5. RLS Policy Example
```sql
create policy "user_access" on agents for select using (true);
```

---

# ⚙️ B) ORCHESTRATOR V2 — ENGINE SPEC

## 1. Mục tiêu
- Chạy workflow đa bước tuần tự  
- Loại step: AGENT, MANUAL_REVIEW, END  
- Pause workflow tại bước yêu cầu duyệt  
- Resume และ retry  
- Logging input/output  

## 2. Kiến trúc module
```
services/orchestrator/
  runner.py
  executor.py
  mapper.py
  events.py
```

## 3. Logic Pseudo-code
```python
class OrchestratorRunner:
    def __init__(self, db, agent_runner):
        self.db = db
        self.agent_runner = agent_runner

    async def run(self, execution_id):
        execution = db.get_execution(execution_id)
        steps = db.get_steps(execution.workflow_id)
        data = execution.input

        for step in steps:
            if step.type == "AGENT":
                agent = db.get_agent(step.agent_id)
                output = await self.agent_runner.run(agent, data)
                data = output
                db.log_step(...)

            elif step.type == "MANUAL_REVIEW":
                db.mark_waiting(step.id)
                return STOP

            elif step.type == "END":
                break

        db.mark_execution_complete(data)
        return data
```

---

# ⚙️ C) WORKFLOW BUILDER UI — SPEC

## 1. Màn hình chính
```
Project > Workflow > Builder
```

## 2. Chức năng
- Add Step (Agent / Manual / End)  
- Edit Step  
- Delete Step  
- Drag & Drop reorder  
- Input/Output mapping  
- Toggle `requires_approval`  

## 3. Components
```
components/workflow/
  StepCard.tsx
  StepEditor.tsx
  StepList.tsx
  WorkflowHeader.tsx
```

## 4. Zustand store
```ts
{
  steps: Step[];
  addStep(type);
  updateStep(id, data);
  deleteStep(id);
  reorderSteps(from, to);
}
```

---

# ⚙️ D) AUTHENTICATION — SPEC

## Option 1: Supabase Auth
- Login / Signup  
- JWT auto-managed  
- Backend validates token

### Backend Middleware Example
```python
async def get_current_user(auth: str = Header(None)):
    if not auth:
        raise HTTPException(401)
    token = auth.replace("Bearer ", "")
    payload = jwt.decode(token, options={"verify_signature": False})
    return payload
```

---

# ⚙️ E) DEPLOYMENT — SPEC

## 1. Frontend Dockerfile
```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## 2. Full docker-compose
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}

  frontend:
    build: ./frontend
    ports: ["3000:3000"]

  nginx:
    image: nginx
    ports: ["80:80", "443:443"]
    volumes:
      - ./infra/nginx.conf:/etc/nginx/nginx.conf
```

## 3. NGINX routing
```
/api → backend
/ → frontend
```

---

# ⚙️ F) API CLIENT SDK (FRONTEND)

## 1. API wrapper
```ts
export const api = {
  agents: {
    list: () => fetch(`/api/agents`).then(r => r.json()),
    create: (body) =>
      fetch(`/api/agents`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body)
      }).then(r => r.json())
  }
};
```

## 2. React Hook
```ts
export function useAgents() {
  const [data, setData] = useState([]);
  useEffect(() => {
    api.agents.list().then(setData);
  }, []);
  return data;
}
```

---

# ✅ KẾT LUẬN
Tài liệu này là nền tảng kỹ thuật đầy đủ để triển khai:

- Database với Supabase + Prisma  
- Orchestrator V2  
- Workflow Builder UI  
- Auth  
- Deployment stack  
- API Client SDK  

**Team dev có thể bắt đầu ngay.**
