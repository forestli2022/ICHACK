import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Types & Constants ---
type WordState = {
  id: string;
  core: string;
  punct: string;
  color: string;
  punctColor: string;
};

const GREEN = '#2ecc71';
const RED = '#e63946';
const BLACK = '#1e293b';
const CURRENT_BG = '#e8eaed';
const SEARCH_WINDOW = 2;

// Words to ignore (connectors, articles, etc)
const BLACKLIST_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'is', 'are', 'was', 'were', 'be', 'by', 'with', 'from', 'as',
  'it', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they'
]);

// --- Levenshtein & Fuzzy Match ---
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const isFuzzyMatch = (target: string, spoken: string): boolean => {
  const dist = getLevenshteinDistance(target, spoken);
  const len = Math.max(target.length, spoken.length);
  if (len <= 3) return dist === 0;
  if (len <= 5) return dist <= 1;
  return dist <= 2;
};

const getConfidenceScore = (target: string, spoken: string): number => {
  const dist = getLevenshteinDistance(target, spoken);
  const len = Math.max(target.length, spoken.length);
  // Return score from 0 to 1 (1 = perfect match)
  if (len === 0) return 1;
  return Math.max(0, 1 - (dist / len));
};

const normalize = (s: string) => {
  if (!s) return '';
  return s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
};

// --- Split Words Logic ---
const splitWords = (text: string): WordState[] => {
  if (!text) return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.reduce((acc: WordState[], w, index) => {
    const m = w.match(/^([^\.,!?;:"'()]+)?([.,!?—;:"'()]*)$/);
    let core = m?.[1] ?? w;
    let punct = m?.[2] ?? '';

    if (normalize(core).length === 0) {
      punct = w;
      core = '';
    }

    if (core) {
      acc.push({
        id: `${index}-${core}`,
        core,
        punct,
        color: BLACK,
        punctColor: BLACK,
      });
    } else if (acc.length > 0) {
      acc[acc.length - 1].punct += ` ${punct}`;
    }

    return acc;
  }, []);
};

export type TextFollowerProps = {
  text: string;
  onComplete?: (missedWords: string[]) => void;
  autoStart?: boolean;  // Auto-start listening without clicking button
};

// Call AI agent to analyze word confidence and get likely missed words
const callAIForWordAnalysis = async (wordConfidenceList: any[], storyContext: string = ''): Promise<string[]> => {
  try {
    console.log('🤖 Calling AI to analyze word confidence...');
    console.log('Word confidences:', wordConfidenceList);
    const response = await fetch('http://localhost:8000/api/quizzes/analyze-pronunciation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        word_confidences: wordConfidenceList,
        story_context: storyContext,
      }),
    });
    
    if (!response.ok) throw new Error('AI analysis failed');
    const data = await response.json();
    console.log('✅ AI analysis result:', data.analyzed_words);
    return data.analyzed_words || [];
  } catch (error) {
    console.error('❌ Error calling AI for word analysis:', error);
    // Fallback: filter by confidence threshold
    return wordConfidenceList
      .filter(item => item.confidence < 0.5)
      .map(item => item.word);
  }
};

// Text-to-Speech helper
const speakWord = (word: string) => {
  try {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error('Error speaking word:', error);
  }
};

