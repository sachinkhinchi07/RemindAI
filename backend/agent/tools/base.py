from typing import Any, Callable, Dict, List, Optional, Type
from pydantic import BaseModel, Field, ConfigDict


class ToolExecutionContext(BaseModel):
    """Context injected into every tool execution to guarantee user isolation."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: str
    auth_token: Optional[str] = None
    data_store: Optional[Any] = None  # Storage adapter or in-memory repository
    context_service: Optional[Any] = None  # Optional contextual service instance


class AgentTool(BaseModel):
    """Registered tool contract for the ReMind AI Agent."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str = Field(..., description="Unique tool identifier")
    description: str = Field(..., description="What the tool does and when to call it")
    input_schema: Type[BaseModel] = Field(..., description="Pydantic model for input validation")
    output_schema: Type[BaseModel] = Field(..., description="Pydantic model for output validation")
    requires_auth: bool = Field(default=True, description="Whether tool requires authenticated user context")
    mutating: bool = Field(default=False, description="True if the tool alters data/state, False if read-only")
    executor: Callable[..., Any] = Field(..., description="Async or sync callable to run tool")

    async def run(self, raw_args: Dict[str, Any], context: ToolExecutionContext) -> BaseModel:
        """Validate input arguments, check context, execute, and validate output."""
        if self.requires_auth and not context.user_id:
            raise PermissionError("Tool requires an authenticated user context.")

        validated_input = self.input_schema(**raw_args)
        result = self.executor(validated_input, context)
        if hasattr(result, "__await__"):
            result = await result

        if isinstance(result, self.output_schema):
            return result
        elif isinstance(result, dict):
            return self.output_schema(**result)
        return result


class ToolRegistry:
    """Central registry of approved and bounded Agent tools."""

    def __init__(self):
        self._tools: Dict[str, AgentTool] = {}

    def register(self, tool: AgentTool):
        if tool.name in self._tools:
            raise ValueError(f"Tool '{tool.name}' is already registered.")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[AgentTool]:
        return self._tools.get(name)

    def list_tools(self) -> List[AgentTool]:
        return list(self._tools.values())

    def get_tool_descriptions(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "mutating": t.mutating,
                "requires_auth": t.requires_auth,
                "input_schema": t.input_schema.model_json_schema(),
            }
            for t in self._tools.values()
        ]
