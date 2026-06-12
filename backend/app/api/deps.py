"""
Shared API dependencies: database session, authentication.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.config import get_settings
from app.models.user import User
from app.schemas.user import TokenData

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/swagger-login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode JWT token and return the current user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise credentials_exception
        try:
            user_id = int(user_id_raw)
        except ValueError:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return user


async def verify_token_string(token: str) -> User | None:
    """
    Verify a raw JWT string without FastAPI dependency injection.
    Used by WebSocket endpoints that receive the token as a query param.
    Returns the User on success, None on any error.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            return None
        user_id = int(user_id_raw)
    except (JWTError, ValueError):
        return None

    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        return None
    return user

