"""User-scoped endpoints: favorites CRUD."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models.database import Event, User, UserFavorite, get_db
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/me", tags=["users"])


class FavoriteResponse(BaseModel):
    event_id: int
    golfer_normalized_name: str
    created_at: str


class AddFavoriteRequest(BaseModel):
    event_id: int
    golfer_normalized_name: str = Field(min_length=1, max_length=200)


@router.get("/favorites", response_model=list[FavoriteResponse])
def list_favorites(
    event_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UserFavorite)
        .filter_by(user_id=current.id, event_id=event_id)
        .order_by(UserFavorite.created_at.desc())
        .all()
    )
    return [
        FavoriteResponse(
            event_id=r.event_id,
            golfer_normalized_name=r.golfer_normalized_name,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/favorites", response_model=FavoriteResponse, status_code=status.HTTP_201_CREATED)
def add_favorite(
    payload: AddFavoriteRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not db.get(Event, payload.event_id):
        raise HTTPException(status_code=404, detail=f"Event {payload.event_id} not found")

    existing = (
        db.query(UserFavorite)
        .filter_by(
            user_id=current.id,
            event_id=payload.event_id,
            golfer_normalized_name=payload.golfer_normalized_name,
        )
        .first()
    )
    if existing:
        return FavoriteResponse(
            event_id=existing.event_id,
            golfer_normalized_name=existing.golfer_normalized_name,
            created_at=existing.created_at,
        )

    fav = UserFavorite(
        user_id=current.id,
        event_id=payload.event_id,
        golfer_normalized_name=payload.golfer_normalized_name,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return FavoriteResponse(
        event_id=fav.event_id,
        golfer_normalized_name=fav.golfer_normalized_name,
        created_at=fav.created_at,
    )


@router.delete("/favorites/{event_id}/{golfer_normalized_name:path}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    event_id: int,
    golfer_normalized_name: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fav = (
        db.query(UserFavorite)
        .filter_by(
            user_id=current.id,
            event_id=event_id,
            golfer_normalized_name=golfer_normalized_name,
        )
        .first()
    )
    if not fav:
        return
    db.delete(fav)
    db.commit()
