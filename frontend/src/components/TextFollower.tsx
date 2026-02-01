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
const SEARCH_WINDOW = 3;

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

const isFuzzyMatch = (target: string, spoken: string): { matches: boolean; distance: number } => {
  const dist = getLevenshteinDistance(target, spoken);
  const len = Math.max(target.length, spoken.length);
  let matches = false;
  if (len <= 3) matches = dist === 0;
  else if (len <= 5) matches = dist <= 1;
  else matches = dist <= 2;
  return { matches, distance: dist };
};

const getConfidenceColor = (distance: number, wordLength: number): string => {
  if (distance === 0) return GREEN; // Perfect match
  if (distance === 1 && wordLength > 3) return '#52c785'; // Very close (light green)
  if (distance === 2 && wordLength > 5) return '#7ec997'; // Close enough (lighter green)
  return RED; // Too far
};

const normalize = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

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
};

const TextFollower: React.FC<TextFollowerProps> = ({ text = '', onComplete }) => {
  const [targetWords, setTargetWords] = useState<WordState[]>(() => splitWords(text));

  const foundIndex = targetWords.findIndex((w) => w.color === BLACK);
  const activeIndex = foundIndex === -1 ? targetWords.length : foundIndex;
  const isFinished = activeIndex === targetWords.length;

  const [lastHeard, setLastHeard] = useState('');
  const recognitionRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Click "Start Reading" to begin');
  const isListeningRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  
  // Practice mode state
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceWords, setPracticeWords] = useState<string[]>([]);
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [practiceAttempts, setPracticeAttempts] = useState(0);
  const [practiceResult, setPracticeResult] = useState<'correct' | 'incorrect' | null>(null);

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

  // Re-split when text prop changes
  useEffect(() => {
    setTargetWords(splitWords(text));
  }, [text]);

  const handleResult = useCallback((event: any) => {
    const fullTranscript = Array.from(event.results)
      .map((r: any) => r[0].transcript)
      .join(' ');

    const spokenWords = fullTranscript.split(/\s+/).filter((w) => w.length > 0);

    if (spokenWords.length > 0) {
      setLastHeard(spokenWords[spokenWords.length - 1]);
    }

    // Practice mode handling
    if (practiceMode && practiceWords.length > 0 && currentPracticeIndex < practiceWords.length) {
      const targetWord = practiceWords[currentPracticeIndex];
      const lastSpoken = spokenWords[spokenWords.length - 1];
      const fuzzyResult = isFuzzyMatch(normalize(targetWord), normalize(lastSpoken));
      
      if (fuzzyResult.matches && fuzzyResult.distance === 0) {
        // Correct pronunciation
        setPracticeResult('correct');
        isListeningRef.current = false;
        setListening(false);
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch {}
        }
        
        setTimeout(() => {
          setPracticeResult(null);
          if (currentPracticeIndex + 1 < practiceWords.length) {
            setCurrentPracticeIndex(currentPracticeIndex + 1);
            setPracticeAttempts(0);
            setStatusMsg('Great! Next word...');
          } else {
            // All practice words done
            setPracticeMode(false);
            setStatusMsg('Practice complete!');
            if (onComplete) {
              onComplete(practiceWords);
            }
          }
        }, 1000);
        return;
      }
    }

    setTargetWords((prevTargetWords) => {
      const nextState = prevTargetWords.map((w) => ({
        ...w,
        color: BLACK,
        punctColor: BLACK,
      }));

      let tIndex = 0;

      for (let sIndex = 0; sIndex < spokenWords.length; sIndex++) {
        if (tIndex >= nextState.length) break;

        const spokenWord = spokenWords[sIndex];
        const sNorm = normalize(spokenWord);
        if (!sNorm) continue;

        let matchIndex = -1;
        let matchDistance = 0;
        const currentTarget = nextState[tIndex];
        const tNorm = normalize(currentTarget.core);

        const fuzzyResult = isFuzzyMatch(tNorm, sNorm);
        if (fuzzyResult.matches) {
          matchIndex = tIndex;
          matchDistance = fuzzyResult.distance;
        } else {
          for (let offset = 1; offset <= SEARCH_WINDOW; offset++) {
            const candidateIdx = tIndex + offset;
            if (candidateIdx < nextState.length) {
              const candidateNorm = normalize(nextState[candidateIdx].core);
              if (candidateNorm === sNorm) {
                matchIndex = candidateIdx;
                matchDistance = 0;
                break;
              }
            }
          }
        }

        if (matchIndex !== -1) {
          for (let i = tIndex; i < matchIndex; i++) {
            nextState[i].color = RED;
            nextState[i].punctColor = RED;
          }
          const wordLength = nextState[matchIndex].core.length;
          const confidenceColor = getConfidenceColor(matchDistance, wordLength);
          nextState[matchIndex].color = confidenceColor;
          nextState[matchIndex].punctColor = confidenceColor;
          tIndex = matchIndex + 1;
        } else {
          nextState[tIndex].color = RED;
          nextState[tIndex].punctColor = RED;
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

        const missedWordsArray = nextState.filter((w) => w.color === RED).map((w) => w.core);
        // Use Set to remove duplicates
        const uniqueMissedWords = Array.from(new Set(missedWordsArray));

        console.log('--- SESSION FINISHED ---');
        if (uniqueMissedWords.length > 0) {
          console.log('Missed/Red Words:', uniqueMissedWords);
          // Enter practice mode
          setPracticeWords(uniqueMissedWords);
          setCurrentPracticeIndex(0);
          setPracticeAttempts(0);
          setPracticeMode(true);
          setStatusMsg('Let\'s practice the words you missed!');
        } else {
          console.log('Perfect score! No missed words.');
          setStatusMsg('Finished!');
          // Call onComplete callback if provided
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
    if (practiceMode && isListeningRef.current) {
      // In practice mode, check attempts
      const newAttempts = practiceAttempts + 1;
      setPracticeAttempts(newAttempts);
      
      if (newAttempts >= 3) {
        // Max attempts reached, skip this word
        setPracticeResult('incorrect');
        isListeningRef.current = false;
        setListening(false);
        setStatusMsg(`Try: ${practiceWords[currentPracticeIndex]}`);
        
        setTimeout(() => {
          setPracticeResult(null);
          if (currentPracticeIndex + 1 < practiceWords.length) {
            setCurrentPracticeIndex(currentPracticeIndex + 1);
            setPracticeAttempts(0);
            setStatusMsg('Let\'s try the next word...');
          } else {
            // All practice words done
            setPracticeMode(false);
            setStatusMsg('Practice complete!');
            if (onComplete) {
              onComplete(practiceWords);
            }
          }
        }, 2000);
      } else {
        // Retry
        setTimeout(() => {
          try {
            if (isListeningRef.current) {
              recognitionRef.current.start();
            }
          } catch {}
        }, 50);
      }
    } else if (recognitionRef.current && isListeningRef.current) {
      setTimeout(() => {
        try {
          if (isListeningRef.current) {
            recognitionRef.current.start();
          }
        } catch {}
      }, 50);
    } else {
      setListening(false);
    }
  }, [practiceMode, practiceAttempts, practiceWords, currentPracticeIndex, onComplete]);

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

    return () => {
      isListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [handleResult, handleError, handleEnd]);

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
    isListeningRef.current = false;
    setListening(false);
    setStatusMsg((prev) => prev === 'Listening...' ? 'Stopped' : prev);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, []);

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
      {!practiceMode ? (
        <>
          <div style={styles.controls}>
            {!isFinished && (
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
            <h3 style={{ color: '#334155', marginBottom: '1rem' }}>Practice Word {currentPracticeIndex + 1} of {practiceWords.length}</h3>
            <div style={{
              ...styles.practiceWord,
              backgroundColor: practiceResult === 'correct' ? '#d1fae5' : practiceResult === 'incorrect' ? '#fee2e2' : '#f8fafc',
              borderColor: practiceResult === 'correct' ? '#2ecc71' : practiceResult === 'incorrect' ? '#e63946' : '#cbd5e1',
            }}>
              {practiceWords[currentPracticeIndex]}
            </div>
            
            {!listening && practiceResult === null && (
              <button
                onClick={startPractice}
                style={styles.btn}
              >
                {practiceAttempts === 0 ? 'Start Practice' : `Try Again (${practiceAttempts}/3)`}
              </button>
            )}
            
            {practiceResult === 'correct' && (
              <div style={{ color: '#2ecc71', fontWeight: 'bold', marginTop: '1rem' }}>✓ Correct!</div>
            )}
            
            {practiceResult === 'incorrect' && (
              <div style={{ color: '#e63946', fontWeight: 'bold', marginTop: '1rem' }}>Let's move to the next word</div>
            )}
            
            <div style={styles.footer}>
              Last heard:{' '}
              <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>
                {lastHeard || '...'}
              </span>
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
  },
  practiceWord: {
    fontSize: '3rem',
    fontWeight: '600',
    padding: '2rem 3rem',
    borderRadius: '16px',
    border: '3px solid',
    marginBottom: '2rem',
    transition: 'all 0.3s ease',
  },
};

export default TextFollower;