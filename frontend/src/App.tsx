import React, { useEffect, useRef, useState } from 'react';

// --- Types & Constants ---
type WordState = { 
  core: string; 
  punct: string; 
  color: string; 
  punctColor: string 
};

const GREEN = '#2ecc71';
const RED = '#e63946';
const BLACK = '#000000';
const CURRENT_BG = '#e8eaed'; // Light gray background for the active word

const SEARCH_WINDOW = 2; // Reduced window size for safety

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
  if (len <= 6) return dist <= 1;
  return dist <= 2;
};

const normalize = (s: string) => s.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();

const splitWords = (text: string): WordState[] =>
  text.split(/\s+/).filter(Boolean).map((w) => {
    const m = w.match(/([^\.,!?;:]+)([.,!?;:]*)/);
    const core = m?.[1] ?? w;
    const punct = m?.[2] ?? '';
    return { core, punct, color: BLACK, punctColor: BLACK };
  });

const App: React.FC = () => {
  const sentence = "Once upon a time, there was a sweet little girl loved by everyone who met her—but most of all by her grandmother. The old woman adored her so much that she made her a small red velvet hood. It suited her perfectly, and from that day on, everyone called her Little Red Riding Hood.";
  
  const [targetWords, setTargetWords] = useState<WordState[]>(() => splitWords(sentence));
  
  // Track the current active index for UI highlighting
  const [activeIndex, setActiveIndex] = useState(0);

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
    setActiveIndex(0);
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

      setTargetWords((prevTargetWords) => {
        // 1. Reset everything to Black
        const nextState = prevTargetWords.map(w => ({ 
          ...w, 
          color: BLACK, 
          punctColor: BLACK 
        }));
        
        let tIndex = 0; 

        // 2. Iterate through every word spoken by the user
        for (let sIndex = 0; sIndex < spokenWords.length; sIndex++) {
          if (tIndex >= nextState.length) break;

          const spokenWord = spokenWords[sIndex];
          const sNorm = normalize(spokenWord);
          let matchIndex = -1;

          // --- PRIORITY 1: Check the CURRENT word (Fuzzy Allowed) ---
          const currentTarget = nextState[tIndex];
          const tNorm = normalize(currentTarget.core);
          
          if (isFuzzyMatch(tNorm, sNorm)) {
            matchIndex = tIndex;
          } 
          else {
            // --- PRIORITY 2: Check Lookahead (Strict Match Only) ---
            // preventing accidental jumps due to fuzzy matching future words
            for (let offset = 1; offset <= SEARCH_WINDOW; offset++) {
              const candidateIdx = tIndex + offset;
              if (candidateIdx < nextState.length) {
                 const candidateNorm = normalize(nextState[candidateIdx].core);
                 
                 // STRICT CHECK: Must be exact match to trigger a skip
                 if (candidateNorm === sNorm) {
                   matchIndex = candidateIdx;
                   break; 
                 }
              }
            }
          }

          // --- Match Logic ---
          if (matchIndex !== -1) {
             // Skipped words -> RED
             for (let i = tIndex; i < matchIndex; i++) {
                 nextState[i].color = RED;
                 nextState[i].punctColor = RED;
             }
             // Matched word -> GREEN
             nextState[matchIndex].color = GREEN;
             nextState[matchIndex].punctColor = GREEN;

             // Log Logic (Prevent spam)
             const wasAlreadyGreen = prevTargetWords[matchIndex]?.color === GREEN;
             if (!wasAlreadyGreen) {
               if (sNorm !== normalize(nextState[matchIndex].core)) {
                 console.log(`%c⚠️ Fuzzy Match: "${nextState[matchIndex].core}" ~ "${spokenWord}"`, 'color: #f1c40f;');
               }
             }

             tIndex = matchIndex + 1;
          } 
          else {
             // --- Mismatch Logic ---
             const expected = nextState[tIndex].core;
             const wasAlreadyRed = prevTargetWords[tIndex]?.color === RED;

             if (!wasAlreadyRed) {
                console.log(`%c❌ Mismatch: Expected "${expected}" | Heard "${spokenWord}"`, 'color: #e63946;');
             }

             nextState[tIndex].color = RED;
             nextState[tIndex].punctColor = RED; 
             tIndex++;
          }
        }

        // Update the active index (for the gray background)
        setActiveIndex(tIndex);

        // Auto-reset check
        if (tIndex >= nextState.length && !resetTimeoutRef.current) {
             handleAutoReset();
        }

        return nextState;
      });
    };

    recognition.onerror = (e: any) => {
      setStatusMsg(`Error: ${e.error}`);
    };

    recognition.onend = () => {
      if (listening) {
        try { recognition.start(); } catch {}
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
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setStatusMsg('Stopped');
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
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
          <span key={i} style={styles.wordWrapper}>
            <span style={{ 
                color: w.color,
                // Add gray background to the CURRENT expected word
                backgroundColor: i === activeIndex ? CURRENT_BG : 'transparent',
                borderRadius: '4px',
                padding: '2px 0',
                
                borderBottom: w.color === RED ? '2px solid #e63946' : 'none',
                fontWeight: w.color !== BLACK ? 'bold' : 'normal'
            }}>
                {w.core}
            </span>
            {w.punct ? <span style={{ color: w.punctColor }}>{w.punct}</span> : null}
          </span>
        ))}
      </p>
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
    background: '#f9fafb',
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
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
  status: { color: '#7f8c8d', fontSize: '0.9rem', fontWeight: 500 },
  btn: {
    padding: '0.6rem 1.2rem',
    borderRadius: 8,
    border: '1px solid #e0e0e0',
    background: '#ffffff',
    color: '#333',
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
    transition: 'all 0.2s ease'
  },
  sentence: {
    fontSize: '2rem',
    lineHeight: 1.6,
    maxWidth: '900px',
    textAlign: 'left',
    color: '#34495e',
    padding: '2.5rem',
    background: '#ffffff',
    borderRadius: 16,
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
  },
  wordWrapper: {
    marginRight: '0.35em',
    display: 'inline-block',
  },
};

export default App;