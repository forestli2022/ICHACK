import os
from dotenv import load_dotenv
from typing import List, Dict, Optional

from google import genai

# Load environment variables from .env file
load_dotenv()

# Set OpenAI/OpenRouter API config
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

def _get_gemini_client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=GEMINI_API_KEY)

def generate_story(
    reading_level: str,
    interests: List[str],
    age: int,
    known_words: List[str],
    focus_words: Optional[List[str]] = None,
    exploitation_words: Optional[List[str]] = None,
    exploration_words: Optional[List[str]] = None,
    style_hint: Optional[str] = None,
    avoid_titles: Optional[List[str]] = None,
    recent_story_context: Optional[str] = None
) -> Dict:
    """
    Generate a story using Gemini based on user's reading level and interests.
    Uses exploration-exploitation strategy for vocabulary selection.
    
    API: Google Gemini
    API Key Required: Yes - set GEMINI_API_KEY environment variable
    """
    
    # Create prompt based on reading level
    word_count = {
        "beginner": "50-100",
        "intermediate": "150-250",
        "advanced": "300-500"
    }.get(reading_level, "100-150")
    
    import random
    
    # Add variety - randomly select subset of interests or add random themes
    random_themes = [
        "space exploration", "underwater adventures", "magical forests", "time travel",
        "robot friends", "dinosaurs", "superhero adventures", "cooking fun",
        "music and dance", "sports challenges", "mystery solving", "art creation",
        "garden adventures", "weather wonders", "city exploration", "farm life"
    ]
    
    if interests and len(interests) > 2:
        # Pick 1-2 interests randomly instead of all
        selected_interests = random.sample(interests, min(2, len(interests)))
        # Maybe add a random theme
        if random.random() > 0.6:  # 40% chance to add variety
            selected_interests.append(random.choice(random_themes))
        interests_str = ", ".join(selected_interests)
    else:
        interests_str = ", ".join(interests) if interests else "animals and adventures"
        # Add a random theme for variety
        if random.random() > 0.5:  # 50% chance
            interests_str += ", " + random.choice(random_themes)
    
    focus_words = focus_words or []
    exploitation_words = exploitation_words or []
    exploration_words = exploration_words or []
    
    focus_words_str = ", ".join(focus_words)

    # Build detailed focus requirements with exploitation/exploration info
    focus_requirement_parts = []
    if exploitation_words:
        focus_requirement_parts.append(
            f"Words to reinforce (user struggled with): {', '.join(exploitation_words)}"
        )
    if exploration_words:
        focus_requirement_parts.append(
            f"New vocabulary to introduce: {', '.join(exploration_words)}"
        )
    
    if focus_requirement_parts:
        focus_requirement = "- Include and naturally use these focus words:\n  " + "\n  ".join(focus_requirement_parts)
    else:
        focus_requirement = "- No required focus words"
    
    avoid_titles = avoid_titles or []
    avoid_requirement = (
        f"\n- Avoid these recent title themes: {', '.join(avoid_titles)}"
        if avoid_titles
        else ""
    )
    
    style_hint_text = (
        f"\n- Additional style requirements: {style_hint}"
        if style_hint
        else ""
    )

    # Build context about recent stories to avoid duplicates
    recent_context_text = ""
    if recent_story_context:
        recent_context_text = f"\n- Do NOT create stories similar to these recent stories the user has already read:\n{recent_story_context}"

    prompt = f"""Write a children's story for a {age}-year-old child at a {reading_level} reading level.

Requirements:
- Word count: {word_count} words
- Topics the child likes: {interests_str}
- Reading level: {reading_level}
- {focus_requirement}{avoid_requirement}{style_hint_text}{recent_context_text}
- Use simple, age-appropriate language
- Include a clear beginning, middle, and end
- Make it engaging and fun
- Be creative and vary the themes - don't make every story too similar!
- Create unique characters and settings
- Do NOT use markdown formatting (no **, __, *, _, #, etc.)
- Write in plain text only

IMPORTANT - Vocabulary Strategy:
This story uses an exploration-exploitation approach:
- Some words are for reinforcement (words the child has struggled with previously)
- Some words are NEW vocabulary to help the child expand their knowledge
- Weave both types naturally into the story without making it feel forced

Please provide:
1. A catchy title (on the first line)
2. The story content (starting from the second line)
3. A list of the NEW vocabulary words you introduced (the exploration words)

CRITICAL: Use this exact format:
Title: [Your Title Here]
Story: [Your story here - do NOT repeat the title at the beginning of the story]
NEW_WORDS: [list of new vocabulary words you used, comma-separated]

Do NOT concatenate the title with the story. Keep them separate.
Make sure to list the actual new words you introduced in the story in the NEW_WORDS section.
"""

    try:
        client = _get_gemini_client()
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        content = (response.text or "").strip()
        if not content:
            raise RuntimeError(f"Gemini response missing text: {response}")
        
        # Parse title and story
        lines = content.strip().split('\n')
        title = "A Wonderful Story"
        story_content = content
        
        # Try to extract title, story, and new words from formatted response
        new_words = []
        for i, line in enumerate(lines):
            if line.startswith("Title:"):
                title = line.replace("Title:", "").strip()
                # Extract content until NEW_WORDS or end
                content_lines = []
                for j in range(i+1, len(lines)):
                    if lines[j].startswith("NEW_WORDS:"):
                        break
                    content_lines.append(lines[j])
                story_content = '\n'.join(content_lines).replace("Story:", "").strip()
                # Extract NEW_WORDS if present
                for j in range(i+1, len(lines)):
                    if lines[j].startswith("NEW_WORDS:"):
                        words_str = lines[j].replace("NEW_WORDS:", "").strip()
                        new_words = [w.strip() for w in words_str.split(',') if w.strip()]
                        break
                break
        
        # If title and story are not on separate lines, check if first line might be title
        # (title-like: short, no periods, often CamelCase or Title Case)
        if story_content == content and lines:
            first_line = lines[0].strip()
            # Check if first line looks like a title (no spaces, CamelCase, or short with no period)
            if (len(first_line) < 80 and 
                ('.' not in first_line or first_line.count('.') == 0) and
                (first_line[0].isupper() if first_line else False)):
                # Check if it's in CamelCase or TitleCase format without spaces
                has_no_spaces = ' ' not in first_line
                has_multiple_caps = sum(1 for c in first_line if c.isupper()) > 1
                
                if has_no_spaces and has_multiple_caps:
                    # Likely a title stuck to the story (e.g., "TheSpaceBasketballAdventureMom...")
                    title = first_line
                    # Remove the title from content
                    story_content = '\n'.join(lines[1:]) if len(lines) > 1 else content.replace(first_line, '', 1)
                    story_content = story_content.strip()
        
        return {
            "title": title,
            "content": story_content,
            "new_words": new_words
        }
    
    except Exception as e:
        # Fallback story if API fails
        print(f"Error generating story: {e}")
        return {
            "title": "The Little Bird",
            "content": "Once upon a time, there was a little bird. The bird loved to fly. Every day, the bird would fly high in the sky. One day, the bird met a friend. They flew together and had fun. The end."
        }

