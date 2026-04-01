import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Exam, ExamResult, User, Question, AppSettings } from '../types';
import { playAlertSound } from '../utils/sound';
import { Timer, ChevronRight, ChevronLeft, Grid3X3, Trophy, CheckCircle, ShieldAlert, ZoomIn, X, Maximize2, Clock } from 'lucide-react';
import { db } from '../services/database'; // SWITCHED TO REAL DB
import { Confetti } from './Confetti';

interface ExamInterfaceProps {
  user: User;
  exam: Exam;
  onComplete: () => void;
  appName: string;
  themeColor: string;
  settings: AppSettings;
}

// Fisher-Yates Shuffle Algorithm
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Helper to shuffle options inside a question and update the correctIndex map
const processQuestionsWithShuffledOptions = (questions: Question[]): Question[] => {
    return questions.map(q => {
        if (q.type === 'URAIAN') return q; // No options to shuffle

        // 1. Map options to objects to track correctness
        const mappedOptions = q.options.map((opt, idx) => {
            let isCorrect = false;
            if (q.type === 'PG') {
                isCorrect = idx === q.correctIndex;
            } else if (['PG_KOMPLEKS', 'PG_BS'].includes(q.type)) {
                isCorrect = q.correctIndices?.includes(idx) ?? false;
            }
            return { text: opt, isCorrect };
        });

        // 2. Shuffle the options
        const shuffledMapped = shuffleArray(mappedOptions);

        // 3. Reconstruct options array
        const newOptions = shuffledMapped.map(m => m.text);

        // 4. Find new indices for correct answers
        let newCorrectIndex = 0;
        let newCorrectIndices: number[] = [];

        if (q.type === 'PG') {
            newCorrectIndex = shuffledMapped.findIndex(m => m.isCorrect);
        } else if (['PG_KOMPLEKS', 'PG_BS'].includes(q.type)) {
            newCorrectIndices = shuffledMapped
                .map((m, idx) => m.isCorrect ? idx : -1)
                .filter(idx => idx !== -1);
        }

        return {
            ...q,
            options: newOptions,
            correctIndex: newCorrectIndex,
            correctIndices: newCorrectIndices
        };
    });
};

// Motivations based on score percentage
const getMotivation = (score: number, maxScore: number, studentName: string) => {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    if (percentage === 100) return `Luar biasa, ${studentName}! Nilai Sempurna! Pertahankan prestasimu!`;
    if (percentage >= 80) return `Hebat, ${studentName}! Hasil yang sangat memuaskan.`;
    if (percentage >= 60) return `Bagus, ${studentName}! Teruslah belajar untuk hasil yang lebih baik lagi.`;
    return `Jangan menyerah, ${studentName}! Kegagalan adalah awal dari kesuksesan. Ayo belajar lebih giat!`;
};

