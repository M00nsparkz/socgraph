from contextlib import asynccontextmanager, closing
from pathlib import Path
import random
import sqlite3

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from seed_names import PEOPLE_NAMES

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "people.db"

RANDOM_SEED = 20260101
MIN_STRENGTH = 1
MAX_STRENGTH = 50
LINKS_PER_PERSON = 2

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    strength INTEGER NOT NULL CHECK (strength BETWEEN 1 AND 50),
    CHECK (source_id < target_id),
    UNIQUE (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT COUNT(*) FROM people").fetchone()[0] > 0:
        return

    rng = random.Random(RANDOM_SEED)

    ids: list[int] = []
    for name in PEOPLE_NAMES:
        cur = conn.execute("INSERT INTO people (name) VALUES (?)", (name,))
        ids.append(cur.lastrowid)

    pairs: set[tuple[int, int]] = set()
    for source in ids:
        for target in rng.sample(ids, LINKS_PER_PERSON):
            if source == target:
                continue
            pair = (min(source, target), max(source, target))
            if pair in pairs:
                continue
            pairs.add(pair)
            strength = rng.randint(MIN_STRENGTH, MAX_STRENGTH)
            conn.execute(
                "INSERT INTO relationships (source_id, target_id, strength) VALUES (?, ?, ?)",
                (pair[0], pair[1], strength),
            )

    conn.commit()


def init_db() -> None:
    with closing(connect()) as conn:
        conn.executescript(SCHEMA)
        seed(conn)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SPrj Network", version="2.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


class PersonOut(BaseModel):
    id: int
    name: str


class RelationshipOut(BaseModel):
    source: int
    target: int
    value: int


class GraphOut(BaseModel):
    nodes: list[PersonOut]
    links: list[RelationshipOut]


def list_people() -> list[PersonOut]:
    with closing(connect()) as conn:
        rows = conn.execute("SELECT id, name FROM people ORDER BY id").fetchall()
    return [PersonOut(id=r["id"], name=r["name"]) for r in rows]


def list_relationships() -> list[RelationshipOut]:
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT source_id, target_id, strength FROM relationships ORDER BY strength DESC"
        ).fetchall()
    return [
        RelationshipOut(source=r["source_id"], target=r["target_id"], value=r["strength"])
        for r in rows
    ]


def build_graph() -> GraphOut:
    return GraphOut(nodes=list_people(), links=list_relationships())


def person_relationships(person_id: int) -> list[RelationshipOut]:
    with closing(connect()) as conn:
        exists = conn.execute("SELECT 1 FROM people WHERE id = ?", (person_id,)).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Person not found")
        rows = conn.execute(
            """
            SELECT source_id, target_id, strength
            FROM relationships
            WHERE source_id = ? OR target_id = ?
            ORDER BY strength DESC
            """,
            (person_id, person_id),
        ).fetchall()
    return [
        RelationshipOut(source=r["source_id"], target=r["target_id"], value=r["strength"])
        for r in rows
    ]


# Pages


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


# API


@app.get("/api/graph", response_model=GraphOut)
def api_graph():
    return build_graph()


@app.get("/api/people", response_model=list[PersonOut])
def api_people():
    return list_people()


@app.get("/api/people/{person_id}/relationships", response_model=list[RelationshipOut])
def api_person_relationships(person_id: int):
    return person_relationships(person_id)


@app.get("/health")
def health():
    graph = build_graph()
    return {"status": "ok", "people": len(graph.nodes), "relationships": len(graph.links)}