def generate_quizzes(story_content: str, reading_level: str, user_age: int, recent_performance: List[Dict],
                     exploration_words: Optional[List[str]] = None, exploitation_words: Optional[List[str]] = None) -> List[Dict]:
    """
    Generate quizzes based on the story using Gemini.
    Includes extra questions for new vocabulary (exploration words).
    
    API: Google Gemini
    API Key Required: Yes - set GEMINI_API_KEY environment variable
    """
    
    exploration_words = exploration_words or []
    exploitation_words = exploitation_words or []
    
    # Determine base number of questions based on reading level
    base_questions = {
        "beginner": 3,
        "intermediate": 5,
        "advanced": 7
    }.get(reading_level, 4)
    
    # Add extra questions for new words (1 question per 2 exploration words)
    extra_word_questions = len(exploration_words) // 2 if exploration_words else 0
    num_questions = base_questions + extra_word_questions
    
    exploration_note = ""
    if exploration_words:
        exploration_note = f"""

IMPORTANT - NEW VOCABULARY FOCUS:
These are NEW words the child is learning: {', '.join(exploration_words)}
Create {extra_word_questions} EXTRA questions specifically about these new words to help the child learn them.
Use vocabulary questions like: "What does [word] mean?" or "Can you use [word] in a sentence?"
"""
    
    focus_words_note = ""
    if exploitation_words:
        focus_words_note = f"""
Practice words (child struggled with these): {', '.join(exploitation_words)}
Include some questions that naturally use these words.
"""

    prompt = f"""Based on the following story, create {num_questions} quiz questions for a {user_age}-year-old child at a {reading_level} reading level.

Story:
{story_content}{exploration_note}{focus_words_note}

Create a mix of these question types:
1. Reading comprehension ("reading" type) - multiple choice: what happened in the story
2. General knowledge ("general" type) - open-ended: simple questions related to story themes
3. Fill-in-the-blank ("fill_blank" type) - open-ended: complete sentences from the story
4. Pronunciation practice ("pronunciation" type) - special: read a portion of the story aloud

IMPORTANT: 
- ALWAYS include ONE "pronunciation" type question
- Vary the other question types! Don't make them all the same type.

For each question, provide:
- type: "reading" (multiple choice), "general" (open-ended), "fill_blank" (open-ended), or "pronunciation" (read-aloud)
- question: The question text
- answer: The correct answer (key words/phrase for open-ended; full passage text for pronunciation)
- options: ONLY for "reading" type. 4 multiple choice options including the correct answer. Omit for other types.

Format your response as a JSON array. Examples:

Reading question (multiple choice):
{{
  "type": "reading",
  "question": "What did the character do?",
  "answer": "flew in the sky",
  "options": ["flew in the sky", "swam in the ocean", "ran on the ground", "slept all day"]
}}

Fill-in-the-blank (open-ended, NO options):
{{
  "type": "fill_blank",
  "question": "The bird loved to ____.",
  "answer": "fly"
}}

General knowledge (open-ended, NO options):
{{
  "type": "general",
  "question": "Why do you think the bird was happy?",
  "answer": "because it had a friend"
}}

Pronunciation (read-aloud, NO options):
{{
  "type": "pronunciation",
  "question": "Read this part of the story aloud clearly:",
  "answer": "Once upon a time, there was a little bird. The bird loved to fly."
}}

REMEMBER: 
- Always include ONE "pronunciation" question with a passage from the story
- Only include "options" field for "reading" type questions."""

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        content = (response.text or "").strip()
        if not content:
            raise RuntimeError(f"Gemini response missing text: {response}")
        
        # Try to parse JSON response
        import json
        # Remove markdown code blocks if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        quizzes = json.loads(content)
        return quizzes
    
    except Exception as e:
        # Fallback quizzes if API fails
        print(f"Error generating quizzes: {e}")
        return [
            {
                "type": "reading",
                "question": "What is the story about?",
                "answer": "A story about learning",
                "options": ["A story about learning", "A cooking recipe", "A math problem", "A song"]
            },
            {
                "type": "fill_blank",
                "question": "Complete this sentence: Reading is ____.",
                "answer": "fun",
                "options": ["fun", "boring", "hard", "scary"]
            }
        ]

