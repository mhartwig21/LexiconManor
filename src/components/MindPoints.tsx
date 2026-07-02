/** Star row showing current/max mind points. */
export function MindPoints({ current, max }: { current: number; max: number }) {
  return (
    <div className="mind-points" aria-label={`${current} of ${max} mind points`}>
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          className={`mind-point${i < current ? '' : ' mind-point--spent'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 2l2.6 6.6L21 9.3l-5 4.6 1.4 6.8L12 17.4l-5.4 3.3L8 13.9 3 9.3l6.4-.7L12 2z" />
        </svg>
      ))}
    </div>
  );
}
