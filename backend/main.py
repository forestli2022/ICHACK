from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import uvicorn

from database import engine, get_db, Base
from routers import auth, stories, quizzes, reports, words, agent

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Reading Learning App API")

# CORS configuration for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(stories.router, prefix="/api/stories", tags=["stories"])
app.include_router(quizzes.router, prefix="/api/quizzes", tags=["quizzes"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(words.router, prefix="/api/words", tags=["word_difficulties"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])

@app.get("/")
def read_root():
    return {"message": "Reading Learning App API", "status": "active"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