def determine_reading_level(assessment_score: float, age: int) -> str:
    """Determine reading level based on assessment score and age"""
    if age < 6:
        return "beginner"
    elif age < 9:
        if assessment_score >= 0.7:
            return "intermediate"
        else:
            return "beginner"
    else:
        if assessment_score >= 0.8:
            return "advanced"
        elif assessment_score >= 0.5:
            return "intermediate"
        else:
            return "beginner"


def analyze_pronunciation_difficulties(word_confidences: List[Dict], story_context: str = "") -> List[str]:
    """
    Use AI to intelligently determine which words are genuinely difficult to pronounce.
    Filters out filler words, connectors, and false positives.
    
    Args:
        word_confidences: List of dicts with 'word' and 'confidence' (0-1 scale)
        story_context: Optional story text for context
    
    Returns:
        List of words that are genuinely difficult and need practice
    """
    if not word_confidences:
        return []
    
    # Build word list with confidence scores
    word_data = "\n".join([
        f"- {item['word']}: {item['confidence']:.2f} confidence"
        for item in word_confidences
    ])
    
    prompt = f"""You are analyzing pronunciation data from a child reading aloud. 
Your task is to identify which words are GENUINELY difficult for the child to pronounce.

Word Confidence Scores (0.0 = poor pronunciation, 1.0 = perfect):
{word_data}

IMPORTANT FILTERING RULES:
1. EXCLUDE common filler words: um, uh, like, well, so, just, really, actually, basically, literally
2. EXCLUDE connector words: and, but, or, the, a, an, in, on, at, to, for, of, with
3. EXCLUDE words with confidence > 0.75 (they're probably fine)
4. INCLUDE content words (nouns, verbs, adjectives) with confidence < 0.6
5. INCLUDE words that are genuinely difficult to pronounce for children
6. Consider the context - some short words might be genuinely difficult

Return ONLY a JSON array of words that genuinely need practice, like:
["difficult", "wonderful", "magnificent"]

If NO words are genuinely difficult, return an empty array: []

Your response (JSON array only):"""

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )
        
        content = (response.text or "").strip()
        
        # Parse JSON response
        import json
        import re
        
        # Extract JSON array from response
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            difficult_words = json.loads(json_match.group(0))
            # Ensure all items are strings and lowercase
            return [str(w).lower().strip() for w in difficult_words if w]
        
        return []
        
    except Exception as e:
        print(f"Error analyzing pronunciation difficulties: {e}")
        # Fallback: simple threshold-based filtering
        return [
            item['word'].lower()
            for item in word_confidences
            if item['confidence'] < 0.5 and 
               item['word'].lower() not in ['um', 'uh', 'like', 'and', 'but', 'the', 'a', 'an', 'or']
        ]


