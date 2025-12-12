**OpenAPI spec** chuẩn để team backend có thể nhét thẳng vào FastAPI (hoặc dùng để generate client).

Dùng **OpenAPI 3.1, YAML**, với:

- Auth: Bearer JWT (đơn giản, có thể map sang Supabase Auth sau)
- Entities: Agents, Projects, Workflows, WorkflowSteps, Executions
- Orchestrator endpoints: run workflow, approve/reject step

Bạn có thể **copy nguyên block YAML** này vào file `openapi.yaml`, hoặc dùng làm tham chiếu khi code FastAPI.

----------------------------------------------------------------------

openapi: 3.1.0

info:

  title: Content Factory API

  version: 1.0.0

  description: >

    Backend API for Content Factory web app.

    Stack: FastAPI + Supabase. 

    Supports Agent CRUD, Project/Workflow CRUD, and an Orchestrator that runs workflows composed of Agents.

servers:

  - url: https://api.content-factory.local

    description: Local / Dev server (example)

security:

  - bearerAuth: []

components:

  securitySchemes:

    bearerAuth:

      type: http

      scheme: bearer

      bearerFormat: JWT

  schemas:

    UUID:

      type: string

      format: uuid

      example: "2f1b9e9c-2e02-4f2b-bf51-f46c28cabcde"

    ErrorResponse:

      type: object

      properties:

        detail:

          type: string

    UserSummary:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        email:

          type: string

          format: email

        name:

          type: string

      required: [id, email]

    AgentType:

      type: string

      enum: [llm, tool, webhook]

    Agent:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        owner_id:

          $ref: '#/components/schemas/UUID'

        name:

          type: string

        slug:

          type: string

        description:

          type: string

        type:

          $ref: '#/components/schemas/AgentType'

        model:

          type: string

          description: LLM model identifier (e.g. gpt-4.1, anthropic/claude-3-haiku)

        prompt_system:

          type: string

        prompt_template:

          type: string

          description: Prompt template using {{variables}}

        input_schema:

          type: object

          nullable: true

        output_schema:

          type: object

          nullable: true

        temperature:

          type: number

          format: float

          default: 0.3

        max_tokens:

          type: integer

          default: 1024

        is_active:

          type: boolean

          default: true

        created_at:

          type: string

          format: date-time

        updated_at:

          type: string

          format: date-time

      required:

        - id

        - owner_id

        - name

        - type

        - model

        - prompt_system

        - prompt_template

        - is_active

    AgentCreate:

      type: object

      properties:

        name:

          type: string

        slug:

          type: string

        description:

          type: string

        type:

          $ref: '#/components/schemas/AgentType'

        model:

          type: string

        prompt_system:

          type: string

        prompt_template:

          type: string

        input_schema:

          type: object

          nullable: true

        output_schema:

          type: object

          nullable: true

        temperature:

          type: number

          format: float

          default: 0.3

        max_tokens:

          type: integer

          default: 1024

        is_active:

          type: boolean

          default: true

      required:

        - name

        - type

        - model

        - prompt_system

        - prompt_template

    AgentUpdate:

      type: object

      properties:

        name:

          type: string

        slug:

          type: string

        description:

          type: string

        model:

          type: string

        prompt_system:

          type: string

        prompt_template:

          type: string

        input_schema:

          type: object

          nullable: true

        output_schema:

          type: object

          nullable: true

        temperature:

          type: number

          format: float

        max_tokens:

          type: integer

        is_active:

          type: boolean

    ProjectStatus:

      type: string

      enum: [active, archived]

    Project:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        owner_id:

          $ref: '#/components/schemas/UUID'

        name:

          type: string

        description:

          type: string

        status:

          $ref: '#/components/schemas/ProjectStatus'

        created_at:

          type: string

          format: date-time

        updated_at:

          type: string

          format: date-time

      required:

        - id

        - owner_id

        - name

        - status

    ProjectCreate:

      type: object

      properties:

        name:

          type: string

        description:

          type: string

      required: [name]

    ProjectUpdate:

      type: object

      properties:

        name:

          type: string

        description:

          type: string

        status:

          $ref: '#/components/schemas/ProjectStatus'

    Workflow:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        project_id:

          $ref: '#/components/schemas/UUID'

        name:

          type: string

        description:

          type: string

        is_active:

          type: boolean

        created_at:

          type: string

          format: date-time

        updated_at:

          type: string

          format: date-time

      required:

        - id

        - project_id

        - name

        - is_active

    WorkflowCreate:

      type: object

      properties:

        name:

          type: string

        description:

          type: string

      required: [name]

    WorkflowUpdate:

      type: object

      properties:

        name:

          type: string

        description:

          type: string

        is_active:

          type: boolean

    WorkflowStepType:

      type: string

      enum: [AGENT, MANUAL_REVIEW, END]

    WorkflowStep:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        workflow_id:

          $ref: '#/components/schemas/UUID'

        step_number:

          type: integer

        name:

          type: string

        type:

          $ref: '#/components/schemas/WorkflowStepType'

        agent_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

        requires_approval:

          type: boolean

          default: false

        config:

          type: object

          nullable: true

          description: |

            JSON config (input mapping, output mapping, any custom parameters).

        next_step_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

        created_at:

          type: string

          format: date-time

        updated_at:

          type: string

          format: date-time

      required:

        - id

        - workflow_id

        - step_number

        - name

        - type

    WorkflowStepCreate:

      type: object

      properties:

        step_number:

          type: integer

        name:

          type: string

        type:

          $ref: '#/components/schemas/WorkflowStepType'

        agent_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

        requires_approval:

          type: boolean

          default: false

        config:

          type: object

          nullable: true

        next_step_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

      required:

        - step_number

        - name

        - type

    WorkflowStepUpdate:

      type: object

      properties:

        step_number:

          type: integer

        name:

          type: string

        type:

          $ref: '#/components/schemas/WorkflowStepType'

        agent_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

        requires_approval:

          type: boolean

        config:

          type: object

          nullable: true

        next_step_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

    ExecutionStatus:

      type: string

      enum: [pending, running, waiting_approval, completed, failed, cancelled]

    ExecutionStepStatus:

      type: string

      enum: [pending, running, waiting_approval, approved, rejected, success, failed]

    WorkflowExecution:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        workflow_id:

          $ref: '#/components/schemas/UUID'

        project_id:

          $ref: '#/components/schemas/UUID'

        user_id:

          $ref: '#/components/schemas/UUID'

        status:

          $ref: '#/components/schemas/ExecutionStatus'

        input:

          type: object

        result:

          type: object

          nullable: true

        created_at:

          type: string

          format: date-time

        updated_at:

          type: string

          format: date-time

      required:

        - id

        - workflow_id

        - project_id

        - user_id

        - status

        - input

    WorkflowExecutionCreate:

      type: object

      properties:

        input:

          type: object

          description: Arbitrary JSON input for the workflow.

      required: [input]

    WorkflowExecutionStep:

      type: object

      properties:

        id:

          $ref: '#/components/schemas/UUID'

        execution_id:

          $ref: '#/components/schemas/UUID'

        step_id:

          $ref: '#/components/schemas/UUID'

        agent_id:

          $ref: '#/components/schemas/UUID'

          nullable: true

        status:

          $ref: '#/components/schemas/ExecutionStepStatus'

        input:

          type: object

        output:

          type: object

          nullable: true

        error:

          type: string

          nullable: true

        started_at:

          type: string

          format: date-time

          nullable: true

        finished_at:

          type: string

          format: date-time

          nullable: true

      required:

        - id

        - execution_id

        - step_id

        - status

        - input

