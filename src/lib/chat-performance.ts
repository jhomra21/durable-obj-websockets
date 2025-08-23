import { createEffect, createSignal } from 'solid-js';

export function useChatPerformance() {
  const [renderCount, setRenderCount] = createSignal(0);
  const [lastRenderTime, setLastRenderTime] = createSignal(0);

  // Track render performance in development
  createEffect(() => {
    if (import.meta.env.DEV) {
      const now = performance.now();
      setRenderCount(c => c + 1);
      setLastRenderTime(now);
      
      // Log performance warnings
      if (renderCount() > 100) {
        console.warn(`Chat component has rendered ${renderCount()} times. Check for unnecessary reactivity.`);
      }
    }
  });

  return {
    renderCount: renderCount(),
    lastRenderTime: lastRenderTime()
  };
}

// Utility to measure function execution time
export function measurePerformance<T>(fn: () => T, label: string): T {
  if (import.meta.env.DEV) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    if (end - start > 16) { // More than one frame (16ms)
      console.warn(`${label} took ${(end - start).toFixed(2)}ms - consider optimization`);
    }
    
    return result;
  }
  
  return fn();
}