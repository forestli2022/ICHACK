from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from agent_graph import build_agent_graph
from schemas import AgentRunRequest, AgentRunResponse

router = APIRouter()


@router.post("/run", response_model=AgentRunResponse)
def run_agent(request: AgentRunRequest, db: Session = Depends(get_db)):
    """Run the agent to generate a story and quizzes."""
    try:
        graph = build_agent_graph(db)
        result = graph.invoke({
            "user_id": request.user_id,
            "difficulty": request.difficulty
        })
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Agent run failed") from exc

    return AgentRunResponse(
        session_id=result["session_id"],
        title=result["story_title"],
        content=result["story_content"],
        difficulty=result["difficulty"],
        questions=result.get("questions", [])
    )
