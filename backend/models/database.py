from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

DATABASE_URL = "sqlite:///./golf.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)           # "2026 Masters"
    slug = Column(String, unique=True, nullable=False)  # "masters-2026"
    pool_type = Column(String, nullable=False)       # "marshalek" | "piper" | "both"
    tour_event = Column(String, nullable=False)      # "masters" | "players" | "pga" | "us_open" | "open"
    purse_usd = Column(Integer, nullable=False)
    start_date = Column(String, nullable=False)      # ISO date string
    is_active = Column(Boolean, default=False)
    dk_event_slug = Column(String)                   # DraftKings URL slug for this event
    mc_payout_usd = Column(Float)                    # flat payout for missed cut; falls back to position 65 when null

    purse_positions = relationship("PursePosition", back_populates="event", cascade="all, delete-orphan")
    entrants = relationship("Entrant", back_populates="event", cascade="all, delete-orphan")
    live_odds = relationship("LiveOddsCache", back_populates="event", cascade="all, delete-orphan")


class PursePosition(Base):
    __tablename__ = "purse_positions"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    position = Column(Integer, nullable=False)       # 1-70
    pct = Column(Float, nullable=False)              # 0.18 for 1st
    amount_usd = Column(Float, nullable=False)       # purse_usd * pct

    event = relationship("Event", back_populates="purse_positions")


class Entrant(Base):
    __tablename__ = "entrants"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    name = Column(String, nullable=False)
    pool_type = Column(String, nullable=False)       # "marshalek" | "piper"

    event = relationship("Event", back_populates="entrants")
    picks = relationship("Pick", back_populates="entrant", cascade="all, delete-orphan")


class Pick(Base):
    __tablename__ = "picks"

    id = Column(Integer, primary_key=True)
    entrant_id = Column(Integer, ForeignKey("entrants.id"), nullable=False)
    golfer_name = Column(String, nullable=False)     # normalized: "Scottie Scheffler"
    golfer_name_raw = Column(String, nullable=False) # original: "Scheffler, Scottie"
    group_label = Column(String)                     # NULL for marshalek; "A-1" etc for piper
    pick_order = Column(Integer, nullable=False)

    entrant = relationship("Entrant", back_populates="picks")


class PlayerCache(Base):
    __tablename__ = "player_cache"

    id = Column(Integer, primary_key=True)
    normalized_name = Column(String, unique=True, nullable=False)
    datagolf_name = Column(String)
    dk_name = Column(String)
    updated_at = Column(String, nullable=False)

    live_odds = relationship("LiveOddsCache", back_populates="player")


class LiveOddsCache(Base):
    __tablename__ = "live_odds_cache"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    player_cache_id = Column(Integer, ForeignKey("player_cache.id"), nullable=False)
    win_pct = Column(Float)
    top5_pct = Column(Float)
    top10_pct = Column(Float)
    top20_pct = Column(Float)
    make_cut_pct = Column(Float)
    dk_win_odds = Column(Integer)                    # American odds integer (e.g. +1500)
    current_pos = Column(Integer)
    current_score = Column(Integer)                  # strokes to par cumulative
    today_score = Column(Integer)                    # strokes to par today
    thru = Column(String)                            # "F", "14", "-"
    end_hole = Column(Integer)                       # 9 = back-nine start, 18 = front-nine start
    missed_cut = Column(Boolean, default=False)
    flag = Column(String)                            # "USA", "GER", country code
    dg_player_num = Column(Integer)                  # DataGolf player_num (joins to PlayerHoleRound)
    rounds_json = Column(Text)                       # JSON: list[{round, course, scores: {1..18}, tee_time, morning}]
    fetched_at = Column(String, nullable=False)

    event = relationship("Event", back_populates="live_odds")
    player = relationship("PlayerCache", back_populates="live_odds")


class CourseHole(Base):
    __tablename__ = "course_holes"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    course_code = Column(String, nullable=False)     # "AR" — matches LiveOddsCache.rounds_json[].course
    hole = Column(Integer, nullable=False)           # 1–18
    par = Column(Integer, nullable=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
