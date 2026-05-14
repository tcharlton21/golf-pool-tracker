"""
One-shot seed: create Trent's account and link both pool entries for active events.

Idempotent — safe to re-run. The user is created if missing; existing pool
links are replaced; favorites are auto-created via the same logic the API
uses (re-add is no-op).

Usage (from backend/):
    JWT_SECRET=... python seed_trent_account.py [PASSWORD]

If PASSWORD is omitted, an env var TRENT_PASSWORD is required.
"""

import os
import sys
from datetime import datetime, timezone

from models.database import (
    Entrant,
    Event,
    SessionLocal,
    User,
    UserFavorite,
    UserPoolLink,
)
from services.auth import hash_password

EMAIL = "trentcharlton21@gmail.com"
ENTRANT_NAME = "Trent Charlton"


def upsert_user(db, password: str) -> User:
    user = db.query(User).filter(User.email == EMAIL).first()
    if user:
        print(f"  user exists: id={user.id}")
        return user
    user = User(
        email=EMAIL,
        password_hash=hash_password(password),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  user created: id={user.id}")
    return user


def link_pool(db, user: User, event: Event, pool_type: str) -> None:
    entrant = (
        db.query(Entrant)
        .filter_by(event_id=event.id, pool_type=pool_type)
        .filter(Entrant.name.ilike(ENTRANT_NAME))
        .first()
    )
    if not entrant:
        print(f"  no '{ENTRANT_NAME}' entrant in {event.name} / {pool_type} — skipping")
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    link = (
        db.query(UserPoolLink)
        .filter_by(user_id=user.id, event_id=event.id, pool_type=pool_type)
        .first()
    )
    if link:
        link.entrant_id = entrant.id
        link.created_at = now_iso
        action = "updated"
    else:
        link = UserPoolLink(
            user_id=user.id,
            event_id=event.id,
            pool_type=pool_type,
            entrant_id=entrant.id,
            created_at=now_iso,
        )
        db.add(link)
        action = "created"

    added_favs = 0
    for pick in entrant.picks:
        existing_fav = (
            db.query(UserFavorite)
            .filter_by(
                user_id=user.id,
                event_id=event.id,
                golfer_normalized_name=pick.golfer_name,
            )
            .first()
        )
        if existing_fav:
            continue
        db.add(
            UserFavorite(
                user_id=user.id,
                event_id=event.id,
                golfer_normalized_name=pick.golfer_name,
                created_at=now_iso,
            )
        )
        added_favs += 1

    db.commit()
    print(
        f"  {action} {pool_type} link → entrant {entrant.id} "
        f"({entrant.name}); +{added_favs} favorites"
    )


def main() -> None:
    password = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TRENT_PASSWORD")
    if not password:
        print("ERROR: pass a password as arg or set TRENT_PASSWORD env var")
        sys.exit(1)
    if len(password) < 6:
        print("ERROR: password must be 6+ chars")
        sys.exit(1)

    db = SessionLocal()
    try:
        user = upsert_user(db, password)
        events = db.query(Event).all()
        for event in events:
            print(f"event: {event.name} (id={event.id})")
            for pool_type in ("marshalek", "piper"):
                link_pool(db, user, event, pool_type)
    finally:
        db.close()


if __name__ == "__main__":
    main()