export const ExamInterface: React.FC<ExamInterfaceProps> = ({ user, exam, onComplete, appName, themeColor, settings }) => {
  // Initialize Randomized Questions (Order AND Options) ONLY ONCE on mount
  const [activeQuestions] = useState<Question[]>(() => {
      // Ensure exam.questions is an array
      const questionsSource: Question[] = exam.questions || [];
      const shuffledQ = shuffleArray(questionsSource);
      return processQuestionsWithShuffledOptions(shuffledQ);
  });
  
  // PERSISTENCE LOGIC: Get last index from storage
  const storageKey = `das_progress_${user.id}_${exam.id}`;
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() => {
     const saved = localStorage.getItem(storageKey);
     return saved ? parseInt(saved, 10) : 0;
  });
  
  // State for different answer types
  const [answers, setAnswers] = useState<any[]>(new Array(activeQuestions.length).fill(null));
  
  const [markedDoubts, setMarkedDoubts] = useState<boolean[]>(new Array(activeQuestions.length).fill(false));
  const [timeLeft, setTimeLeft] = useState(exam.durationMinutes * 60);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [cheatingAttempts, setCheatingAttempts] = useState(0);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [maxPossibleScore, setMaxPossibleScore] = useState(0);
  
  // UI State
  const [showQuestionListModal, setShowQuestionListModal] = useState(false);
  
  // Time Warning State
  const [timeAlert, setTimeAlert] = useState<{ visible: boolean; title: string; subtitle: string } | null>(null);

  // Anti Cheat States
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezeTimeLeft, setFreezeTimeLeft] = useState(0);
  const [freezeReason, setFreezeReason] = useState("");

  // Lightbox State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Persistence Effect
  useEffect(() => {
      localStorage.setItem(storageKey, currentQuestionIndex.toString());
  }, [currentQuestionIndex, storageKey]);

  useEffect(() => {
    // Calculate max possible score once
    const max = activeQuestions.reduce((acc, q) => acc + q.points, 0);
    setMaxPossibleScore(max);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const nextTime = prev - 1;

        // --- WARNING LOGIC START ---
        // Warning 5 Minutes (300 seconds)
        if (nextTime === 300) {
            setTimeAlert({ 
                visible: true, 
                title: "Waktu mengerjakan kurang 5 menit", 
                subtitle: "Periksa kembali soal dan jawaban" 
            });
            // Auto hide after 3 seconds
            setTimeout(() => setTimeAlert(null), 3000);
        }

        // Warning 1 Minute (60 seconds)
        if (nextTime === 60) {
            setTimeAlert({ 
                visible: true, 
                title: "Waktu mengerjakan kurang 60 detik", 
                subtitle: "Periksa kembali soal dan jawaban" 
            });
            // Auto hide after 3 seconds
            setTimeout(() => setTimeAlert(null), 3000);
        }
        // --- WARNING LOGIC END ---

        if (nextTime <= 0) {
          clearInterval(timer);
          // Use setTimeout to break the render cycle just in case
          setTimeout(() => finishExam(), 0);
          return 0;
        }
        return nextTime;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown for Freeze Timer
  useEffect(() => {
      let interval: any;
      if (isFrozen && freezeTimeLeft > 0) {
          interval = setInterval(() => {
              setFreezeTimeLeft((prev) => {
                  if (prev <= 1) {
                      setIsFrozen(false);
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else if (freezeTimeLeft <= 0) {
          setIsFrozen(false);
      }
      return () => clearInterval(interval);
  }, [isFrozen, freezeTimeLeft]);

  useEffect(() => {
    if (!settings.antiCheat.isActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerCheatingAlert("Tab switching detected!");
      }
    };
    const handleBlur = () => {
       triggerCheatingAlert("Window focus lost!");
    };
    
    // Screenshot detection (best effort)
    const handleKeyDown = (e: KeyboardEvent) => {
        // PrintScreen detection
        if (e.key === 'PrintScreen') {
            triggerCheatingAlert("Screenshot attempt detected!");
            // Try to clear clipboard if possible (limited browser support)
            navigator.clipboard.writeText("");
        }
        
        // Common screenshot shortcuts
        // Windows: Meta+Shift+S or Alt+PrintScreen
        // Mac: Meta+Shift+3 or Meta+Shift+4
        const isWinScreenshot = e.metaKey && e.shiftKey && e.key === 'S';
        const isMacScreenshot = e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4');
        
        if (isWinScreenshot || isMacScreenshot) {
            triggerCheatingAlert("Screenshot shortcut detected!");
        }
    };

    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        return false;
    };

    const handleCopy = (e: ClipboardEvent) => {
        e.preventDefault();
        triggerCheatingAlert("Copy attempt detected!");
        return false;
    };

    const handleBeforePrint = () => {
        triggerCheatingAlert("Print attempt detected!");
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    window.addEventListener('beforeprint', handleBeforePrint);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, [cheatingAttempts, settings.antiCheat, isFrozen, showScoreModal]);

  const triggerCheatingAlert = (reason: string = "Violation detected!") => {
    // Only alert if exam is active (score modal not shown) and not already frozen
    if (showScoreModal || isFrozen) return;

    if (settings.antiCheat.enableSound) {
        playAlertSound();
    }
    
    setFreezeReason(reason);
    
    // CALCULATE EXPONENTIAL FREEZE TIME (Jos Jis System)
    // Attempt 1: 15s * 2^0 = 15s
    // Attempt 2: 15s * 2^1 = 30s
    // Attempt 3: 15s * 2^2 = 60s
    // Attempt 4: 15s * 2^3 = 120s
    const baseTime = settings.antiCheat.freezeDurationSeconds || 15;
    const penaltyDuration = baseTime * Math.pow(2, cheatingAttempts);
    
    setFreezeTimeLeft(penaltyDuration);
    setIsFrozen(true);

    setCheatingAttempts(prev => prev + 1);
  };

  const handleSingleChoice = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  const handleMultiChoice = (optionIndex: number) => {
    const newAnswers = [...answers];
    const currentSelected = newAnswers[currentQuestionIndex] || [];
    
    if (currentSelected.includes(optionIndex)) {
        newAnswers[currentQuestionIndex] = currentSelected.filter((i: number) => i !== optionIndex);
    } else {
        newAnswers[currentQuestionIndex] = [...currentSelected, optionIndex];
    }
    setAnswers(newAnswers);
  };

  const handleEssay = (text: string) => {
      const newAnswers = [...answers];
      newAnswers[currentQuestionIndex] = text;
      setAnswers(newAnswers);
  };

  const handleBinaryChoice = (optionIndex: number, value: 'B' | 'S') => {
    const newAnswers = [...answers];
    const current = newAnswers[currentQuestionIndex] || {};
    newAnswers[currentQuestionIndex] = { ...current, [optionIndex]: value };
    setAnswers(newAnswers);
  };

  const toggleDoubt = () => {
    const newDoubts = [...markedDoubts];
    newDoubts[currentQuestionIndex] = !newDoubts[currentQuestionIndex];
    setMarkedDoubts(newDoubts);
  };

  const calculateScore = () => {
      let score = 0;
      // Calculate based on ACTIVE (Randomized) Questions
      activeQuestions.forEach((q, idx) => {
          const answer = answers[idx];
          if (answer === null || answer === undefined) return;

          if (q.type === 'PG' && answer === q.correctIndex) {
              score += q.points;
          } else if (q.type === 'PG_KOMPLEKS' && q.correctIndices) {
              // Basic logic: if selected array matches correctIndices array (sorted)
              const selected = (answer as number[]).sort();
              const correct = [...q.correctIndices].sort();
              if (JSON.stringify(selected) === JSON.stringify(correct)) {
                  score += q.points;
              }
          } else if (q.type === 'PG_BS' && q.correctIndices) {
              const ansObj = answer as Record<number, 'B' | 'S'>;
              let allCorrect = true;
              q.options.forEach((_, optIdx) => {
                  const isCorrectBenar = q.correctIndices?.includes(optIdx);
                  const studentAns = ansObj[optIdx];
                  if (isCorrectBenar && studentAns !== 'B') allCorrect = false;
                  if (!isCorrectBenar && studentAns !== 'S') allCorrect = false;
              });
              if (allCorrect) score += q.points;
          }
          // Essay score is 0 by default until graded
      });
      return score;
  };

  const finishExam = async () => {
    const rawScore = calculateScore();
    const scaledScore = maxPossibleScore > 0 ? Math.round((rawScore / maxPossibleScore) * 100) : 0;
    setFinalScore(scaledScore);
    
    // Clear persistence on finish
    localStorage.removeItem(storageKey);

    const result: ExamResult = {
      id: `res-${Date.now()}`,
      studentId: user.id,
      studentName: user.name,
      examId: exam.id,
      examTitle: exam.title,
      score: scaledScore,
      totalQuestions: activeQuestions.length,
      cheatingAttempts,
      submittedAt: new Date().toISOString()
    };

    await db.submitResult(result);
    setShowScoreModal(true);
  };

  const currentQ = activeQuestions[currentQuestionIndex];
  
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getFontSizeClass = () => {
    switch(fontSize) {
      case 'sm': return 'text-sm';
      case 'lg': return 'text-xl';
      default: return 'text-base';
    }
  };

  // --- Render Answer Inputs based on Type ---
  const renderAnswerInput = (q: Question) => {
      if (q.type === 'PG') {
          return (
            // Modified: Grid layout 1 column on mobile, 2 columns on md+ screens
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {q.options?.map((opt, idx) => (
                    <label key={idx} className="cursor-pointer group flex items-start h-full">
                        <input 
                            type="radio" 
                            name={`answer-${q.id}`} 
                            className="peer sr-only exam-radio"
                            checked={answers[currentQuestionIndex] === idx}
                            onChange={() => handleSingleChoice(idx)}
                        />
                        <div className="w-full p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center group-hover:border-blue-400 h-full">
                            <div className="w-8 h-8 rounded-full border-2 border-gray-300 mr-3 flex-shrink-0 flex items-center justify-center radio-dot transition-all font-bold text-gray-400" style={{ '--tw-border-color': themeColor } as React.CSSProperties}>
                                {String.fromCharCode(65+idx)}
                            </div>
                            <div className={`${getFontSizeClass()} text-gray-700 q-content`} dangerouslySetInnerHTML={{ __html: opt }}></div>
                        </div>
                    </label>
                ))}
            </div>
          );
      } else if (q.type === 'PG_KOMPLEKS') {
          return (
            <div className="grid grid-cols-1 gap-3">
                <p className="text-sm italic mb-2" style={{ color: themeColor }}>* Pilih jawaban lebih dari satu</p>
                {q.options?.map((opt, idx) => (
                    <label key={idx} className="cursor-pointer group flex items-start">
                        <input 
                            type="checkbox" 
                            className="peer sr-only"
                            checked={(answers[currentQuestionIndex] || []).includes(idx)}
                            onChange={() => handleMultiChoice(idx)}
                        />
                        <div className="w-full p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center group-hover:border-blue-400 peer-checked:bg-blue-50 peer-checked:border-blue-500">
                            <div className="w-6 h-6 rounded border-2 border-gray-300 mr-3 flex-shrink-0 flex items-center justify-center peer-checked:bg-blue-600 peer-checked:border-blue-600">
                                <CheckCircle size={14} className="text-white opacity-0 peer-checked:opacity-100" />
                            </div>
                            <div className={`${getFontSizeClass()} text-gray-700 q-content`} dangerouslySetInnerHTML={{ __html: opt }}></div>
                        </div>
                    </label>
                ))}
            </div>
          );
      } else if (q.type === 'PG_BS') {
          return (
            <div className="grid grid-cols-1 gap-3">
                <p className="text-sm italic mb-2" style={{ color: themeColor }}>* Tentukan Benar (B) atau Salah (S) untuk setiap pernyataan</p>
                {q.options?.map((opt, idx) => (
                    <div key={idx} className="w-full p-3 rounded-lg border border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-all">
                        <div className={`${getFontSizeClass()} text-gray-700 flex-1 mr-4 q-content`} dangerouslySetInnerHTML={{ __html: opt }}></div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleBinaryChoice(idx, 'B')}
                                className={`w-10 h-10 rounded-lg font-bold transition-all ${ (answers[currentQuestionIndex] || {})[idx] === 'B' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200' }`}
                            >
                                B
                            </button>
                            <button 
                                onClick={() => handleBinaryChoice(idx, 'S')}
                                className={`w-10 h-10 rounded-lg font-bold transition-all ${ (answers[currentQuestionIndex] || {})[idx] === 'S' ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200' }`}
                            >
                                S
                            </button>
                        </div>
                    </div>
                ))}
            </div>
          );
      } else if (q.type === 'URAIAN') {
          return (
              <div className="mt-2">
                  <p className="text-sm italic mb-2" style={{ color: themeColor }}>* Jawablah uraian di bawah ini</p>
                  <textarea 
                      className="w-full h-40 border border-gray-300 rounded-lg p-4 focus:ring-2 outline-none"
                      style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                      placeholder="Ketik jawaban Anda di sini..."
                      value={answers[currentQuestionIndex] || ''}
                      onChange={(e) => handleEssay(e.target.value)}
                  ></textarea>
              </div>
          );
      }
      return null;
  };

  // Magnifier Mouse Handler
  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    
    // Set Custom Properties for transform-origin
    e.currentTarget.style.setProperty('--zoom-x', `${x}%`);
    e.currentTarget.style.setProperty('--zoom-y', `${y}%`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans relative select-none">
      
      {/* Lightbox / Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setPreviewImage(null)}
        >
           <button 
             className="absolute top-6 right-6 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all z-50"
             onClick={() => setPreviewImage(null)}
           >
              <X size={32} />
           </button>
           
           <img 
              src={previewImage} 
              alt="Preview" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()} // Optional: keep modal open if clicking image itself, but user said "click image to zoom out", usually implies clicking away or toggle. I'll let click close it for simplicity or add specific logic.
           />
           <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-4 py-2 rounded-full pointer-events-none">
              Klik dimana saja untuk menutup
           </div>
        </div>
      )}

      {/* QUESTION LIST MODAL (Daftar Soal JOS JIS) */}
      {showQuestionListModal && (
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex justify-end" onClick={() => setShowQuestionListModal(false)}>
              <div 
                  className="bg-white w-full md:w-96 h-full shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300 relative"
                  onClick={e => e.stopPropagation()}
              >
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="text-xl font-bold text-gray-800">Daftar Soal</h3>
                      <button onClick={() => setShowQuestionListModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition"><X/></button>
                  </div>
                  
                  <div className="grid grid-cols-5 gap-3">
                      {activeQuestions.map((q, idx) => {
                          const isAnswered = answers[idx] !== null && answers[idx] !== undefined && (
                              Array.isArray(answers[idx]) 
                                ? answers[idx].length > 0 
                                : typeof answers[idx] === 'object'
                                  ? Object.keys(answers[idx]).length > 0
                                  : String(answers[idx]).trim() !== ''
                          );
                          const isCurrent = currentQuestionIndex === idx;
                          const isDoubt = markedDoubts[idx];
                          
                          let bgClass = 'bg-white border-gray-300 text-gray-700';
                          if (isCurrent) bgClass = 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300';
                          else if (isDoubt) bgClass = 'bg-yellow-400 text-black border-yellow-500 font-bold';
                          else if (isAnswered) bgClass = 'bg-green-500 text-white border-green-600';

                          return (
                              <button
                                key={idx}
                                onClick={() => {
                                    setCurrentQuestionIndex(idx);
                                    setShowQuestionListModal(false);
                                }}
                                className={`w-full aspect-square flex items-center justify-center rounded-lg border-2 text-sm font-bold transition hover:scale-105 active:scale-95 shadow-sm ${bgClass}`}
                              >
                                  {idx + 1}
                              </button>
                          )
                      })}
                  </div>

                  <div className="mt-8 pt-4 border-t space-y-2 text-xs text-gray-600 font-medium">
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded border border-green-600"></div> Sudah Dijawab</div>
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-400 rounded border border-yellow-500"></div> Ragu-ragu</div>
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-white rounded border border-gray-300"></div> Belum Dijawab</div>
                      <div className="flex items-center gap-2"><div className="w-4 h-4 bg-blue-600 rounded border border-blue-600"></div> Sedang Dikerjakan</div>
                  </div>
              </div>
          </div>
      )}

      {/* Frozen Overlay (JOS JIS SYSTEM) */}
      {isFrozen && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-center p-8 backdrop-blur-xl">
              <ShieldAlert className="w-24 h-24 text-red-500 mb-6 animate-pulse" />
              <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-widest">SISTEM TERKUNCI</h2>
              <p className="text-red-400 text-xl mb-4 font-bold">Terdeteksi Aktivitas Mencurigakan! (Pelanggaran #{cheatingAttempts})</p>
              <div className="bg-red-900/40 border border-red-500/50 px-6 py-3 rounded-xl mb-8">
                  <p className="text-red-200 font-mono text-sm uppercase tracking-widest">{freezeReason}</p>
              </div>
              
              <div className="w-64 h-64 relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                  <div className="absolute inset-0 rounded-full border-t-4 border-red-500 animate-spin"></div>
                  <div className="text-6xl font-mono font-bold text-white">{freezeTimeLeft}</div>
              </div>
              <p className="text-gray-400 mt-8 max-w-md">Layar Anda dibekukan karena terdeteksi meninggalkan halaman ujian. Waktu pembekuan akan <strong>BERLIPAT GANDA</strong> jika Anda mengulanginya lagi.</p>
          </div>
      )}

      {/* TIME ALERT POPUP (WARNING 5 MIN / 1 MIN) */}
      {timeAlert && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none px-4">
              <div className="bg-orange-500 text-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center animate-in zoom-in duration-300 border-4 border-white ring-4 ring-orange-200/50 max-w-sm w-full text-center">
                  <Clock size={48} className="mb-3 animate-pulse text-white drop-shadow-md" />
                  <h2 className="text-2xl font-bold mb-1 leading-tight">{timeAlert.title}</h2>
                  <p className="font-medium text-orange-100 text-sm uppercase tracking-wider">{timeAlert.subtitle}</p>
              </div>
          </div>
      )}

      {/* Score Popup Modal */}
      {showScoreModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-500">
              
              {/* Confetti Effect */}
              <Confetti />

              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-in zoom-in-95 duration-300 border-4 border-white ring-8 ring-blue-500/20 relative z-50">
                  <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner animate-bounce">
                      <Trophy className="w-12 h-12 text-yellow-600" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-gray-800 mb-2">Ujian Selesai!</h2>
                  
                  {/* Motivational Quote */}
                  <p className="text-gray-600 mb-6 italic text-sm">
                      "{getMotivation(finalScore, 100, user.name)}"
                  </p>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 mb-8 border border-blue-200 shadow-inner">
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-500">Nilai Perolehan</p>
                      <p className="text-6xl font-extrabold mt-2 text-blue-700">{finalScore}</p>
                  </div>

                  <button 
                    onClick={onComplete}
                    className="w-full text-white font-bold py-3.5 rounded-xl shadow-lg transition transform hover:-translate-y-1 hover:shadow-xl active:scale-95"
                    style={{ backgroundColor: themeColor }}
                  >
                      Lanjut ke Mata Pelajaran Lain
                  </button>
              </div>
          </div>
      )}

      {/* Header PUSMENDIK Style - KEMDIKBUD LOGO */}
      <header className="text-white shadow-md z-10 sticky top-0" style={{ backgroundColor: themeColor }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="bg-white p-1 rounded-full">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg" 
                className="h-8 w-8" 
                alt="Logo Kemdikbud"
              />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{appName}</h1>
              <p className="text-xs text-blue-100">Computer Based Test - SMPN 2 Gempol</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             <div className="hidden md:flex flex-col text-right text-sm">
                 <span className="font-semibold">{user.username} - {user.name}</span>
                 <span className="opacity-80">Kelas {user.grade}</span>
             </div>
             <div className="bg-black/20 px-3 py-1 rounded text-sm font-mono flex items-center">
                 <Timer size={16} className="mr-2"/> {formatTime(timeLeft)}
             </div>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="bg-white border-b px-4 py-2 flex justify-between items-center max-w-7xl mx-auto w-full sticky top-[60px] z-10">
          <div className="flex items-center space-x-4">
              <span className="font-bold text-gray-700">Soal nomor {currentQuestionIndex + 1}</span>
              <div className="flex items-center space-x-2 text-gray-500 text-sm border-l pl-4">
                  <span>Ukuran font:</span>
                  <button onClick={() => setFontSize('sm')} className={`hover:text-black ${fontSize === 'sm' ? 'text-black font-bold' : ''}`}>A</button>
                  <button onClick={() => setFontSize('base')} className={`hover:text-black text-lg ${fontSize === 'base' ? 'text-black font-bold' : ''}`}>A</button>
                  <button onClick={() => setFontSize('lg')} className={`hover:text-black text-xl ${fontSize === 'lg' ? 'text-black font-bold' : ''}`}>A</button>
              </div>
          </div>
          <div className="flex items-center space-x-2">
               <button 
                onClick={() => setShowQuestionListModal(true)}
                className="flex items-center px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 text-gray-700 shadow-sm active:bg-gray-100"
               >
                   <Grid3X3 size={16} className="mr-1"/> Daftar Soal
               </button>
          </div>
      </div>

      {/* Main Content Split */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col md:flex-row gap-6">
        {/* Left: Question */}
        <div className="w-full md:w-1/2 bg-white p-4">
            {currentQ.imgUrl && currentQ.imgUrl.trim() !== '' && (
                 <div 
                    className="mb-4 max-w-sm relative group overflow-hidden rounded-lg border shadow-sm cursor-zoom-in"
                    onMouseMove={handleImageMouseMove}
                    onClick={() => setPreviewImage(currentQ.imgUrl || null)}
                    style={{ '--zoom-x': '50%', '--zoom-y': '50%' } as React.CSSProperties}
                 >
                     <img 
                        src={currentQ.imgUrl} 
                        alt="Soal" 
                        className="w-full h-auto object-contain transition-transform duration-200 ease-out group-hover:scale-[2.5]"
                        style={{ transformOrigin: 'var(--zoom-x) var(--zoom-y)' }}
                        onError={(e) => e.currentTarget.parentElement!.style.display = 'none'} 
                     />
                     
                     {/* Magnifier Hint Overlay */}
                     <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full opacity-80 transition-opacity pointer-events-none flex items-center group-hover:opacity-0">
                        <Maximize2 size={12} className="mr-1"/> Klik untuk Memperbesar
                     </div>
                 </div>
            )}
            <div className={`${getFontSizeClass()} text-gray-800 leading-relaxed q-content`} dangerouslySetInnerHTML={{ __html: currentQ.text }}></div>
        </div>

        {/* Vertical Divider (Hidden on mobile) */}
        <div className="hidden md:block w-px bg-gray-200 border-r border-dashed border-gray-300 self-stretch mx-2"></div>

        {/* Right: Options / Answers */}
        <div className="w-full md:w-1/2">
            {renderAnswerInput(currentQ)}
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="bg-white border-t p-4 sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
              <button 
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="flex items-center px-4 py-2 bg-btn-danger text-white rounded font-medium hover:bg-red-600 disabled:opacity-50 transition"
              >
                 <ChevronLeft size={20} className="mr-1"/> Soal sebelumnya
              </button>

              <div className="flex space-x-4">
                  <button 
                    onClick={toggleDoubt}
                    className={`flex items-center px-6 py-2 rounded font-medium transition text-black ${markedDoubts[currentQuestionIndex] ? 'bg-yellow-400' : 'bg-btn-warning'}`}
                  >
                      <input type="checkbox" checked={markedDoubts[currentQuestionIndex]} readOnly className="mr-2 w-4 h-4" /> Ragu-ragu
                  </button>
              </div>

              {currentQuestionIndex === activeQuestions.length - 1 ? (
                   <button 
                    onClick={finishExam}
                    className="flex items-center px-4 py-2 text-white rounded font-medium hover:opacity-90 transition"
                    style={{ backgroundColor: themeColor }}
                   >
                     Selesai <ChevronRight size={20} className="ml-1"/>
                   </button>
              ) : (
                  <button 
                    onClick={() => setCurrentQuestionIndex(prev => Math.min(activeQuestions.length - 1, prev + 1))}
                    className="flex items-center px-4 py-2 text-white rounded font-medium hover:opacity-90 transition"
                    style={{ backgroundColor: themeColor }}
                  >
                     Soal berikutnya <ChevronRight size={20} className="ml-1"/>
                  </button>
              )}
          </div>
      </footer>
    </div>
  );
};