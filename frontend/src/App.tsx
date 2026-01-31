import React, { useEffect, useRef, useState } from 'react';

// --- Types & Constants ---
type WordState = { 
  id: string; 
  core: string; 
  punct: string; 
  color: string; 
  punctColor: string 
};

const GREEN = '#2ecc71';
const RED = '#e63946';
const BLACK = '#1e293b';
const CURRENT_BG = '#e8eaed'; 
const SEARCH_WINDOW = 2; 

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

const normalize = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// --- Split Words Logic ---
const splitWords = (text: string): WordState[] => {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.reduce((acc: WordState[], w, index) => {
    const m = w.match(/^([^\.,!?;:"'()]+)?([.,!?—;:"'()]*)$/);
    let core = m?.[1] ?? w;
    let punct = m?.[2] ?? '';

    if (normalize(core).length === 0) {
      punct = w; 
      core = "";
    }

    if (core) {
      acc.push({ 
        id: `${index}-${core}`, 
        core, 
        punct, 
        color: BLACK, 
        punctColor: BLACK 
      });
    } else if (acc.length > 0) {
      acc[acc.length - 1].punct += ` ${punct}`; 
    }
    
    return acc;
  }, []);
};

const App: React.FC = () => {
  const sentence = "Once upon a time, there was a sweet little girl loved by everyone who met her - but most of all by her grandmother. The old woman adored her so much that she made her a small red velvet hood.";
  
  const [targetWords, setTargetWords] = useState<WordState[]>(() => splitWords(sentence));
  
  // FIX: Derived State. 
  // The "active" word is simply the first word that hasn't been colored Green or Red yet.
  // If findIndex returns -1 (all colored), we default to length (end of sentence).
  const foundIndex = targetWords.findIndex(w => w.color === BLACK);
  const activeIndex = foundIndex === -1 ? targetWords.length : foundIndex;

  const [lastHeard, setLastHeard] = useState('');
  const recognitionRef = useRef<any>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Click "Start Reading" to begin');

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      setStatusMsg('SpeechRecognition not supported in this browser.');
    }
  }, []);

  const resetSentence = () => {
    setTargetWords(splitWords(sentence));
    // No need to reset activeIndex manually anymore, it auto-calculates from the fresh BLACK words
    setLastHeard('');
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
  };

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    if (recognitionRef.current) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setStatusMsg('Listening...');
    };

    recognition.onresult = (event: any) => {
      const fullTranscript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join(' ');
        
      const spokenWords = fullTranscript.split(/\s+/).filter((w) => w.length > 0);
      
      if (spokenWords.length > 0) {
        setLastHeard(spokenWords[spokenWords.length - 1]);
      }

      setTargetWords((prevTargetWords) => {
        const nextState = prevTargetWords.map(w => ({ 
          ...w, 
          color: BLACK, 
          punctColor: BLACK 
        }));
        
        let tIndex = 0; 

        for (let sIndex = 0; sIndex < spokenWords.length; sIndex++) {
          if (tIndex >= nextState.length) break;

          const spokenWord = spokenWords[sIndex];
          const sNorm = normalize(spokenWord);

          if (!sNorm) continue; 

          let matchIndex = -1;
          const currentTarget = nextState[tIndex];
          const tNorm = normalize(currentTarget.core);
          
          if (isFuzzyMatch(tNorm, sNorm)) {
            matchIndex = tIndex;
          } 
          else {
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
             for (let i = tIndex; i < matchIndex; i++) {
                 nextState[i].color = RED;
                 nextState[i].punctColor = RED;
             }
             nextState[matchIndex].color = GREEN;
             nextState[matchIndex].punctColor = GREEN;
             tIndex = matchIndex + 1;
          } 
          else {
             nextState[tIndex].color = RED;
             nextState[tIndex].punctColor = RED; 
             tIndex++;
          }
        }

        // REMOVED: setActiveIndex(tIndex) 
        // We do not set state inside a state setter. 
        // activeIndex is now derived in the render function.

        if (tIndex >= nextState.length && !resetTimeoutRef.current) {
             handleAutoReset();
        }

        return nextState;
      });
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return; 
      if (event.error === 'not-allowed') {
        setListening(false);
        setStatusMsg('Microphone access denied.');
        return;
      }
      setStatusMsg(`Error: ${event.error}`);
    };

    recognition.onend = () => {
      if (listening) {
        setTimeout(() => {
            try { recognition.start(); } catch {}
        }, 50); 
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutoReset = () => {
    if (resetTimeoutRef.current) return;
    resetTimeoutRef.current = window.setTimeout(() => {
      resetSentence();
      if (recognitionRef.current) recognitionRef.current.abort();
      resetTimeoutRef.current = null;
    }, 2000);
  };

  const stopListening = () => {
    setListening(false); 
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setStatusMsg('Stopped');
  };

  useEffect(() => {
    return () => {
      setListening(false);
      if (recognitionRef.current) recognitionRef.current.abort();
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.controls}>
        <button onClick={startListening} disabled={!supported || listening} style={styles.btn}>
          Start Reading
        </button>
        <button onClick={stopListening} disabled={!listening} style={styles.btn}>
          Stop
        </button>
        <button onClick={() => {
            if(recognitionRef.current) recognitionRef.current.abort();
            resetSentence();
        }} style={styles.btn}>
          Reset
        </button>
        <div style={styles.status}>{statusMsg}</div>
      </div>

      <p style={styles.sentence}>
        {targetWords.map((w, i) => (
          <span key={w.id} style={styles.wordWrapper}>
            <span style={{ 
                color: w.color,
                // Use the DERIVED activeIndex here
                backgroundColor: i === activeIndex ? CURRENT_BG : 'transparent',
                borderRadius: '4px',
                padding: '2px 4px',
                borderBottom: w.color === RED ? '2px solid #e63946' : '2px solid transparent',
                fontWeight: w.color !== BLACK ? '600' : '400',
                transition: 'background-color 0.2s, color 0.1s'
            }}>
                {w.core}
            </span>
            {w.punct ? <span style={{ color: w.punctColor }}>{w.punct}</span> : null}
          </span>
        ))}
      </p>

      <div style={styles.footer}>
        Last heard: <span style={{color: '#2ecc71', fontWeight: 'bold'}}>{lastHeard || "..."}</span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    background: '#f8fafc',
    fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
    padding: '3rem',
    boxSizing: 'border-box',
  },
  controls: {
    marginBottom: 24,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  status: { color: '#64748b', fontSize: '0.9rem', fontWeight: 500, marginLeft: 10 },
  btn: {
    padding: '0.6rem 1.2rem',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    transition: 'all 0.2s ease'
  },
  sentence: {
    fontSize: '2rem',
    lineHeight: 1.8,
    maxWidth: '900px',
    textAlign: 'left',
    color: '#334155',
    padding: '3rem',
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  wordWrapper: {
    marginRight: '0.25em',
    display: 'inline-block',
  },
  footer: {
    marginTop: '2rem',
    padding: '1rem',
    background: '#0f172a',
    color: '#94a3b8',
    borderRadius: '8px',
    fontSize: '0.9rem',
    minWidth: '200px',
    textAlign: 'center'
  }
};

export default App;