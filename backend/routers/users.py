"""User-scoped endpoints: favorites + pool-link CRUD."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from models.database import Entrant, Event, Pick, User, UserFavorite, UserPoolLink, get_db
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


# ---------- Pool links ----------


class PoolLinkResponse(BaseModel):
    event_id: int
    pool_type: str
    entrant_id: int
    entrant_name: str
    created_at: str


class SetPoolLinkRequest(BaseModel):
    event_id: int
    pool_type: str = Field(pattern="^(marshalek|piper)$")
    entrant_id: int


def _to_link_response(link: UserPoolLink, entrant_name: str) -> PoolLinkResponse:
    return PoolLinkResponse(
        event_id=link.event_id,
        pool_type=link.pool_type,
        entrant_id=link.entrant_id,
        entrant_name=entrant_name,
        created_at=link.created_at,
    )


@router.get("/pool-links", response_model=list[PoolLinkResponse])
def list_pool_links(
    event_id: int,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UserPoolLink, Entrant.name)
        .join(Entrant, Entrant.id == UserPoolLink.entrant_id)
        .filter(UserPoolLink.user_id == current.id, UserPoolLink.event_id == event_id)
        .all()
    )
    return [_to_link_response(link, name) for link, name in rows]


@router.put("/pool-links", response_model=PoolLinkResponse)
def set_pool_link(
    payload: SetPoolLinkRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set or replace the user's link for (event, pool_type). Auto-favorites the entrant's picks."""
    if not db.get(Event, payload.event_id):
        raise HTTPException(status_code=404, detail=f"Event {payload.event_id} not found")

    entrant = db.get(Entrant, payload.entrant_id)
    if not entrant:
        raise HTTPException(status_code=404, detail=f"Entrant {payload.entrant_id} not found")
    if entrant.event_id != payload.event_id:
        raise HTTPException(status_code=400, detail="Entrant does not belong to that event")
    if entrant.pool_type != payload.pool_type:
        raise HTTPException(
            status_code=400,
            detail=f"Entrant is in pool '{entrant.pool_type}', not '{payload.pool_type}'",
        )

    existing = (
        db.query(UserPoolLink)
        .filter_by(user_id=current.id, event_id=payload.event_id, pool_type=payload.pool_type)
        .first()
    )
    now_iso = datetime.now(timezone.utc).isoformat()
    if existing:
        existing.entrant_id = payload.entrant_id
        existing.created_at = now_iso
        link = existing
    else:
        link = UserPoolLink(
            user_id=current.id,
            event_id=payload.event_id,
            pool_type=payload.pool_type,
            entrant_id=payload.entrant_id,
            created_at=now_iso,
        )
        db.add(link)

    picks = db.query(Pick).filter_by(entrant_id=payload.entrant_id).all()
    for pick in picks:
        already = (
            db.query(UserFavorite)
            .filter_by(
                user_id=current.id,
                event_id=payload.event_id,
                golfer_normalized_name=pick.golfer_name,
            )
            .first()
        )
        if not already:
            db.add(
                UserFavorite(
                    user_id=current.id,
                    event_id=payload.event_id,
                    golfer_normalized_name=pick.golfer_name,
                    created_at=now_iso,
                )
            )

    db.commit()
    db.refresh(link)
    return _to_link_response(link, entrant.name)


@router.delete("/pool-links/{event_id}/{pool_type}", status_code=status.HTTP_204_NO_CONTENT)
def remove_pool_link(
    event_id: int,
    pool_type: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if pool_type not in ("marshalek", "piper"):
        raise HTTPException(status_code=400, detail="pool_type must be 'marshalek' or 'piper'")
    link = (
        db.query(UserPoolLink)
        .filter_by(user_id=current.id, event_id=event_id, pool_type=pool_type)
        .first()
    )
    if not link:
        return
    db.delete(link)
    db.commit()
