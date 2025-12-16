from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import json
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db_models import (
    Agent,
    Workflow,
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowStep,
)
from services.llm_provider import LLMProvider


class Orchestrator:
    """Simple sequential orchestrator.

    v1 assumptions:
    - Steps are executed in order of step_number.
    - Supports step types: AGENT, MANUAL_REVIEW, END.
    - For MANUAL_REVIEW or AGENT with requires_approval=True, execution pauses
      with status "waiting_approval" and resumes via explicit approve endpoint.
    """

    def __init__(self, session: AsyncSession, llm: LLMProvider):
        self.session = session
        self.llm = llm

    def _try_extract_json_object(self, text: str) -> Optional[Dict[str, Any]]:
        """Best-effort extraction of a JSON object from a free-form string.

        Used when the model returns explanations or markdown code fences around
        the actual JSON payload.
        """
        if not isinstance(text, str):
            return None

        candidate = text.strip()
        # Handle markdown fenced code blocks like ```json ... ```
        if candidate.startswith("```") and candidate.endswith("```"):
            lines = candidate.splitlines()
            # Drop first fence line
            if lines:
                lines = lines[1:]
            # Drop last fence line if present
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            candidate = "\n".join(lines).strip()

        # First try full candidate
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        # Fallback: try substring between first '{' and last '}'
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and start < end:
            snippet = candidate[start : end + 1]
            try:
                parsed = json.loads(snippet)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        return None

    async def _get_ordered_steps(self, workflow_id) -> List[WorkflowStep]:
        stmt = (
            select(WorkflowStep)
            .where(WorkflowStep.workflow_id == workflow_id)
            .order_by(WorkflowStep.step_number.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def _resolve_workflow_output_input_source(
        self,
        *,
        upstream_workflow_id: str,
        project_id: Any,
    ) -> Dict[str, Any]:
        """Resolve upstream workflow output for input_source.

        - Uses latest completed execution for the upstream workflow.
        - Filters returned data by upstream workflow.output_config.
        - Raises ValueError for any missing/invalid state (hard error).
        """

        if not upstream_workflow_id:
            raise ValueError("input_source.workflow_id is required")
        if not project_id:
            raise ValueError("Execution project_id is missing")

        upstream_wf = await self.session.get(Workflow, upstream_workflow_id)
        if upstream_wf is None:
            raise ValueError("Upstream workflow not found")

        if getattr(upstream_wf, "project_id", None) != project_id:
            raise ValueError("Upstream workflow must be in the same project")

        oc = getattr(upstream_wf, "output_config", None)
        output_config: List[str] = [str(x) for x in oc] if isinstance(oc, list) else []
        output_config = [k.strip() for k in output_config if isinstance(k, str) and k.strip()]
        if not output_config:
            raise ValueError("Upstream workflow has no output_config defined")

        stmt = (
            select(WorkflowExecution)
            .where(WorkflowExecution.workflow_id == upstream_workflow_id)
            .where(WorkflowExecution.project_id == project_id)
            .where(func.lower(WorkflowExecution.status) == "completed")
            .order_by(WorkflowExecution.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        latest = result.scalars().first()
        if latest is None:
            raise ValueError("Upstream workflow has no completed execution")

        raw_result = getattr(latest, "result", None)
        if not isinstance(raw_result, dict) or not raw_result:
            raise ValueError("Upstream latest execution has no result")

        filtered: Dict[str, Any] = {k: raw_result.get(k) for k in output_config if k in raw_result}
        if not filtered:
            raise ValueError("Upstream latest execution result has no keys from output_config")

        return filtered

    async def start_execution(
        self,
        workflow: Workflow,
        project_id: Optional[str],
        user_id: Optional[str],
        input_payload: Dict[str, Any],
    ) -> WorkflowExecution:
        execution = WorkflowExecution(
            workflow_id=str(workflow.id),
            project_id=project_id,
            user_id=user_id,
            input=input_payload,
            status="running",
        )
        self.session.add(execution)
        await self.session.commit()
        await self.session.refresh(execution)

        await self.run_until_pause_or_end(execution)
        return execution

    async def run_until_pause_or_end(self, execution: WorkflowExecution) -> WorkflowExecution:
        """Continue execution from the last finished step until pause or END."""

        steps = await self._get_ordered_steps(execution.workflow_id)
        # Build a dict of existing execution steps for quick lookup
        stmt = select(WorkflowExecutionStep).where(
            WorkflowExecutionStep.execution_id == execution.id
        )
        result = await self.session.execute(stmt)
        existing_steps = {str(s.step_id): s for s in result.scalars().all() if s.step_id}

        current_data: Dict[str, Any] = execution.input or {}

        # Workflow Configuration Schema (WCS): persisted on Workflow, but can be overridden per-run
        # via a reserved key in execution.input.
        workflow_wcs: Dict[str, Any] = {}

        if isinstance(current_data, dict):
            # Prefer the new key, but keep legacy compatibility.
            raw = None
            if "__workflow_wcs" in current_data:
                raw = current_data.pop("__workflow_wcs", None)
            elif "__workflow_config" in current_data:
                raw = current_data.pop("__workflow_config", None)

            if isinstance(raw, dict):
                workflow_wcs = raw

        # If the run did not provide WCS, fall back to the persisted workflow.wcs.
        if not workflow_wcs:
            try:
                wf = await self.session.get(Workflow, execution.workflow_id)
                if wf is not None and isinstance(getattr(wf, "wcs", None), dict):
                    workflow_wcs = wf.wcs  # type: ignore[assignment]
            except Exception:
                pass

        first_agent_step_id: Optional[str] = None
        for s in steps:
            if getattr(s, "type", None) == "AGENT":
                first_agent_step_id = str(getattr(s, "id", ""))
                break

        input_source_applied = False

        for step in steps:
            step_key = str(step.id)
            if step_key in existing_steps:
                # Already processed: merge previous output (if dict) and skip
                last_output = existing_steps[step_key].output
                if isinstance(last_output, dict):
                    current_data.update(last_output)
                continue

            # Generic input step: treat its config as initial structured input
            if step.type == "GENERIC":
                exec_step = WorkflowExecutionStep(
                    execution_id=execution.id,
                    step_id=step.id,
                    status="success",
                    input=current_data,
                    started_at=datetime.utcnow(),
                )

                raw_config = step.config or {}
                raw_text = raw_config.get("input_text") if isinstance(raw_config, dict) else None

                parsed: Dict[str, Any]
                if isinstance(raw_text, str) and raw_text.strip():
                    try:
                        parsed = json.loads(raw_text)
                    except Exception:
                        # Fallback: wrap non-JSON text
                        parsed = {"raw_input": raw_text}
                else:
                    parsed = {}

                exec_step.output = parsed
                exec_step.finished_at = datetime.utcnow()
                self.session.add(exec_step)

                if isinstance(parsed, dict):
                    current_data.update(parsed)

                await self.session.commit()
                await self.session.refresh(exec_step)
                continue

            if step.type == "END":
                execution.status = "completed"
                execution.result = current_data
                await self.session.commit()
                await self.session.refresh(execution)
                await prune_workflow_executions(self.session, execution.workflow_id, keep_last=3)
                return execution

            if step.type == "MANUAL_REVIEW" or step.requires_approval:
                exec_step = WorkflowExecutionStep(
                    execution_id=execution.id,
                    step_id=step.id,
                    status="waiting_approval",
                    input=current_data,
                    started_at=datetime.utcnow(),
                )
                self.session.add(exec_step)
                execution.status = "waiting_approval"
                await self.session.commit()
                await self.session.refresh(execution)
                return execution

            if step.type == "AGENT":
                agent = await self.session.get(Agent, step.agent_id) if step.agent_id else None
                if not agent:
                    exec_step = WorkflowExecutionStep(
                        execution_id=execution.id,
                        step_id=step.id,
                        status="failed",
                        input=current_data,
                        error="Agent not found",
                        started_at=datetime.utcnow(),
                        finished_at=datetime.utcnow(),
                    )
                    self.session.add(exec_step)
                    execution.status = "failed"
                    await self.session.commit()
                    await self.session.refresh(execution)
                    return execution

                # Inject per-agent config from workflow WCS if present.
                raw_agent_config = workflow_wcs.get(str(agent.id)) if isinstance(workflow_wcs, dict) else None

                # Apply workflow-level input_source only once (first agent step only).
                is_first_agent_step = first_agent_step_id is not None and str(step.id) == first_agent_step_id
                if (
                    is_first_agent_step
                    and not input_source_applied
                    and len(existing_steps) == 0
                    and isinstance(raw_agent_config, dict)
                ):
                    input_source = raw_agent_config.get("input_source")
                    if isinstance(input_source, dict) and input_source.get("type") == "workflow_output":
                        upstream_workflow_id = input_source.get("workflow_id")
                        policy = input_source.get("policy")
                        if policy != "latest_completed":
                            exec_step = WorkflowExecutionStep(
                                execution_id=execution.id,
                                step_id=step.id,
                                agent_id=agent.id,
                                status="failed",
                                input=current_data,
                                error="Unsupported input_source policy",
                                started_at=datetime.utcnow(),
                                finished_at=datetime.utcnow(),
                            )
                            self.session.add(exec_step)
                            execution.status = "failed"
                            await self.session.commit()
                            await self.session.refresh(execution)
                            return execution

                        try:
                            upstream_data = await self._resolve_workflow_output_input_source(
                                upstream_workflow_id=str(upstream_workflow_id) if upstream_workflow_id else "",
                                project_id=getattr(execution, "project_id", None),
                            )
                        except ValueError as exc:
                            exec_step = WorkflowExecutionStep(
                                execution_id=execution.id,
                                step_id=step.id,
                                agent_id=agent.id,
                                status="failed",
                                input=current_data,
                                error=str(exc),
                                started_at=datetime.utcnow(),
                                finished_at=datetime.utcnow(),
                            )
                            self.session.add(exec_step)
                            execution.status = "failed"
                            await self.session.commit()
                            await self.session.refresh(execution)
                            return execution

                        current_data.update(upstream_data)
                        input_source_applied = True

                # Sanitize config passed to agents:
                # - First agent keeps input_source in config (so you can see it in input JSON)
                # - Later agents never see input_source in config
                agent_config = raw_agent_config
                if isinstance(raw_agent_config, dict) and not is_first_agent_step and "input_source" in raw_agent_config:
                    agent_config = dict(raw_agent_config)
                    agent_config.pop("input_source", None)

                # Determine which inputs should be passed to this agent.
                agent_input: Dict[str, Any] = dict(current_data)
                step_config = step.config if isinstance(step.config, dict) else {}
                selected_inputs = step_config.get("selected_inputs")
                if isinstance(selected_inputs, list) and selected_inputs:
                    # Normalize legacy keys for backward compatibility.
                    # Example: older UIs used "contents" for long-form output,
                    # but the current schema uses "long_form".
                    normalized_keys: List[str] = []
                    for key in selected_inputs:
                        if key == "contents":
                            if "long_form" in current_data:
                                normalized_keys.append("long_form")
                            else:
                                normalized_keys.append("contents")
                        else:
                            normalized_keys.append(key)

                    agent_input = {
                        key: value
                        for key, value in current_data.items()
                        if key in normalized_keys
                    }

                if isinstance(agent_config, dict):
                    agent_input = dict(agent_input)
                    agent_input["config"] = agent_config

                exec_step = WorkflowExecutionStep(
                    execution_id=execution.id,
                    step_id=step.id,
                    agent_id=agent.id,
                    status="running",
                    input=agent_input,
                    started_at=datetime.utcnow(),
                )
                self.session.add(exec_step)
                await self.session.commit()
                await self.session.refresh(exec_step)

                # Very simple prompt assembly: use prompt_system + prompt_template
                messages: List[Dict[str, Any]] = []
                if agent.prompt_system:
                    messages.append({"role": "system", "content": agent.prompt_system})

                # Build template data from agent_input and also expose it as {{input_json}}
                template_data: Dict[str, Any] = dict(agent_input)
                template_data["input_json"] = agent_input

                user_content = agent.prompt_template or ""
                # naive variable interpolation using {{key}}
                for key, value in (template_data or {}).items():
                    if isinstance(value, (dict, list)):
                        replacement = json.dumps(value, ensure_ascii=False)
                    else:
                        replacement = str(value)
                    user_content = user_content.replace(f"{{{{{key}}}}}", replacement)

                messages.append({"role": "user", "content": user_content})

                try:
                    raw = await self.llm.chat(
                        model=agent.model,
                        messages=messages,
                        temperature=agent.temperature,
                        max_tokens=agent.max_tokens,
                    )
                    # Extract assistant content from OpenAI/OpenRouter-style response
                    content = ""
                    choices = raw.get("choices") or []
                    if choices:
                        message = choices[0].get("message") or {}
                        content = message.get("content", "")

                    output: Dict[str, Any]
                    try:
                        import json as _json

                        output = _json.loads(content)
                    except Exception:
                        # Try to rescue a JSON object from within the text
                        extracted = self._try_extract_json_object(content)
                        if extracted is not None:
                            output = extracted
                        else:
                            output = {"raw_output": content}

                    # If the model returned a JSON object encoded as a string
                    # and we stored it under raw_output, try to parse it again
                    # so downstream steps see a proper structured payload
                    if (
                        isinstance(output, dict)
                        and set(output.keys()) == {"raw_output"}
                        and isinstance(output.get("raw_output"), str)
                    ):
                        inner = self._try_extract_json_object(output["raw_output"])
                        if inner is not None:
                            output = inner

                    exec_step.status = "success"
                    exec_step.output = output
                    exec_step.finished_at = datetime.utcnow()
                    current_data.update(output)
                    await self.session.commit()
                    await self.session.refresh(exec_step)
                except Exception as exc:  # pragma: no cover - network errors
                    exec_step.status = "failed"
                    # Ensure we always persist a helpful error message
                    message = str(exc) or repr(exc) or exc.__class__.__name__
                    exec_step.error = message
                    exec_step.finished_at = datetime.utcnow()
                    execution.status = "failed"
                    await self.session.commit()
                    await self.session.refresh(execution)
                    await prune_workflow_executions(self.session, execution.workflow_id, keep_last=3)
                    return execution

        # If we exit loop without explicit END, mark as completed
        execution.status = "completed"
        execution.result = current_data
        await self.session.commit()
        await self.session.refresh(execution)
        await prune_workflow_executions(self.session, execution.workflow_id, keep_last=3)
        return execution


async def prune_workflow_executions(
    session: AsyncSession,
    workflow_id: Optional[str],
    keep_last: int = 3,
) -> None:
    """Keep only the latest N executions per workflow.

    To avoid disrupting active work, this prunes only terminal executions
    (completed/failed/cancelled). If there are many non-terminal executions,
    total count can exceed N until those finish.
    """

    if not workflow_id or keep_last <= 0:
        return

    try:
        stmt = (
            select(WorkflowExecution)
            .where(WorkflowExecution.workflow_id == workflow_id)
            .order_by(WorkflowExecution.created_at.desc())
            .offset(keep_last)
        )
        res = await session.execute(stmt)
        old_execs = list(res.scalars().all())

        terminal = {"completed", "failed", "cancelled"}
        deleted_any = False
        for ex in old_execs:
            if getattr(ex, "status", None) in terminal:
                await session.delete(ex)
                deleted_any = True

        if deleted_any:
            await session.commit()
    except Exception:
        # Best-effort retention; never break execution flow.
        return


async def approve_step(
    session: AsyncSession,
    execution: WorkflowExecution,
    step_exec: WorkflowExecutionStep,
    edited_output: Optional[Dict[str, Any]] = None,
) -> WorkflowExecution:
    """Approve a waiting step, optionally with edited output, then continue."""

    if step_exec.status != "waiting_approval":
        return execution

    if edited_output is not None:
        step_exec.output = edited_output
    step_exec.status = "approved"
    step_exec.finished_at = datetime.utcnow()
    await session.commit()
    await session.refresh(step_exec)

    orchestrator = Orchestrator(session=session, llm=session.info["llm_provider"])
    return await orchestrator.run_until_pause_or_end(execution)


async def reject_step(
    session: AsyncSession,
    execution: WorkflowExecution,
    step_exec: WorkflowExecutionStep,
    reason: Optional[str] = None,
) -> WorkflowExecution:
    step_exec.status = "rejected"
    step_exec.error = reason or "Rejected by user"
    step_exec.finished_at = datetime.utcnow()
    execution.status = "failed"
    await session.commit()
    await session.refresh(execution)

    await prune_workflow_executions(
        session,
        str(execution.workflow_id) if execution.workflow_id else None,
        keep_last=3,
    )
    return execution
