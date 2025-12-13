const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Agent = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  model: string;
  prompt_system?: string | null;
  prompt_template?: string | null;
  input_schema?: any | null;
  output_schema?: any | null;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LLMModelInfo = {
  id: string;
  label: string;
};

export type LLMProviderInfo = {
  id: string;
  name: string;
  enabled: boolean;
  models: LLMModelInfo[];
};

export type Workflow = {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowExecution = {
  id: string;
  workflow_id: string | null;
  project_id: string | null;
  status: string;
  input: any;
  result?: any | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowExecutionStep = {
  id: string;
  execution_id: string;
  step_id?: string | null;
  agent_id?: string | null;
  status: string;
  input?: any;
  output?: any;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type WorkflowStep = {
  id: string;
  workflow_id: string;
  step_number: number;
  name: string;
  type: string;
  agent_id?: string | null;
  requires_approval: boolean;
  config?: any | null;
  next_step_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }

  if (res.status === 204) {
    // no content
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

// Projects
export function listProjects() {
  return request<Project[]>("/projects");
}

export function getProject(id: string) {
  return request<Project>(`/projects/${id}`);
}

export function createProject(payload: { name: string; description?: string }) {
  return request<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProject(id: string, payload: { name?: string; description?: string }) {
  return request<Project>(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProject(id: string) {
  return request<void>(`/projects/${id}`, {
    method: "DELETE",
  });
}

// Agents
export function listAgents() {
  return request<Agent[]>("/agents");
}

export function getAgent(id: string) {
  return request<Agent>(`/agents/${id}`);
}

export type AgentCreatePayload = {
  name: string;
  description?: string;
  type?: string;
  model?: string;
  prompt_system?: string;
  prompt_template?: string;
  input_schema?: any;
  output_schema?: any;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
};

export type AgentUpdatePayload = {
  name?: string;
  description?: string;
  type?: string;
  model?: string;
  prompt_system?: string;
  prompt_template?: string;
  input_schema?: any;
  output_schema?: any;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
};

export function createAgent(payload: AgentCreatePayload) {
  return request<Agent>("/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgent(id: string, payload: AgentUpdatePayload) {
  return request<Agent>(`/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAgent(id: string) {
  return request<void>(`/agents/${id}`, {
    method: "DELETE",
  });
}

// LLM config
export function listLLMProviders() {
  return request<LLMProviderInfo[]>("/llm/providers");
}

// Workflows
export function listWorkflows() {
  return request<Workflow[]>("/workflows");
}

export function listWorkflowsByProject(projectId: string) {
  return request<Workflow[]>(`/workflows/by-project/${projectId}`);
}

export function getWorkflow(id: string) {
  return request<Workflow>(`/workflows/${id}`);
}

export function createWorkflowForProject(projectId: string, payload: { name: string; description?: string }) {
  return request<Workflow>(`/workflows/projects/${projectId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorkflow(id: string, payload: { name?: string; description?: string; status?: string }) {
  return request<Workflow>(`/workflows/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteWorkflow(id: string) {
  return request<void>(`/workflows/${id}`, {
    method: "DELETE",
  });
}

// Workflow steps
export function listWorkflowSteps(workflowId: string) {
  return request<WorkflowStep[]>(`/workflows/${workflowId}/steps`);
}

export function createWorkflowStep(
  workflowId: string,
  payload: {
    step_number: number;
    name: string;
    type: string;
    agent_id?: string | null;
    requires_approval?: boolean;
    config?: any;
    next_step_id?: string | null;
  },
) {
  return request<WorkflowStep>(`/workflows/${workflowId}/steps`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorkflowStep(
  workflowId: string,
  stepId: string,
  payload: {
    step_number?: number;
    name?: string;
    type?: string;
    agent_id?: string | null;
    requires_approval?: boolean;
    config?: any;
    next_step_id?: string | null;
  },
) {
  return request<WorkflowStep>(`/workflows/${workflowId}/steps/${stepId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteWorkflowStep(workflowId: string, stepId: string) {
  return request<void>(`/workflows/${workflowId}/steps/${stepId}`, {
    method: "DELETE",
  });
}

// Executions
export function getExecution(id: string) {
  return request<WorkflowExecution>(`/executions/${id}`);
}

export function listExecutionSteps(executionId: string) {
  return request<WorkflowExecutionStep[]>(`/executions/${executionId}/steps`);
}

export function runWorkflow(
  workflowId: string,
  payload: { input: any },
) {
  return request<WorkflowExecution>(`/executions/workflows/${workflowId}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveExecutionStep(executionId: string, stepExecId: string, payload?: { approved_by?: string; comment?: string }) {
  return request<WorkflowExecution>(`/executions/${executionId}/steps/${stepExecId}/approve`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function rejectExecutionStep(executionId: string, stepExecId: string, payload?: { rejected_by?: string; reason?: string }) {
  return request<WorkflowExecution>(`/executions/${executionId}/steps/${stepExecId}/reject`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function cancelExecution(executionId: string) {
  return request<WorkflowExecution>(`/executions/${executionId}/cancel`, {
    method: "POST",
  });
}
