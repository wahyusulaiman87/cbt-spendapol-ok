// Simple beep generator to avoid external asset dependencies
export const playAlertSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    
    const playBeep = (startTime: number, duration: number, frequency: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime + startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

      oscillator.start(ctx.currentTime + startTime);
      oscillator.stop(ctx.currentTime + startTime + duration);
    };

    // Play 3 beeps
    playBeep(0, 0.3, 880);
    playBeep(0.4, 0.3, 880);
    playBeep(0.8, 0.5, 600);

    // Close context after beeps
    setTimeout(() => {
      ctx.close();
    }, 1500);

  } catch (e) {
    console.error("Audio playback failed", e);
  }
};