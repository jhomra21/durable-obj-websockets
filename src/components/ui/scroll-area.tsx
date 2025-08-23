import { splitProps, type ComponentProps } from 'solid-js';
import { cn } from '~/lib/utils';

interface ScrollAreaProps extends ComponentProps<'div'> {
  orientation?: 'horizontal' | 'vertical';
}

function ScrollArea(props: ScrollAreaProps) {
  const [local, rest] = splitProps(props, ['class', 'children', 'orientation']);

  return (
    <div
      data-slot="scroll-area"
      class={cn("relative overflow-auto", local.class)}
      {...rest}
    >
      <div
        data-slot="scroll-area-viewport"
        class="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {local.children}
      </div>
    </div>
  );
}

function ScrollBar() {
  // Simplified scrollbar - just return null for now
  // Can be enhanced later with custom scrollbar implementation
  return null;
}

export { ScrollArea, ScrollBar };
