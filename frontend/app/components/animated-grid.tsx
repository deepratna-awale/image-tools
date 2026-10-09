/** Slowly drifting colour glow over a faint grid, behind every page. Pure CSS, so it costs no JavaScript. */
const AnimatedGrid = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`pointer-events-none overflow-hidden bg-background ${className}`} aria-hidden>
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="backdrop-grid absolute inset-0" />
    </div>
  );
};

export default AnimatedGrid;
