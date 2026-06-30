"""Schema definitions for runner-owned browser tools."""

from __future__ import annotations

from typing import Any

from omnigent.tools.base import Tool


def _schema(
    *,
    name: str,
    description: str,
    properties: dict[str, Any],
    required: list[str],
) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


class SysBrowserOpenTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_open"

    @classmethod
    def description(cls) -> str:
        return "Open or navigate the session browser to an approved URL."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={
                "url": {
                    "type": "string",
                    "description": "Absolute http/https URL to open.",
                }
            },
            required=["url"],
        )


class SysBrowserClickTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_click"

    @classmethod
    def description(cls) -> str:
        return "Click at viewport CSS-pixel coordinates in the session browser."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={
                "x": {"type": "number", "description": "Viewport CSS-pixel x coordinate."},
                "y": {"type": "number", "description": "Viewport CSS-pixel y coordinate."},
            },
            required=["x", "y"],
        )


class SysBrowserTypeTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_type"

    @classmethod
    def description(cls) -> str:
        return "Type text into the currently focused browser element."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={"text": {"type": "string", "description": "Text to type."}},
            required=["text"],
        )


class SysBrowserKeyTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_key"

    @classmethod
    def description(cls) -> str:
        return "Press a keyboard key or chord in the session browser."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={
                "key": {
                    "type": "string",
                    "description": "Playwright key name or chord, e.g. Enter or Meta+L.",
                }
            },
            required=["key"],
        )


class SysBrowserSnapshotTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_snapshot"

    @classmethod
    def description(cls) -> str:
        return "Read the current browser accessibility snapshot and page metadata."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={},
            required=[],
        )


class SysBrowserScreenshotTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_screenshot"

    @classmethod
    def description(cls) -> str:
        return "Refresh the current browser screenshot and return screenshot metadata."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={},
            required=[],
        )


class SysBrowserCloseTool(Tool):
    @classmethod
    def name(cls) -> str:
        return "sys_browser_close"

    @classmethod
    def description(cls) -> str:
        return "Close the session browser."

    def get_schema(self) -> dict[str, Any]:
        return _schema(
            name=self.name(),
            description=self.description(),
            properties={},
            required=[],
        )


def build_browser_tools() -> tuple[Tool, ...]:
    """Return all browser tools in their advertised order."""
    return (
        SysBrowserOpenTool(),
        SysBrowserClickTool(),
        SysBrowserTypeTool(),
        SysBrowserKeyTool(),
        SysBrowserSnapshotTool(),
        SysBrowserScreenshotTool(),
        SysBrowserCloseTool(),
    )
