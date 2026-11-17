/**
 * The running-bond brick texture for a brick-red header. Purely decorative: place it as the first
 * child of a `relative` element with the brick background; put the real content in a `relative`
 * sibling so it sits above the pattern. The CSS lives in globals.css (.brick-layer).
 */
function BrickPattern() {
  return (
    <>
      <div aria-hidden="true" className="brick-layer brick-rows" />
      <div aria-hidden="true" className="brick-layer brick-joints-a" />
      <div aria-hidden="true" className="brick-layer brick-joints-b" />
    </>
  );
}

export default BrickPattern;