paths:

  /auth/me:

    get:

      summary: Get current user

      security:

        - bearerAuth: []

      responses:

        '200':

          description: Current user info

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/UserSummary'

        '401':

          description: Unauthorized

  /agents:

    get:

      summary: List all agents for current user (plus system agents if applicable)

      security:

        - bearerAuth: []

      responses:

        '200':

          description: List of agents

          content:

            application/json:

              schema:

                type: array

                items:

                  $ref: '#/components/schemas/Agent'

    post:

      summary: Create a new agent

      security:

        - bearerAuth: []

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/AgentCreate'

      responses:

        '201':

          description: Agent created

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Agent'

        '400':

          description: Invalid data

  /agents/{agentId}:

    get:

      summary: Get an agent by ID

      security:

        - bearerAuth: []

      parameters:

        - name: agentId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Agent

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Agent'

        '404':

          description: Not found

    put:

      summary: Update an agent

      security:

        - bearerAuth: []

      parameters:

        - name: agentId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/AgentUpdate'

      responses:

        '200':

          description: Updated agent

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Agent'

        '404':

          description: Not found

    delete:

      summary: Delete an agent

      security:

        - bearerAuth: []

      parameters:

        - name: agentId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '204':

          description: Deleted

        '404':

          description: Not found

  /projects:

    get:

      summary: List projects

      security:

        - bearerAuth: []

      responses:

        '200':

          description: List of projects

          content:

            application/json:

              schema:

                type: array

                items:

                  $ref: '#/components/schemas/Project'

    post:

      summary: Create a project

      security:

        - bearerAuth: []

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/ProjectCreate'

      responses:

        '201':

          description: Created project

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Project'

  /projects/{projectId}:

    get:

      summary: Get a project by ID

      security:

        - bearerAuth: []

      parameters:

        - name: projectId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Project

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Project'

        '404':

          description: Not found

    put:

      summary: Update a project

      security:

        - bearerAuth: []

      parameters:

        - name: projectId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/ProjectUpdate'

      responses:

        '200':

          description: Updated project

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Project'

        '404':

          description: Not found

    delete:

      summary: Delete a project

      security:

        - bearerAuth: []

      parameters:

        - name: projectId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '204':

          description: Deleted

        '404':

          description: Not found

  /projects/{projectId}/workflows:

    get:

      summary: List workflows for a project

      security:

        - bearerAuth: []

      parameters:

        - name: projectId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: List of workflows

          content:

            application/json:

              schema:

                type: array

                items:

                  $ref: '#/components/schemas/Workflow'

    post:

      summary: Create workflow for project

      security:

        - bearerAuth: []

      parameters:

        - name: projectId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/WorkflowCreate'

      responses:

        '201':

          description: Created workflow

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Workflow'

  /workflows/{workflowId}:

    get:

      summary: Get workflow

      security:

        - bearerAuth: []

      parameters:

        - name: workflowId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Workflow

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Workflow'

        '404':

          description: Not found

    put:

      summary: Update workflow

      security:

        - bearerAuth: []

      parameters:

        - name: workflowId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/WorkflowUpdate'

      responses:

        '200':

          description: Updated workflow

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/Workflow'

        '404':

          description: Not found

    delete:

      summary: Delete workflow

      security:

        - bearerAuth: []

      parameters:

        - name: workflowId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '204':

          description: Deleted

        '404':

          description: Not found

  /workflows/{workflowId}/steps:

    get:

      summary: List workflow steps

      security:

        - bearerAuth: []

      parameters:

        - name: workflowId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: List of steps

          content:

            application/json:

              schema:

                type: array

                items:

                  $ref: '#/components/schemas/WorkflowStep'

    post:

      summary: Create workflow step

      security:

        - bearerAuth: []

      parameters:

        - name: workflowId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/WorkflowStepCreate'

      responses:

        '201':

          description: Created step

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowStep'

  /workflow-steps/{stepId}:

    put:

      summary: Update workflow step

      security:

        - bearerAuth: []

      parameters:

        - name: stepId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/WorkflowStepUpdate'

      responses:

        '200':

          description: Updated step

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowStep'

        '404':

          description: Not found

    delete:

      summary: Delete workflow step

      security:

        - bearerAuth: []

      parameters:

        - name: stepId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '204':

          description: Deleted

        '404':

          description: Not found

  /workflows/{workflowId}/run:

    post:

      summary: Run workflow (create execution and start orchestrator)

      security:

        - bearerAuth: []

      parameters:

        - name: workflowId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: true

        content:

          application/json:

            schema:

              $ref: '#/components/schemas/WorkflowExecutionCreate'

      responses:

        '201':

          description: Execution created and started

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowExecution'

        '404':

          description: Workflow not found

  /executions/{executionId}:

    get:

      summary: Get execution status

      security:

        - bearerAuth: []

      parameters:

        - name: executionId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Execution summary

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowExecution'

        '404':

          description: Not found

  /executions/{executionId}/steps:

    get:

      summary: List execution steps with status

      security:

        - bearerAuth: []

      parameters:

        - name: executionId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Execution steps

          content:

            application/json:

              schema:

                type: array

                items:

                  $ref: '#/components/schemas/WorkflowExecutionStep'

        '404':

          description: Not found

  /executions/{executionId}/steps/{stepId}/approve:

    post:

      summary: Approve a waiting_approval step and resume workflow

      security:

        - bearerAuth: []

      parameters:

        - name: executionId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

        - name: stepId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      requestBody:

        required: false

        content:

          application/json:

            schema:

              type: object

              description: Optional edited output payload from the user.

              additionalProperties: true

      responses:

        '200':

          description: Step approved, execution resumed (may still be running)

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowExecution'

        '400':

          description: Step not in waiting_approval state

        '404':

          description: Execution or step not found

  /executions/{executionId}/steps/{stepId}/reject:

    post:

      summary: Reject a waiting_approval step (execution may be marked failed or cancelled)

      security:

        - bearerAuth: []

      parameters:

        - name: executionId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

        - name: stepId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Step rejected, execution marked failed or waiting manual handling

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowExecution'

        '404':

          description: Execution or step not found

  /executions/{executionId}/cancel:

    post:

      summary: Cancel an execution

      security:

        - bearerAuth: []

      parameters:

        - name: executionId

          in: path

          required: true

          schema:

            $ref: '#/components/schemas/UUID'

      responses:

        '200':

          description: Execution cancelled

          content:

            application/json:

              schema:

                $ref: '#/components/schemas/WorkflowExecution'

        '404':

          description: Not found