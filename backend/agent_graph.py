from typing import TypedDict, Optional, List, Dict
import re
import random
from datetime import datetime

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge, WordDifficulty, StoryHistory
from schemas import QuizQuestion
from ai_service import generate_story, generate_quizzes

# Exploration-exploitation ratio
EXPLOITATION_RATIO = 0.6  # 60% exploitation (difficult words), 40% exploration (new words)

# Word pools for exploration by reading level
EXPLORATION_WORDS = {
    "beginner": [
        "sparkle", "giggle", "wobble", "whisper", "flutter", "bounce", "tumble", "splash",
        "glitter", "twirl", "peek", "dash", "scramble", "wiggle", "shimmer", "tiptoe",
        "snuggle", "nibble", "huddle", "marvel", "rustle", "breeze", "shadow", "meadow"
    ],
    "intermediate": [
        "adventure", "mysterious", "discover", "imagine", "treasure", "courage", "curious", "wonderful",
        "explore", "journey", "magical", "enchanted", "brilliant", "beneath", "ancient", "crystal",
        "harmony", "graceful", "whispered", "shimmered", "gleaming", "majestic", "extraordinary", "luminous"
    ],
    "advanced": [
        "magnificent", "extraordinary", "fascinating", "phenomenon", "perseverance", "determination", "curiosity",
        "intricate", "mesmerizing", "spectacular", "brilliant", "remarkable", "astonishing", "breathtaking",
        "mysterious", "unprecedented", "revolutionary", "magnificent", "transcendent", "enigmatic", "captivating",
        "illuminate", "resonate", "flourish", "embark", "endeavor", "contemplate", "navigate"
    ]
}


class AgentState(TypedDict, total=False):
    user_id: int
    difficulty: Optional[str]
    session_id: int
    story_title: str
    story_content: str
    questions: List[QuizQuestion]
    focus_words: List[str]
    exploration_words: List[str]  # New words for exploration
    exploitation_words: List[str]  # Words to reinforce
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

    # Get words user struggles with for exploitation
    focus_words_db = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == user.id,
        WordKnowledge.familiarity_score < 0.4
    ).order_by(WordKnowledge.familiarity_score.asc()).limit(12).all()

    difficulty_words = db.query(WordDifficulty).filter(
        WordDifficulty.user_id == user.id
    ).order_by(WordDifficulty.created_at.desc()).limit(12).all()
    
    # Combine difficult words for exploitation (ensure uniqueness)
    exploitation_words = set()
    exploitation_words.update([w.word.lower() for w in focus_words_db])
    exploitation_words.update([w.word.lower() for w in difficulty_words])
    exploitation_words = list(exploitation_words)
    
    print(f"🔍 Exploitation word pool: {exploitation_words}")
    
    # Get all words user has seen
    all_seen_words = set(w.word.lower() for w in db.query(WordKnowledge).filter(
        WordKnowledge.user_id == user.id
    ).all())
    
    print(f"👀 User has seen {len(all_seen_words)} words total")
    
    # Get exploration word pool for user's level
    exploration_pool = EXPLORATION_WORDS.get(difficulty, EXPLORATION_WORDS["beginner"])
    # Filter out words the user has already seen
    unseen_exploration_words = [w for w in exploration_pool if w.lower() not in all_seen_words]
    
    print(f"✨ Available exploration words: {len(unseen_exploration_words)} - {unseen_exploration_words[:10]}")
    
    # Calculate how many words to use (target 8 focus words)
    target_focus_count = 8
    exploitation_count = int(target_focus_count * EXPLOITATION_RATIO)  # 60% = ~5 words
    exploration_count = target_focus_count - exploitation_count  # 40% = ~3 words
    
    # Sample exploitation words (difficult words user has seen)
    selected_exploitation = random.sample(
        exploitation_words, 
        min(exploitation_count, len(exploitation_words))
    ) if exploitation_words else []
    
    # Sample exploration words (new words user hasn't seen)
    selected_exploration = random.sample(
        unseen_exploration_words, 
        min(exploration_count, len(unseen_exploration_words))
    ) if unseen_exploration_words else []
    
    # Combine for final focus words
    focus_words = selected_exploitation + selected_exploration
    
    print(f"📚 Selected {len(selected_exploitation)} exploitation words: {selected_exploitation}")
    print(f"✨ Selected {len(selected_exploration)} exploration words: {selected_exploration}")
    
    # If we don't have enough words, fill from exploitation pool
    if len(focus_words) < target_focus_count and exploitation_words:
        remaining = target_focus_count - len(focus_words)
        additional = [w for w in exploitation_words if w not in focus_words][:remaining]
        focus_words.extend(additional)
        print(f"➕ Added {len(additional)} additional exploitation words: {additional}")

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
        focus_words=focus_words,  # Now includes both exploitation and exploration words
        exploitation_words=selected_exploitation,
        exploration_words=selected_exploration,
        style_hint=style_hint,
        avoid_titles=avoid_titles,
        recent_story_context=recent_story_context
    )
    
    # Extract actual exploration words that Gemini used (from NEW_WORDS section)
    actual_exploration_words = story_data.get("new_words", []) or selected_exploration

    return {
        "story_title": story_data["title"],
        "story_content": story_data["content"],
        "difficulty": difficulty,
        "focus_words": focus_words,
        "exploration_words": actual_exploration_words,  # Use words from Gemini's NEW_WORDS section
        "exploitation_words": selected_exploitation,
        "known_words": [w.word for w in known_words],
        "weak_words": list(set(focus_words) | {w.word for w in difficulty_words}),
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
    
    # Track all focus words used in this story as "seen" by the user
    focus_words = state.get("focus_words", [])
    if focus_words:
        from datetime import datetime as dt
        for word in focus_words:
            word_clean = word.strip().lower()
            word_knowledge = db.query(WordKnowledge).filter(
                WordKnowledge.user_id == user_id,
                WordKnowledge.word == word_clean
            ).first()
            
            if word_knowledge:
                # Word already exists, just mark it as seen again
                word_knowledge.times_seen += 1
                word_knowledge.last_seen = dt.utcnow()
            else:
                # New word - add to knowledge base
                word_knowledge = WordKnowledge(
                    user_id=user_id,
                    word=word_clean,
                    times_seen=1,
                    times_correct=0,
                    familiarity_score=0.0  # Not tested yet, so 0
                )
                db.add(word_knowledge)

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
        } for response, quiz in recent_responses],
        exploration_words=state.get("exploration_words", []),
        exploitation_words=state.get("exploitation_words", [])
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
