"""
One-shot migration: add new columns to live_odds_cache and create course_holes.

Idempotent — safe to re-run. Use:
    python -m backend.migrate_add_live_columns
"""

from sqlalchemy import inspect, text

from models.database import Base, engine


def main() -> None:
    inspector = inspect(engine)
    existing_cols = {c["name"] for c in inspector.get_columns("live_odds_cache")}

    new_cols = [
        ("make_cut_pct", "FLOAT"),
        ("today_score", "INTEGER"),
        ("flag", "VARCHAR"),
        ("dg_player_num", "INTEGER"),
        ("rounds_json", "TEXT"),
    ]

    with engine.begin() as conn:
        for col, sqltype in new_cols:
            if col in existing_cols:
                print(f"  skip live_odds_cache.{col} (already exists)")
                continue
            conn.execute(text(f"ALTER TABLE live_odds_cache ADD COLUMN {col} {sqltype}"))
            print(f"  added live_odds_cache.{col}")

    # course_holes is created via metadata if missing
    Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables["course_holes"]])
    print("  ensured course_holes exists")


if __name__ == "__main__":
    main()