const TextFollower: React.FC<TextFollowerProps> = ({ text = '', onComplete, autoStart = false }) => {
  const [targetWords, setTargetWords] = useState<WordState[]>(() => splitWords(text));

  const foundIndex = targetWords.findIndex((w) => w.color === BLACK);
  const activeIndex = foundIndex === -1 ? targetWords.length : foundIndex;
  const isFinished = activeIndex === targetWords.length;

  const [lastHeard, setLastHeard] = useState('');
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [statusMsg, setStatusMsg] = useState(autoStart ? 'Starting...' : 'Click "Start Reading" to begin');
  const isListeningRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  
  // Practice mode state
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceWords, setPracticeWords] = useState<string[]>([]);
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [practiceAttempts, setPracticeAttempts] = useState(0);
  const [practiceResult, setPracticeResult] = useState<'correct' | 'incorrect' | null>(null);
  const [practiceProcessing, setPracticeProcessing] = useState(false); // Prevent double-clicks
  // Prevent UI from reverting to story while parent handles completion
  const [awaitingCompletion, setAwaitingCompletion] = useState(false);
  
  // Lock words list during practice to prevent swapping
  const lockedPracticeWordsRef = useRef<string[]>([]);
  const practiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear awaiting state after a short timeout if parent doesn't advance
  useEffect(() => {
    if (!awaitingCompletion) return;
    const id = setTimeout(() => {
      setAwaitingCompletion(false);
      setStatusMsg('Submission timeout — you can continue.');
    }, 6000);
    return () => clearTimeout(id);
  }, [awaitingCompletion]);
  
  // Cleanup practice timeout on unmount
  useEffect(() => {
    return () => {
      if (practiceTimeoutRef.current) {
        clearTimeout(practiceTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to keep current word centered
  useEffect(() => {
    if (activeIndex < targetWords.length && wordRefs.current[activeIndex] && scrollContainerRef.current) {
      const wordElement = wordRefs.current[activeIndex];
      const container = scrollContainerRef.current;
      const wordTop = wordElement.offsetTop;
      const wordHeight = wordElement.offsetHeight;
      const containerHeight = container.clientHeight;
      
      // Scroll to center the current word
      const scrollTo = wordTop - (containerHeight / 2) + (wordHeight / 2);
      container.scrollTo({
        top: scrollTo,
        behavior: 'smooth'
      });
    }
  }, [activeIndex, targetWords.length]);

  // Re-split when text prop changes (but not during practice mode to prevent word shifting)
  useEffect(() => {
    if (!practiceMode) {
      setTargetWords(splitWords(text));
    }
  }, [text, practiceMode]);
  
  // Debug: Log when practice index changes
  useEffect(() => {
    if (practiceMode) {
      console.log(`📍 Practice index changed to: ${currentPracticeIndex}, word: ${lockedPracticeWordsRef.current[currentPracticeIndex]}`);
    }
  }, [currentPracticeIndex, practiceMode]);
  
  // Debug: Log when practiceProcessing changes
  useEffect(() => {
    console.log(`🔄 practiceProcessing changed to: ${practiceProcessing}`);
  }, [practiceProcessing]);

  const handleResult = useCallback((event: any) => {
    const fullTranscript = Array.from(event.results)
      .map((r: any) => r[0].transcript)
      .join(' ');

    const spokenWords = fullTranscript.split(/\s+/).filter((w) => w.length > 0);

    if (spokenWords.length > 0) {
      setLastHeard(spokenWords[spokenWords.length - 1]);
    }

    // Practice mode no longer uses speech recognition - skip this section
    if (practiceMode) {
      return; // Practice mode is now manual (just listen, no recognition)
    }

    setTargetWords((prevTargetWords) => {
      const nextState = prevTargetWords.map((w) => ({
        ...w,
        color: BLACK,
        punctColor: BLACK,
      }));

      let tIndex = 0;

      for (let sIndex = 0; sIndex < spokenWords.length; sIndex++) {
        // If we ran out of target words, stop processing
        if (tIndex >= nextState.length) break;

        const spokenWord = spokenWords[sIndex];
        const sNorm = normalize(spokenWord);
        if (!sNorm) continue;

        let matchIndex = -1;
        const currentTarget = nextState[tIndex];
        const tNorm = normalize(currentTarget.core);

        // 1. Direct Match (Current Word)
        if (isFuzzyMatch(tNorm, sNorm)) {
          matchIndex = tIndex;
        } else {
          // 2. Lookahead (Did they skip a word?)
          for (let offset = 1; offset <= SEARCH_WINDOW; offset++) {
            const candidateIdx = tIndex + offset;
            if (candidateIdx < nextState.length) {
              const candidateNorm = normalize(nextState[candidateIdx].core);
              if (candidateNorm === sNorm) {
                matchIndex = candidateIdx;
                break;
              }
            }
          }
        }

        if (matchIndex !== -1) {
          // Matched somewhere!
          // Mark skipped words as RED
          for (let i = tIndex; i < matchIndex; i++) {
            nextState[i].color = RED;
            nextState[i].punctColor = RED;
          }
          // Mark found word as GREEN
          nextState[matchIndex].color = GREEN;
          nextState[matchIndex].punctColor = GREEN;
          
          // Advance pointer past the matched word
          tIndex = matchIndex + 1;
        } else {
          // 3. No Match Found (The Fix)
          // Mark current word RED and move to the next word
          nextState[tIndex].color = RED;
          nextState[tIndex].punctColor = RED;
          tIndex++; 
        }
      }

      if (tIndex >= nextState.length) {
        isListeningRef.current = false;
        setListening(false);
        
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {}
        }

        const missedWordsArray = nextState
          .filter((w) => w.color === RED)
          .map((word) => {
            // Strip punctuation, convert to lowercase
            const cleaned = word.core.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
            return cleaned;
          })
          .filter((word) => word.length > 2 && !BLACKLIST_WORDS.has(word)); // Remove short words and blacklisted words
        
        // Use Set to remove duplicates
        const uniqueMissedWords = Array.from(new Set(missedWordsArray));

        console.log('--- SESSION FINISHED ---');
        if (uniqueMissedWords.length > 0) {
          console.log('Missed/Red Words:', uniqueMissedWords);
          
          // Build word confidence list for AI analysis
          const wordConfidenceList = nextState
            .filter((w) => !BLACKLIST_WORDS.has(normalize(w.core)) && w.core.length > 2)
            .map((w) => ({
              word: w.core,
              color: w.color,
              confidence: w.color === GREEN ? 0.95 : w.color === RED ? 0.1 : 0.5
            }));
          
          // Call AI agent to analyze and get genuinely difficult words
          callAIForWordAnalysis(wordConfidenceList, text.slice(0, 500)).then((aiResult) => {
            const finalMissedWords = aiResult || [];
            
            if (finalMissedWords.length > 0) {
              // Sort by length descending and keep only the top 3
              const sortedByLength = finalMissedWords.sort((a, b) => b.length - a.length);
              const topThreeWords = sortedByLength.slice(0, 3);
              // Lock the words to prevent swapping during practice
              lockedPracticeWordsRef.current = topThreeWords;
              // Enter practice mode
              setPracticeWords(topThreeWords);
              setCurrentPracticeIndex(0);
              setPracticeAttempts(0);
              setPracticeMode(true);
              setStatusMsg('Let\'s practice the words you missed!');
            } else {
              console.log('AI filtered out all words - no practice needed!');
              // No genuinely difficult words — signal completion
              setAwaitingCompletion(true);
              setStatusMsg('Finished — submitting...');
              if (onComplete) {
                onComplete([]);
              }
            }
          });
        } else {
          console.log('Perfect score! No missed words.');
          // No missed words — signal parent and wait so UI doesn't revert
          setAwaitingCompletion(true);
          setStatusMsg('Finished — submitting...');
          if (onComplete) {
            onComplete(uniqueMissedWords);
          }
        }
      }

      return nextState;
    });
  }, [onComplete, practiceMode, practiceWords, currentPracticeIndex, practiceAttempts]);

  const handleError = useCallback((event: any) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return;
    if (event.error === 'not-allowed') {
      setListening(false);
      isListeningRef.current = false;
      setStatusMsg('Microphone access denied.');
      return;
    }
    setStatusMsg(`Error: ${event.error}`);
  }, []);

  const handleEnd = useCallback(() => {
    // Practice mode doesn't use speech recognition anymore
    if (practiceMode) {
      return;
    }
    
    // Auto-restart if stopped unexpectedly (normal reading mode only)
    if (recognitionRef.current && isListeningRef.current) {
      setTimeout(() => {
        try {
          if (isListeningRef.current && !practiceMode) {
            recognitionRef.current.start();
          }
        } catch {}
      }, 50);
    } else {
      setListening(false);
      isListeningRef.current = false;
    }
  }, [practiceMode]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      setStatusMsg('SpeechRecognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;
    recognition.onstart = () => {
      setListening(true);
      isListeningRef.current = true;
      setStatusMsg('Listening...');
    };

    // Auto-start if enabled
    if (autoStart && !isListeningRef.current && !isFinished) {
      setTimeout(() => {
        try {
          if (!isListeningRef.current) {
            recognition.start();
            setStatusMsg('Starting...');
          }
        } catch (err) {
          console.log('Auto-start error:', err);
        }
      }, 1000);
    }

    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [handleResult, handleError, handleEnd, autoStart, isFinished]);

  const startListening = () => {
    if (!recognitionRef.current || isFinished) return;
    isListeningRef.current = true;
    try {
      recognitionRef.current.start();
      setStatusMsg('Starting...');
    } catch (err) {
      console.log('Already started or error:', err);
    }
  };

  const stopListening = useCallback(() => {
    if (statusMsg === 'Listening...') {
      setStatusMsg('Stopped');
    }

    isListeningRef.current = false;
    setListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [statusMsg]);

  const handlePracticeWordClick = useCallback(() => {
    if (practiceProcessing) return; // Prevent double-clicks
    
    setPracticeProcessing(true);
    const currentIdx = currentPracticeIndex;
    const word = lockedPracticeWordsRef.current[currentIdx];
    
    console.log(`🔊 Playing word ${currentIdx + 1}: ${word}`);
    speakWord(word);
    
    // Clear any existing timeout
    if (practiceTimeoutRef.current) {
      clearTimeout(practiceTimeoutRef.current);
    }
    
    // Move to next word after short delay
    practiceTimeoutRef.current = setTimeout(() => {
      const nextIndex = currentPracticeIndex + 1;
      console.log(`📍 Moving from word ${currentPracticeIndex + 1} to ${nextIndex + 1}`);
      
      if (nextIndex < lockedPracticeWordsRef.current.length) {
        // Move to next word
        console.log(`✅ Advancing to word ${nextIndex + 1}`);
        setCurrentPracticeIndex(nextIndex);
        setStatusMsg(`Word ${nextIndex + 1} of ${lockedPracticeWordsRef.current.length}`);
        setPracticeProcessing(false);
      } else {
        // All practice words done
        console.log('🎉 All practice words complete');
        setPracticeMode(false);
        setAwaitingCompletion(true);
        setStatusMsg('Practice complete — submitting...');
        setPracticeProcessing(false);
        if (onComplete) {
          onComplete(lockedPracticeWordsRef.current);
        }
      }
      practiceTimeoutRef.current = null;
    }, 2000); // 2 second delay to hear the word
  }, [currentPracticeIndex, practiceProcessing, onComplete]);

  const startPractice = useCallback(() => {
    isListeningRef.current = true;
    setListening(true);
    setPracticeResult(null);
    setStatusMsg(`Attempt ${practiceAttempts + 1}/3`);
    try {
      recognitionRef.current.start();
    } catch (err) {
      console.log('Already started or error:', err);
    }
  }, [practiceAttempts]);

  return (
    <div style={styles.container}>
      {awaitingCompletion ? (
        <>
          <div style={{ ...styles.controls, justifyContent: 'center' }}>
            <div style={styles.status}>{statusMsg}</div>
          </div>
        </>
      ) : !practiceMode ? (
        <>
          <div style={styles.controls}>
            {!isFinished && !autoStart && (
              <button
                onClick={startListening}
                disabled={!supported || listening}
                style={styles.btn}
              >
                Start Reading
              </button>
            )}
            <div style={styles.status}>{statusMsg}</div>
          </div>

          <div ref={scrollContainerRef} style={styles.scrollContainer}>
        <p style={styles.sentence}>
          {targetWords.map((w, i) => (
            <span 
              key={w.id} 
              ref={(el) => { wordRefs.current[i] = el; }}
              style={styles.wordWrapper}
            >
              <span
                style={{
                  color: w.color,
                  backgroundColor: i === activeIndex ? CURRENT_BG : 'transparent',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  borderBottom:
                    w.color === RED ? '2px solid #e63946' : '2px solid transparent',
                  fontWeight: '500',
                  transition: 'background-color 0.2s, color 0.2s',
                }}
              >
                {w.core}
              </span>
              {w.punct ? <span style={{ color: w.punctColor }}>{w.punct}</span> : null}
            </span>
          ))}
        </p>
      </div>

          <div style={styles.footer}>
            Last heard:{' '}
            <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>
              {lastHeard || '...'}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={styles.controls}>
            <div style={styles.status}>{statusMsg}</div>
          </div>

          <div style={styles.practiceContainer}>
            <div style={{ width: '100%', marginBottom: '1rem' }}>
              <div style={{ color: '#64748b', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Word {currentPracticeIndex + 1} of {lockedPracticeWordsRef.current.length}</div>
              <div style={{
                height: '4px',
                background: '#e2e8f0',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
                  width: `${((currentPracticeIndex + 1) / lockedPracticeWordsRef.current.length) * 100}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
            
            <div style={{
              ...styles.practiceWord,
              backgroundColor: '#ffffff',
              borderColor: '#e2e8f0',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.06)',
            }}>
              {lockedPracticeWordsRef.current[currentPracticeIndex] || ''}
            </div>
            
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              width: '100%',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={handlePracticeWordClick}
                disabled={practiceProcessing}
                style={{
                  ...styles.btn,
                  background: practiceProcessing ? 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
                  color: '#ffffff',
                  flex: '0 1 auto',
                  minWidth: '220px',
                  fontSize: '16px',
                  padding: '14px 28px',
                  cursor: practiceProcessing ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  border: 'none',
                  boxShadow: practiceProcessing ? '0 2px 4px rgba(0,0,0,0.1)' : '0 4px 12px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                {practiceProcessing ? 'Playing...' : 'Play & Continue'}
              </button>
            </div>
            
            <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '1.5rem', textAlign: 'center', fontStyle: 'italic' }}>
              Listen to the correct pronunciation
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'system-ui, Avenir, Helvetica, Arial, sans-serif',
    padding: '1rem',
    boxSizing: 'border-box',
    fontSynthesis: 'none',
    textRendering: 'optimizeLegibility',
    color: '#334155',
  },
  controls: {
    marginBottom: 16,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    flexShrink: 0,
  },
  status: { color: '#64748b', fontSize: '0.9rem', fontWeight: 500 },
  btn: {
    padding: '0.6rem 1.2rem',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#2ecc71',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'all 0.2s ease',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '1.5rem',
    background: '#f8fafc',
    borderRadius: 12,
    border: '2px solid #e8eaed',
    marginBottom: '1rem',
    position: 'relative',
  },
  sentence: {
    fontSize: '1.5rem',
    lineHeight: 1.8,
    textAlign: 'left',
    color: '#334155',
    margin: 0,
    padding: '0 0.5rem',
  },
  wordWrapper: {
    marginRight: '0.25em',
    display: 'inline-block',
  },
  footer: {
    padding: '0.75rem',
    background: '#f1f5f9',
    color: '#64748b',
    borderRadius: '8px',
    fontSize: '0.85rem',
    textAlign: 'center',
    flexShrink: 0,
  },
  practiceContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    width: '100%',
    gap: '1.5rem',
  },
  practiceWord: {
    fontSize: '3.5rem',
    fontWeight: '700',
    padding: '2.5rem 3rem',
    borderRadius: '12px',
    border: '2px solid',
    marginBottom: '1.5rem',
    transition: 'all 0.3s ease',
  },
};

export default TextFollower;




