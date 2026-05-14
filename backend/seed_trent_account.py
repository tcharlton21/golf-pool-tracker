"""
Seed Trent's account and link both pool entries for every event.

Idempotent — safe to re-run. The user is created if missing (or password is
reset); existing pool links are replaced; favorites are auto-created.

Called automatically on app startup (see main.py) so a fresh deploy on
ephemeral storage immediately has Trent's account back. Also runnable as a
one-shot script:
    JWT_SECRET=... python seed_trent_account.py [PASSWORD]
"""

import logging
import os
import sys
from datetime import datetime, timezone

from sqlalchemy.orm import Session

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
DEFAULT_PASSWORD = "VintageTB21"

logger = logging.getLogger(__name__)


def upsert_user(db: Session, password: str) -> User:
    user = db.query(User).filter(User.email == EMAIL).first()
    if user:
        user.password_hash = hash_password(password)
        db.commit()
        logger.info(f"  user exists: id={user.id} (password reset)")
        return user
    user = User(
        email=EMAIL,
        password_hash=hash_password(password),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info(f"  user created: id={user.id}")
    return user


def link_pool(db: Session, user: User, event: Event, pool_type: str) -> None:
    entrant = (
        db.query(Entrant)
        .filter_by(event_id=event.id, pool_type=pool_type)
        .filter(Entrant.name.ilike(ENTRANT_NAME))
        .first()
    )
    if not entrant:
        logger.info(f"  no '{ENTRANT_NAME}' entrant in {event.name} / {pool_type} — skipping")
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
    logger.info(
        f"  {action} {pool_type} link → entrant {entrant.id} "
        f"({entrant.name}); +{added_favs} favorites"
    )


def seed_trent(db: Session, password: str) -> None:
    """Run the full seed against an open session. Safe to call repeatedly."""
    user = upsert_user(db, password)
    for event in db.query(Event).all():
        logger.info(f"event: {event.name} (id={event.id})")
        for pool_type in ("marshalek", "piper"):
            link_pool(db, user, event, pool_type)


def run_with_default_password() -> None:
    """Entry point used by app startup. Swallows errors so the API still boots."""
    password = os.environ.get("TRENT_PASSWORD") or DEFAULT_PASSWORD
    db = SessionLocal()
    try:
        seed_trent(db, password)
    except Exception as e:
        logger.error(f"Trent seed failed (non-fatal): {e}")
    finally:
        db.close()


def main() -> None:
    password = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TRENT_PASSWORD") or DEFAULT_PASSWORD
    if len(password) < 6:
        print("ERROR: password must be 6+ chars")
        sys.exit(1)
    db = SessionLocal()
    try:
        seed_trent(db, password)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    main()
