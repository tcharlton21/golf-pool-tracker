from pydantic import BaseModel, Field


class RegisterOrLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    signup_code: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: "UserResponse"


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: str
    is_new: bool = False


AuthResponse.model_rebuild()
