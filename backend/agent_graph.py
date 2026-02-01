from typing import TypedDict, Optional, List, Dict
import re

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge, WordDifficulty, StoryHistory
from schemas import QuizQuestion
from ai_service import generate_story, generate_quizzes


class AgentState(TypedDict, total=False):
    user_id: int
    difficulty: Optional[str]
    session_id: int
    story_title: str
    story_content: str
    questions: List[QuizQuestion]
    focus_words: List[str]
    known_words: List[str]
    weak_words: List[str]
    attempts: int
    max_attempts: int
    quality_score: float
    diversity_score: float
    focus_coverage: float
    length_score: float
    quality_passed: bool


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

    difficulty_words = db.query(WordDifficulty).filter(
        WordDifficulty.user_id == user.id
    ).order_by(WordDifficulty.created_at.desc()).limit(8).all()

    attempt = state.get("attempts", 0)
    max_attempts = state.get("max_attempts", 2)

    style_hint = None
    if attempt > 0:
        hints = []
        if state.get("diversity_score", 1.0) < 0.45:
            hints.append("use more varied vocabulary and avoid repeating words")
        if state.get("focus_coverage", 1.0) < 0.6:
            hints.append("ensure the focus words appear naturally in the story")
        if state.get("length_score", 1.0) < 0.7:
            hints.append("adjust the story length to match the target word range")
        if not hints:
            hints.append("increase vocabulary variety and include focus words naturally")
        style_hint = " ".join(hints)

    recent_titles = db.query(ReadingSession.story_title).filter(
        ReadingSession.user_id == user.id
    ).order_by(ReadingSession.started_at.desc()).limit(3).all()
    avoid_titles = [t[0] for t in recent_titles if t[0]]

    # Fetch recent story history (up to 50 most recent) to avoid similar stories
    recent_stories = db.query(StoryHistory).filter(
        StoryHistory.user_id == user.id
    ).order_by(desc(StoryHistory.generated_at)).limit(50).all()
    
    recent_story_context = "\n".join([
        f"- Title: {s.title}\n  Summary: {s.summary}"
        for s in recent_stories
    ]) if recent_stories else "No previous stories."

    story_data = generate_story(
        reading_level=difficulty,
        interests=user.interests,
        age=user.age,
        known_words=[w.word for w in known_words],
        focus_words=[w.word for w in focus_words],
        style_hint=style_hint,
        avoid_titles=avoid_titles,
        recent_story_context=recent_story_context
    )

    return {
        "story_title": story_data["title"],
        "story_content": story_data["content"],
        "difficulty": difficulty,
        "focus_words": [w.word for w in focus_words],
        "known_words": [w.word for w in known_words],
        "weak_words": list({w.word for w in focus_words} | {w.word for w in difficulty_words}),
        "attempts": attempt + 1,
        "max_attempts": max_attempts
    }

def _length_score(word_count: int, min_words: int, max_words: int) -> float:
    if min_words <= word_count <= max_words:
        return 1.0
    if word_count <= 0:
        return 0.0
    if word_count < min_words:
        return max(0.0, word_count / float(min_words))
    return max(0.0, max_words / float(word_count))


def _tokenize_words(text: str) -> List[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


def _evaluate_story_node(db: Session, state: AgentState) -> Dict:
    story_content = state.get("story_content", "")
    difficulty = state.get("difficulty") or "beginner"

    tokens = _tokenize_words(story_content)
    word_count = len(tokens)
    unique_words = len(set(tokens)) if tokens else 0
    diversity_score = (unique_words / word_count) if word_count else 0.0

    word_range = {
        "beginner": (50, 100),
        "intermediate": (150, 250),
        "advanced": (300, 500)
    }.get(difficulty, (100, 150))
    length_score = _length_score(word_count, word_range[0], word_range[1])

    target_words = state.get("weak_words") or state.get("focus_words") or []
    target_set = {w.lower() for w in target_words if w}
    if target_set:
        token_set = set(tokens)
        hits = sum(1 for w in target_set if w in token_set)
        focus_coverage = hits / float(len(target_set))
    else:
        focus_coverage = 1.0

    quality_score = (0.4 * length_score) + (0.4 * focus_coverage) + (0.2 * diversity_score)
    quality_passed = quality_score >= 0.6

    return {
        "quality_score": quality_score,
        "diversity_score": diversity_score,
        "focus_coverage": focus_coverage,
        "length_score": length_score,
        "quality_passed": quality_passed
    }


def _persist_story_node(db: Session, state: AgentState) -> Dict:
    user_id = state["user_id"]
    session = ReadingSession(
        user_id=user_id,
        story_content=state.get("story_content", ""),
        story_title=state.get("story_title", "Untitled Story"),
        story_difficulty=state.get("difficulty") or "beginner"
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Store story in history (max 50 most recent)
    story_title = state.get("story_title", "Untitled Story")
    # Generate a summary from the first 100 characters of the story
    story_content = state.get("story_content", "")
    summary = story_content[:150] if story_content else ""
    
    history = StoryHistory(
        user_id=user_id,
        title=story_title,
        summary=summary
    )
    db.add(history)
    db.commit()
    
    # Clean up old stories, keeping only the 50 most recent
    old_count = db.query(StoryHistory).filter(
        StoryHistory.user_id == user_id
    ).count()
    
    if old_count > 50:
        # Delete oldest stories
        to_delete = old_count - 50
        oldest = db.query(StoryHistory).filter(
            StoryHistory.user_id == user_id
        ).order_by(StoryHistory.generated_at.asc()).limit(to_delete).all()
        
        for item in oldest:
            db.delete(item)
        db.commit()

    return {"session_id": session.id}


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
    # DISABLED: Story quality evaluation filter for now
    # graph.add_node("evaluate_story", lambda state: _evaluate_story_node(db, state))
    graph.add_node("persist_story", lambda state: _persist_story_node(db, state))
    graph.add_node("generate_quizzes", lambda state: _generate_quizzes_node(db, state))

    graph.set_entry_point("generate_story")
    # Skip evaluation, go straight to persistence
    graph.add_edge("generate_story", "persist_story")

    # DISABLED: Conditional routing based on quality evaluation
    # def _route_after_evaluation(state: AgentState) -> str:
    #     if not state.get("quality_passed", False) and state.get("attempts", 0) < state.get("max_attempts", 2):
    #         return "regenerate"
    #     return "accept"
    #
    # graph.add_conditional_edges(
    #     "evaluate_story",
    #     _route_after_evaluation,
    #     {
    #         "regenerate": "generate_story",
    #         "accept": "persist_story"
    #     }
    # )

    graph.add_edge("persist_story", "generate_quizzes")
    graph.add_edge("generate_quizzes", END)

    return graph.compile()