def analyze_word_familiarity(words: List[str], user_responses: List[Dict]) -> Dict[str, float]:
    """Analyze which words the user is familiar with based on their responses"""
    word_scores = {}
    
    for word in words:
        # Simple heuristic: if word appears in correct answers, increase familiarity
        score = 0.5  # neutral starting point
        for response in user_responses:
            if word.lower() in response.get("answer", "").lower():
                if response.get("correct", False):
                    score += 0.1
                else:
                    score -= 0.05
        
        word_scores[word] = max(0.0, min(1.0, score))
    
    return word_scores

def validate_open_ended_answer(story_content: str, question_text: str, user_answer: str) -> Dict:
    """
    Use Gemini to validate open-ended answers (fill_blank, general) against the story.
    Returns whether the answer makes sense and a confidence score.
    """
    if not user_answer or not user_answer.strip():
        return {"is_valid": False, "confidence": 0.0, "reasoning": "Answer is empty"}
    
    validation_prompt = f"""You are grading a child's reading comprehension answer.

Story:
{story_content}

Question: {question_text}
Student's Answer: {user_answer}

Determine if the student's answer is reasonable/correct based on the story. Consider:
1. Does it match the story content?
2. Is it grammatically reasonable for the question type?
3. Does it show understanding of the story?

Respond ONLY with JSON in this exact format:
{{
  "is_valid": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}}

Do NOT include markdown code blocks, just raw JSON."""

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=validation_prompt
        )
        
        content = (response.text or "").strip()
        if not content:
            return {"is_valid": False, "confidence": 0.5, "reasoning": "Validation failed"}
        
        import json
        # Remove markdown if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        result = json.loads(content)
        return result
    except Exception as e:
        print(f"Error validating answer: {e}")
        # Conservative default: mark as invalid on error
        return {"is_valid": False, "confidence": 0.5, "reasoning": f"Validation error: {str(e)}"}

