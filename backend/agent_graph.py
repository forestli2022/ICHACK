from typing import TypedDict, Optional, List, Dict

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge
from schemas import QuizQuestion
from ai_service import generate_story, generate_quizzes


class AgentState(TypedDict, total=False):
    user_id: int
    difficulty: Optional[str]
    session_id: int
    story_title: str
    story_content: str
    questions: List[QuizQuestion]


def _generate_story_node(db: Session, state: AgentState) -> Dict:
    user = db.query(User).filter(User.id == state["user_id"]).first()
    if not user:
        raise ValueError("User not found")

    difficulty = state.get("difficulty") or user.reading_level

    known_words = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == user.id,
        WordKnowledge.familiarity_score > 0.7
    ).all()

    focus_words = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == user.id,
        WordKnowledge.familiarity_score < 0.4
    ).order_by(WordKnowledge.familiarity_score.asc()).limit(8).all()

    story_data = generate_story(
        reading_level=difficulty,
        interests=user.interests,
        age=user.age,
        known_words=[w.word for w in known_words],
        focus_words=[w.word for w in focus_words]
    )

    session = ReadingSession(
        user_id=user.id,
        story_content=story_data["content"],
        story_title=story_data["title"],
        story_difficulty=difficulty
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "story_title": story_data["title"],
        "story_content": story_data["content"],
        "difficulty": difficulty
    }


def _generate_quizzes_node(db: Session, state: AgentState) -> Dict:
    session = db.query(ReadingSession).filter(
        ReadingSession.id == state["session_id"]
    ).first()
    if not session:
        raise ValueError("Session not found")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise ValueError("User not found")

    recent_responses = db.query(QuizResponse, Quiz).join(
        Quiz, Quiz.id == QuizResponse.quiz_id
    ).filter(
        QuizResponse.user_id == user.id
    ).order_by(QuizResponse.answered_at.desc()).limit(20).all()

    quiz_data = generate_quizzes(
        story_content=session.story_content,
        reading_level=session.story_difficulty,
        user_age=user.age,
        recent_performance=[{
            "correct": response.is_correct,
            "question_type": quiz.question_type
        } for response, quiz in recent_responses]
    )

    quiz_questions: List[QuizQuestion] = []
    for quiz_item in quiz_data:
        quiz = Quiz(
            session_id=session.id,
            question_type=quiz_item["type"],
            question_text=quiz_item["question"],
            correct_answer=quiz_item["answer"],
            options=quiz_item.get("options")
        )
        db.add(quiz)
        db.commit()
        db.refresh(quiz)

        quiz_questions.append(QuizQuestion(
            id=quiz.id,
            question_type=quiz.question_type,
            question_text=quiz.question_text,
            options=quiz.options
        ))

    return {"questions": quiz_questions}


def build_agent_graph(db: Session):
    graph = StateGraph(AgentState)

    graph.add_node("generate_story", lambda state: _generate_story_node(db, state))
    graph.add_node("generate_quizzes", lambda state: _generate_quizzes_node(db, state))

    graph.set_entry_point("generate_story")
    graph.add_edge("generate_story", "generate_quizzes")
    graph.add_edge("generate_quizzes", END)

    return graph.compile()
