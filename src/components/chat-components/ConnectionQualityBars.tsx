import { For } from 'solid-js';

interface ConnectionQualityBarsProps {
  bars: number;
  color: string;
}

export function ConnectionQualityBars(props: ConnectionQualityBarsProps) {
  return (
    <div class="flex gap-0.5">
      <For each={Array(4)}>
        {(_, i) => (
          <div
            class={`w-1 h-3 rounded-sm transition-colors duration-200 ${
              i() < props.bars ? props.color : 'bg-muted'
            }`}
          />
        )}
      </For>
    </div>
  );
}