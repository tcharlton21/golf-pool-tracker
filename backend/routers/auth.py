"""Auth router: register-or-login + /me, plus the get_current_user dependency."""

import logging
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from models.database import User, get_db
from schemas.auth_schemas import AuthResponse, RegisterOrLoginRequest, UserResponse
from services.auth import (
    SIGNUP_CODE,
    decode_token,
    hash_password,
    issue_token,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(None, 1)[1].strip()
    try:
        user_id = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _to_response(user: User, is_new: bool = False) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, created_at=user.created_at, is_new=is_new)


@router.post("/register-or-login", response_model=AuthResponse)
def register_or_login(payload: RegisterOrLoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == email).first()

    if existing:
        if not verify_password(payload.password, existing.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
        return AuthResponse(token=issue_token(existing.id), user=_to_response(existing))

    if payload.signup_code != SIGNUP_CODE:
        raise HTTPException(status_code=403, detail="Signup code required for new accounts")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info(f"new user registered: {email}")
    return AuthResponse(token=issue_token(user.id), user=_to_response(user, is_new=True))


@router.get("/me", response_model=UserResponse)
def me(current: User = Depends(get_current_user)):
    return _to_response(current)
