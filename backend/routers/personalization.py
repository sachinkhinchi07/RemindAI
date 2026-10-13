from fastapi import APIRouter, Depends, Header
from typing import Optional

from backend.personalization.models import (
    PersonalizationProfile,
    ResetPersonalizationResponse,
)
from backend.personalization.service import (
    PersonalizationService,
    default_personalization_service,
)

router = APIRouter(prefix="/api/personalization", tags=["Personalization"])


def get_current_user_id(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
) -> str:
    """Extract authenticated user ID, defaulting safely to 'demo_user' for testing."""
    if x_user_id and x_user_id.strip():
        return x_user_id.strip()
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        if token and token != "undefined":
            return f"user_{token[:8]}"
    return "demo_user"


def get_personalization_service() -> PersonalizationService:
    return default_personalization_service


@router.get("", response_model=PersonalizationProfile)
async def get_personalization_profile(
    user_id: str = Depends(get_current_user_id),
    service: PersonalizationService = Depends(get_personalization_service),
):
    """
    Returns the user's verified personalization profile, evidence level,
    recommended lead time, and active deterministic personalization rules.
    """
    return await service.get_or_build_profile(user_id=user_id)


@router.post("/reset", response_model=ResetPersonalizationResponse)
async def reset_personalization_profile(
    user_id: str = Depends(get_current_user_id),
    service: PersonalizationService = Depends(get_personalization_service),
):
    """
    Safely resets inferred personalization rules and recommendations back to system defaults.
    Historical observations and tasks remain preserved.
    """
    return await service.reset_profile(user_id=user_id)
