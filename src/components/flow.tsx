import NumberFlow, { NumberFlowGroup, type NumberFlowProps } from "@number-flow/react";

/*
 * Numbers that roll to their new value (NumberFlow) instead of jumping:
 * timer, tempo, statistics and progress counts.
 */

export function Num(props: NumberFlowProps) {
  return <NumberFlow locales="de-DE" {...props} />;
}

/** m:ss or h:mm:ss, every part rolls on its own. */
export function FlowClock({ sec, sign = "" }: { sec: number; sign?: string }) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return (
    <NumberFlowGroup>
      <span className="inline-flex items-baseline">
        {sign}
        {h > 0 && (
          <>
            <NumberFlow value={h} />:
          </>
        )}
        <NumberFlow value={m} format={{ minimumIntegerDigits: h > 0 ? 2 : 1 }} digits={h > 0 ? { 1: { max: 5 } } : undefined} />:
        <NumberFlow value={r} format={{ minimumIntegerDigits: 2 }} digits={{ 1: { max: 5 } }} />
      </span>
    </NumberFlowGroup>
  );
}

/** Same text as formatMinutes ("45 min", "3 h 20 min"), rolling. */
export function FlowMinutes({ min }: { min: number }) {
  if (min > 0 && min < 0.5) return <>&lt; 1 min</>;
  const total = Math.round(min);
  if (total < 60) return <NumberFlow value={total} suffix=" min" />;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return (
    <NumberFlowGroup>
      <span className="inline-flex items-baseline">
        <NumberFlow value={h} suffix=" h" />
        {m > 0 && <NumberFlow value={m} prefix={" "} suffix=" min" />}
      </span>
    </NumberFlowGroup>
  );
}
