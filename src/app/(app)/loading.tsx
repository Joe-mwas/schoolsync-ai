/** Shown for a moment while a page loads, so moving around feels instant. */
export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading">
      <div className="bone" style={{ height: 44, width: "40%" }} />
      <div className="grid grid-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="bone" style={{ height: 96 }} />)}
      </div>
      <div className="bone" style={{ height: 260 }} />
    </div>
  );
}
