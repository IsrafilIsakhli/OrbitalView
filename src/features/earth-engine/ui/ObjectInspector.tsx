import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

interface ObjectInspectorProps {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  headingId?: string;
}

export function ObjectInspector({
  ariaLabel,
  children,
  className,
  headingId,
}: ObjectInspectorProps) {
  const regionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => {
      const heading = headingId
        ? document.getElementById(headingId)
        : regionRef.current?.querySelector<HTMLElement>("[data-inspector-heading]");
      heading?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) {
          previousFocus.focus({ preventScroll: true });
        } else {
          document.querySelector<HTMLElement>("[data-earth-focus-target]")
            ?.focus({ preventScroll: true });
        }
      });
    };
  }, [headingId]);

  return (
    <motion.aside
      animate={{ opacity: 1, x: 0 }}
      aria-label={ariaLabel}
      aria-labelledby={headingId}
      className={`object-inspector ${className}`}
      exit={{ opacity: 0, x: 18 }}
      initial={{ opacity: 0, x: 18 }}
      ref={regionRef}
      role="complementary"
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.aside>
  );
}
