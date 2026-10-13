from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from .models import NotificationRecord


class NotificationProvider(ABC):
    """Abstract base provider for multi-channel notification dispatch."""

    @property
    @abstractmethod
    def channel_name(self) -> str:
        """Name of the channel: IN_APP, BROWSER, VOICE."""
        pass

    @abstractmethod
    async def deliver(self, notification: NotificationRecord) -> bool:
        """Execute dispatch. Returns True if successfully sent/delivered."""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify delivery mechanism is healthy."""
        pass


class InAppNotificationProvider(NotificationProvider):
    """In-app delivery provider. Persists notifications to user inbox."""

    @property
    def channel_name(self) -> str:
        return "IN_APP"

    async def deliver(self, notification: NotificationRecord) -> bool:
        # In-app delivery succeeds by virtue of valid database/store persistence
        return True

    async def health_check(self) -> bool:
        return True


class BrowserNotificationProvider(NotificationProvider):
    """Desktop / Web notification provider abstraction."""

    @property
    def channel_name(self) -> str:
        return "BROWSER"

    async def deliver(self, notification: NotificationRecord) -> bool:
        # Client triggers Web Notification API when polling / receiving event
        return True

    async def health_check(self) -> bool:
        return True


class VoiceNotificationProvider(NotificationProvider):
    """Spoken voice reminder provider abstraction."""

    @property
    def channel_name(self) -> str:
        return "VOICE"

    async def deliver(self, notification: NotificationRecord) -> bool:
        # Client triggers TTS via BrowserTextToSpeechProvider for verified message
        return True

    async def health_check(self) -> bool:
        return True
